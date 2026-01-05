/**
 * Server-side agentic workflow service
 * 
 * Implements the multi-iteration self-check agentic flow for image editing.
 * Mirrors the client-side AgenticPainterService but adapted for server-side execution.
 */

import type { Response } from 'express';
import type { GeminiService, GeminiProgressEvent } from './geminiService.js';
import type { ImageGenerationService } from './imageGenerationService.js';
import type { AIProgressStep } from '../types/api.js';
import { AI_MODELS, THINKING_BUDGETS } from '../types/api.js';
import { sendProgress } from '../utils/sseHelpers.js';
import { extractBase64Data, extractMimeType } from '../utils/imageHelpers.js';

const MAX_ITERATIONS = 3;

/**
 * Create a progress handler that converts Gemini progress events to SSE events
 */
function createGeminiProgressHandler(
  res: Response,
  step: AIProgressStep,
  iteration: { current: number; max: number }
): (event: GeminiProgressEvent) => void {
  let previousThinkingLength = 0;
  
  return (event) => {
    if (event.type === 'request') {
      // Send the prompt being sent to AI - this starts a new log entry
      sendProgress(res, {
        step,
        message: `Sending request to AI...`,
        prompt: event.prompt,
        iteration,
        newLogEntry: true,  // Force new log entry for each API call
      });
    } else if (event.type === 'streaming') {
      // Send thinking deltas
      if (event.thinking && event.thinking.length > previousThinkingLength) {
        const delta = event.thinking.substring(previousThinkingLength);
        previousThinkingLength = event.thinking.length;
        sendProgress(res, {
          step,
          message: `AI is thinking... (${event.thinking.length} chars)`,
          thinkingTextDelta: delta,
          iteration,
        });
      }
    } else if (event.type === 'response') {
      // Send the final response
      sendProgress(res, {
        step,
        message: `AI response received`,
        rawOutput: event.text,
        iteration,
      });
    } else if (event.type === 'error') {
      sendProgress(res, {
        step: 'error',
        message: event.error || 'Unknown error',
        iteration,
      });
    }
  };
}

export interface AgenticEditOptions {
  /** Source image (base64 data URL) */
  sourceImage: string;
  /** Edit prompt */
  prompt: string;
  /** Optional mask image (base64 data URL) */
  maskImage?: string;
  /** Maximum iterations (default: 3) */
  maxIterations?: number;
  /** SSE response object for streaming updates */
  sseResponse: Response;
}

export interface AgenticEditResult {
  /** Final generated image (base64 data URL) */
  imageData: string;
  /** Number of iterations performed */
  iterations: number;
  /** Final prompt that produced the result */
  finalPrompt: string;
}

/**
 * Create an agentic editing service
 */
export function createAgenticService(
  gemini: GeminiService,
  imageGen: ImageGenerationService
) {
  /**
   * Build the system prompt for the planning phase
   */
  function buildSystemPrompt(userPrompt: string, hasMask: boolean): string {
    const maskContext = hasMask
      ? 'The user has selected a specific area of the image (shown as a white mask). Your edits should focus on this masked region.'
      : 'The user wants to edit the entire image.';

    return `You are an expert image editing assistant working on a SCREENSHOT MODIFICATION task.

USER'S REQUEST: "${userPrompt}"

${maskContext}

Your goal is to create an edit that:
1. Accomplishes exactly what the user wants
2. FITS NATURALLY into the existing image - the modification should look like it belongs there
3. Matches the style, lighting, perspective, and aesthetic of the original screenshot
4. Unless the user explicitly asks for something that stands out, edits should be SEAMLESS and COHERENT

Think deeply about:
- What is the user really trying to achieve?
- What visual details would make this edit look natural and integrated?
- How should lighting, shadows, and style match the surroundings?
- What would make someone looking at the final image NOT notice it was edited?

You have one powerful tool: gemini_image_painter, which uses Gemini 3 Pro to edit images.

Call gemini_image_painter with a detailed prompt that achieves the goal while ensuring visual coherence.

You MUST call the gemini_image_painter tool.`;
  }

  /**
   * Extract refined prompt from planning response
   */
  function extractRefinedPrompt(
    thinking: string,
    text: string,
    functionCall: any,
    fallback: string
  ): string {
    // Priority 1: Function call args
    if (functionCall && functionCall.args && functionCall.args.prompt) {
      return functionCall.args.prompt;
    }

    // Priority 2: Text match pattern
    if (text) {
      const match = text.match(/gemini_image_painter\s*\(\s*prompt\s*=\s*"([^"]+)"/);
      if (match) {
        return match[1];
      }
    }

    // Priority 3: Fallback to original
    return fallback;
  }

  /**
   * Build the self-check prompt for evaluation
   */
  function buildSelfCheckPrompt(
    userPrompt: string,
    editPrompt: string
  ): string {
    return `You are evaluating whether an image edit meets the user's request.

**User's original request:** "${userPrompt}"

**Prompt used for editing:** "${editPrompt}"

You will see two images:
1. The original image (BEFORE)
2. The edited result (AFTER)

Your task: Determine if the edit successfully accomplishes what the user wanted.

Evaluate:
1. Does the edit match the user's request?
2. Is the edit visible and significant enough?
3. Does the edit look natural and coherent with the rest of the image?
4. Are there any issues with quality, artifacts, or unintended changes?

Respond ONLY with a JSON object in this exact format (use a markdown code fence):

\`\`\`json
{
  "satisfied": true or false,
  "reasoning": "explain why the edit does or doesn't meet the goal",
  "revised_prompt": "if not satisfied, provide an improved prompt to fix the issues"
}
\`\`\`

Be strict but fair. If the edit is close to correct, consider it satisfied.`;
  }

  /**
   * Extract evaluation from self-check response
   */
  function extractEvaluation(text: string, thinking: string): {
    satisfied: boolean;
    reasoning: string;
    suggestion: string;
  } {
    const evaluation = { satisfied: true, reasoning: '', suggestion: '' };
    const allText = thinking + '\n' + text;

    // Try to extract JSON from code fence
    const jsonMatch = allText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        evaluation.satisfied = parsed.satisfied === true;
        evaluation.reasoning = parsed.reasoning || '';
        evaluation.suggestion = parsed.revised_prompt || '';
        return evaluation;
      } catch (e) {
        console.error('Failed to parse JSON from code fence:', e);
      }
    }

    // Fallback: try to find raw JSON
    const rawJsonMatch = allText.match(/\{[\s\S]*"satisfied"[\s\S]*\}/);
    if (rawJsonMatch) {
      try {
        const parsed = JSON.parse(rawJsonMatch[0]);
        evaluation.satisfied = parsed.satisfied === true;
        evaluation.reasoning = parsed.reasoning || '';
        evaluation.suggestion = parsed.revised_prompt || '';
        return evaluation;
      } catch (e) {
        console.error('Failed to parse raw JSON:', e);
      }
    }

    // Default to satisfied if we can't parse
    evaluation.reasoning = 'Could not parse evaluation response';
    return evaluation;
  }

  /**
   * Perform self-check on the generated image
   */
  async function selfCheck(
    sourceImage: string,
    resultImage: string,
    userPrompt: string,
    editPrompt: string,
    res: Response,
    iteration: { current: number; max: number }
  ): Promise<{ satisfied: boolean; reasoning: string; suggestion: string }> {
    console.log('🤖 Self-checking result...');

    const sourceBase64 = extractBase64Data(sourceImage);
    const sourceMimeType = extractMimeType(sourceImage);
    const resultBase64 = extractBase64Data(resultImage);
    const resultMimeType = extractMimeType(resultImage);

    const checkPrompt = buildSelfCheckPrompt(userPrompt, editPrompt);

    try {
      // Use streaming for self-check phase with onProgress callback
      let streamedThinking = '';
      let streamedText = '';

      const stream = gemini.callStream({
        model: AI_MODELS.PLANNING,
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'ORIGINAL IMAGE (BEFORE):' },
              {
                inlineData: {
                  mimeType: sourceMimeType,
                  data: sourceBase64,
                },
              },
              { text: 'EDITED IMAGE (AFTER):' },
              {
                inlineData: {
                  mimeType: resultMimeType,
                  data: resultBase64,
                },
              },
              { text: checkPrompt },
            ],
          },
        ],
        thinkingBudget: THINKING_BUDGETS.MEDIUM,
        includeThoughts: true,
        onProgress: createGeminiProgressHandler(res, 'self_checking', iteration),
      });

      // Simplified loop - onProgress handles SSE events
      for await (const chunk of stream) {
        streamedThinking = chunk.thinking;
        streamedText = chunk.text;
      }

      const evaluation = extractEvaluation(streamedText, streamedThinking);

      console.log(`🤖 Self-check result: satisfied=${evaluation.satisfied}, reasoning="${evaluation.reasoning}"`);

      return evaluation;

    } catch (error) {
      console.error('Self-check failed:', error);
      // On error, assume satisfied to avoid blocking progress
      return {
        satisfied: true,
        reasoning: 'Self-check failed, accepting result',
        suggestion: '',
      };
    }
  }

  /**
   * Perform agentic edit with streaming updates
   */
  async function agenticEdit(options: AgenticEditOptions): Promise<AgenticEditResult> {
    const {
      sourceImage,
      prompt,
      maskImage,
      maxIterations = MAX_ITERATIONS,
      sseResponse: res,
    } = options;

    console.log('🤖 Starting agentic edit with streaming updates');

    // Step 1: Plan the edit
    const systemPrompt = buildSystemPrompt(prompt, !!maskImage);
    
    sendProgress(res, {
      step: 'planning',
      message: 'Sending planning request to AI...',
      prompt: systemPrompt,  // Send the full planning prompt
      iteration: { current: 0, max: maxIterations },
    });
    const sourceBase64 = extractBase64Data(sourceImage);
    const sourceMimeType = extractMimeType(sourceImage);

    // Build content parts
    const contentParts: any[] = [
      { text: systemPrompt },
      {
        inlineData: {
          mimeType: sourceMimeType,
          data: sourceBase64,
        },
      },
    ];

    if (maskImage) {
      const maskBase64 = extractBase64Data(maskImage);
      const maskMimeType = extractMimeType(maskImage);
      contentParts.push({ text: 'Here is the mask showing the selected area (white = selected):' });
      contentParts.push({
        inlineData: {
          mimeType: maskMimeType,
          data: maskBase64,
        },
      });
    }

    // Tool declarations
    const toolDeclarations = [
      {
        name: 'gemini_image_painter',
        description: 'Edits the image. Provide a detailed prompt describing what to create/modify, including style and coherence details.',
        parameters: {
          type: 'OBJECT' as const,
          properties: {
            prompt: {
              type: 'STRING' as const,
              description: 'Detailed description of the edit, including how it should fit naturally into the image.',
            },
          },
          required: ['prompt'],
        },
      },
    ];

    console.log('🤖 Planning edit with high thinking budget (streaming)...');

    // Use streaming for planning phase with onProgress callback
    const stream = gemini.callStream({
      model: AI_MODELS.PLANNING,
      contents: [{ role: 'user', parts: contentParts }],
      tools: [{ functionDeclarations: toolDeclarations }],
      thinkingBudget: THINKING_BUDGETS.HIGH,
      includeThoughts: true,
      onProgress: createGeminiProgressHandler(res, 'planning', { current: 0, max: maxIterations }),
    });

    let streamedThinking = '';
    let streamedText = '';
    let refinedPrompt = prompt;
    let lastFunctionCall: any = undefined;

    // Simplified loop - onProgress handles SSE events
    for await (const chunk of stream) {
      streamedThinking = chunk.thinking;
      streamedText = chunk.text;
      if (chunk.functionCall) {
        lastFunctionCall = chunk.functionCall;
      }
    }

    console.log(`🤖 Stream complete: ${streamedThinking.length} thinking chars, ${streamedText.length} text chars`);

    // Extract refined prompt
    refinedPrompt = extractRefinedPrompt(streamedThinking, streamedText, lastFunctionCall, prompt);

    console.log(`🤖 Agent refined prompt: "${refinedPrompt.substring(0, 100)}..."`);

    sendProgress(res, {
      step: 'processing',
      message: 'AI planned the edit',
      rawOutput: streamedText,  // Send the non-thinking response
      iteration: { current: 0, max: maxIterations },
    });

    // Step 2: Iteration loop with self-check
    let finalResult: string | null = null;
    let actualIterations = 0;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      actualIterations = iteration + 1;
      console.log(`🤖 Iteration ${actualIterations}/${maxIterations}`);

      sendProgress(res, {
        step: 'calling_api',
        message: `Generating image (attempt ${actualIterations}/${maxIterations})...`,
        iteration: { current: actualIterations, max: maxIterations },
      });

      try {
        // Generate image
        let generationResult;
        if (maskImage) {
          generationResult = await imageGen.inpaint({
            sourceImage,
            maskImage,
            prompt: refinedPrompt,
            thinkingBudget: THINKING_BUDGETS.LOW,
          });
        } else {
          generationResult = await imageGen.generateImage({
            sourceImage,
            prompt: refinedPrompt,
            model: AI_MODELS.IMAGE_GENERATION,
          });
        }

        finalResult = generationResult.imageData;

      } catch (editError) {
        console.error('🤖 Image generation failed:', editError);
        sendProgress(res, {
          step: 'error',
          message: 'Image generation failed',
          error: {
            message: editError instanceof Error ? editError.message : 'Unknown error',
            details: editError instanceof Error ? editError.stack : undefined,
          },
          iteration: { current: actualIterations, max: maxIterations },
        });
        throw editError;
      }

      if (!finalResult) {
        console.log('🤖 No result from edit, stopping');
        break;
      }

      sendProgress(res, {
        step: 'processing',
        message: `Image generated (attempt ${actualIterations}/${maxIterations})`,
        iteration: { current: actualIterations, max: maxIterations },
        iterationImage: finalResult,
      });

      // Skip self-check on last iteration
      if (iteration >= maxIterations - 1) {
        console.log('🤖 Max iterations reached, using current result');
        sendProgress(res, {
          step: 'processing',
          message: 'Max iterations reached, using final result',
          iteration: { current: actualIterations, max: maxIterations },
        });
        break;
      }

      // Self-check: Did we meet the user's goal?
      const checkResult = await selfCheck(
        sourceImage,
        finalResult,
        prompt,
        refinedPrompt,
        res,
        { current: actualIterations, max: maxIterations }
      );

      if (checkResult.satisfied) {
        console.log(`🤖 Self-check SATISFIED: ${checkResult.reasoning}`);
        sendProgress(res, {
          step: 'processing',
          message: `AI approved: ${checkResult.reasoning}`,  // Include reasoning
          iteration: { current: actualIterations, max: maxIterations },
        });
        break;
      } else {
        console.log(`🤖 Self-check requested REVISION: ${checkResult.reasoning}`);
        
        if (checkResult.suggestion) {
          sendProgress(res, {
            step: 'iterating',
            message: `AI requested revision: ${checkResult.reasoning}`,  // Include reasoning
            rawOutput: checkResult.suggestion,  // The revised prompt suggestion
            iteration: { current: actualIterations, max: maxIterations },
          });

          refinedPrompt = checkResult.suggestion;
          console.log(`🤖 Trying revised prompt: "${refinedPrompt.substring(0, 100)}..."`);
        } else {
          console.log('🤖 No suggestion provided, using current result');
          sendProgress(res, {
            step: 'processing',
            message: 'No revision suggested, using current result',
            iteration: { current: actualIterations, max: maxIterations },
          });
          break;
        }
      }
    }

    if (!finalResult) {
      throw new Error('Failed to generate image after all iterations');
    }

    sendProgress(res, {
      step: 'complete',
      message: 'Edit completed successfully!',
      iteration: { current: actualIterations, max: maxIterations },
    });

    return {
      imageData: finalResult,
      iterations: actualIterations,
      finalPrompt: refinedPrompt,
    };
  }

  return {
    agenticEdit,
  };
}

export type AgenticService = ReturnType<typeof createAgenticService>;
