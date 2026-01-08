/**
 * Server-Sent Events (SSE) utilities
 * 
 * Provides helper functions for SSE streaming responses.
 * Used by agentic endpoints to stream progress updates to the client.
 */

import type { Response } from 'express';
import type { AIProgressEvent } from '../types/api.js';

/**
 * Initialize an SSE response stream
 * 
 * Sets the required headers for SSE and ensures the connection stays open.
 * Call this before sending any SSE events.
 */
export function initSSE(res: Response): void {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial comment to establish connection
  res.write(': SSE stream initialized\n\n');

  // Flush headers immediately
  res.flushHeaders();
}

/**
 * Extended Response type that includes optional flush method
 * (added by compression middleware)
 */
interface FlushableResponse extends Response {
  flush?: () => void;
}

/**
 * Send an SSE event to the client
 * 
 * @param res - Express response object
 * @param event - Event name (e.g., 'progress', 'complete', 'error')
 * @param data - Event data (will be JSON stringified)
 */
export function sendSSE(
  res: Response,
  event: string,
  data: unknown
): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  res.write(message);
  // Force flush - try multiple methods (flush is added by compression middleware)
  const flushableRes = res as FlushableResponse;
  if (typeof flushableRes.flush === 'function') {
    flushableRes.flush();
  }
  // For Node.js streams, cork/uncork can help with flushing
  if (res.socket && !res.socket.destroyed) {
    res.socket.uncork?.();
  }
}

// Only log in development
const DEBUG = process.env.NODE_ENV !== 'production';

/**
 * Send a progress event (convenience wrapper)
 * 
 * @param res - Express response object
 * @param progressEvent - Progress event data
 */
export function sendProgress(
  res: Response,
  progressEvent: AIProgressEvent
): void {
  if (DEBUG) {
    console.log('[SSE] sendProgress:', {
      step: progressEvent.step,
      message: progressEvent.message,
      hasInputImages: progressEvent.inputImages?.length ?? 0,
    });
  }
  sendSSE(res, 'progress', progressEvent);
}

/**
 * Send a completion event
 * 
 * @param res - Express response object
 * @param data - Completion data
 */
export function sendComplete(
  res: Response,
  data: unknown
): void {
  sendSSE(res, 'complete', data);
}

/**
 * Send an error event
 * 
 * @param res - Express response object
 * @param error - Error object or message
 */
export function sendError(
  res: Response,
  error: Error | string
): void {
  const errorData = typeof error === 'string'
    ? { message: error }
    : { message: error.message, details: error.stack };

  sendSSE(res, 'error', errorData);
}

/**
 * End an SSE stream
 * 
 * Optionally send a final event before closing.
 * 
 * @param res - Express response object
 * @param finalEvent - Optional final event to send before closing
 */
export function endSSE(
  res: Response,
  finalEvent?: { event: string; data: unknown }
): void {
  if (finalEvent) {
    sendSSE(res, finalEvent.event, finalEvent.data);
  }

  // End the stream
  res.end();
}

/**
 * Utility to handle SSE errors and ensure stream cleanup
 * 
 * @param res - Express response object
 * @param error - Error object
 */
export function handleSSEError(
  res: Response,
  error: Error | string
): void {
  console.error('SSE stream error:', error);
  
  if (!res.headersSent) {
    // Headers not sent yet - send as regular error response
    res.status(500).json({
      error: 'Internal Server Error',
      message: typeof error === 'string' ? error : error.message,
    });
  } else {
    // Headers already sent - send as SSE error event
    sendError(res, error);
    endSSE(res);
  }
}
