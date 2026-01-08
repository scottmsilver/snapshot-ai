/**
 * Server-side Gemini AI service
 * 
 * Mirrors the client-side aiClient.ts but adapted for server use.
 * Handles all interactions with Google's Gemini API.
 */

import { GoogleGenAI } from '@google/genai';
import { THINKING_BUDGETS } from '../config/aiModels.js';

export interface GeminiProgressEvent {
  type: 'request' | 'streaming' | 'response' | 'error';
  /** The prompt/request being sent (text parts only, not images) */
  prompt?: string;
  /** Accumulated thinking text */
  thinking?: string;
  /** Accumulated response text */
  text?: string;
  /** Function call if present */
  functionCall?: { name: string; args: Record<string, any> };
  /** Error if type is 'error' */
  error?: string;
}

export type GeminiProgressCallback = (event: GeminiProgressEvent) => void;

/**
 * Options for non-streaming Gemini calls (e.g., image generation).
 * Progress callback is optional for these calls.
 */
export interface GeminiCallOptions {
  /** The model to use */
  model: string;
  /** The content/prompt to send */
  contents: any[];
  /** Optional tools (function declarations) */
  tools?: any[];
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
  contents: any[];
  /** Optional tools (function declarations) */
  tools?: any[];
  /** Thinking budget - defaults to HIGH for streaming */
  thinkingBudget?: number;
  /** Whether to include thoughts in response - defaults to true */
  includeThoughts?: boolean;
  /** REQUIRED callback for progress events - ensures transparency */
  onProgress: GeminiProgressCallback;
}

export interface GeminiCallResult {
  /** The raw result from the API */
  raw: any;
  /** Extracted text response (non-thinking parts) */
  text: string;
  /** Extracted thinking text */
  thinking: string;
  /** Function call if present */
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
}

/**
 * Create a Gemini AI client
 */
export function createGeminiService(apiKey: string) {
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

      // Build the request
      const request: any = {
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

      // Make the API call
      const result = await genAI.models.generateContent(request);

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
    functionCall?: { name: string; args: Record<string, any> };
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

      // Build the request
      const request: any = {
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

      // Make the streaming API call
      const stream = await genAI.models.generateContentStream(request);

      let accumulatedText = '';
      let accumulatedThinking = '';
      let functionCall: { name: string; args: Record<string, any> } | undefined;

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
function extractPromptText(contents: any[]): string {
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
 * Extract text, thinking, and function calls from API response
 */
function extractResponseParts(result: any): {
  text: string;
  thinking: string;
  functionCall?: { name: string; args: Record<string, any> };
} {
  let text = '';
  let thinking = '';
  let functionCall: { name: string; args: Record<string, any> } | undefined;

  const parts = result.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.thought && part.text) {
      thinking += part.text;
    } else if (part.text) {
      text += part.text;
    } else if (part.functionCall) {
      functionCall = {
        name: part.functionCall.name,
        args: part.functionCall.args || {},
      };
    }
  }

  // Fallback to result.text if available
  if (!text && result.text) {
    text = result.text;
  }

  return { text, thinking, functionCall };
}

export type GeminiService = ReturnType<typeof createGeminiService>;
