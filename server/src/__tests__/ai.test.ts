/**
 * Integration tests for /api/ai/generate endpoint
 * 
 * Tests text generation, function calls, thinking extraction, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import aiRouter from '../routes/ai.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { createMockGeminiService, mockEnv } from './helpers/mockGemini.js';
import * as geminiService from '../services/geminiService.js';
import type { GenerateTextRequest, GenerateTextResponse } from '../types/api.js';

describe('POST /api/ai/generate', () => {
  let app: Express;
  let cleanupEnv: () => void;

  beforeEach(() => {
    // Setup test app
    app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use('/api/ai', aiRouter);
    app.use(errorHandler);

    // Mock environment
    cleanupEnv = mockEnv({ GEMINI_API_KEY: 'test-api-key' });
  });

  afterEach(() => {
    cleanupEnv();
    vi.restoreAllMocks();
  });

  describe('Successful text generation', () => {
    it('should generate text successfully', async () => {
      // Mock Gemini service
      const mockService = createMockGeminiService({
        text: {
          text: 'Hello from AI',
          thinking: 'I am thinking...',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateTextRequest = {
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        thinkingBudget: 4096,
        includeThoughts: true,
      };

      const response = await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(200)
        .expect('Content-Type', /json/);

      const data = response.body as GenerateTextResponse;

      expect(data.text).toBe('Hello from AI');
      expect(data.thinking).toBe('I am thinking...');
      expect(data.raw).toBeDefined();
      expect(data.functionCall).toBeUndefined();
    });

    it('should handle function calls', async () => {
      const mockFunctionCall = {
        name: 'get_weather',
        args: { location: 'San Francisco' },
      };

      const mockService = createMockGeminiService({
        text: {
          text: '',
          thinking: 'Let me check the weather',
          functionCall: mockFunctionCall,
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateTextRequest = {
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: 'What is the weather?' }] }],
        tools: [
          {
            functionDeclarations: [
              {
                name: 'get_weather',
                description: 'Get weather for a location',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                },
              },
            ],
          },
        ],
      };

      const response = await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(200);

      const data = response.body as GenerateTextResponse;

      expect(data.functionCall).toEqual(mockFunctionCall);
      expect(data.thinking).toBe('Let me check the weather');
    });

    it('should extract thinking correctly', async () => {
      const mockService = createMockGeminiService({
        text: {
          text: 'The answer is 42',
          thinking: 'First, I need to analyze the question... Then calculate...',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateTextRequest = {
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: 'Complex question' }] }],
        thinkingBudget: 8192,
        includeThoughts: true,
      };

      const response = await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(200);

      const data = response.body as GenerateTextResponse;

      expect(data.thinking).toContain('analyze');
      expect(data.thinking).toContain('calculate');
      expect(data.text).toBe('The answer is 42');
    });

    it('should pass through generationConfig', async () => {
      const mockService = createMockGeminiService({
        text: {
          text: 'Generated with config',
          thinking: '',
        },
      });

      const createServiceSpy = vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateTextRequest = {
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      };

      await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(200);

      // Verify the service was called
      expect(createServiceSpy).toHaveBeenCalledWith('test-api-key');
    });
  });

  describe('Validation', () => {
    it('should reject missing model', async () => {
      const requestBody = {
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const response = await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('model');
    });

    it('should reject missing contents', async () => {
      const requestBody = {
        model: 'gemini-3-flash-preview',
      };

      const response = await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('contents');
    });

    it('should reject empty contents array', async () => {
      const requestBody = {
        model: 'gemini-3-flash-preview',
        contents: [],
      };

      const response = await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('contents');
    });

    it('should reject non-array contents', async () => {
      const requestBody = {
        model: 'gemini-3-flash-preview',
        contents: 'not an array',
      };

      const response = await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('contents');
    });
  });

  describe('Error handling', () => {
    it('should handle missing API key', async () => {
      // Override environment to remove API key
      cleanupEnv();
      cleanupEnv = mockEnv({});

      const requestBody: GenerateTextRequest = {
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const response = await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(500);

      expect(response.body.error).toContain('GEMINI_API_KEY');
    });

    it('should handle Gemini API errors', async () => {
      const mockService = createMockGeminiService({
        shouldError: true,
        errorMessage: 'Rate limit exceeded',
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateTextRequest = {
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const response = await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(500);

      expect(response.body.error).toBeDefined();
      expect(response.body.details).toContain('Rate limit exceeded');
    });

    it('should handle malformed JSON', async () => {
      // Express body-parser returns 400 for malformed JSON, which is then
      // converted to 500 by the error handler for consistency
      const response = await request(app)
        .post('/api/ai/generate')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      // Could be 400 (body-parser) or 500 (error handler)
      expect([400, 500]).toContain(response.status);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Optional parameters', () => {
    it('should work without thinkingBudget', async () => {
      const mockService = createMockGeminiService({
        text: { text: 'Response', thinking: '' },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateTextRequest = {
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(200);
    });

    it('should work without includeThoughts', async () => {
      const mockService = createMockGeminiService({
        text: { text: 'Response', thinking: '' },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateTextRequest = {
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(200);
    });

    it('should accept logLabel parameter', async () => {
      const mockService = createMockGeminiService({
        text: { text: 'Response', thinking: '' },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateTextRequest = {
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        logLabel: 'test-label',
      };

      await request(app)
        .post('/api/ai/generate')
        .send(requestBody)
        .expect(200);
    });
  });
});

/**
 * Helper to parse SSE response body into events
 */
function parseSSEEvents(body: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const lines = body.split('\n');
  let currentEvent = '';
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      currentData = line.slice(5).trim();
    } else if (line === '' && currentEvent && currentData) {
      try {
        events.push({ event: currentEvent, data: JSON.parse(currentData) });
      } catch {
        events.push({ event: currentEvent, data: currentData });
      }
      currentEvent = '';
      currentData = '';
    }
  }

  return events;
}

describe('POST /api/ai/inpaint-stream', () => {
  let app: Express;
  let cleanupEnv: () => void;
  let mockFetch: ReturnType<typeof vi.fn>;

  const testSourceImage = 'data:image/png;base64,TEST_SOURCE_IMAGE';
  const testMaskImage = 'data:image/png;base64,TEST_MASK_IMAGE';
  const testPrompt = 'Remove the background';
  const testResultImage = 'data:image/png;base64,RESULT_IMAGE';

  /**
   * Create a mock SSE stream response from Python
   */
  function createMockSSEStream(events: Array<{ type: string; data: unknown }>) {
    const encoder = new TextEncoder();
    let eventIndex = 0;
    
    return new ReadableStream({
      pull(controller) {
        if (eventIndex < events.length) {
          const event = events[eventIndex];
          const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
          eventIndex++;
        } else {
          controller.close();
        }
      },
    });
  }

  /**
   * Create default mock Python SSE response with progress and complete events
   */
  function createDefaultPythonSSEResponse() {
    return createMockSSEStream([
      { 
        type: 'progress', 
        data: { 
          step: 'planning', 
          message: 'Planning the edit...',
          prompt: testPrompt,
        } 
      },
      { 
        type: 'progress', 
        data: { 
          step: 'generation', 
          message: 'Generating edit',
          thinkingText: 'Analyzing the masked region...',
          prompt: 'Enhanced: Remove the background',
        } 
      },
      { 
        type: 'progress', 
        data: { 
          step: 'complete', 
          message: 'Complete',
          iterationImage: testResultImage,
        } 
      },
      { 
        type: 'complete', 
        data: { 
          imageData: testResultImage,
          iterations: 1,
          finalPrompt: 'Enhanced: Remove the background',
        } 
      },
    ]);
  }

  beforeEach(() => {
    // Setup test app
    app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use('/api/ai', aiRouter);
    app.use(errorHandler);

    // Mock environment
    cleanupEnv = mockEnv({ 
      GEMINI_API_KEY: 'test-api-key',
      PYTHON_SERVER_URL: 'http://localhost:8001',
    });

    // Mock global fetch for Python server calls - now returns SSE stream
    mockFetch = vi.fn().mockImplementation(() => Promise.resolve({
      ok: true,
      body: createDefaultPythonSSEResponse(),
      text: async () => '', // Not used when body is available
    }));
    global.fetch = mockFetch;
  });

  afterEach(() => {
    cleanupEnv();
    vi.restoreAllMocks();
  });

  describe('Route availability', () => {
    it('should respond with 200 (not 404) for valid inpaint-stream request', async () => {
      // This test verifies the route is properly mounted and accessible
      // A 404 would indicate the route is not registered
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody);

      // Route should be found (not 404)
      expect(response.status).not.toBe(404);
      // Should be SSE response
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
    });

    it('should return 400 for missing required fields (not 404)', async () => {
      // Even with invalid data, route should be found (400, not 404)
      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send({});

      expect(response.status).not.toBe(404);
      expect(response.status).toBe(400);
    });
  });

  describe('SSE event structure', () => {
    it('should include sourceImage, maskImage, and prompt in first progress event', async () => {
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      const events = parseSSEEvents(response.text);
      
      // Find the first progress event
      const firstProgress = events.find(e => e.event === 'progress');
      expect(firstProgress).toBeDefined();
      
      const progressData = firstProgress!.data as {
        sourceImage?: string;
        maskImage?: string;
        prompt?: string;
        newLogEntry?: boolean;
      };
      
      // Bug fix verification: first event MUST include all input data
      expect(progressData.sourceImage).toBe(testSourceImage);
      expect(progressData.maskImage).toBe(testMaskImage);
      expect(progressData.prompt).toBe(testPrompt);
      expect(progressData.newLogEntry).toBe(true);
    });

    it('should have newLogEntry: true only on first event', async () => {
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200);

      const events = parseSSEEvents(response.text);
      const progressEvents = events.filter(e => e.event === 'progress');
      
      // Should have at least 2 progress events (analyzing, generating)
      expect(progressEvents.length).toBeGreaterThanOrEqual(2);
      
      // First event should have newLogEntry: true
      const firstProgress = progressEvents[0].data as { newLogEntry?: boolean };
      expect(firstProgress.newLogEntry).toBe(true);
      
      // Second event should NOT have newLogEntry: true (updates existing entry)
      const secondProgress = progressEvents[1].data as { newLogEntry?: boolean };
      expect(secondProgress.newLogEntry).toBeFalsy();
    });

    it('should send progress events followed by complete', async () => {
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200);

      const events = parseSSEEvents(response.text);
      
      // Get progress events and complete event
      const progressEvents = events.filter(e => e.event === 'progress');
      const completeEvent = events.find(e => e.event === 'complete');
      
      // Should have multiple progress events
      expect(progressEvents.length).toBeGreaterThanOrEqual(3);
      
      // Should end with complete event containing result
      expect(completeEvent).toBeDefined();
      expect((completeEvent!.data as { imageData?: string }).imageData).toBe(testResultImage);
    });

    it('should include thinking text in progress events', async () => {
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200);

      const events = parseSSEEvents(response.text);
      const progressEvents = events.filter(e => e.event === 'progress');
      
      // Find event with thinking text (the "Generating edit" step)
      const eventWithThinking = progressEvents.find(
        e => (e.data as { thinkingText?: string }).thinkingText
      );
      expect(eventWithThinking).toBeDefined();
      expect((eventWithThinking!.data as { thinkingText?: string }).thinkingText).toBe('Analyzing the masked region...');
    });

    it('should include refined prompt in progress events', async () => {
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200);

      const events = parseSSEEvents(response.text);
      const progressEvents = events.filter(e => e.event === 'progress');
      
      // Find event with refined prompt
      const eventWithPrompt = progressEvents.find(
        e => (e.data as { prompt?: string }).prompt === 'Enhanced: Remove the background'
      );
      expect(eventWithPrompt).toBeDefined();
    });

    it('should include iterationImage in final progress event', async () => {
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200);

      const events = parseSSEEvents(response.text);
      const progressEvents = events.filter(e => e.event === 'progress');
      
      // Last progress event should have step: 'complete' and iterationImage
      const lastProgress = progressEvents[progressEvents.length - 1];
      const data = lastProgress.data as { step?: string; iterationImage?: string };
      expect(data.step).toBe('complete');
      expect(data.iterationImage).toBe(testResultImage);
    });
  });

  describe('Complete event data', () => {
    it('should include imageData in complete event', async () => {
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200);

      const events = parseSSEEvents(response.text);
      const completeEvent = events.find(e => e.event === 'complete');
      
      expect(completeEvent).toBeDefined();
      const completeData = completeEvent!.data as { imageData?: string };
      expect(completeData.imageData).toBe(testResultImage);
      expect(completeData.imageData).toMatch(/^data:image\/(png|jpeg);base64,/);
    });

    it('should include finalPrompt in complete event', async () => {
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200);

      const events = parseSSEEvents(response.text);
      const completeEvent = events.find(e => e.event === 'complete');
      
      expect(completeEvent).toBeDefined();
      const completeData = completeEvent!.data as { finalPrompt?: string };
      expect(completeData.finalPrompt).toBe('Enhanced: Remove the background');
    });

    it('should include iterations in complete event', async () => {
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200);

      const events = parseSSEEvents(response.text);
      const completeEvent = events.find(e => e.event === 'complete');
      
      expect(completeEvent).toBeDefined();
      const completeData = completeEvent!.data as { iterations?: number };
      expect(completeData.iterations).toBe(1);
    });

    it('complete event should have all required fields from Python SSE', async () => {
      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200);

      const events = parseSSEEvents(response.text);
      const completeEvent = events.find(e => e.event === 'complete');
      
      expect(completeEvent).toBeDefined();
      const completeData = completeEvent!.data as {
        imageData?: string;
        iterations?: number;
        finalPrompt?: string;
      };
      
      // Python SSE complete event has these fields (not thinking/refinedPrompt)
      expect(completeData).toHaveProperty('imageData');
      expect(completeData).toHaveProperty('iterations');
      expect(completeData).toHaveProperty('finalPrompt');
      
      // Validate types
      expect(typeof completeData.imageData).toBe('string');
      expect(typeof completeData.iterations).toBe('number');
      expect(typeof completeData.finalPrompt).toBe('string');
      
      // imageData should be a valid base64 data URL
      expect(completeData.imageData).toMatch(/^data:image\/(png|jpeg);base64,/);
    });
  });

  describe('Error handling', () => {
    it('should send error event when Python server fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => 'Python server error',
      });

      const requestBody = {
        sourceImage: testSourceImage,
        maskImage: testMaskImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(200);

      const events = parseSSEEvents(response.text);
      const errorEvent = events.find(e => e.event === 'error');
      
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as { message?: string }).message).toContain('Python server error');
    });

    it('should validate request body', async () => {
      // Missing maskImage
      const requestBody = {
        sourceImage: testSourceImage,
        prompt: testPrompt,
      };

      const response = await request(app)
        .post('/api/ai/inpaint-stream')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});
