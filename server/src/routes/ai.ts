/**
 * AI routes - POST /api/ai/generate endpoint
 * 
 * Handles AI text generation requests using Gemini
 */

import { Router, type Request, type Response } from 'express';
import { createGeminiService } from '../services/geminiService.js';
import { asyncHandler, APIError } from '../middleware/errorHandler.js';
import type { GenerateTextResponse } from '../types/api.js';
import { generateTextRequestSchema } from '../schemas/index.js';

const router = Router();

/**
 * POST /api/ai/generate
 * 
 * Text generation endpoint using Gemini
 * 
 * Request body: GenerateTextRequest
 * Response: GenerateTextResponse
 */
router.post('/generate', asyncHandler(async (req: Request, res: Response) => {
  // Validate request body with Zod
  const {
    model,
    contents,
    tools,
    generationConfig,
    thinkingBudget,
    includeThoughts,
    logLabel: _logLabel,
  } = generateTextRequestSchema.parse(req.body);

  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new APIError(500, 'Server configuration error: GEMINI_API_KEY not set');
  }

  // Create service and make call
  const gemini = createGeminiService(apiKey);

  try {
    const result = await gemini.call({
      model,
      contents,
      tools,
      generationConfig,
      thinkingBudget,
      includeThoughts,
      isImageGeneration: false,
    });

    const response: GenerateTextResponse = {
      raw: result.raw,
      text: result.text,
      thinking: result.thinking,
      functionCall: result.functionCall,
    };

    res.json(response);

  } catch (error) {
    // Handle Gemini API errors
    if (error instanceof Error) {
      throw new APIError(
        500,
        'Gemini API call failed',
        error.message
      );
    }
    throw error;
  }
}));

/**
 * POST /api/ai/generate-image (placeholder for future implementation)
 */
router.post('/generate-image', (req: Request, res: Response) => {
  res.status(501).json({
    error: 'Not Implemented',
    message: 'Image generation endpoint will be implemented in a future task',
  });
});

/**
 * POST /api/ai/inpaint (placeholder for future implementation)
 */
router.post('/inpaint', (req: Request, res: Response) => {
  res.status(501).json({
    error: 'Not Implemented',
    message: 'Inpainting endpoint will be implemented in a future task',
  });
});

export default router;
