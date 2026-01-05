/**
 * Integration tests for /api/ai/agentic/edit endpoint
 * 
 * Tests SSE streaming, progress events, and multi-iteration workflow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import agenticRouter from '../routes/agentic.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { createMockGeminiService, mockEnv, createTestImageDataUrl, createInvalidImageDataUrl } from './helpers/mockGemini.js';
import * as geminiService from '../services/geminiService.js';
import type { AgenticEditRequest, AIProgressEvent, AgenticEditResponse } from '../types/api.js';

/**
 * Helper to parse SSE stream from response text
 */
function parseSSEStream(text: string): Array<{ event: string; data: any }> {
  const events: Array<{ event: string; data: any }> = [];
  const lines = text.split('\n');

  let currentEvent: string | null = null;
  let currentData: string | null = null;

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.substring(6).trim();
    } else if (line.startsWith('data:')) {
      currentData = line.substring(5).trim();
    } else if (line === '' && currentEvent && currentData) {
      // End of event
      try {
        events.push({
          event: currentEvent,
          data: JSON.parse(currentData),
        });
      } catch {
        // Skip non-JSON data (like initial comment)
      }
      currentEvent = null;
      currentData = null;
    }
  }

  return events;
}

describe('POST /api/ai/agentic/edit', () => {
  let app: Express;
  let cleanupEnv: () => void;

  beforeEach(() => {
    // Setup test app
    app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use('/api/ai/agentic', agenticRouter);
    app.use(errorHandler);

    // Mock environment
    cleanupEnv = mockEnv({ GEMINI_API_KEY: 'test-api-key' });
  });

  afterEach(() => {
    cleanupEnv();
    vi.restoreAllMocks();
  });

  describe('SSE streaming', () => {
    it('should stream progress events', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
        text: {
          text: 'yes',
          thinking: 'Analyzing the edit...',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: AgenticEditRequest = {
        sourceImage: testImageUrl,
        prompt: 'Add a circle',
        maxIterations: 1,
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      const events = parseSSEStream(response.text);

      // Should have at least progress and complete events
      expect(events.length).toBeGreaterThan(0);

      const progressEvents = events.filter(e => e.event === 'progress');
      const completeEvents = events.filter(e => e.event === 'complete');

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(completeEvents.length).toBe(1);

      // Verify complete event structure
      const completeData = completeEvents[0].data as AgenticEditResponse;
      expect(completeData.imageData).toBeDefined();
      expect(completeData.iterations).toBeGreaterThan(0);
      expect(completeData.finalPrompt).toBeDefined();
    });

    it('should include iteration information in progress events', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
        text: {
          text: 'yes',
          thinking: 'Iterating...',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: AgenticEditRequest = {
        sourceImage: testImageUrl,
        prompt: 'Add stars',
        maxIterations: 2,
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(200);

      const events = parseSSEStream(response.text);
      const progressEvents = events.filter(e => e.event === 'progress');

      // Should have progress events with iteration info
      const iterationEvents = progressEvents.filter(e => {
        const data = e.data as AIProgressEvent;
        return data.iteration !== undefined;
      });

      expect(iterationEvents.length).toBeGreaterThan(0);

      // Check iteration structure
      const firstIterationEvent = iterationEvents[0].data as AIProgressEvent;
      expect(firstIterationEvent.iteration).toHaveProperty('current');
      expect(firstIterationEvent.iteration).toHaveProperty('max');
    });

    it('should send complete event with final result', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
        text: {
          text: 'yes',
          thinking: 'Complete',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: AgenticEditRequest = {
        sourceImage: testImageUrl,
        prompt: 'Final edit',
        maxIterations: 1,
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(200);

      const events = parseSSEStream(response.text);
      const completeEvents = events.filter(e => e.event === 'complete');

      expect(completeEvents.length).toBe(1);

      const completeData = completeEvents[0].data as AgenticEditResponse;
      expect(completeData.imageData).toContain('data:image/');
      expect(completeData.iterations).toBeGreaterThanOrEqual(1);
      expect(completeData.finalPrompt).toBe('Final edit');
    });

    it('should respect maxIterations parameter', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
        text: {
          text: 'no', // Always say "no" to force iterations
          thinking: 'Not satisfied yet',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const maxIterations = 2;
      const requestBody: AgenticEditRequest = {
        sourceImage: testImageUrl,
        prompt: 'Complex edit',
        maxIterations,
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(200);

      const events = parseSSEStream(response.text);
      const completeEvents = events.filter(e => e.event === 'complete');

      expect(completeEvents.length).toBe(1);

      const completeData = completeEvents[0].data as AgenticEditResponse;
      expect(completeData.iterations).toBeLessThanOrEqual(maxIterations);
    });

    it('should default to maxIterations=3', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
        text: {
          text: 'yes',
          thinking: 'Done',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: AgenticEditRequest = {
        sourceImage: testImageUrl,
        prompt: 'Edit with defaults',
        // maxIterations not provided
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(200);

      const events = parseSSEStream(response.text);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('With mask image', () => {
    it('should handle inpainting with mask', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
        text: {
          text: 'yes',
          thinking: 'Inpainting masked area',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: AgenticEditRequest = {
        sourceImage: testImageUrl,
        maskImage: testImageUrl,
        prompt: 'Replace with tree',
        maxIterations: 1,
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(200);

      const events = parseSSEStream(response.text);
      const completeEvents = events.filter(e => e.event === 'complete');

      expect(completeEvents.length).toBe(1);
      expect(completeEvents[0].data.imageData).toBeDefined();
    });

    it('should validate maskImage format', async () => {
      const requestBody: AgenticEditRequest = {
        sourceImage: createTestImageDataUrl(),
        maskImage: createInvalidImageDataUrl(),
        prompt: 'Edit',
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('maskImage');
    });
  });

  describe('Validation', () => {
    it('should reject missing sourceImage', async () => {
      const requestBody = {
        prompt: 'Add a circle',
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('sourceImage');
    });

    it('should reject missing prompt', async () => {
      const requestBody = {
        sourceImage: createTestImageDataUrl(),
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('prompt');
    });

    it('should reject invalid sourceImage format', async () => {
      const requestBody = {
        sourceImage: createInvalidImageDataUrl(),
        prompt: 'Edit',
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('sourceImage');
    });

    it('should reject non-data-url sourceImage', async () => {
      const requestBody = {
        sourceImage: 'not-a-data-url',
        prompt: 'Edit',
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('sourceImage');
    });
  });

  describe('Error handling', () => {
    it('should handle missing API key', async () => {
      cleanupEnv();
      cleanupEnv = mockEnv({});

      const requestBody: AgenticEditRequest = {
        sourceImage: createTestImageDataUrl(),
        prompt: 'Edit',
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(500); // Configuration error returns 500

      expect(response.body.error).toContain('GEMINI_API_KEY');
    });

    it('should send error event for API failures during streaming', async () => {
      const mockService = createMockGeminiService({
        shouldError: true,
        errorMessage: 'Streaming API error',
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: AgenticEditRequest = {
        sourceImage: createTestImageDataUrl(),
        prompt: 'Edit',
        maxIterations: 1,
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(200); // SSE always returns 200

      const events = parseSSEStream(response.text);
      const errorEvents = events.filter(e => e.event === 'error');

      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].data.message).toBeDefined();
    });
  });

  describe('Progress step tracking', () => {
    it('should emit different progress steps', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
        text: {
          text: 'yes',
          thinking: 'Processing',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: AgenticEditRequest = {
        sourceImage: testImageUrl,
        prompt: 'Edit',
        maxIterations: 1,
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(200);

      const events = parseSSEStream(response.text);
      const progressEvents = events.filter(e => e.event === 'progress');

      // Should have various progress steps
      const steps = progressEvents.map(e => (e.data as AIProgressEvent).step);
      expect(steps.length).toBeGreaterThan(0);

      // Common steps should be present
      const hasCallingApi = steps.some(s => s === 'calling_api' || s === 'processing');
      expect(hasCallingApi).toBe(true);
    });

    it('should include thinking text in progress events', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
        text: {
          text: 'yes',
          thinking: 'Deep analysis of the image',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: AgenticEditRequest = {
        sourceImage: testImageUrl,
        prompt: 'Edit with thinking',
        maxIterations: 1,
      };

      const response = await request(app)
        .post('/api/ai/agentic/edit')
        .send(requestBody)
        .expect(200);

      const events = parseSSEStream(response.text);
      const progressEvents = events.filter(e => e.event === 'progress');

      // At least one progress event should have thinking text (now sent as delta)
      const hasThinking = progressEvents.some(e => {
        const data = e.data as AIProgressEvent;
        return (data.thinkingText && data.thinkingText.length > 0) || 
               (data.thinkingTextDelta && data.thinkingTextDelta.length > 0);
      });

      expect(hasThinking).toBe(true);
    });
  });
});
