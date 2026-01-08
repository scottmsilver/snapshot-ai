/**
 * Shared AI Stream Helper
 * 
 * Provides a consistent SSE streaming protocol for all AI endpoints.
 * Both inpaint and agentic edit use this same interface.
 * 
 * Protocol:
 * 1. First progress event: includes sourceImage, maskImage (if any), prompt, newLogEntry: true
 * 2. Subsequent progress events: step updates, thinking text, iteration info
 * 3. Final progress event: step: 'complete', iterationImage with result
 * 4. Complete event: full result data for promise resolution
 */

import type { Response } from 'express';
import type { AIProgressEvent } from '../types/api.js';
import { initSSE, sendProgress, sendComplete, endSSE, handleSSEError } from './sseHelpers.js';

// Only log in development
const DEBUG = process.env.NODE_ENV !== 'production';
function debugLog(message: string, data?: Record<string, unknown>): void {
  if (DEBUG) {
    console.log(`[aiStreamHelper] ${message}`, data ? JSON.stringify(data) : '');
  }
}

export interface AIStreamContext {
  res: Response;
  sourceImage: string;
  maskImage?: string;
  prompt: string;
}

export interface AIStreamResult {
  imageData: string;
  thinking?: string;
  refinedPrompt?: string;
  /** Alias for refinedPrompt - used by agentic endpoint */
  finalPrompt?: string;
  iterations?: number;
}

/**
 * Start an AI stream - initializes SSE and sends first progress event with inputs
 */
export function startAIStream(ctx: AIStreamContext): void {
  initSSE(ctx.res);
  
  debugLog('startAIStream', { 
    hasSourceImage: !!ctx.sourceImage, 
    hasMaskImage: !!ctx.maskImage 
  });
  
  // First event MUST include all inputs for the log display
  sendProgress(ctx.res, {
    step: 'processing',
    message: 'Starting AI operation',
    sourceImage: ctx.sourceImage,
    maskImage: ctx.maskImage,
    prompt: ctx.prompt,
    newLogEntry: true,
  });
}

/**
 * Send a progress update during AI processing
 */
export function updateAIStream(
  res: Response,
  update: {
    step?: AIProgressEvent['step'];
    message: string;
    thinkingText?: string;
    prompt?: string;
    iteration?: { current: number; max: number };
    iterationImage?: string;
  }
): void {
  debugLog('updateAIStream', { message: update.message });
  sendProgress(res, {
    step: update.step || 'processing',
    message: update.message,
    thinkingText: update.thinkingText,
    prompt: update.prompt,
    iteration: update.iteration,
    iterationImage: update.iterationImage,
  });
}

/**
 * Complete an AI stream - sends final progress with result, then complete event
 */
export function completeAIStream(res: Response, result: AIStreamResult): void {
  debugLog('completeAIStream', { imageDataLength: result.imageData?.length || 0 });
  
  // Send final progress event with result image (for log display)
  sendProgress(res, {
    step: 'complete',
    message: 'Complete',
    iterationImage: result.imageData,
    thinkingText: result.thinking,
  });
  
  // Send complete event (for promise resolution)
  sendComplete(res, result);
  
  // End the stream
  endSSE(res);
}

/**
 * Handle an error in the AI stream
 */
export function errorAIStream(res: Response, error: Error | string): void {
  handleSSEError(res, error);
}

/**
 * Run an AI operation with consistent streaming protocol
 * 
 * This is the main entry point - handles the full lifecycle:
 * 1. Start stream with inputs
 * 2. Run the operation (caller provides updates via callback)
 * 3. Complete stream with result
 * 
 * @example
 * ```ts
 * await runAIStream(
 *   { res, sourceImage, maskImage, prompt },
 *   async (update) => {
 *     update({ message: 'Analyzing...' });
 *     const result = await doSomething();
 *     update({ message: 'Generating...', thinkingText: result.thinking });
 *     return { imageData: result.image, thinking: result.thinking };
 *   }
 * );
 * ```
 */
export async function runAIStream(
  ctx: AIStreamContext,
  operation: (update: (u: Parameters<typeof updateAIStream>[1]) => void) => Promise<AIStreamResult>
): Promise<void> {
  try {
    debugLog('runAIStream starting');
    startAIStream(ctx);
    
    const update = (u: Parameters<typeof updateAIStream>[1]): void => updateAIStream(ctx.res, u);
    debugLog('runAIStream calling operation');
    const result = await operation(update);
    debugLog('runAIStream operation returned');
    
    completeAIStream(ctx.res, result);
    debugLog('runAIStream done');
  } catch (error) {
    // Always log errors, even in production
    console.error('[aiStreamHelper] runAIStream error:', error);
    errorAIStream(ctx.res, error instanceof Error ? error : String(error));
  }
}
