/**
 * API Key validation middleware
 * 
 * Validates that required API keys are present before processing requests.
 * Extracts the API key and attaches it to the request for downstream use.
 */

import type { Request, Response, NextFunction } from 'express';
import { APIError } from './errorHandler.js';

/**
 * Extended Request interface that includes validated API key
 */
export interface ApiKeyRequest extends Request {
  geminiApiKey: string;
}

/**
 * Middleware that validates GEMINI_API_KEY is present in environment.
 * If valid, attaches the key to req.geminiApiKey for use in route handlers.
 * 
 * Usage:
 * ```typescript
 * router.post('/endpoint', requireGeminiApiKey, asyncHandler(async (req: ApiKeyRequest, res) => {
 *   const gemini = createGeminiService(req.geminiApiKey);
 *   // ...
 * }));
 * ```
 */
export function requireGeminiApiKey(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return next(new APIError(500, 'Server configuration error: GEMINI_API_KEY not set'));
  }
  
  // Attach API key to request for downstream use
  (req as ApiKeyRequest).geminiApiKey = apiKey;
  next();
}
