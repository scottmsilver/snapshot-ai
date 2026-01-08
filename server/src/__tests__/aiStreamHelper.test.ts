/**
 * Unit tests for aiStreamHelper.ts
 * 
 * Tests the shared AI Stream Helper functions that provide a consistent
 * SSE streaming protocol for all AI endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response } from 'express';
import {
  startAIStream,
  updateAIStream,
  completeAIStream,
  errorAIStream,
  runAIStream,
  type AIStreamContext,
  type AIStreamResult,
} from '../utils/aiStreamHelper.js';
import * as sseHelpers from '../utils/sseHelpers.js';

/**
 * Create a mock Express Response object
 */
function createMockResponse(): Response {
  const res = {
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    flushHeaders: vi.fn().mockReturnThis(),
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    socket: {
      destroyed: false,
      uncork: vi.fn(),
    },
  } as unknown as Response;
  return res;
}

describe('aiStreamHelper', () => {
  let mockRes: Response;
  let initSSESpy: ReturnType<typeof vi.spyOn>;
  let sendProgressSpy: ReturnType<typeof vi.spyOn>;
  let sendCompleteSpy: ReturnType<typeof vi.spyOn>;
  let endSSESpy: ReturnType<typeof vi.spyOn>;
  let handleSSEErrorSpy: ReturnType<typeof vi.spyOn>;

  const testSourceImage = 'data:image/png;base64,TEST_SOURCE_IMAGE';
  const testMaskImage = 'data:image/png;base64,TEST_MASK_IMAGE';
  const testPrompt = 'Remove the background';
  const testResultImage = 'data:image/png;base64,RESULT_IMAGE';

  beforeEach(() => {
    mockRes = createMockResponse();
    
    // Spy on sseHelpers functions
    initSSESpy = vi.spyOn(sseHelpers, 'initSSE').mockImplementation(() => {});
    sendProgressSpy = vi.spyOn(sseHelpers, 'sendProgress').mockImplementation(() => {});
    sendCompleteSpy = vi.spyOn(sseHelpers, 'sendComplete').mockImplementation(() => {});
    endSSESpy = vi.spyOn(sseHelpers, 'endSSE').mockImplementation(() => {});
    handleSSEErrorSpy = vi.spyOn(sseHelpers, 'handleSSEError').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startAIStream', () => {
    it('should initialize SSE connection', () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      startAIStream(ctx);

      expect(initSSESpy).toHaveBeenCalledWith(mockRes);
    });

    it('should send initial progress event with sourceImage and prompt', () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      startAIStream(ctx);

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'processing',
        message: 'Starting AI operation',
        sourceImage: testSourceImage,
        maskImage: undefined,
        prompt: testPrompt,
        newLogEntry: true,
      });
    });

    it('should include maskImage in initial progress event when provided', () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      startAIStream(ctx);

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'processing',
        message: 'Starting AI operation',
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
        newLogEntry: true,
      });
    });

    it('should set newLogEntry: true for first event', () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      startAIStream(ctx);

      expect(sendProgressSpy).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({
          newLogEntry: true,
        })
      );
    });

    it('should handle empty sourceImage', () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: '',
        prompt: testPrompt,
      };

      startAIStream(ctx);

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'processing',
        message: 'Starting AI operation',
        sourceImage: '',
        maskImage: undefined,
        prompt: testPrompt,
        newLogEntry: true,
      });
    });

    it('should handle empty prompt', () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: '',
      };

      startAIStream(ctx);

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'processing',
        message: 'Starting AI operation',
        sourceImage: testSourceImage,
        maskImage: undefined,
        prompt: '',
        newLogEntry: true,
      });
    });
  });

  describe('updateAIStream', () => {
    it('should send progress event with message', () => {
      updateAIStream(mockRes, { message: 'Processing...' });

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'processing',
        message: 'Processing...',
        thinkingText: undefined,
        prompt: undefined,
        iteration: undefined,
        iterationImage: undefined,
      });
    });

    it('should include step when provided', () => {
      updateAIStream(mockRes, {
        step: 'planning',
        message: 'Planning the edit...',
      });

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'planning',
        message: 'Planning the edit...',
        thinkingText: undefined,
        prompt: undefined,
        iteration: undefined,
        iterationImage: undefined,
      });
    });

    it('should include thinkingText when provided', () => {
      updateAIStream(mockRes, {
        message: 'Generating...',
        thinkingText: 'Analyzing the image...',
      });

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'processing',
        message: 'Generating...',
        thinkingText: 'Analyzing the image...',
        prompt: undefined,
        iteration: undefined,
        iterationImage: undefined,
      });
    });

    it('should include prompt when provided', () => {
      updateAIStream(mockRes, {
        message: 'Refining prompt...',
        prompt: 'Enhanced prompt text',
      });

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'processing',
        message: 'Refining prompt...',
        thinkingText: undefined,
        prompt: 'Enhanced prompt text',
        iteration: undefined,
        iterationImage: undefined,
      });
    });

    it('should include iteration info when provided', () => {
      updateAIStream(mockRes, {
        message: 'Iteration 2 of 3',
        iteration: { current: 2, max: 3 },
      });

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'processing',
        message: 'Iteration 2 of 3',
        thinkingText: undefined,
        prompt: undefined,
        iteration: { current: 2, max: 3 },
        iterationImage: undefined,
      });
    });

    it('should include iterationImage when provided', () => {
      updateAIStream(mockRes, {
        message: 'Generated intermediate result',
        iterationImage: testResultImage,
      });

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'processing',
        message: 'Generated intermediate result',
        thinkingText: undefined,
        prompt: undefined,
        iteration: undefined,
        iterationImage: testResultImage,
      });
    });

    it('should include all fields when provided', () => {
      updateAIStream(mockRes, {
        step: 'iterating',
        message: 'Iteration complete',
        thinkingText: 'Checking quality...',
        prompt: 'Final prompt',
        iteration: { current: 3, max: 3 },
        iterationImage: testResultImage,
      });

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'iterating',
        message: 'Iteration complete',
        thinkingText: 'Checking quality...',
        prompt: 'Final prompt',
        iteration: { current: 3, max: 3 },
        iterationImage: testResultImage,
      });
    });
  });

  describe('completeAIStream', () => {
    it('should send final progress event with result image', () => {
      const result: AIStreamResult = {
        imageData: testResultImage,
      };

      completeAIStream(mockRes, result);

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'complete',
        message: 'Complete',
        iterationImage: testResultImage,
        thinkingText: undefined,
      });
    });

    it('should send complete event with result', () => {
      const result: AIStreamResult = {
        imageData: testResultImage,
      };

      completeAIStream(mockRes, result);

      expect(sendCompleteSpy).toHaveBeenCalledWith(mockRes, result);
    });

    it('should end the SSE stream', () => {
      const result: AIStreamResult = {
        imageData: testResultImage,
      };

      completeAIStream(mockRes, result);

      expect(endSSESpy).toHaveBeenCalledWith(mockRes);
    });

    it('should include thinking in final progress event when provided', () => {
      const result: AIStreamResult = {
        imageData: testResultImage,
        thinking: 'Final analysis complete',
      };

      completeAIStream(mockRes, result);

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, {
        step: 'complete',
        message: 'Complete',
        iterationImage: testResultImage,
        thinkingText: 'Final analysis complete',
      });
    });

    it('should pass refinedPrompt through in complete event', () => {
      const result: AIStreamResult = {
        imageData: testResultImage,
        refinedPrompt: 'Enhanced prompt',
      };

      completeAIStream(mockRes, result);

      expect(sendCompleteSpy).toHaveBeenCalledWith(mockRes, result);
    });

    it('should pass finalPrompt through in complete event', () => {
      const result: AIStreamResult = {
        imageData: testResultImage,
        finalPrompt: 'The final prompt used',
      };

      completeAIStream(mockRes, result);

      expect(sendCompleteSpy).toHaveBeenCalledWith(mockRes, result);
    });

    it('should pass iterations through in complete event', () => {
      const result: AIStreamResult = {
        imageData: testResultImage,
        iterations: 3,
      };

      completeAIStream(mockRes, result);

      expect(sendCompleteSpy).toHaveBeenCalledWith(mockRes, result);
    });

    it('should call sendProgress, sendComplete, and endSSE in order', () => {
      const result: AIStreamResult = {
        imageData: testResultImage,
      };

      const callOrder: string[] = [];
      sendProgressSpy.mockImplementation(() => { callOrder.push('sendProgress'); });
      sendCompleteSpy.mockImplementation(() => { callOrder.push('sendComplete'); });
      endSSESpy.mockImplementation(() => { callOrder.push('endSSE'); });

      completeAIStream(mockRes, result);

      expect(callOrder).toEqual(['sendProgress', 'sendComplete', 'endSSE']);
    });
  });

  describe('errorAIStream', () => {
    it('should call handleSSEError with Error object', () => {
      const error = new Error('Something went wrong');

      errorAIStream(mockRes, error);

      expect(handleSSEErrorSpy).toHaveBeenCalledWith(mockRes, error);
    });

    it('should call handleSSEError with string error', () => {
      const error = 'Something went wrong';

      errorAIStream(mockRes, error);

      expect(handleSSEErrorSpy).toHaveBeenCalledWith(mockRes, error);
    });

    it('should handle empty error message', () => {
      const error = '';

      errorAIStream(mockRes, error);

      expect(handleSSEErrorSpy).toHaveBeenCalledWith(mockRes, error);
    });
  });

  describe('runAIStream', () => {
    it('should call startAIStream with context', async () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      await runAIStream(ctx, async () => ({
        imageData: testResultImage,
      }));

      // startAIStream calls initSSE and sendProgress
      expect(initSSESpy).toHaveBeenCalledWith(mockRes);
      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, expect.objectContaining({
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
        newLogEntry: true,
      }));
    });

    it('should call operation with update function', async () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      const operationSpy = vi.fn().mockResolvedValue({
        imageData: testResultImage,
      });

      await runAIStream(ctx, operationSpy);

      expect(operationSpy).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should allow operation to send updates', async () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      await runAIStream(ctx, async (update) => {
        update({ message: 'Step 1' });
        update({ message: 'Step 2', thinkingText: 'Thinking...' });
        return { imageData: testResultImage };
      });

      // Should have been called for: start, step 1, step 2, complete
      expect(sendProgressSpy).toHaveBeenCalledTimes(4);
      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, expect.objectContaining({
        message: 'Step 1',
      }));
      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, expect.objectContaining({
        message: 'Step 2',
        thinkingText: 'Thinking...',
      }));
    });

    it('should call completeAIStream with operation result', async () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      const result: AIStreamResult = {
        imageData: testResultImage,
        thinking: 'Analysis complete',
        refinedPrompt: 'Enhanced prompt',
        iterations: 2,
      };

      await runAIStream(ctx, async () => result);

      expect(sendCompleteSpy).toHaveBeenCalledWith(mockRes, result);
      expect(endSSESpy).toHaveBeenCalledWith(mockRes);
    });

    it('should handle operation errors', async () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      const error = new Error('Operation failed');

      await runAIStream(ctx, async () => {
        throw error;
      });

      expect(handleSSEErrorSpy).toHaveBeenCalledWith(mockRes, error);
    });

    it('should convert non-Error throws to Error', async () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      await runAIStream(ctx, async () => {
        throw 'String error';
      });

      expect(handleSSEErrorSpy).toHaveBeenCalledWith(mockRes, 'String error');
    });

    it('should not call completeAIStream on error', async () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      await runAIStream(ctx, async () => {
        throw new Error('Failed');
      });

      expect(sendCompleteSpy).not.toHaveBeenCalled();
      expect(endSSESpy).not.toHaveBeenCalled();
    });

    it('should handle async operation correctly', async () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      await runAIStream(ctx, async (update) => {
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 10));
        update({ message: 'Processing...' });
        await new Promise(resolve => setTimeout(resolve, 10));
        return { imageData: testResultImage };
      });

      expect(sendCompleteSpy).toHaveBeenCalledWith(mockRes, { imageData: testResultImage });
    });
  });

  describe('Edge cases', () => {
    it('should handle very long prompts', () => {
      const longPrompt = 'x'.repeat(10000);
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: longPrompt,
      };

      startAIStream(ctx);

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, expect.objectContaining({
        prompt: longPrompt,
      }));
    });

    it('should handle large base64 images', () => {
      const largeImage = 'data:image/png;base64,' + 'A'.repeat(100000);
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: largeImage,
        prompt: testPrompt,
      };

      startAIStream(ctx);

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, expect.objectContaining({
        sourceImage: largeImage,
      }));
    });

    it('should handle unicode in prompts', () => {
      const unicodePrompt = 'Remove the background and add emoji: 🌟✨🎨';
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: unicodePrompt,
      };

      startAIStream(ctx);

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, expect.objectContaining({
        prompt: unicodePrompt,
      }));
    });

    it('should handle special characters in thinking text', async () => {
      const ctx: AIStreamContext = {
        res: mockRes,
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      await runAIStream(ctx, async (update) => {
        update({ 
          message: 'Processing', 
          thinkingText: 'Analysis: <script>alert("xss")</script>\n"quoted" text' 
        });
        return { imageData: testResultImage };
      });

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, expect.objectContaining({
        thinkingText: 'Analysis: <script>alert("xss")</script>\n"quoted" text',
      }));
    });

    it('should handle undefined optional fields in result', () => {
      const result: AIStreamResult = {
        imageData: testResultImage,
        // All optional fields undefined
      };

      completeAIStream(mockRes, result);

      expect(sendCompleteSpy).toHaveBeenCalledWith(mockRes, result);
    });

    it('should handle iteration with current > max', () => {
      updateAIStream(mockRes, {
        message: 'Extra iteration',
        iteration: { current: 5, max: 3 },
      });

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, expect.objectContaining({
        iteration: { current: 5, max: 3 },
      }));
    });

    it('should handle iteration with current = 0', () => {
      updateAIStream(mockRes, {
        message: 'Starting',
        iteration: { current: 0, max: 3 },
      });

      expect(sendProgressSpy).toHaveBeenCalledWith(mockRes, expect.objectContaining({
        iteration: { current: 0, max: 3 },
      }));
    });
  });
});
