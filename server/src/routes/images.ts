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
import type {
  GenerateImageResponse,
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
router.post('/generate', asyncHandler(async (req: Request, res: Response) => {
  // Validate request body with Zod
  const {
    model,
    sourceImage,
    prompt,
    logLabel: _logLabel,
  } = generateImageRequestSchema.parse(req.body);

  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new APIError(500, 'Server configuration error: GEMINI_API_KEY not set');
  }

  // Create services
  const gemini = createGeminiService(apiKey);
  const imageService = createImageGenerationService(gemini);

  try {
    const result = await imageService.generateImage({
      sourceImage,
      prompt,
      model,
    });

    const response: GenerateImageResponse = {
      raw: result.raw,
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
