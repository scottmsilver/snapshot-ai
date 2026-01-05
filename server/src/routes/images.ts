/**
 * Image routes - Image generation and inpainting endpoints
 * 
 * Provides:
 * - POST /api/images/generate - Image generation/editing
 * - POST /api/images/inpaint - Two-step inpainting
 */

import { Router, type Request, type Response } from 'express';
import { createGeminiService } from '../services/geminiService.js';
import { createImageGenerationService } from '../services/imageGenerationService.js';
import { asyncHandler, APIError } from '../middleware/errorHandler.js';
import type {
  GenerateImageResponse,
  InpaintResponse,
} from '../types/api.js';
import { generateImageRequestSchema, inpaintRequestSchema } from '../schemas/index.js';

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
 * Two-step inpainting endpoint using Gemini
 * 
 * Step 1: Describe the masked area
 * Step 2: Edit using the description
 * 
 * Request body: InpaintRequest
 * Response: InpaintResponse
 */
router.post('/inpaint', asyncHandler(async (req: Request, res: Response) => {
  // Validate request body with Zod
  const {
    sourceImage,
    maskImage,
    prompt,
    thinkingBudget,
  } = inpaintRequestSchema.parse(req.body);

  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new APIError(500, 'Server configuration error: GEMINI_API_KEY not set');
  }

  // Create services
  const gemini = createGeminiService(apiKey);
  const imageService = createImageGenerationService(gemini);

  try {
    const result = await imageService.inpaint({
      sourceImage,
      maskImage,
      prompt,
      thinkingBudget,
    });

    const response: InpaintResponse = {
      imageData: result.imageData,
      refinedPrompt: result.refinedPrompt,
      thinking: result.thinking,
    };

    res.json(response);

  } catch (error) {
    // Handle Gemini API errors
    if (error instanceof Error) {
      throw new APIError(
        500,
        'Inpainting failed',
        error.message
      );
    }
    throw error;
  }
}));

export default router;
