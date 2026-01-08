/**
 * Unit tests for SSE (Server-Sent Events) helper utilities
 *
 * Tests the low-level SSE functions used by agentic endpoints for streaming
 * progress updates to the client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response } from 'express';
import type { Socket } from 'net';
import {
  initSSE,
  sendSSE,
  sendProgress,
  sendComplete,
  sendError,
  handleSSEError,
  endSSE,
} from '../utils/sseHelpers.js';
import type { AIProgressEvent } from '../types/api.js';

/**
 * Create a mock Express Response object for testing SSE functions
 */
function createMockResponse(options: {
  headersSent?: boolean;
  socketDestroyed?: boolean;
  hasFlush?: boolean;
} = {}): {
  res: Response;
  written: string[];
  headers: Map<string, string>;
  getEnded: () => boolean;
  getStatusCode: () => number;
  getJsonBody: () => unknown;
} {
  const written: string[] = [];
  const headers = new Map<string, string>();
  const state = {
    ended: false,
    statusCode: 200,
    jsonBody: null as unknown,
  };

  const mockSocket = {
    destroyed: options.socketDestroyed ?? false,
    uncork: vi.fn(),
  } as unknown as Socket;

  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name, value);
      return res;
    }),
    write: vi.fn((data: string) => {
      written.push(data);
      return true;
    }),
    end: vi.fn(() => {
      state.ended = true;
    }),
    flushHeaders: vi.fn(),
    headersSent: options.headersSent ?? false,
    socket: mockSocket,
    status: vi.fn((code: number) => {
      state.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      state.jsonBody = body;
      return res;
    }),
  } as unknown as Response;

  // Optionally add flush method (added by compression middleware)
  if (options.hasFlush) {
    (res as unknown as { flush: () => void }).flush = vi.fn();
  }

  return {
    res,
    written,
    headers,
    getEnded: () => state.ended,
    getStatusCode: () => state.statusCode,
    getJsonBody: () => state.jsonBody,
  };
}

describe('sseHelpers', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initSSE', () => {
    it('should set Content-Type header to text/event-stream', () => {
      const { res, headers } = createMockResponse();

      initSSE(res);

      expect(headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('should set Cache-Control header to no-cache', () => {
      const { res, headers } = createMockResponse();

      initSSE(res);

      expect(headers.get('Cache-Control')).toBe('no-cache');
    });

    it('should set Connection header to keep-alive', () => {
      const { res, headers } = createMockResponse();

      initSSE(res);

      expect(headers.get('Connection')).toBe('keep-alive');
    });

    it('should set X-Accel-Buffering header to no (nginx buffering)', () => {
      const { res, headers } = createMockResponse();

      initSSE(res);

      expect(headers.get('X-Accel-Buffering')).toBe('no');
    });

    it('should write initial SSE comment to establish connection', () => {
      const { res, written } = createMockResponse();

      initSSE(res);

      expect(written).toHaveLength(1);
      expect(written[0]).toBe(': SSE stream initialized\n\n');
    });

    it('should flush headers after initialization', () => {
      const { res } = createMockResponse();

      initSSE(res);

      expect(res.flushHeaders).toHaveBeenCalled();
    });
  });

  describe('sendSSE', () => {
    it('should format event with correct SSE syntax', () => {
      const { res, written } = createMockResponse();

      sendSSE(res, 'test-event', { foo: 'bar' });

      expect(written).toHaveLength(1);
      expect(written[0]).toBe('event: test-event\ndata: {"foo":"bar"}\n\n');
    });

    it('should JSON stringify the data', () => {
      const { res, written } = createMockResponse();
      const complexData = {
        step: 'processing',
        progress: 50,
        nested: { value: true },
      };

      sendSSE(res, 'progress', complexData);

      expect(written[0]).toContain(JSON.stringify(complexData));
    });

    it('should handle string data', () => {
      const { res, written } = createMockResponse();

      sendSSE(res, 'message', 'hello world');

      expect(written[0]).toBe('event: message\ndata: "hello world"\n\n');
    });

    it('should handle null data', () => {
      const { res, written } = createMockResponse();

      sendSSE(res, 'empty', null);

      expect(written[0]).toBe('event: empty\ndata: null\n\n');
    });

    it('should handle array data', () => {
      const { res, written } = createMockResponse();
      const arrayData = [1, 2, 3];

      sendSSE(res, 'list', arrayData);

      expect(written[0]).toBe('event: list\ndata: [1,2,3]\n\n');
    });

    it('should call flush when available (compression middleware)', () => {
      const { res } = createMockResponse({ hasFlush: true });

      sendSSE(res, 'test', {});

      expect((res as unknown as { flush: () => void }).flush).toHaveBeenCalled();
    });

    it('should call socket.uncork when socket is available', () => {
      const { res } = createMockResponse();

      sendSSE(res, 'test', {});

      expect(res.socket!.uncork).toHaveBeenCalled();
    });

    it('should not call socket.uncork when socket is destroyed', () => {
      const { res } = createMockResponse({ socketDestroyed: true });

      sendSSE(res, 'test', {});

      expect(res.socket!.uncork).not.toHaveBeenCalled();
    });
  });

  describe('sendProgress', () => {
    it('should send progress event with correct event name', () => {
      const { res, written } = createMockResponse();
      const progressEvent: AIProgressEvent = {
        step: 'planning',
        message: 'Analyzing image...',
      };

      sendProgress(res, progressEvent);

      expect(written[0]).toContain('event: progress');
    });

    it('should include step in progress event data', () => {
      const { res, written } = createMockResponse();
      const progressEvent: AIProgressEvent = {
        step: 'calling_api',
        message: 'Calling Gemini API',
      };

      sendProgress(res, progressEvent);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.step).toBe('calling_api');
    });

    it('should include message in progress event data', () => {
      const { res, written } = createMockResponse();
      const progressEvent: AIProgressEvent = {
        step: 'processing',
        message: 'Processing response',
      };

      sendProgress(res, progressEvent);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.message).toBe('Processing response');
    });

    it('should include thinkingText when present', () => {
      const { res, written } = createMockResponse();
      const progressEvent: AIProgressEvent = {
        step: 'planning',
        message: 'Planning',
        thinkingText: 'Let me analyze this image...',
      };

      sendProgress(res, progressEvent);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.thinkingText).toBe('Let me analyze this image...');
    });

    it('should include iteration info when present', () => {
      const { res, written } = createMockResponse();
      const progressEvent: AIProgressEvent = {
        step: 'iterating',
        message: 'Iteration 2 of 3',
        iteration: { current: 2, max: 3 },
      };

      sendProgress(res, progressEvent);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.iteration).toEqual({ current: 2, max: 3 });
    });

    it('should include inputImages when present', () => {
      const { res, written } = createMockResponse();
      const inputImages = [
        { label: 'Source Image', dataUrl: 'data:image/png;base64,SOURCE' },
        { label: 'Mask', dataUrl: 'data:image/png;base64,MASK' },
      ];
      const progressEvent: AIProgressEvent = {
        step: 'planning',
        message: 'Planning',
        inputImages,
      };

      sendProgress(res, progressEvent);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.inputImages).toEqual(inputImages);
    });

    it('should include prompt when present', () => {
      const { res, written } = createMockResponse();
      const progressEvent: AIProgressEvent = {
        step: 'calling_api',
        message: 'Calling API',
        prompt: 'Remove the background from this image',
      };

      sendProgress(res, progressEvent);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.prompt).toBe('Remove the background from this image');
    });

    it('should include inputImages when present', () => {
      const { res, written } = createMockResponse();
      const progressEvent: AIProgressEvent = {
        step: 'calling_api',
        message: 'Calling API',
        inputImages: [
          { label: 'Original', dataUrl: 'data:image/png;base64,ORIGINAL' },
          { label: 'Mask', dataUrl: 'data:image/png;base64,MASK' },
        ],
      };

      sendProgress(res, progressEvent);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.inputImages).toHaveLength(2);
      expect(data.inputImages[0].label).toBe('Original');
    });
  });

  describe('sendComplete', () => {
    it('should send complete event', () => {
      const { res, written } = createMockResponse();
      const completeData = {
        imageData: 'data:image/png;base64,RESULT',
        iterations: 2,
        finalPrompt: 'Enhanced prompt',
      };

      sendComplete(res, completeData);

      expect(written[0]).toContain('event: complete');
    });

    it('should include all completion data', () => {
      const { res, written } = createMockResponse();
      const completeData = {
        imageData: 'data:image/png;base64,RESULT',
        iterations: 3,
        finalPrompt: 'Final refined prompt',
      };

      sendComplete(res, completeData);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.imageData).toBe('data:image/png;base64,RESULT');
      expect(data.iterations).toBe(3);
      expect(data.finalPrompt).toBe('Final refined prompt');
    });

    it('should handle arbitrary data structures', () => {
      const { res, written } = createMockResponse();
      const completeData = {
        success: true,
        result: { nested: { value: 42 } },
      };

      sendComplete(res, completeData);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.result.nested.value).toBe(42);
    });
  });

  describe('sendError', () => {
    it('should send error event', () => {
      const { res, written } = createMockResponse();

      sendError(res, 'Something went wrong');

      expect(written[0]).toContain('event: error');
    });

    it('should handle string error', () => {
      const { res, written } = createMockResponse();

      sendError(res, 'Simple error message');

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.message).toBe('Simple error message');
      expect(data.details).toBeUndefined();
    });

    it('should handle Error object', () => {
      const { res, written } = createMockResponse();
      const error = new Error('Error object message');

      sendError(res, error);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.message).toBe('Error object message');
      expect(data.details).toContain('Error: Error object message');
    });

    it('should include stack trace for Error objects', () => {
      const { res, written } = createMockResponse();
      const error = new Error('Test error');

      sendError(res, error);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.details).toContain('sseHelpers.test.ts');
    });
  });

  describe('handleSSEError', () => {
    it('should send JSON error response when headers not sent', () => {
      const { res, getJsonBody, getStatusCode } = createMockResponse({ headersSent: false });
      const error = new Error('Server error');

      handleSSEError(res, error);

      expect(getStatusCode()).toBe(500);
      expect(getJsonBody()).toEqual({
        error: 'Internal Server Error',
        message: 'Server error',
      });
    });

    it('should send SSE error event when headers already sent', () => {
      const { res, written, getEnded } = createMockResponse({ headersSent: true });
      const error = new Error('Stream error');

      handleSSEError(res, error);

      expect(written[0]).toContain('event: error');
      expect(getEnded()).toBe(true);
    });

    it('should handle string error when headers not sent', () => {
      const { res, getJsonBody } = createMockResponse({ headersSent: false });

      handleSSEError(res, 'String error message');

      expect(getJsonBody()).toEqual({
        error: 'Internal Server Error',
        message: 'String error message',
      });
    });

    it('should handle string error when headers already sent', () => {
      const { res, written } = createMockResponse({ headersSent: true });

      handleSSEError(res, 'String error message');

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.message).toBe('String error message');
    });

    it('should log error to console', () => {
      const { res } = createMockResponse({ headersSent: false });
      const error = new Error('Logged error');

      handleSSEError(res, error);

      expect(console.error).toHaveBeenCalledWith('SSE stream error:', error);
    });

    it('should end stream when headers already sent', () => {
      const { res, getEnded } = createMockResponse({ headersSent: true });

      handleSSEError(res, 'Error');

      expect(getEnded()).toBe(true);
    });

    it('should not end stream when headers not sent (JSON response)', () => {
      const { res, getEnded } = createMockResponse({ headersSent: false });

      handleSSEError(res, 'Error');

      // JSON response doesn't require explicit end() call for express
      expect(getEnded()).toBe(false);
    });
  });

  describe('endSSE', () => {
    it('should end the response', () => {
      const { res, getEnded } = createMockResponse();

      endSSE(res);

      expect(getEnded()).toBe(true);
    });

    it('should send final event if provided', () => {
      const { res, written, getEnded } = createMockResponse();
      const finalEvent = {
        event: 'done',
        data: { status: 'success' },
      };

      endSSE(res, finalEvent);

      expect(written).toHaveLength(1);
      expect(written[0]).toContain('event: done');
      expect(written[0]).toContain('"status":"success"');
      expect(getEnded()).toBe(true);
    });

    it('should not write anything if no final event provided', () => {
      const { res, written, getEnded } = createMockResponse();

      endSSE(res);

      expect(written).toHaveLength(0);
      expect(getEnded()).toBe(true);
    });

    it('should handle complex final event data', () => {
      const { res, written } = createMockResponse();
      const finalEvent = {
        event: 'final',
        data: {
          results: [1, 2, 3],
          meta: { timestamp: '2024-01-01' },
        },
      };

      endSSE(res, finalEvent);

      const data = JSON.parse(written[0].split('data: ')[1].split('\n')[0]);
      expect(data.results).toEqual([1, 2, 3]);
      expect(data.meta.timestamp).toBe('2024-01-01');
    });
  });

  describe('Integration scenarios', () => {
    it('should support typical SSE flow: init -> progress -> complete -> end', () => {
      const { res, written, headers, getEnded } = createMockResponse();

      // Initialize
      initSSE(res);
      expect(headers.get('Content-Type')).toBe('text/event-stream');
      expect(written[0]).toContain('SSE stream initialized');

      // Send progress updates
      sendProgress(res, { step: 'planning', message: 'Starting...' });
      sendProgress(res, { step: 'processing', message: 'Working...' });
      sendProgress(res, { step: 'complete', message: 'Done!' });

      // Send completion
      sendComplete(res, { result: 'success' });

      // End stream
      endSSE(res);

      expect(written).toHaveLength(5); // init + 3 progress + complete
      expect(getEnded()).toBe(true);
    });

    it('should support error flow: init -> progress -> error', () => {
      const { res, written, getEnded } = createMockResponse({ headersSent: true });

      initSSE(res);
      sendProgress(res, { step: 'planning', message: 'Starting...' });
      handleSSEError(res, new Error('Something failed'));

      expect(written).toHaveLength(3); // init + progress + error
      expect(getEnded()).toBe(true);
    });

    it('should properly escape special characters in data', () => {
      const { res, written } = createMockResponse();
      const dataWithSpecialChars = {
        text: 'Line 1\nLine 2',
        quote: 'He said "hello"',
        unicode: '\u2764 Heart',
      };

      sendSSE(res, 'test', dataWithSpecialChars);

      // Should be valid JSON that can be parsed back
      const data = JSON.parse(written[0].split('data: ')[1].split('\n\n')[0]);
      expect(data.text).toBe('Line 1\nLine 2');
      expect(data.quote).toBe('He said "hello"');
      expect(data.unicode).toBe('\u2764 Heart');
    });
  });
});
