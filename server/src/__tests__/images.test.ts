/**
 * Integration tests for /api/images endpoints
 * 
 * Tests:
 * - POST /api/images/generate - Image generation/editing
 * - POST /api/images/inpaint - Two-step inpainting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import imagesRouter from '../routes/images.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { createMockGeminiService, mockEnv, createTestImageDataUrl, createInvalidImageDataUrl } from './helpers/mockGemini.js';
import * as geminiService from '../services/geminiService.js';
import type { GenerateImageRequest, GenerateImageResponse, InpaintRequest, InpaintResponse } from '../types/api.js';

describe('POST /api/images/generate', () => {
  let app: Express;
  let cleanupEnv: () => void;

  beforeEach(() => {
    // Setup test app
    app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use('/api/images', imagesRouter);
    app.use(errorHandler);

    // Mock environment
    cleanupEnv = mockEnv({ GEMINI_API_KEY: 'test-api-key' });
  });

  afterEach(() => {
    cleanupEnv();
    vi.restoreAllMocks();
  });

  describe('Successful image generation', () => {
    it('should generate image successfully', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateImageRequest = {
        model: 'gemini-3-pro-image-preview',
        sourceImage: testImageUrl,
        prompt: 'Add a red circle',
      };

      const response = await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(200)
        .expect('Content-Type', /json/);

      const data = response.body as GenerateImageResponse;

      expect(data.imageData).toBeDefined();
      expect(data.imageData).toContain('data:image/');
      expect(data.raw).toBeDefined();
    });

    it('should handle large base64 payloads', async () => {
      // Create a larger base64 payload (simulate a real image)
      const largeBase64 = 'data:image/png;base64,' + 'A'.repeat(10000);
      const mockService = createMockGeminiService({
        image: largeBase64,
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateImageRequest = {
        model: 'gemini-3-pro-image-preview',
        sourceImage: largeBase64,
        prompt: 'Edit this image',
      };

      const response = await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(200);

      const data = response.body as GenerateImageResponse;
      expect(data.imageData).toBeDefined();
    });

    it('should accept logLabel parameter', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateImageRequest = {
        model: 'gemini-3-pro-image-preview',
        sourceImage: testImageUrl,
        prompt: 'Add stars',
        logLabel: 'test-generation',
      };

      await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(200);
    });
  });

  describe('Validation', () => {
    it('should reject missing model', async () => {
      const requestBody = {
        sourceImage: createTestImageDataUrl(),
        prompt: 'Add a circle',
      };

      const response = await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('model');
    });

    it('should reject missing sourceImage', async () => {
      const requestBody = {
        model: 'gemini-3-pro-image-preview',
        prompt: 'Add a circle',
      };

      const response = await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('sourceImage');
    });

    it('should reject invalid sourceImage format', async () => {
      const requestBody = {
        model: 'gemini-3-pro-image-preview',
        sourceImage: createInvalidImageDataUrl(),
        prompt: 'Add a circle',
      };

      const response = await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('sourceImage');
      expect(response.body.details).toContain('base64');
    });

    it('should reject missing prompt', async () => {
      const requestBody = {
        model: 'gemini-3-pro-image-preview',
        sourceImage: createTestImageDataUrl(),
      };

      const response = await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('prompt');
    });

    it('should reject non-string prompt', async () => {
      const requestBody = {
        model: 'gemini-3-pro-image-preview',
        sourceImage: createTestImageDataUrl(),
        prompt: 123,
      };

      const response = await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('prompt');
    });

    it('should reject non-image data URL', async () => {
      const requestBody = {
        model: 'gemini-3-pro-image-preview',
        sourceImage: 'data:text/plain;base64,SGVsbG8=',
        prompt: 'Edit',
      };

      const response = await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('sourceImage');
    });
  });

  describe('Error handling', () => {
    it('should handle missing API key', async () => {
      cleanupEnv();
      cleanupEnv = mockEnv({});

      const requestBody: GenerateImageRequest = {
        model: 'gemini-3-pro-image-preview',
        sourceImage: createTestImageDataUrl(),
        prompt: 'Add a circle',
      };

      const response = await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(500);

      expect(response.body.error).toContain('GEMINI_API_KEY');
    });

    it('should handle Gemini API errors', async () => {
      const mockService = createMockGeminiService({
        shouldError: true,
        errorMessage: 'Image generation quota exceeded',
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: GenerateImageRequest = {
        model: 'gemini-3-pro-image-preview',
        sourceImage: createTestImageDataUrl(),
        prompt: 'Add a circle',
      };

      const response = await request(app)
        .post('/api/images/generate')
        .send(requestBody)
        .expect(500);

      expect(response.body.error).toBeDefined();
      expect(response.body.details).toContain('quota exceeded');
    });
  });
});

describe('POST /api/images/inpaint', () => {
  let app: Express;
  let cleanupEnv: () => void;

  beforeEach(() => {
    // Setup test app
    app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use('/api/images', imagesRouter);
    app.use(errorHandler);

    // Mock environment
    cleanupEnv = mockEnv({ GEMINI_API_KEY: 'test-api-key' });
  });

  afterEach(() => {
    cleanupEnv();
    vi.restoreAllMocks();
  });

  describe('Successful inpainting', () => {
    it('should complete two-step inpainting flow', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
        text: {
          text: 'A detailed description of the masked area',
          thinking: 'Analyzing the masked region...',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: InpaintRequest = {
        sourceImage: testImageUrl,
        maskImage: testImageUrl,
        prompt: 'Replace with a tree',
      };

      const response = await request(app)
        .post('/api/images/inpaint')
        .send(requestBody)
        .expect(200)
        .expect('Content-Type', /json/);

      const data = response.body as InpaintResponse;

      expect(data.imageData).toBeDefined();
      expect(data.imageData).toContain('data:image/');
      expect(data.refinedPrompt).toBeDefined();
      expect(data.thinking).toBeDefined();
    });

    it('should handle custom thinkingBudget', async () => {
      const testImageUrl = createTestImageDataUrl();
      const mockService = createMockGeminiService({
        image: testImageUrl,
        text: {
          text: 'Refined prompt',
          thinking: 'Deep thinking with high budget',
        },
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: InpaintRequest = {
        sourceImage: testImageUrl,
        maskImage: testImageUrl,
        prompt: 'Replace with a mountain',
        thinkingBudget: 8192,
      };

      const response = await request(app)
        .post('/api/images/inpaint')
        .send(requestBody)
        .expect(200);

      const data = response.body as InpaintResponse;
      expect(data.thinking).toBeDefined();
      expect(data.thinking.length).toBeGreaterThan(0);
    });
  });

  describe('Validation', () => {
    it('should reject missing sourceImage', async () => {
      const requestBody = {
        maskImage: createTestImageDataUrl(),
        prompt: 'Replace with a tree',
      };

      const response = await request(app)
        .post('/api/images/inpaint')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('sourceImage');
    });

    it('should reject invalid sourceImage', async () => {
      const requestBody = {
        sourceImage: createInvalidImageDataUrl(),
        maskImage: createTestImageDataUrl(),
        prompt: 'Replace with a tree',
      };

      const response = await request(app)
        .post('/api/images/inpaint')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('sourceImage');
    });

    it('should reject missing maskImage', async () => {
      const requestBody = {
        sourceImage: createTestImageDataUrl(),
        prompt: 'Replace with a tree',
      };

      const response = await request(app)
        .post('/api/images/inpaint')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('maskImage');
    });

    it('should reject invalid maskImage', async () => {
      const requestBody = {
        sourceImage: createTestImageDataUrl(),
        maskImage: createInvalidImageDataUrl(),
        prompt: 'Replace with a tree',
      };

      const response = await request(app)
        .post('/api/images/inpaint')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('maskImage');
    });

    it('should reject missing prompt', async () => {
      const requestBody = {
        sourceImage: createTestImageDataUrl(),
        maskImage: createTestImageDataUrl(),
      };

      const response = await request(app)
        .post('/api/images/inpaint')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('prompt');
    });

    it('should reject non-string prompt', async () => {
      const requestBody = {
        sourceImage: createTestImageDataUrl(),
        maskImage: createTestImageDataUrl(),
        prompt: null,
      };

      const response = await request(app)
        .post('/api/images/inpaint')
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toContain('prompt');
    });
  });

  describe('Error handling', () => {
    it('should handle missing API key', async () => {
      cleanupEnv();
      cleanupEnv = mockEnv({});

      const requestBody: InpaintRequest = {
        sourceImage: createTestImageDataUrl(),
        maskImage: createTestImageDataUrl(),
        prompt: 'Replace with a tree',
      };

      const response = await request(app)
        .post('/api/images/inpaint')
        .send(requestBody)
        .expect(500);

      expect(response.body.error).toContain('GEMINI_API_KEY');
    });

    it('should handle Gemini API errors during inpainting', async () => {
      const mockService = createMockGeminiService({
        shouldError: true,
        errorMessage: 'Inpainting service unavailable',
      });

      vi.spyOn(geminiService, 'createGeminiService').mockReturnValue(mockService);

      const requestBody: InpaintRequest = {
        sourceImage: createTestImageDataUrl(),
        maskImage: createTestImageDataUrl(),
        prompt: 'Replace with a tree',
      };

      const response = await request(app)
        .post('/api/images/inpaint')
        .send(requestBody)
        .expect(500);

      expect(response.body.error).toBeDefined();
      expect(response.body.details).toContain('unavailable');
    });
  });
});
