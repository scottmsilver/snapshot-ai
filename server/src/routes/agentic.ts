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
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireGeminiApiKey, type ApiKeyRequest } from '../middleware/apiKeyValidation.js';
import { startAIStream, completeAIStream, errorAIStream } from '../utils/aiStreamHelper.js';
import type { AgenticEditResponse as _AgenticEditResponse } from '../types/api.js';
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
router.post('/edit', requireGeminiApiKey, asyncHandler(async (req: Request, res: Response) => {
  // Validate request body with Zod
  const {
    sourceImage,
    prompt,
    maskImage,
    maxIterations,
  } = agenticEditRequestSchema.parse(req.body);

  // Initialize SSE stream with first event containing images
  // This creates the log entry that agenticService will update
  const inputImages: Array<{ label: string; dataUrl: string }> = [
    { label: 'Source Image', dataUrl: sourceImage },
  ];
  if (maskImage) {
    inputImages.push({ label: 'Mask (white = edit area)', dataUrl: maskImage });
  }
  startAIStream({ res, prompt, inputImages });

  // Small delay to ensure first SSE event is flushed
  await new Promise(resolve => setImmediate(resolve));

  try {
    // Create services (API key validated by middleware)
    const gemini = createGeminiService((req as ApiKeyRequest).geminiApiKey);
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

    // Use shared completeAIStream for consistent protocol
    completeAIStream(res, {
      imageData: result.imageData,
      iterations: result.iterations,
      finalPrompt: result.finalPrompt,
    });

  } catch (error) {
    // Handle errors in SSE stream
    errorAIStream(res, error instanceof Error ? error : String(error));
  }
}));

export default router;
