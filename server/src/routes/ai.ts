/**
 * AI routes - POST /api/ai/generate and /api/ai/inpaint-stream endpoints
 * 
 * Handles AI text generation requests using Gemini
 * and SSE streaming inpaint endpoint that wraps Python backend
 */

import { Router, type Request, type Response } from 'express';
import { createGeminiService } from '../services/geminiService.js';
import { asyncHandler, APIError } from '../middleware/errorHandler.js';
import { requireGeminiApiKey, type ApiKeyRequest } from '../middleware/apiKeyValidation.js';
import type { GenerateTextResponse, GeminiRawResponse } from '../types/api.js';
import { generateTextRequestSchema, inpaintRequestSchema } from '../schemas/index.js';
import { initSSE, sendSSE } from '../utils/sseHelpers.js';

const router = Router();

/**
 * POST /api/ai/generate
 * 
 * Text generation endpoint using Gemini
 * 
 * Request body: GenerateTextRequest
 * Response: GenerateTextResponse
 */
router.post('/generate', requireGeminiApiKey, asyncHandler(async (req: Request, res: Response) => {
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

  // Create service and make call (API key validated by middleware)
  const gemini = createGeminiService((req as ApiKeyRequest).geminiApiKey);

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
      raw: result.raw as GeminiRawResponse,
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

/**
 * POST /api/ai/inpaint-stream
 * 
 * SSE streaming inpaint endpoint that proxies to Python backend.
 * Python now returns SSE events which we forward to the client.
 */
// Only log in development
const DEBUG = process.env.NODE_ENV !== 'production';

router.post('/inpaint-stream', asyncHandler(async (req: Request, res: Response) => {
  if (DEBUG) console.log('[inpaint-stream] Request received');
  
  // Validate request body with Zod
  const {
    sourceImage,
    maskImage,
    prompt,
    thinkingBudget,
  } = inpaintRequestSchema.parse(req.body);

  // Get Python server URL from environment
  const pythonServerUrl = process.env.PYTHON_SERVER_URL || 'http://localhost:8001';

  // Initialize SSE response using shared helper
  initSSE(res);

  // Send initial progress event with all input data for frontend log entry creation
  sendSSE(res, 'progress', {
    step: 'processing',
    message: 'Starting AI operation',
    sourceImage,
    maskImage,
    prompt,
    newLogEntry: true,
    hasSourceImage: !!sourceImage,
    hasMaskImage: !!maskImage,
  });

  try {
    // Call Python inpaint endpoint - now returns SSE
    if (DEBUG) console.log('[inpaint-stream] Calling Python server...');
    const pythonResponse = await fetch(`${pythonServerUrl}/api/images/inpaint`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ sourceImage, maskImage, prompt, thinkingBudget }),
    });

    if (DEBUG) console.log('[inpaint-stream] Python response status:', pythonResponse.status);
    
    if (!pythonResponse.ok) {
      // Try to get error details - handle both JSON and SSE error responses
      const contentType = pythonResponse.headers.get('content-type') || '';
      if (DEBUG) console.log('[inpaint-stream] Python error content-type:', contentType);
      
      if (contentType.includes('text/event-stream')) {
        // Python returned SSE (200) but we got here - shouldn't happen
        throw new Error(`Python server returned ${pythonResponse.status} with SSE`);
      } else {
        const errorText = await pythonResponse.text();
        throw new Error(`Python server returned ${pythonResponse.status}: ${errorText}`);
      }
    }

    if (!pythonResponse.body) {
      throw new Error('No response body from Python server');
    }

    // Stream SSE events from Python directly to client
    // SSE format: "event: <type>\ndata: <json>\n\n"
    if (DEBUG) console.log('[inpaint-stream] Starting to stream from Python...');
    const reader = pythonResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (DEBUG) console.log('[inpaint-stream] Python stream done, total chunks:', chunkCount);
        break;
      }

      chunkCount++;
      const chunk = decoder.decode(value, { stream: true });
      if (DEBUG && chunkCount <= 3) console.log(`[inpaint-stream] Chunk ${chunkCount} length:`, chunk.length);
      
      buffer += chunk;
      
      // SSE events are separated by double newlines
      // Split on \n\n to get complete events
      const parts = buffer.split('\n\n');
      
      // Keep the last part in buffer (might be incomplete)
      buffer = parts.pop() || '';
      
      // Forward complete events
      for (const eventText of parts) {
        if (eventText.trim()) {
          // Forward the complete SSE event with proper termination
          res.write(eventText + '\n\n');
        }
      }
    }

    // Handle any remaining buffered content
    if (buffer.trim()) {
      if (DEBUG) console.log('[inpaint-stream] Flushing remaining buffer length:', buffer.length);
      res.write(buffer + '\n\n');
    }

  } catch (error) {
    // Send error as SSE event using shared helper
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (DEBUG) console.error('[inpaint-stream] Error:', message);
    
    sendSSE(res, 'error', {
      message,
      details: error instanceof Error ? error.stack : undefined,
    });
  }

  res.end();
}));

export default router;
