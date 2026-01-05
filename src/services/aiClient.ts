/**
 * Centralized AI client wrapper that automatically logs all AI calls to the AI console.
 * Use this instead of directly calling genAI.models.generateContent.
 * 
 * In server mode (default), all calls are proxied through the Express backend.
 * In legacy mode (VITE_USE_SERVER_AI=false), calls go directly to Gemini.
 */

import { GoogleGenAI } from '@google/genai';
import { aiLogService } from './aiLogService';
import { THINKING_BUDGETS } from '@/config/aiModels';
import { createAPIClient } from './apiClient';
import { isServerAIEnabled } from '@/config/apiConfig';

export interface AICallOptions {
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
  /** Label for this call in the log (e.g., "Self-Check", "Element Identification") */
  logLabel?: string;
  /** Whether this is an image generation call (no thinking expected) */
  isImageGeneration?: boolean;
}

export interface AICallResult {
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

// Use the centralized helper for consistency
const USE_SERVER_AI = isServerAIEnabled();

/**
 * Create an AI client with automatic logging
 * 
 * @param apiKey - Gemini API key (only required in legacy mode, can be empty string in server mode)
 */
export function createAIClient(apiKey: string) {
  // In server mode, we don't need GoogleGenAI - all calls go through the server
  // In legacy mode, we need a valid API key
  const genAI = USE_SERVER_AI ? null : new GoogleGenAI({ apiKey });
  
  // If server mode enabled, create API client for delegation
  const serverClient = USE_SERVER_AI ? createAPIClient() : null;

  /**
   * Make an AI call with automatic logging
   */
  async function call(options: AICallOptions): Promise<AICallResult> {
    const {
      model,
      contents,
      tools,
      generationConfig,
      thinkingBudget = THINKING_BUDGETS.MEDIUM,
      includeThoughts = true,
      logLabel = 'AI Call',
      isImageGeneration = false,
    } = options;

    // Delegate to server API if enabled
    if (serverClient) {
      aiLogService.appendThinking(`### ${logLabel}\n\n*Using server API...*\n\n`);
      return await serverClient.call(options);
    }

    // Legacy mode: Direct Gemini calls (requires API key and genAI instance)
    if (!genAI) {
      throw new Error('Gemini API client not initialized. Provide a valid API key or enable server mode.');
    }

    // Extract prompt text and image info for logging
    const { text: promptText, imageInfos } = extractPromptParts(contents);

    // Log the call with image summary (not full base64)
    let logContent = `### ${logLabel}\n\n`;

    // Show image summary (not full base64 to keep logs clean)
    if (imageInfos.length > 0) {
      const imageSummary = imageInfos.map((img, i) =>
        `Image ${i + 1}: ${img.sizeKB}KB (${img.mimeType.split('/')[1] || 'unknown'})`
      ).join(', ');
      logContent += `**Input Images:** ${imageInfos.length} (${imageSummary})\n\n`;
    }

    logContent += `**Prompt:**\n\`\`\`\n${promptText}\n\`\`\`\n\n`;

    if (isImageGeneration) {
      logContent += `*Generating image...*\n\n`;
    } else {
      logContent += `*Waiting for AI response...*\n\n`;
    }

    aiLogService.appendThinking(logContent);

    try {
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

      // Log the response
      if (thinking) {
        aiLogService.appendThinking(`**AI Thinking:**\n${thinking}\n\n---\n\n`);
      }

      if (text) {
        aiLogService.appendThinking(`**Response:**\n${text}\n\n`);
      }

      if (functionCall) {
        aiLogService.appendThinking(`**Function Call:** \`${functionCall.name}\`\n\`\`\`json\n${JSON.stringify(functionCall.args, null, 2)}\n\`\`\`\n\n`);
      }

      if (isImageGeneration) {
        const hasImage = result.candidates?.[0]?.content?.parts?.some(
          (p: any) => p.inlineData?.data
        );
        if (hasImage) {
          aiLogService.appendThinking(`**Image generated successfully**\n\n`);
        }
      }

      return {
        raw: result,
        text,
        thinking,
        functionCall,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogService.appendThinking(`**Error:** ${errorMessage}\n\n`);
      console.error(`AI call failed (${logLabel}):`, error);
      throw error;
    }
  }

  /**
   * Make a streaming AI call with automatic logging
   */
  async function* callStream(options: AICallOptions): AsyncGenerator<{
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
      logLabel = 'AI Call (Streaming)',
    } = options;

    // Delegate to server API if enabled
    if (serverClient) {
      aiLogService.appendThinking(`### ${logLabel}\n\n*Using server API (streaming)...*\n\n`);
      yield* serverClient.callStream(options);
      return;
    }

    // Legacy mode: Direct Gemini calls (requires API key and genAI instance)
    if (!genAI) {
      throw new Error('Gemini API client not initialized. Provide a valid API key or enable server mode.');
    }

    // Extract prompt text and image info for logging
    const { text: promptText, imageInfos } = extractPromptParts(contents);

    // Log the call with image summary (not full base64)
    let logContent = `### ${logLabel}\n\n`;

    if (imageInfos.length > 0) {
      const imageSummary = imageInfos.map((img, i) =>
        `Image ${i + 1}: ${img.sizeKB}KB (${img.mimeType.split('/')[1] || 'unknown'})`
      ).join(', ');
      logContent += `**Input Images:** ${imageInfos.length} (${imageSummary})\n\n`;
    }

    logContent += `**Prompt:**\n\`\`\`\n${promptText}\n\`\`\`\n\n*Streaming response...*\n\n`;
    aiLogService.appendThinking(logContent);

    try {
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

        yield {
          text: accumulatedText,
          thinking: accumulatedThinking,
          functionCall,
          done: false,
        };
      }

      // Log final response (no truncation)
      if (accumulatedThinking) {
        aiLogService.appendThinking(`**AI Thinking:**\n${accumulatedThinking}\n\n---\n\n`);
      }
      if (accumulatedText) {
        aiLogService.appendThinking(`**Response:**\n${accumulatedText}\n\n`);
      }
      if (functionCall) {
        aiLogService.appendThinking(`**Function Call:** \`${functionCall.name}\`\n\`\`\`json\n${JSON.stringify(functionCall.args, null, 2)}\n\`\`\`\n\n`);
      }

      yield {
        text: accumulatedText,
        thinking: accumulatedThinking,
        functionCall,
        done: true,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogService.appendThinking(`**Error:** ${errorMessage}\n\n`);
      console.error(`AI streaming call failed (${logLabel}):`, error);
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
 * Image info for logging (without full base64 data)
 */
interface ImageInfo {
  /** Estimated size in KB */
  sizeKB: number;
  /** MIME type */
  mimeType: string;
}

/**
 * Extract text and image info from contents array for logging
 * Returns image metadata instead of full base64 to keep logs clean
 */
function extractPromptParts(contents: any[]): { text: string; imageInfos: ImageInfo[] } {
  const textParts: string[] = [];
  const imageInfos: ImageInfo[] = [];

  for (const content of contents) {
    if (content.parts) {
      for (const part of content.parts) {
        if (part.text) {
          textParts.push(part.text);
        } else if (part.inlineData) {
          // Extract image metadata (not full base64)
          const mimeType = part.inlineData.mimeType || 'image/png';
          const data = part.inlineData.data;
          if (data) {
            // Estimate size: base64 is ~4/3 of binary size
            const sizeKB = Math.round((data.length * 3) / 4 / 1024);
            imageInfos.push({ sizeKB, mimeType });
          }
        }
      }
    } else if (content.text) {
      textParts.push(content.text);
    }
  }

  return { text: textParts.join('\n'), imageInfos };
}

/**
 * Extract text, thinking, and function calls from API response
 */
function extractResponseParts(result: any): { text: string; thinking: string; functionCall?: { name: string; args: Record<string, any> } } {
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

export type AIClient = ReturnType<typeof createAIClient>;
