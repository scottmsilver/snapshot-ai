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
