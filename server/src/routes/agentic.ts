/**
 * Agentic AI routes - POST /api/ai/agentic/edit endpoint
 * 
 * Handles agentic editing with Server-Sent Events (SSE) for real-time progress updates.
 * Implements multi-iteration self-check workflow with streaming responses.
 */

import { Router, type Request, type Response } from 'express';
import { createGeminiService } from '../services/geminiService.js';
import { createImageGenerationService } from '../services/imageGenerationService.js';
import { createAgenticService } from '../services/agenticService.js';
import { asyncHandler, APIError } from '../middleware/errorHandler.js';
import { initSSE, sendComplete, handleSSEError } from '../utils/sseHelpers.js';
import type { AgenticEditResponse } from '../types/api.js';
import { agenticEditRequestSchema } from '../schemas/index.js';

const router = Router();

/**
 * POST /api/ai/agentic/edit
 * 
 * Agentic editing endpoint with SSE streaming
 * 
 * Request body: AgenticEditRequest
 * Response: SSE stream with AIProgressEvent updates
 * 
 * SSE Events:
 * - event: progress, data: AIProgressEvent (JSON)
 * - event: complete, data: AgenticEditResponse (JSON)
 * - event: error, data: { message: string, details?: string } (JSON)
 */
router.post('/edit', asyncHandler(async (req: Request, res: Response) => {
  // Validate request body with Zod
  const {
    sourceImage,
    prompt,
    maskImage,
    maxIterations,
  } = agenticEditRequestSchema.parse(req.body);

  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new APIError(500, 'Server configuration error: GEMINI_API_KEY not set');
  }

  // Initialize SSE stream
  initSSE(res);

  try {
    // Create services
    const gemini = createGeminiService(apiKey);
    const imageGen = createImageGenerationService(gemini);
    const agentic = createAgenticService(gemini, imageGen);

    // Perform agentic edit with streaming updates
    const result = await agentic.agenticEdit({
      sourceImage,
      prompt,
      maskImage,
      maxIterations,
      sseResponse: res,
    });

    // Send completion event
    const completeData: AgenticEditResponse = {
      imageData: result.imageData,
      iterations: result.iterations,
      finalPrompt: result.finalPrompt,
    };

    sendComplete(res, completeData);

    // End the stream
    res.end();

  } catch (error) {
    // Handle errors in SSE stream
    handleSSEError(res, error instanceof Error ? error : String(error));
  }
}));

export default router;
