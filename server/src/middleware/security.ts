/**
 * Security middleware for the API server
 * 
 * Includes:
 * - Rate limiting to prevent abuse
 * - Helmet for security headers
 * - API key validation (optional)
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Rate limiter for general API endpoints
 * Limits each IP to 100 requests per minute
 */
export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'Too many requests',
    details: 'You have exceeded the rate limit. Please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Stricter rate limiter for AI endpoints (which are expensive)
 * Limits each IP to 20 AI requests per minute
 */
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: {
    error: 'AI rate limit exceeded',
    details: 'AI requests are limited to 20 per minute. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Very strict rate limiter for agentic endpoints (very expensive, long-running)
 * Limits each IP to 5 agentic requests per minute
 */
export const agenticRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: {
    error: 'Agentic rate limit exceeded',
    details: 'Agentic edit requests are limited to 5 per minute. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Helmet security headers configuration
 * Customized for API server (not serving HTML)
 */
export const securityHeaders = helmet({
  // Disable content security policy for API server
  contentSecurityPolicy: false,
  // Allow cross-origin requests (handled by CORS)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

/**
 * Optional API key validation middleware
 * 
 * If SERVER_API_KEY is set, requests must include it in the X-API-Key header.
 * This provides an additional layer of security beyond CORS.
 * 
 * Usage:
 *   Set SERVER_API_KEY environment variable to enable
 *   Client must send: X-API-Key: <your-api-key>
 */
export const apiKeyValidator: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const serverApiKey = process.env.SERVER_API_KEY;
  
  // If no server API key is configured, skip validation
  if (!serverApiKey) {
    next();
    return;
  }
  
  const clientApiKey = req.headers['x-api-key'];
  
  if (!clientApiKey) {
    res.status(401).json({
      error: 'API key required',
      details: 'Please provide an API key in the X-API-Key header',
    });
    return;
  }
  
  if (clientApiKey !== serverApiKey) {
    res.status(403).json({
      error: 'Invalid API key',
      details: 'The provided API key is not valid',
    });
    return;
  }
  
  next();
};

/**
 * Request size limiter for AI requests
 * Helps prevent denial of service via large payloads
 */
export const requestSizeCheck: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check content length if available
  const contentLength = req.headers['content-length'];
  const maxSize = 50 * 1024 * 1024; // 50MB (same as express.json limit)
  
  if (contentLength && parseInt(contentLength, 10) > maxSize) {
    res.status(413).json({
      error: 'Request too large',
      details: `Request size exceeds maximum of ${maxSize / 1024 / 1024}MB`,
    });
    return;
  }
  
  next();
};
