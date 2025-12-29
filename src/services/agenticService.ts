import { GoogleGenAI } from '@google/genai';
import { GenerativeInpaintService } from './generativeApi';
import { imageDataToBase64, base64ToImageData } from '@/utils/maskRendering';
import type { AIProgressEvent } from '@/types/aiProgress';

const MAX_ITERATIONS = 3;
const HIGH_THINKING_BUDGET = 8192;
const CHECK_THINKING_BUDGET = 4096;

export class AgenticPainterService {
    private genAI: GoogleGenAI;
    private underlyingService: GenerativeInpaintService;

    constructor(apiKey: string, underlyingService: GenerativeInpaintService) {
        this.genAI = new GoogleGenAI({ apiKey });
        this.underlyingService = underlyingService;
    }

    private buildSystemPrompt(userPrompt: string, hasMask: boolean): string {
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

    private extractRefinedPrompt(result: any, fallback: string): { refinedPrompt: string; thinking: string } {
        const parts = result.candidates?.[0]?.content?.parts || [];
        let refinedPrompt = fallback;
        let thinking = '';

        for (const part of parts) {
            // Capture thought summaries
            if (part.thought && part.text) {
                thinking += `[Thought] ${part.text}\n\n`;
            }
            // Check for function call
            if (part.functionCall) {
                const args = part.functionCall.args || {};
                refinedPrompt = args.prompt || fallback;
                thinking += `[Action] Called gemini_image_painter`;
            } else if (part.text && !part.thought) {
                // Try to extract from text response
                const text = part.text;
                thinking += text;
                const match = text.match(/gemini_image_painter\s*\(\s*prompt\s*=\s*"([^"]+)"/);
                if (match) {
                    refinedPrompt = match[1];
                }
            }
        }

        return { refinedPrompt, thinking };
    }

    private extractEvaluation(result: any): { satisfied: boolean; reasoning: string; suggestion: string; thinking: string } {
        const parts = result.candidates?.[0]?.content?.parts || [];
        let evaluation = { satisfied: true, reasoning: '', suggestion: '' };
        let thinking = '';

        for (const part of parts) {
            if (part.thought && part.text) {
                thinking += `[Thought] ${part.text}\n\n`;
            }
            if (part.functionCall) {
                const name = part.functionCall.name;
                const args = part.functionCall.args || {};

                if (name === 'mark_satisfied') {
                    evaluation.satisfied = true;
                    evaluation.reasoning = args.reasoning || '';
                    thinking += `[Action] Marked SATISFIED: ${evaluation.reasoning}`;
                } else if (name === 'request_revision') {
                    evaluation.satisfied = false;
                    evaluation.reasoning = args.reasoning || '';
                    evaluation.suggestion = args.revised_prompt || '';
                    thinking += `[Action] Requested REVISION: ${evaluation.reasoning}`;
                }
            } else if (part.text && !part.thought) {
                thinking += part.text;
                // Try to parse from text if no function call
                if (part.text.toLowerCase().includes('satisfied') && !part.text.toLowerCase().includes('not satisfied') && !part.text.toLowerCase().includes('request_revision')) {
                    evaluation.satisfied = true;
                    evaluation.reasoning = part.text;
                } else if (part.text.toLowerCase().includes('not satisfied') || part.text.toLowerCase().includes('request_revision') || part.text.toLowerCase().includes('revision')) {
                    evaluation.satisfied = false;
                    evaluation.reasoning = part.text;

                    // Try to extract the revised prompt from text like: request_revision "prompt here"
                    const revisionMatch = part.text.match(/request_revision\s*"([^"]+)"/i) ||
                                          part.text.match(/request_revision\s*\(\s*"([^"]+)"/i) ||
                                          part.text.match(/revised[_\s]prompt[:\s]*"([^"]+)"/i);
                    if (revisionMatch) {
                        evaluation.suggestion = revisionMatch[1];
                        console.log(`🤖 Agentic Service: Extracted revision prompt from text`);
                    }
                }
            }
        }

        return { ...evaluation, thinking };
    }

    async edit(
        sourceImage: ImageData,
        prompt: string,
        maskImage?: ImageData,
        onProgress?: (event: AIProgressEvent) => void
    ): Promise<ImageData> {
        console.log('🤖 Agentic Service: Starting agentic edit with high thinking and self-check');

        // Step 1: Agent plans the edit with high thinking budget
        const systemPrompt = this.buildSystemPrompt(prompt, !!maskImage);
        
        // Generate base64 images for preview and API
        const sourceBase64 = imageDataToBase64(sourceImage);
        const maskBase64 = maskImage ? imageDataToBase64(maskImage) : null;
        
        // Calculate image sizes
        const sourceKB = Math.round((sourceBase64.length * 3) / 4 / 1024);
        const maskKB = maskBase64 ? Math.round((maskBase64.length * 3) / 4 / 1024) : 0;
        
        // Show the user what we're sending with image previews
        const planningContext = `## Planning Request

**User prompt:** "${prompt}"

**Mode:** ${maskImage ? 'Inpainting (masked region)' : 'Full image edit'}

### Images Being Sent

**Source Image:** ${sourceImage.width} x ${sourceImage.height} (${sourceKB} KB)

![Source Image](${sourceBase64})

${maskImage ? `**Mask Image:** ${maskImage.width} x ${maskImage.height} (${maskKB} KB)

![Mask Image](${maskBase64})` : ''}

### System Prompt
\`\`\`
${systemPrompt}
\`\`\`

**Planning Model:** \`gemini-2.5-flash\` (thinking budget: ${HIGH_THINKING_BUDGET} tokens)
**Image Generation Model:** \`gemini-3-pro-image-preview\`

---
*Waiting for AI response...*`;

        onProgress?.({
            step: 'planning',
            message: 'Sending planning request to AI...',
            thinkingText: planningContext,
            iteration: { current: 0, max: MAX_ITERATIONS }
        });

        try {
            const contentParts: any[] = [
                { text: systemPrompt },
                { inlineData: { mimeType: 'image/png', data: sourceBase64.split(',')[1] } },
            ];

            if (maskImage && maskBase64) {
                contentParts.push({ text: 'Here is the mask showing the selected area (white = selected):' });
                contentParts.push({ inlineData: { mimeType: 'image/png', data: maskBase64.split(',')[1] } });
            }

            const toolDeclarations = [{
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
            }];

            console.log('🤖 Agentic Service: Planning edit with high thinking budget (streaming)...');

            onProgress?.({
                step: 'calling_api',
                message: 'Waiting for AI planning response...',
                iteration: { current: 0, max: MAX_ITERATIONS }
            });

            // Use streaming to show thinking tokens as they arrive
            const stream = await this.genAI.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: contentParts }],
                tools: [{ functionDeclarations: toolDeclarations }],
                config: {
                    thinkingConfig: {
                        thinkingBudget: HIGH_THINKING_BUDGET,
                        includeThoughts: true,
                    },
                },
            } as any);

            // Collect streaming response and show thinking in real-time
            let streamedThinking = '';
            let streamedText = '';
            let refinedPrompt = prompt;
            let chunkCount = 0;
            
            // Send immediate update that we're starting to receive
            onProgress?.({
                step: 'planning',
                message: 'Receiving AI response...',
                thinkingText: `## AI Thinking\n\n*Waiting for thoughts...*`,
                iteration: { current: 0, max: MAX_ITERATIONS }
            });
            
            for await (const chunk of stream) {
                chunkCount++;
                const parts = chunk.candidates?.[0]?.content?.parts || [];
                
                console.log(`🤖 Stream chunk #${chunkCount}:`, parts.length, 'parts');
                
                for (const part of parts) {
                    // Log what we're getting
                    console.log(`🤖 Part: thought=${part.thought}, hasText=${!!part.text}, hasFunctionCall=${!!part.functionCall}`);
                    
                    // Check if this is a thought part
                    if (part.thought && part.text) {
                        streamedThinking += part.text;
                        console.log(`🤖 Thought chunk: "${part.text.substring(0, 50)}..."`);
                        
                        // Update UI immediately with each thought chunk
                        onProgress?.({
                            step: 'planning',
                            message: `AI is thinking... (${streamedThinking.length} chars)`,
                            thinkingText: `## AI Thinking\n\n${streamedThinking}`,
                            iteration: { current: 0, max: MAX_ITERATIONS }
                        });
                    }
                    // Check for function call
                    if (part.functionCall) {
                        console.log(`🤖 Function call:`, part.functionCall.name);
                        const args = (part.functionCall.args || {}) as Record<string, unknown>;
                        if (typeof args.prompt === 'string') {
                            refinedPrompt = args.prompt;
                            console.log(`🤖 Got refined prompt from function call`);
                        }
                    }
                    // Check for regular text (non-thought)
                    if (part.text && !part.thought) {
                        streamedText += part.text;
                        console.log(`🤖 Text chunk: "${part.text.substring(0, 50)}..."`);
                        // Try to extract prompt from text if no function call
                        const match = part.text.match(/gemini_image_painter\s*\(\s*prompt\s*=\s*"([^"]+)"/);
                        if (match) {
                            refinedPrompt = match[1];
                            console.log(`🤖 Got refined prompt from text`);
                        }
                    }
                }
            }
            
            console.log(`🤖 Stream complete: ${chunkCount} chunks, ${streamedThinking.length} thinking chars, ${streamedText.length} text chars`);
            
            const planThinking = streamedThinking || streamedText;
            
            // Send final update with all thinking
            if (planThinking) {
                onProgress?.({
                    step: 'planning',
                    message: 'AI planning complete',
                    thinkingText: `## AI Thinking\n\n${planThinking}`,
                    iteration: { current: 0, max: MAX_ITERATIONS }
                });
            }
            console.log(`🤖 Agentic Service: Agent refined prompt: "${refinedPrompt.substring(0, 100)}..."`);
            if (planThinking) {
                console.log(`🤖 Agentic Service: Agent thinking: ${planThinking.substring(0, 200)}...`);
            }

            // Show the AI's response
            const responseContext = `## AI Planning Response

**AI's refined prompt:**
> ${refinedPrompt}

${planThinking ? `**AI Thinking:**\n${planThinking}` : ''}`;

            onProgress?.({
                step: 'processing',
                message: 'AI planned the edit',
                thinkingText: responseContext,
                iteration: { current: 0, max: MAX_ITERATIONS }
            });

            // Iteration loop with self-check
            let finalResult: ImageData | null = null;

            for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
                console.log(`🤖 Agentic Service: Iteration ${iteration + 1}/${MAX_ITERATIONS}`);

                // Show iteration start with the prompt being used
                const iterationContext = `## Iteration ${iteration + 1}/${MAX_ITERATIONS}

**Sending to image generator:**
> ${refinedPrompt}

**Model:** \`gemini-3-pro-image-preview\` (${maskImage ? 'inpainting mode' : 'text-only mode'})

---
*Generating image...*`;

                onProgress?.({
                    step: 'calling_api',
                    message: `Generating image (attempt ${iteration + 1}/${MAX_ITERATIONS})...`,
                    thinkingText: iterationContext,
                    iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                });

                try {
                    if (maskImage) {
                        finalResult = await this.underlyingService.inpaintWithGemini(
                            sourceImage,
                            maskImage,
                            refinedPrompt
                        );
                    } else {
                        finalResult = await this.underlyingService.textOnlyWithGemini(
                            sourceImage,
                            refinedPrompt
                        );
                    }
                } catch (editError) {
                    console.error('🤖 Agentic Service: Edit failed:', editError);
                    const errorContext = `## Generation Failed

**Error:** ${editError instanceof Error ? editError.message : 'Unknown error'}

${editError instanceof Error && editError.stack ? `**Stack:**\n\`\`\`\n${editError.stack}\n\`\`\`` : ''}`;

                    onProgress?.({
                        step: 'error',
                        message: 'Image generation failed',
                        thinkingText: errorContext,
                        error: {
                            message: editError instanceof Error ? editError.message : 'Unknown error',
                            details: editError instanceof Error ? editError.stack : undefined
                        },
                        iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                    });
                    break;
                }

                if (!finalResult) {
                    console.log('🤖 Agentic Service: No result from edit, stopping');
                    break;
                }

                // Self-check on last iteration is skipped (nothing to improve)
                if (iteration >= MAX_ITERATIONS - 1) {
                    console.log('🤖 Agentic Service: Max iterations reached, using current result');
                    onProgress?.({
                        step: 'processing',
                        message: 'Max iterations reached, using final result',
                        thinkingText: `## Max Iterations Reached

Used all ${MAX_ITERATIONS} attempts. Returning the last generated image.`,
                        iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                    });
                    break;
                }

                // Self-check: Did we meet the user's goal?
                console.log('🤖 Agentic Service: Self-checking result...');

                const selfCheckContext = `## Self-Evaluation

**Original request:** "${prompt}"
**Prompt used:** "${refinedPrompt}"

Asking AI to evaluate if the result meets the goal...`;

                onProgress?.({
                    step: 'self_checking',
                    message: 'AI is evaluating the result...',
                    thinkingText: selfCheckContext,
                    iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                });

                const checkResult = await this.selfCheck(sourceImage, finalResult, prompt, refinedPrompt, maskImage);

                if (checkResult.satisfied) {
                    console.log(`🤖 Agentic Service: Self-check SATISFIED: ${checkResult.reasoning}`);
                    
                    const satisfiedContext = `## Self-Check: SATISFIED

**Reasoning:** ${checkResult.reasoning}

The AI is happy with the result. Completing edit.`;

                    onProgress?.({
                        step: 'processing',
                        message: 'AI approved the result',
                        thinkingText: satisfiedContext,
                        iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                    });
                    break;
                } else {
                    console.log(`🤖 Agentic Service: Self-check requested REVISION: ${checkResult.reasoning}`);
                    
                    if (checkResult.suggestion) {
                        const revisionContext = `## Self-Check: REVISION NEEDED

**Reasoning:** ${checkResult.reasoning}

**New prompt for next attempt:**
> ${checkResult.suggestion}

Will try again with the revised prompt...`;

                        onProgress?.({
                            step: 'iterating',
                            message: 'AI requested revision, trying again...',
                            thinkingText: revisionContext,
                            iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                        });

                        refinedPrompt = checkResult.suggestion;
                        console.log(`🤖 Agentic Service: Trying revised prompt: "${refinedPrompt.substring(0, 100)}..."`);
                    } else {
                        console.log('🤖 Agentic Service: No suggestion provided, using current result');
                        
                        onProgress?.({
                            step: 'processing',
                            message: 'No revision suggested, using current result',
                            thinkingText: `## Self-Check: No Revision

**Reasoning:** ${checkResult.reasoning}

AI didn't provide a revised prompt. Using current result.`,
                            iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                        });
                        break;
                    }
                }
            }

            if (finalResult) {
                onProgress?.({
                    step: 'complete',
                    message: 'Edit completed successfully!',
                    thinkingText: `## Complete

Image generation finished successfully.`,
                    iteration: { current: MAX_ITERATIONS, max: MAX_ITERATIONS }
                });
                return finalResult;
            }

            // Fallback if nothing worked
            console.log('🤖 Agentic Service: Using fallback direct edit');
            onProgress?.({
                step: 'calling_api',
                message: 'Using fallback edit method...',
                thinkingText: `## Fallback Mode

Primary generation didn't produce a result. Trying direct API call...

**Prompt:** "${prompt}"`,
                iteration: { current: MAX_ITERATIONS, max: MAX_ITERATIONS }
            });
            const fallbackResult = await this.fallbackEdit(sourceImage, prompt, maskImage);
            onProgress?.({
                step: 'complete',
                message: 'Fallback edit completed',
                thinkingText: `## Complete (Fallback)

Used fallback direct generation.`,
                iteration: { current: MAX_ITERATIONS, max: MAX_ITERATIONS }
            });
            return fallbackResult;

        } catch (error) {
            console.error('🤖 Agentic Service: Error in agentic flow:', error);
            onProgress?.({
                step: 'error',
                message: 'Error in AI editing flow',
                error: {
                    message: error instanceof Error ? error.message : 'Unknown error',
                    details: error instanceof Error ? error.stack : undefined
                }
            });
            return this.fallbackEdit(sourceImage, prompt, maskImage);
        }
    }

    private async selfCheck(
        originalImage: ImageData,
        resultImage: ImageData,
        userPrompt: string,
        editPrompt: string,
        maskImage?: ImageData
    ): Promise<{ satisfied: boolean; reasoning: string; suggestion: string }> {
        const originalBase64 = imageDataToBase64(originalImage);
        const resultBase64 = imageDataToBase64(resultImage);

        const hasMask = !!maskImage;
        const maskContext = hasMask
            ? 'You will also see a MASK IMAGE showing which area the user selected for editing (white = selected area).'
            : 'The user wanted to edit the entire image (no specific area selected).';

        const checkPrompt = `You are reviewing an image edit to determine if it successfully accomplished the user's goal.

ORIGINAL USER REQUEST: "${userPrompt}"

EDIT THAT WAS ATTEMPTED: "${editPrompt}"

${maskContext}

Evaluate the RESULT against what the user asked for:
1. Does the edit accomplish what the user originally asked for ("${userPrompt}")?
${hasMask ? '2. Was the edit applied to the correct area (as shown by the white region in the mask)?' : ''}
${hasMask ? '3' : '2'}. Does the edited area look NATURAL and FIT SEAMLESSLY into the image?
${hasMask ? '4' : '3'}. Is the edit clearly visible and significant enough?
${hasMask ? '5' : '4'}. Does it match the style, lighting, and aesthetic of the surroundings?

If the edit is GOOD and meets the user's goal naturally, call mark_satisfied.
If the edit needs improvement, call request_revision with a better prompt.

Be thoughtful - only request revision if there's a real problem. Consider whether the result genuinely achieves the user's intent.`;

        const checkTools = [{
            functionDeclarations: [
                {
                    name: 'mark_satisfied',
                    description: 'The edit successfully accomplishes the user goal and looks natural.',
                    parameters: {
                        type: 'OBJECT' as const,
                        properties: {
                            reasoning: {
                                type: 'STRING' as const,
                                description: 'Brief explanation of why the edit is satisfactory.',
                            },
                        },
                        required: ['reasoning'],
                    },
                },
                {
                    name: 'request_revision',
                    description: 'The edit needs improvement. Provide a revised prompt.',
                    parameters: {
                        type: 'OBJECT' as const,
                        properties: {
                            reasoning: {
                                type: 'STRING' as const,
                                description: 'What is wrong or could be improved.',
                            },
                            revised_prompt: {
                                type: 'STRING' as const,
                                description: 'An improved, more specific prompt to try.',
                            },
                        },
                        required: ['reasoning', 'revised_prompt'],
                    },
                },
            ],
        }];

        try {
            // Build the parts array with optional mask
            const contentParts: any[] = [
                { text: checkPrompt },
            ];

            if (maskImage) {
                const maskBase64 = imageDataToBase64(maskImage);
                contentParts.push({ text: '\n\n=== MASK IMAGE (white = area to edit) ===' });
                contentParts.push({ inlineData: { mimeType: 'image/png', data: maskBase64.split(',')[1] } });
            }

            contentParts.push({ text: '\n\n=== ORIGINAL IMAGE (before edit) ===' });
            contentParts.push({ inlineData: { mimeType: 'image/png', data: originalBase64.split(',')[1] } });
            contentParts.push({ text: '\n\n=== RESULT IMAGE (after edit) ===' });
            contentParts.push({ inlineData: { mimeType: 'image/png', data: resultBase64.split(',')[1] } });
            contentParts.push({ text: hasMask
                ? '\n\nCompare the images above. Did the edit accomplish the user\'s goal in the masked area?'
                : '\n\nCompare the images above. Did the edit accomplish the user\'s goal?' });

            const checkResult = await this.genAI.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: contentParts,
                }],
                tools: checkTools,
                config: {
                    thinkingConfig: {
                        thinkingBudget: CHECK_THINKING_BUDGET,
                        includeThoughts: true,
                    },
                },
            } as any);

            const evaluation = this.extractEvaluation(checkResult);
            return {
                satisfied: evaluation.satisfied,
                reasoning: evaluation.reasoning,
                suggestion: evaluation.suggestion,
            };
        } catch (error) {
            console.error('🤖 Agentic Service: Self-check failed:', error);
            // If self-check fails, assume satisfied to avoid infinite loops
            return { satisfied: true, reasoning: 'Self-check failed, assuming satisfied', suggestion: '' };
        }
    }

    private async fallbackEdit(
        sourceImage: ImageData,
        prompt: string,
        maskImage?: ImageData
    ): Promise<ImageData> {
        console.log('🤖 Agentic Service: Using fallback direct edit');
        if (maskImage) {
            return this.underlyingService.inpaintWithGemini(sourceImage, maskImage, prompt);
        } else {
            return this.underlyingService.textOnlyWithGemini(sourceImage, prompt);
        }
    }
}
