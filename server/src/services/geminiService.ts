/**
 * Server-side Gemini AI service
 * 
 * Mirrors the client-side aiClient.ts but adapted for server use.
 * Handles all interactions with Google's Gemini API.
 */

import { GoogleGenAI } from '@google/genai';
import { THINKING_BUDGETS } from '../config/aiModels.js';

/**
 * Extended parameters for Gemini SDK - extends the SDK types with additional
 * config options that are supported at runtime but not in SDK type definitions
 */
interface GeminiRequestParams {
  model: string;
  contents: GeminiContent[];
  tools?: GeminiTool[];
  generationConfig?: Record<string, unknown>;
  config?: {
    tools?: GeminiTool[];
    thinkingConfig?: {
      thinkingBudget?: number;
      includeThoughts?: boolean;
    };
    [key: string]: unknown;
  };
}

/**
 * Type for function call results from Gemini API
 */
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiProgressEvent {
  type: 'request' | 'streaming' | 'response' | 'error';
  /** The prompt/request being sent (text parts only, not images) */
  prompt?: string;
  /** Accumulated thinking text */
  thinking?: string;
  /** Accumulated response text */
  text?: string;
  /** Function call if present */
  functionCall?: GeminiFunctionCall;
  /** Error if type is 'error' */
  error?: string;
}

export type GeminiProgressCallback = (event: GeminiProgressEvent) => void;

/**
 * Type for content parts sent to Gemini API
 */
export interface GeminiContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: GeminiFunctionCall;
}

/**
 * Type for content sent to Gemini API
 */
export interface GeminiContent {
  role: 'user' | 'model' | 'function';
  parts: GeminiContentPart[];
}

/**
 * Type for tool function declarations
 */
export interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

/**
 * Type for tools passed to Gemini API
 */
export interface GeminiTool {
  functionDeclarations: GeminiToolDeclaration[];
}

/**
 * Options for non-streaming Gemini calls (e.g., image generation).
 * Progress callback is optional for these calls.
 */
export interface GeminiCallOptions {
  /** The model to use */
  model: string;
  /** The content/prompt to send */
  contents: GeminiContent[];
  /** Optional tools (function declarations) */
  tools?: GeminiTool[];
  /** Generation config (e.g., responseModalities for image generation) */
  generationConfig?: Record<string, unknown>;
  /** Thinking budget - defaults to MEDIUM */
  thinkingBudget?: number;
  /** Whether to include thoughts in response - defaults to true for text models */
  includeThoughts?: boolean;
  /** Whether this is an image generation call (no thinking expected) */
  isImageGeneration?: boolean;
  /** Optional callback for progress events */
  onProgress?: GeminiProgressCallback;
}

/**
 * Options for streaming Gemini calls with thinking.
 * Progress callback is REQUIRED to ensure transparency.
 * 
 * This enforces that all streaming AI calls emit:
 * - The prompt being sent
 * - Thinking deltas as they stream
 * - The raw output when complete
 */
export interface GeminiStreamOptions {
  /** The model to use */
  model: string;
  /** The content/prompt to send */
  contents: GeminiContent[];
  /** Optional tools (function declarations) */
  tools?: GeminiTool[];
  /** Thinking budget - defaults to HIGH for streaming */
  thinkingBudget?: number;
  /** Whether to include thoughts in response - defaults to true */
  includeThoughts?: boolean;
  /** REQUIRED callback for progress events - ensures transparency */
  onProgress: GeminiProgressCallback;
}

export interface GeminiCallResult {
  /** The raw result from the API (external API response, accessed via optional chaining) */
  raw: unknown;
  /** Extracted text response (non-thinking parts) */
  text: string;
  /** Extracted thinking text */
  thinking: string;
  /** Function call if present */
  functionCall?: GeminiFunctionCall;
}

/**
 * Service interface returned by createGeminiService
 */
export interface GeminiServiceInstance {
  call: (options: GeminiCallOptions) => Promise<GeminiCallResult>;
  callStream: (options: GeminiStreamOptions) => AsyncGenerator<{
    text: string;
    thinking: string;
    functionCall?: GeminiFunctionCall;
    done: boolean;
  }>;
  raw: GoogleGenAI;
}

/**
 * Create a Gemini AI client
 */
export function createGeminiService(apiKey: string): GeminiServiceInstance {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required');
  }

  const genAI = new GoogleGenAI({ apiKey });

  /**
   * Make an AI call
   */
  async function call(options: GeminiCallOptions): Promise<GeminiCallResult> {
    const {
      model,
      contents,
      tools,
      generationConfig,
      thinkingBudget = THINKING_BUDGETS.MEDIUM,
      includeThoughts = true,
      isImageGeneration = false,
      onProgress,
    } = options;

    // Extract text prompt for logging
    const promptText = extractPromptText(contents);

    try {
      // Emit request event
      onProgress?.({ type: 'request', prompt: promptText });

      // Build the request - cast to SDK expected type at call site
      const request: GeminiRequestParams = {
        model,
        contents,
      };

      if (tools) {
        request.tools = tools;
      }

      if (generationConfig) {
        request.generationConfig = generationConfig;
      }

      // Add thinking config for non-image-generation calls
      if (!isImageGeneration && includeThoughts) {
        request.config = {
          thinkingConfig: {
            thinkingBudget,
            includeThoughts: true,
          },
        };
      }

      // Make the API call - cast needed because SDK types don't include all runtime options
      const result = await genAI.models.generateContent(
        request as Parameters<typeof genAI.models.generateContent>[0]
      );

      // Extract response parts
      const { text, thinking, functionCall } = extractResponseParts(result);

      // Emit response event
      onProgress?.({
        type: 'response',
        prompt: promptText,
        thinking,
        text,
        functionCall,
      });

      return {
        raw: result,
        text,
        thinking,
        functionCall,
      };

    } catch (error) {
      // Emit error event
      onProgress?.({
        type: 'error',
        prompt: promptText,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('Gemini API call failed:', error);
      throw error;
    }
  }

  /**
   * Make a streaming AI call with REQUIRED progress callback.
   * 
   * This ensures full transparency for all streaming AI calls:
   * - The prompt being sent (emitted at start)
   * - Thinking deltas (emitted as they stream)
   * - The raw output (emitted at end)
   * 
   * Use this for any AI call that involves thinking/reasoning.
   */
  async function* callStream(options: GeminiStreamOptions): AsyncGenerator<{
    text: string;
    thinking: string;
    functionCall?: GeminiFunctionCall;
    done: boolean;
  }> {
    const {
      model,
      contents,
      tools,
      thinkingBudget = THINKING_BUDGETS.HIGH,
      includeThoughts = true,
      onProgress,
    } = options;

    // Extract text prompt for logging
    const promptText = extractPromptText(contents);

    try {
      // Emit request event - this is now guaranteed since onProgress is required
      onProgress({ type: 'request', prompt: promptText });

      // Build the request - cast to SDK expected type at call site
      const request: GeminiRequestParams = {
        model,
        contents,
      };

      if (tools) {
        request.tools = tools;
      }

      if (includeThoughts) {
        request.config = {
          thinkingConfig: {
            thinkingBudget,
            includeThoughts: true,
          },
        };
      }

      // Make the streaming API call - cast needed because SDK types don't include all runtime options
      const stream = await genAI.models.generateContentStream(
        request as Parameters<typeof genAI.models.generateContentStream>[0]
      );

      let accumulatedText = '';
      let accumulatedThinking = '';
      let functionCall: GeminiFunctionCall | undefined;

      for await (const chunk of stream) {
        const extracted = extractResponseParts(chunk);

        if (extracted.thinking) {
          accumulatedThinking += extracted.thinking;
        }
        if (extracted.text) {
          accumulatedText += extracted.text;
        }
        if (extracted.functionCall) {
          functionCall = extracted.functionCall;
        }

        // Emit streaming event with accumulated data - guaranteed since onProgress is required
        onProgress({
          type: 'streaming',
          prompt: promptText,
          thinking: accumulatedThinking,
          text: accumulatedText,
          functionCall,
        });

        yield {
          text: accumulatedText,
          thinking: accumulatedThinking,
          functionCall,
          done: false,
        };
      }

      // Emit final response event - guaranteed since onProgress is required
      onProgress({
        type: 'response',
        prompt: promptText,
        thinking: accumulatedThinking,
        text: accumulatedText,
        functionCall,
      });

      yield {
        text: accumulatedText,
        thinking: accumulatedThinking,
        functionCall,
        done: true,
      };

    } catch (error) {
      // Emit error event - guaranteed since onProgress is required
      onProgress({
        type: 'error',
        prompt: promptText,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('Gemini streaming call failed:', error);
      throw error;
    }
  }

  return {
    call,
    callStream,
    /** Direct access to underlying genAI for advanced use cases */
    raw: genAI,
  };
}

/**
 * Extract text prompt from contents for logging (excludes images/binary data)
 */
function extractPromptText(contents: GeminiContent[]): string {
  const texts: string[] = [];
  for (const content of contents) {
    if (content.parts) {
      for (const part of content.parts) {
        if (part.text) {
          texts.push(part.text);
        }
      }
    }
  }
  return texts.join('\n\n');
}

/**
 * Response part structure from Gemini API (used for type-safe extraction)
 */
interface GeminiResponsePart {
  text?: string;
  thought?: boolean;
  functionCall?: {
    name?: string;
    args?: Record<string, unknown>;
  };
}

/**
 * Extract text, thinking, and function calls from API response
 */
function extractResponseParts(result: unknown): {
  text: string;
  thinking: string;
  functionCall?: GeminiFunctionCall;
} {
  let text = '';
  let thinking = '';
  let functionCall: GeminiFunctionCall | undefined;

  // Type-safe access to nested response structure
  const response = result as {
    candidates?: Array<{
      content?: {
        parts?: GeminiResponsePart[];
      };
    }>;
    text?: string;
  } | null;

  const parts = response?.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.thought && part.text) {
      thinking += part.text;
    } else if (part.text) {
      text += part.text;
    } else if (part.functionCall && part.functionCall.name) {
      functionCall = {
        name: part.functionCall.name,
        args: part.functionCall.args || {},
      };
    }
  }

  // Fallback to result.text if available
  if (!text && response?.text) {
    text = response.text;
  }

  return { text, thinking, functionCall };
}

export type GeminiService = ReturnType<typeof createGeminiService>;
