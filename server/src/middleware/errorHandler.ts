/**
 * Centralized error handling middleware
 * 
 * Provides consistent error responses across all endpoints
 */

import type { Request, Response, NextFunction } from 'express';
import type { ErrorResponse } from '../types/api.js';
import { ZodError } from 'zod';

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler middleware
 * Should be registered last in the middleware chain
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('Error:', err);

  // Handle APIError instances
  if (err instanceof APIError) {
    const response: ErrorResponse = {
      error: err.message,
      details: err.details,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    };
    return res.status(err.statusCode).json(response);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    const fieldName = firstIssue.path.join('.');
    const response: ErrorResponse = {
      error: `Validation Error: ${fieldName}`,
      details: err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', '),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    };
    return res.status(400).json(response);
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    const response: ErrorResponse = {
      error: 'Validation Error',
      details: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    };
    return res.status(400).json(response);
  }

  // Handle Gemini API errors
  if (err.message?.includes('API key') || err.message?.includes('GEMINI_API_KEY')) {
    const response: ErrorResponse = {
      error: 'API Configuration Error',
      details: 'Gemini API key is missing or invalid',
    };
    return res.status(500).json(response);
  }

  // Default error response
  const response: ErrorResponse = {
    error: 'Internal Server Error',
    details: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };
  res.status(500).json(response);
}

/**
 * 404 handler
 */
export function notFoundHandler(req: Request, res: Response) {
  const response: ErrorResponse = {
    error: 'Not Found',
    details: `Cannot ${req.method} ${req.path}`,
  };
  res.status(404).json(response);
}
