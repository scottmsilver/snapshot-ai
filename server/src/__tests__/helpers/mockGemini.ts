/**
 * Mock Gemini SDK responses for testing
 * 
 * Provides test doubles for the @google/genai SDK to avoid real API calls.
 * Uses the "Fake" pattern - these are working implementations with shortcuts.
 */

import type { GeminiService, GeminiCallOptions, GeminiCallResult } from '../../services/geminiService.js';

/**
 * Mock response for a text generation call
 */
export function createMockTextResponse(options: {
  text?: string;
  thinking?: string;
  functionCall?: { name: string; args: Record<string, any> };
}): any {
  const { text = 'Mock response', thinking = '', functionCall } = options;

  const parts: any[] = [];

  // Add thinking parts
  if (thinking) {
    parts.push({
      thought: true,
      text: thinking,
    });
  }

  // Add text parts
  if (text) {
    parts.push({
      text,
    });
  }

  // Add function call parts
  if (functionCall) {
    parts.push({
      functionCall,
    });
  }

  return {
    candidates: [
      {
        content: {
          parts,
        },
      },
    ],
    text, // Fallback for simple responses
  };
}

/**
 * Mock response for an image generation call
 */
export function createMockImageResponse(imageData: string = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='): any {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageData.split(',')[1] || imageData,
              },
            },
          ],
        },
      },
    ],
  };
}

/**
 * Create a mock Gemini service for testing
 */
export function createMockGeminiService(
  customResponses?: {
    text?: Partial<GeminiCallResult>;
    image?: string;
    shouldError?: boolean;
    errorMessage?: string;
  }
): GeminiService {
  const responses = customResponses || {};

  async function call(options: GeminiCallOptions): Promise<GeminiCallResult> {
    // Simulate API errors if configured
    if (responses.shouldError) {
      throw new Error(responses.errorMessage || 'Mock Gemini API error');
    }

    // Return image response for image generation
    if (options.isImageGeneration || options.generationConfig?.responseModalities) {
      const mockResponse = createMockImageResponse(responses.image);
      return {
        raw: mockResponse,
        text: '',
        thinking: '',
      };
    }

    // Return text/function call response
    const mockResponse = createMockTextResponse({
      text: responses.text?.text || 'Mock AI response',
      thinking: responses.text?.thinking || 'Mock thinking',
      functionCall: responses.text?.functionCall,
    });

    return {
      raw: mockResponse,
      text: responses.text?.text || 'Mock AI response',
      thinking: responses.text?.thinking || 'Mock thinking',
      functionCall: responses.text?.functionCall,
    };
  }

  async function* callStream(options: GeminiCallOptions) {
    if (responses.shouldError) {
      throw new Error(responses.errorMessage || 'Mock Gemini streaming error');
    }

    const text = responses.text?.text || 'Mock streaming response';
    const thinking = responses.text?.thinking || 'Mock streaming thinking';
    const functionCall = responses.text?.functionCall;
    const onProgress = options.onProgress;

    // Emit request event like the real service does
    onProgress?.({ type: 'request', prompt: 'Mock prompt' });

    // Simulate streaming chunks
    const chunks = text.split(' ');
    let accumulatedText = '';
    const accumulatedThinking = thinking;

    for (let i = 0; i < chunks.length; i++) {
      accumulatedText += (i > 0 ? ' ' : '') + chunks[i];
      
      // Emit streaming event like the real service does
      onProgress?.({
        type: 'streaming',
        prompt: 'Mock prompt',
        thinking: accumulatedThinking,
        text: accumulatedText,
        functionCall,
      });
      
      yield {
        text: accumulatedText,
        thinking: accumulatedThinking,
        functionCall,
        done: i === chunks.length - 1,
      };
    }
    
    // Emit response event like the real service does
    onProgress?.({
      type: 'response',
      prompt: 'Mock prompt',
      thinking: accumulatedThinking,
      text: accumulatedText,
      functionCall,
    });
  }

  return {
    call,
    callStream,
    raw: {} as any, // Not used in tests
  };
}

/**
 * Mock environment variables for testing
 */
export function mockEnv(env: Record<string, string>): () => void {
  const original = { ...process.env };

  Object.assign(process.env, env);

  // Return cleanup function
  return () => {
    process.env = original;
  };
}

/**
 * Create a valid test image data URL (1x1 transparent PNG)
 */
export function createTestImageDataUrl(): string {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

/**
 * Create an invalid image data URL for testing validation
 */
export function createInvalidImageDataUrl(): string {
  return 'not-a-data-url';
}
