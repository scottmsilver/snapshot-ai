/**
 * Client-side API adapter that calls Express endpoints instead of Gemini directly.
 * 
 * Provides the same interface as aiClient.ts but uses fetch to call /api/ai/* endpoints.
 * This allows for a drop-in replacement when wiring up the server integration.
 */

import ky from 'ky';
import { buildApiUrl, API_ENDPOINTS, getApiUrl } from '@/config/apiConfig';
import { ssePostRequest, SSEError } from './sseClient';

// Only log in development
const DEBUG = import.meta.env.DEV;
function debugLog(message: string, data?: Record<string, unknown>): void {
  if (DEBUG) {
    console.log(`[apiClient] ${message}`, data ?? '');
  }
}
import type {
  GenerateTextRequest,
  GenerateTextResponse,
  GenerateImageRequest,
  GenerateImageResponse,
  InpaintRequest,
  InpaintResponse,
  AgenticEditRequest,
  AgenticEditResponse,
  AIProgressEvent,
  ErrorResponse,
} from '../../server/src/types/api.js';
import type { AICallOptions, AICallResult } from './aiClient';

/**
 * Custom error class for API-related errors
 */
export class APIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Create ky instance with proper configuration
 */
const api = ky.create({
  prefixUrl: getApiUrl(),
  timeout: 60000,
  hooks: {
    beforeError: [
      async (error) => {
        const { response } = error;
        if (response && response.body) {
          try {
            const errorData = await response.json() as ErrorResponse;
            const apiError = new APIError(
              errorData.error || 'Unknown server error',
              response.status,
              errorData.details
            );
            // Preserve the original error but add our custom error as the cause
            error.message = apiError.message;
            (error as any).apiError = apiError;
          } catch {
            // If we can't parse JSON, use default error
            const apiError = new APIError(
              `HTTP ${response.status}: ${response.statusText}`,
              response.status
            );
            error.message = apiError.message;
            (error as any).apiError = apiError;
          }
        }
        return error;
      },
    ],
  },
});

/**
 * Create an API client that matches the aiClient interface
 */
export function createAPIClient() {
  /**
   * Make an AI call via the server (non-streaming)
   * 
   * Maps AICallOptions to the appropriate server endpoint.
   */
  async function call(options: AICallOptions): Promise<AICallResult> {
    const {
      model,
      contents,
      tools,
      generationConfig,
      thinkingBudget,
      includeThoughts,
      logLabel,
      isImageGeneration,
    } = options;

    // Build request matching server API
    const request: GenerateTextRequest = {
      model,
      contents,
      tools,
      generationConfig,
      thinkingBudget,
      includeThoughts,
      logLabel,
    };

    // Determine endpoint based on options
    if (isImageGeneration) {
      // For image generation, we need different parameters
      // This is a simplified version - real implementation would extract image from contents
      throw new APIError('Image generation not yet supported via API adapter');
    }

    // Make the API call
    try {
      const response = await api.post(API_ENDPOINTS.GENERATE_TEXT, { json: request }).json<GenerateTextResponse>();
      return {
        raw: response.raw,
        text: response.text,
        thinking: response.thinking,
        functionCall: response.functionCall,
      };
    } catch (error: any) {
      // Re-throw APIError from hook
      if (error.apiError) {
        throw error.apiError;
      }
      // Wrap other errors (network errors, etc.)
      throw new APIError(
        'Network error',
        undefined,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Make a streaming AI call via the server (SSE)
   * 
   * Currently only supports agentic edit endpoint with streaming.
   * For other streaming needs, extend this method.
   */
  async function* callStream(_options: AICallOptions): AsyncGenerator<{
    text: string;
    thinking: string;
    functionCall?: { name: string; args: Record<string, any> };
    done: boolean;
  }> {
    // This is a simplified implementation
    // Full implementation would map options to appropriate streaming endpoint
    throw new APIError('Streaming not yet fully implemented in API adapter');
    // Note: This unreachable yield is needed to satisfy TypeScript's generator requirements
    yield { text: '', thinking: '', done: true };
  }

  /**
   * Generate an image via the server
   */
  async function generateImage(
    sourceImage: string,
    prompt: string,
    options: {
      model: string;
      maskImage?: string;
      logLabel?: string;
    }
  ): Promise<{ imageData: string }> {
    const request: GenerateImageRequest = {
      model: options.model,
      sourceImage,
      prompt,
      maskImage: options.maskImage,
      isImageGeneration: true,
      logLabel: options.logLabel,
    };

    try {
      const response = await api.post(API_ENDPOINTS.GENERATE_IMAGE, { json: request }).json<GenerateImageResponse>();
      return { imageData: response.imageData };
    } catch (error: any) {
      // Re-throw APIError from hook
      if (error.apiError) {
        throw error.apiError;
      }
      // Wrap other errors (network errors, etc.)
      throw new APIError(
        'Network error',
        undefined,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Perform two-step inpainting via the server
   */
  async function inpaint(
    sourceImage: string,
    maskImage: string,
    prompt: string,
    options: {
      thinkingBudget?: number;
    } = {}
  ): Promise<InpaintResponse> {
    const request: InpaintRequest = {
      sourceImage,
      maskImage,
      prompt,
      thinkingBudget: options.thinkingBudget,
    };

    try {
      return await api.post(API_ENDPOINTS.INPAINT, { json: request }).json<InpaintResponse>();
    } catch (error: any) {
      // Re-throw APIError from hook
      if (error.apiError) {
        throw error.apiError;
      }
      // Wrap other errors (network errors, etc.)
      throw new APIError(
        'Network error',
        undefined,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Perform SSE streaming inpaint via the server
   * 
   * Uses the /api/ai/inpaint-stream endpoint which wraps the Python backend.
   * Sends SSE events: progress (analyzing, generating) and complete (with imageData).
   * 
   * @param sourceImage - Base64 encoded source image
   * @param maskImage - Base64 encoded mask image
   * @param prompt - User's edit prompt
   * @param options.thinkingBudget - Optional thinking budget for AI
   * @param options.onProgress - Callback for SSE progress events
   */
  async function inpaintStream(
    sourceImage: string,
    maskImage: string,
    prompt: string,
    options: {
      thinkingBudget?: number;
      onProgress?: (event: AIProgressEvent) => void;
    } = {}
  ): Promise<InpaintResponse> {
    const request: InpaintRequest = {
      sourceImage,
      maskImage,
      prompt,
      thinkingBudget: options.thinkingBudget,
    };

    const url = buildApiUrl(API_ENDPOINTS.INPAINT_STREAM);
    debugLog('Inpaint streaming', { url, hasSourceImage: !!sourceImage, hasMaskImage: !!maskImage });

    try {
      return await ssePostRequest<InpaintResponse, AIProgressEvent>(
        url,
        request,
        {
          onProgress: options.onProgress,
        }
      );
    } catch (error) {
      // Map SSEError to APIError
      if (error instanceof SSEError) {
        throw new APIError(error.message, undefined, error.details);
      }
      throw error;
    }
  }

  /**
   * Perform agentic edit with SSE streaming
   * 
   * @param sourceImage - Base64 encoded source image
   * @param prompt - User's edit prompt
   * @param options.maskImage - Optional mask for inpainting
   * @param options.maxIterations - Max self-check iterations (default: 3)
   * @param options.onProgress - Callback for SSE progress events
   * @param options.useLangGraph - If true, routes to Python/LangGraph backend
   */
  async function agenticEdit(
    sourceImage: string,
    prompt: string,
    options: {
      maskImage?: string;
      maxIterations?: number;
      onProgress?: (event: AIProgressEvent) => void;
      useLangGraph?: boolean;
    } = {}
  ): Promise<AgenticEditResponse> {
    const request: AgenticEditRequest = {
      sourceImage,
      prompt,
      maskImage: options.maskImage,
      maxIterations: options.maxIterations,
    };

    // Choose endpoint based on useLangGraph setting
    const endpoint = options.useLangGraph 
      ? API_ENDPOINTS.AGENTIC_EDIT_LANGGRAPH 
      : API_ENDPOINTS.AGENTIC_EDIT;
    const url = buildApiUrl(endpoint);
    debugLog('Agentic edit', { backend: options.useLangGraph ? 'LangGraph' : 'Express', url });

    try {
      return await ssePostRequest<AgenticEditResponse, AIProgressEvent>(
        url,
        request,
        {
          onProgress: options.onProgress,
        }
      );
    } catch (error) {
      // Map SSEError to APIError
      if (error instanceof SSEError) {
        throw new APIError(error.message, undefined, error.details);
      }
      throw error;
    }
  }

  return {
    call,
    callStream,
    generateImage,
    inpaint,
    inpaintStream,
    agenticEdit,
  };
}

export type APIClient = ReturnType<typeof createAPIClient>;
