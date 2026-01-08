/**
 * Image routes - Image generation and inpainting endpoints
 * 
 * Provides:
 * - POST /api/images/generate - Image generation/editing
 * - POST /api/images/inpaint - DEPRECATED (migrated to Python server)
 */

import { Router, type Request, type Response } from 'express';
import { createGeminiService } from '../services/geminiService.js';
import { createImageGenerationService } from '../services/imageGenerationService.js';
import { asyncHandler, APIError } from '../middleware/errorHandler.js';
import { requireGeminiApiKey, type ApiKeyRequest } from '../middleware/apiKeyValidation.js';
import type {
  GenerateImageResponse,
  GeminiRawResponse,
} from '../types/api.js';
import { generateImageRequestSchema } from '../schemas/index.js';

const router = Router();

/**
 * POST /api/images/generate
 * 
 * Image generation/editing endpoint using Gemini
 * 
 * Request body: GenerateImageRequest
 * Response: GenerateImageResponse
 */
router.post('/generate', requireGeminiApiKey, asyncHandler(async (req: Request, res: Response) => {
  // Validate request body with Zod
  const {
    model,
    sourceImage,
    prompt,
    logLabel: _logLabel,
  } = generateImageRequestSchema.parse(req.body);

  // Create services (API key validated by middleware)
  const gemini = createGeminiService((req as ApiKeyRequest).geminiApiKey);
  const imageService = createImageGenerationService(gemini);

  try {
    const result = await imageService.generateImage({
      sourceImage,
      prompt,
      model,
    });

    const response: GenerateImageResponse = {
      raw: result.raw as GeminiRawResponse,
      imageData: result.imageData,
    };

    res.json(response);

  } catch (error) {
    // Handle Gemini API errors
    if (error instanceof Error) {
      throw new APIError(
        500,
        'Image generation failed',
        error.message
      );
    }
    throw error;
  }
}));

/**
 * POST /api/images/inpaint
 * 
 * DEPRECATED: This endpoint has been migrated to the Python server.
 * Use /api/images/inpaint on the Python server (port 8001) instead.
 */
router.post('/inpaint', asyncHandler(async (_req: Request, _res: Response) => {
  throw new APIError(501, 'DEPRECATED: Use Python server at /api/images/inpaint instead');
}));

export default router;
