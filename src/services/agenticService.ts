import { GenerativeInpaintService } from './generativeApi';
import { imageDataToBase64, base64ToImageData } from '@/utils/maskRendering';
import { annotateImage, parseCommandForArrows } from '@/utils/imageAnnotation';
import { aiLogService } from './aiLogService';
import { createAIClient, type AIClient } from './aiClient';
import { AI_MODELS, THINKING_BUDGETS } from '@/config/aiModels';
import { detectEditRegions, formatEditRegionsForPrompt } from './imageCompareService';
import type { AIProgressEvent } from '@/types/aiProgress';
import type { Shape, PenShape, RectShape, CircleShape, ArrowShape } from '@/types/drawing';
import { DrawingTool } from '@/types/drawing';

/**
 * Result of the planning phase for AI Move operations
 */
export interface MovePlan {
  annotatedImage: string;  // Image with circles/arrows drawn for visualization
  descriptions: Array<{
    label: string;
    x: number;
    y: number;
    description: string;
  }>;
  interpretation: string;  // AI's understanding of what to do
  suggestedPrompt: string; // The prompt that will be sent to edit()
  originalCommand: string; // The user's original command
}

const MAX_ITERATIONS = 3;

export class AgenticPainterService {
    private ai: AIClient;
    private underlyingService: GenerativeInpaintService;

    constructor(apiKey: string, underlyingService: GenerativeInpaintService) {
        this.ai = createAIClient(apiKey);
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
        let allText = '';

        // Collect thinking and text from response
        for (const part of parts) {
            if (part.thought && part.text) {
                thinking += `[Thought] ${part.text}\n\n`;
            } else if (part.text) {
                allText += part.text;
            }
        }

        // Extract JSON from code fence
        const jsonMatch = allText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1].trim());
                evaluation.satisfied = parsed.satisfied === true;
                evaluation.reasoning = parsed.reasoning || '';
                evaluation.suggestion = parsed.revised_prompt || '';
                console.log(`🤖 Self-check: Parsed JSON - satisfied=${evaluation.satisfied}, reasoning length=${evaluation.reasoning.length}`);
            } catch (e) {
                console.error('🤖 Self-check: Failed to parse JSON from code fence:', e);
                // Fallback: try to find any JSON object in the text
                const fallbackMatch = allText.match(/\{[\s\S]*"satisfied"[\s\S]*\}/);
                if (fallbackMatch) {
                    try {
                        const parsed = JSON.parse(fallbackMatch[0]);
                        evaluation.satisfied = parsed.satisfied === true;
                        evaluation.reasoning = parsed.reasoning || '';
                        evaluation.suggestion = parsed.revised_prompt || '';
                        console.log(`🤖 Self-check: Parsed fallback JSON - satisfied=${evaluation.satisfied}`);
                    } catch (e2) {
                        console.error('🤖 Self-check: Fallback JSON parse also failed');
                    }
                }
            }
        } else {
            // No code fence found - try to find raw JSON
            const rawJsonMatch = allText.match(/\{[\s\S]*"satisfied"[\s\S]*\}/);
            if (rawJsonMatch) {
                try {
                    const parsed = JSON.parse(rawJsonMatch[0]);
                    evaluation.satisfied = parsed.satisfied === true;
                    evaluation.reasoning = parsed.reasoning || '';
                    evaluation.suggestion = parsed.revised_prompt || '';
                    console.log(`🤖 Self-check: Parsed raw JSON - satisfied=${evaluation.satisfied}`);
                } catch (e) {
                    console.error('🤖 Self-check: Raw JSON parse failed');
                }
            }
        }

        // Ensure we always have some reasoning
        if (!evaluation.reasoning) {
            evaluation.reasoning = evaluation.satisfied ? 'Edit appears to meet the goal' : 'Edit may need improvement';
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

        // Start the agentic operation in aiLogService
        aiLogService.startOperation('planning', `Editing: "${prompt}"`);

        // Log the planning context to aiLogService (centralized logging)
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

**Planning Model:** \`${AI_MODELS.PLANNING}\` (thinking budget: ${THINKING_BUDGETS.HIGH} tokens)
**Image Generation Model:** \`${AI_MODELS.IMAGE_GENERATION}\`

---
`;
        aiLogService.appendThinking(planningContext);

        onProgress?.({
            step: 'planning',
            message: 'Sending planning request to AI...',
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

            aiLogService.updateOperation({ step: 'calling_api', message: 'Waiting for AI planning response...' });
            onProgress?.({
                step: 'calling_api',
                message: 'Waiting for AI planning response...',
                iteration: { current: 0, max: MAX_ITERATIONS }
            });

            // Use streaming with the wrapper - logs input images automatically at lowest level
            const stream = this.ai.callStream({
                model: AI_MODELS.PLANNING,
                contents: [{ role: 'user', parts: contentParts }],
                tools: [{ functionDeclarations: toolDeclarations }],
                thinkingBudget: THINKING_BUDGETS.HIGH,
                logLabel: 'Planning Edit',
            });

            // Collect streaming response and show thinking in real-time
            let streamedThinking = '';
            let streamedText = '';
            let refinedPrompt = prompt;

            // Send immediate update that we're starting to receive
            aiLogService.updateOperation({ step: 'planning', message: 'Receiving AI response...' });
            onProgress?.({
                step: 'planning',
                message: 'Receiving AI response...',
                iteration: { current: 0, max: MAX_ITERATIONS }
            });

            for await (const chunk of stream) {
                streamedThinking = chunk.thinking;
                streamedText = chunk.text;

                // Update UI with thinking as it streams (wrapper already logged to aiLogService)
                if (streamedThinking) {
                    onProgress?.({
                        step: 'planning',
                        message: `AI is thinking... (${streamedThinking.length} chars)`,
                        iteration: { current: 0, max: MAX_ITERATIONS }
                    });
                }

                // Extract prompt from function call
                if (chunk.functionCall) {
                    const args = chunk.functionCall.args;
                    if (typeof args.prompt === 'string') {
                        refinedPrompt = args.prompt;
                        console.log(`🤖 Got refined prompt from function call`);
                    }
                }

                // Try to extract prompt from text if no function call
                if (streamedText && !chunk.functionCall) {
                    const match = streamedText.match(/gemini_image_painter\s*\(\s*prompt\s*=\s*"([^"]+)"/);
                    if (match) {
                        refinedPrompt = match[1];
                        console.log(`🤖 Got refined prompt from text`);
                    }
                }
            }

            console.log(`🤖 Stream complete: ${streamedThinking.length} thinking chars, ${streamedText.length} text chars`);

            const planThinking = streamedThinking || streamedText;

            // Send final update (wrapper already logged thinking to aiLogService)
            if (planThinking) {
                onProgress?.({
                    step: 'planning',
                    message: 'AI planning complete',
                    iteration: { current: 0, max: MAX_ITERATIONS }
                });
            }
            console.log(`🤖 Agentic Service: Agent refined prompt: "${refinedPrompt.substring(0, 100)}..."`);
            if (planThinking) {
                console.log(`🤖 Agentic Service: Agent thinking: ${planThinking.substring(0, 200)}...`);
            }

            // Log the AI's response context
            aiLogService.appendThinking(`## AI Planning Response\n\n**AI's refined prompt:**\n> ${refinedPrompt}\n\n`);

            aiLogService.updateOperation({ step: 'processing', message: 'AI planned the edit' });
            onProgress?.({
                step: 'processing',
                message: 'AI planned the edit',
                iteration: { current: 0, max: MAX_ITERATIONS }
            });

            // Iteration loop with self-check
            let finalResult: ImageData | null = null;

            for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
                console.log(`🤖 Agentic Service: Iteration ${iteration + 1}/${MAX_ITERATIONS}`);

                // Log iteration start
                aiLogService.appendThinking(`## Iteration ${iteration + 1}/${MAX_ITERATIONS}

**Sending to image generator:**
> ${refinedPrompt}

**Model:** \`${AI_MODELS.IMAGE_GENERATION}\` (${maskImage ? 'inpainting mode' : 'text-only mode'})

---
`);

                aiLogService.updateOperation({ step: 'calling_api', message: `Generating image (attempt ${iteration + 1}/${MAX_ITERATIONS})...` });
                onProgress?.({
                    step: 'calling_api',
                    message: `Generating image (attempt ${iteration + 1}/${MAX_ITERATIONS})...`,
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
                    aiLogService.appendThinking(`## Generation Failed

**Error:** ${editError instanceof Error ? editError.message : 'Unknown error'}

${editError instanceof Error && editError.stack ? `**Stack:**\n\`\`\`\n${editError.stack}\n\`\`\`` : ''}
`);

                    aiLogService.endOperation('error', 'Image generation failed');
                    onProgress?.({
                        step: 'error',
                        message: 'Image generation failed',
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

                // Convert result to base64 and show in progress
                const iterationImageBase64 = imageDataToBase64(finalResult);
                aiLogService.appendThinking(`## Image Generated (Iteration ${iteration + 1})

**Prompt used:** "${refinedPrompt}"

Generated image preview:

![Generated Image](${iterationImageBase64})

`);

                aiLogService.updateOperation({ step: 'processing', message: `Image generated (attempt ${iteration + 1}/${MAX_ITERATIONS})` });
                onProgress?.({
                    step: 'processing',
                    message: `Image generated (attempt ${iteration + 1}/${MAX_ITERATIONS})`,
                    iteration: { current: iteration + 1, max: MAX_ITERATIONS },
                    iterationImage: iterationImageBase64
                });

                // Self-check on last iteration is skipped (nothing to improve)
                if (iteration >= MAX_ITERATIONS - 1) {
                    console.log('🤖 Agentic Service: Max iterations reached, using current result');
                    aiLogService.appendThinking(`## Max Iterations Reached

Used all ${MAX_ITERATIONS} attempts. Returning the last generated image.
`);
                    onProgress?.({
                        step: 'processing',
                        message: 'Max iterations reached, using final result',
                        iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                    });
                    break;
                }

                // Self-check: Did we meet the user's goal?
                console.log('🤖 Agentic Service: Self-checking result...');

                aiLogService.appendThinking(`## Self-Evaluation

**Original request:** "${prompt}"
**Prompt used:** "${refinedPrompt}"

Asking AI to evaluate if the result meets the goal...

`);

                aiLogService.updateOperation({ step: 'self_checking', message: 'AI is evaluating the result...' });
                onProgress?.({
                    step: 'self_checking',
                    message: 'AI is evaluating the result...',
                    iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                });

                const checkResult = await this.selfCheck(sourceImage, finalResult, prompt, refinedPrompt, maskImage, onProgress, { current: iteration + 1, max: MAX_ITERATIONS });

                if (checkResult.satisfied) {
                    console.log(`🤖 Agentic Service: Self-check SATISFIED: ${checkResult.reasoning}`);

                    aiLogService.appendThinking(`## Self-Check: SATISFIED

**Reasoning:** ${checkResult.reasoning}

The AI is happy with the result. Completing edit.
`);

                    aiLogService.updateOperation({ step: 'processing', message: 'AI approved the result' });
                    onProgress?.({
                        step: 'processing',
                        message: 'AI approved the result',
                        iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                    });
                    break;
                } else {
                    console.log(`🤖 Agentic Service: Self-check requested REVISION: ${checkResult.reasoning}`);

                    if (checkResult.suggestion) {
                        aiLogService.appendThinking(`## Self-Check: REVISION NEEDED

**Reasoning:** ${checkResult.reasoning}

**New prompt for next attempt:**
> ${checkResult.suggestion}

Will try again with the revised prompt...
`);

                        aiLogService.updateOperation({ step: 'iterating', message: 'AI requested revision, trying again...' });
                        onProgress?.({
                            step: 'iterating',
                            message: 'AI requested revision, trying again...',
                            iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                        });

                        refinedPrompt = checkResult.suggestion;
                        console.log(`🤖 Agentic Service: Trying revised prompt: "${refinedPrompt.substring(0, 100)}..."`);
                    } else {
                        console.log('🤖 Agentic Service: No suggestion provided, using current result');

                        aiLogService.appendThinking(`## Self-Check: No Revision

**Reasoning:** ${checkResult.reasoning}

AI didn't provide a revised prompt. Using current result.
`);

                        onProgress?.({
                            step: 'processing',
                            message: 'No revision suggested, using current result',
                            iteration: { current: iteration + 1, max: MAX_ITERATIONS }
                        });
                        break;
                    }
                }
            }

            if (finalResult) {
                aiLogService.appendThinking(`## Complete

Image generation finished successfully.
`);
                aiLogService.endOperation('complete', 'Edit completed successfully!');
                onProgress?.({
                    step: 'complete',
                    message: 'Edit completed successfully!',
                    iteration: { current: MAX_ITERATIONS, max: MAX_ITERATIONS }
                });
                return finalResult;
            }

            // Fallback if nothing worked
            console.log('🤖 Agentic Service: Using fallback direct edit');
            aiLogService.appendThinking(`## Fallback Mode

Primary generation didn't produce a result. Trying direct API call...

**Prompt:** "${prompt}"
`);
            aiLogService.updateOperation({ step: 'calling_api', message: 'Using fallback edit method...' });
            onProgress?.({
                step: 'calling_api',
                message: 'Using fallback edit method...',
                iteration: { current: MAX_ITERATIONS, max: MAX_ITERATIONS }
            });
            const fallbackResult = await this.fallbackEdit(sourceImage, prompt, maskImage);
            aiLogService.appendThinking(`## Complete (Fallback)

Used fallback direct generation.
`);
            aiLogService.endOperation('complete', 'Fallback edit completed');
            onProgress?.({
                step: 'complete',
                message: 'Fallback edit completed',
                iteration: { current: MAX_ITERATIONS, max: MAX_ITERATIONS }
            });
            return fallbackResult;

        } catch (error) {
            console.error('🤖 Agentic Service: Error in agentic flow:', error);
            aiLogService.appendThinking(`## Error in AI Editing Flow

**Error:** ${error instanceof Error ? error.message : 'Unknown error'}

${error instanceof Error && error.stack ? `**Stack:**\n\`\`\`\n${error.stack}\n\`\`\`` : ''}
`);
            aiLogService.endOperation('error', 'Error in AI editing flow');
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
        maskImage?: ImageData,
        onProgress?: (event: AIProgressEvent) => void,
        iteration?: { current: number; max: number }
    ): Promise<{ satisfied: boolean; reasoning: string; suggestion: string }> {
        const originalBase64 = imageDataToBase64(originalImage);
        const resultBase64 = imageDataToBase64(resultImage);

        // Detect where edits actually occurred using block-based comparison
        // Block-based filtering helps ignore diffusion noise while catching real edits
        const editRegions = detectEditRegions(originalImage, resultImage, {
            useBlockComparison: true,
            blockSize: 8,
            minBlockDensity: 0.25, // Block needs 25% of pixels changed to count
            minBlockCount: 2,      // Need at least 2 connected blocks to form a region
            colorThreshold: 30,
        });

        // Filter to only significant regions to avoid overwhelming the AI
        // Based on testing: meaningful edits typically have significance 40+, noise is 15-30
        const MIN_SIGNIFICANCE_THRESHOLD = 35;
        const significantRegions = editRegions.regions.filter(r => r.significance >= MIN_SIGNIFICANCE_THRESHOLD);
        const filteredResult = {
            ...editRegions,
            regions: significantRegions,
        };
        const editRegionsText = formatEditRegionsForPrompt(filteredResult);

        // Log the detected regions (show both filtered and total counts)
        const filteredNote = significantRegions.length < editRegions.regions.length
            ? ` (filtered from ${editRegions.regions.length} total, threshold: significance >= ${MIN_SIGNIFICANCE_THRESHOLD})`
            : '';
        aiLogService.appendThinking(`### Detected Edit Regions (Block-Based Comparison)${filteredNote}

${editRegionsText}

`);
        console.log('🤖 Self-check detected edit regions:', significantRegions.length, 'significant regions (of', editRegions.regions.length, 'total),', editRegions.totalChangedPixels, 'pixels changed');

        // Attach debug data for visualization in AI console (use filtered significant regions)
        aiLogService.attachDebugData({
            originalImage: originalBase64,
            resultImage: resultBase64,
            editRegions: significantRegions, // Only significant regions shown
            imageWidth: editRegions.imageWidth,
            imageHeight: editRegions.imageHeight,
            totalChangedPixels: editRegions.totalChangedPixels,
            percentChanged: editRegions.percentChanged,
        });

        const hasMask = !!maskImage;
        const maskContext = hasMask
            ? 'You will also see a MASK IMAGE showing which area the user selected for editing (white = selected area).'
            : 'The user wanted to edit the entire image (no specific area selected).';

        const checkPrompt = `You are reviewing an image edit to determine if it successfully accomplished the user's goal.

ORIGINAL USER REQUEST: "${userPrompt}"

EDIT THAT WAS ATTEMPTED: "${editPrompt}"

${maskContext}

## Automatically Detected Changes

The following regions were detected as changed by comparing the original and result images pixel-by-pixel:

${editRegionsText}

Use this information to verify the edit was applied to the CORRECT location.

## Evaluation Criteria

### 1. Location Accuracy
Think carefully: WHERE did the user want changes to happen?
- Compare the DETECTED EDIT LOCATIONS above with where the edit SHOULD have been applied
- If the edit prompt contains COORDINATES (e.g., "at (150, 200)", "move to (300, 400)"), verify the detected regions are at or near those pixel locations
- If the user referenced specific elements (e.g., "the button", "the header", "the red car"), verify the detected changes are in the region of THAT element
- If a mask was provided, verify the detected changes are within the masked area

### 2. Unintended Substantial Changes (CRITICAL)
CAREFULLY examine the detected edit regions. Are there SUBSTANTIAL changes OUTSIDE the intended edit area?
- If the user wanted to edit region X, but regions Y and Z also changed significantly, that's a PROBLEM
- Look for large changes on the edges of the image, far from the target area, or in unrelated parts
- Focus on substantial changes - major artifacts, missing elements, structural distortions, large color shifts
- Ignore minor pixel-level noise or subtle compression artifacts - only flag changes that are visually noticeable

**If there are substantial unintended changes outside the target area (high significance score, large region, or visually obvious), the edit should be marked as UNSATISFACTORY and revised with a prompt that explicitly instructs the model to preserve unchanged areas.**

### 3. Cardinality Check
Think carefully: Did the user's request imply ADDING, REMOVING, or REPLACING elements?
- **REPLACE/MODIFY**: "Change X to Y", "Make X look like Y", "Update the color" → The COUNT of elements should stay the SAME
- **ADD**: "Add a button", "Put text here", "Insert an icon" → There should be MORE elements than before
- **REMOVE/DELETE**: "Remove the logo", "Delete the text", "Clear this area" → There should be FEWER elements than before

Does the result match the expected cardinality? If the user said "remove" but the element is still there (or replaced with something else), that's wrong.

### 4. Visual Quality
${hasMask ? '- Was the edit applied to the correct area (as shown by the white region in the mask)?' : ''}
- Does the edited area look NATURAL and FIT SEAMLESSLY into the image?
- Is the edit clearly visible and significant enough?
- Does it match the style, lighting, and aesthetic of the surroundings?

## Your Response

Think through each criterion carefully, then provide your evaluation as a JSON object in a code fence.

If the edit is SATISFACTORY:
\`\`\`json
{
  "satisfied": true,
  "reasoning": "Explain why the edit meets all criteria: location accuracy, no substantial unintended changes, cardinality, and visual quality."
}
\`\`\`

If the edit NEEDS REVISION:
\`\`\`json
{
  "satisfied": false,
  "reasoning": "Explain what is wrong - which criteria failed and why. Be specific about any substantial unintended changes detected.",
  "revised_prompt": "A better, more specific prompt that addresses the issues. If there were unintended changes, add explicit instructions like 'DO NOT modify any other part of the image' or 'Preserve all areas outside of [target region]'."
}
\`\`\`

Be thoughtful - only flag substantial unintended changes that are visually noticeable, not minor noise.

IMPORTANT: You MUST output exactly one JSON code block with your evaluation.`;

        try {
            aiLogService.updateOperation({ step: 'self_checking', message: 'Evaluating result...' });
            onProgress?.({
                step: 'self_checking',
                message: 'Evaluating result...',
                iteration
            });

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

            // Use the wrapper - it automatically logs prompt, thinking, and response
            // No tools - we ask for JSON output which is more reliable
            const result = await this.ai.call({
                model: AI_MODELS.PLANNING,
                contents: [{ role: 'user', parts: contentParts }],
                thinkingBudget: THINKING_BUDGETS.HIGH,
                includeThoughts: true,
                logLabel: 'Self-Check',
            });

            // Log what we got back for debugging
            console.log('🤖 Self-check raw response:', {
                hasThinking: !!result.thinking,
                thinkingLength: result.thinking?.length || 0,
                hasText: !!result.text,
                textLength: result.text?.length || 0,
                hasFunctionCall: !!result.functionCall,
                functionCall: result.functionCall,
            });

            const evaluation = this.extractEvaluation(result.raw);

            // Log decision to AI console (wrapper already logged prompt/response)
            aiLogService.appendThinking(`## Decision: ${evaluation.satisfied ? '✅ SATISFIED' : '⚠️ NEEDS REVISION'}

**Reasoning:** ${evaluation.reasoning}${!evaluation.satisfied && evaluation.suggestion ? `

**Suggested revision:** ${evaluation.suggestion}` : ''}
`);

            onProgress?.({
                step: 'self_checking',
                message: evaluation.satisfied ? 'Self-check passed' : 'Self-check requested revision',
                iteration
            });

            return {
                satisfied: evaluation.satisfied,
                reasoning: evaluation.reasoning,
                suggestion: evaluation.suggestion,
            };
        } catch (error) {
            console.error('🤖 Agentic Service: Self-check failed:', error);

            aiLogService.appendThinking(`## Self-Check Error

${error instanceof Error ? error.message : 'Unknown error'}

Assuming satisfied to avoid infinite loops.
`);

            onProgress?.({
                step: 'error',
                message: 'Self-check failed',
                iteration
            });

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

    /**
     * Identify what UI element is at a specific coordinate in an image
     * @param imageData Base64-encoded image data
     * @param x X coordinate (0-1 normalized or pixel coordinate)
     * @param y Y coordinate (0-1 normalized or pixel coordinate)
     * @param imageWidth Width of the image in pixels
     * @param imageHeight Height of the image in pixels
     * @returns Description of the element at that location
     */
    async identifyElementAtPoint(
        imageData: string,
        x: number,
        y: number,
        imageWidth: number,
        imageHeight: number
    ): Promise<string> {
        console.log(`🤖 Agentic Service: Identifying element at (${x}, ${y})`);

        const prompt = `You are analyzing a screenshot to identify what is at a specific coordinate.

Image dimensions: ${imageWidth} x ${imageHeight} pixels
Target coordinate: (${x}, ${y})

IMPORTANT: You may see blue teardrop-shaped pin markers with letters (A, B, C) overlaid on the image. These are UI markers added by the application - IGNORE THEM COMPLETELY. Describe only the ACTUAL content underneath or near the pin.

Describe what is at this location:

1. **What it is**: The actual element/object (NOT the pin marker)
2. **Approximate size**: Width and height in pixels
3. **Visual features**: Color, text, icons, distinctive characteristics
4. **Context**: What surrounds it

Respond with a single paragraph. Examples:
- "A blue 'Submit' button (approximately 100x36 pixels) with white text, in the bottom-right of a login form."
- "A red sports car (approximately 200x80 pixels) facing left, on a gray road."
- "Empty white background area, near the page header."

Do NOT mention any pin markers, letters A/B/C, or overlay elements in your description.`;

        try {
            // Use the wrapper - it automatically logs prompt, thinking, and response
            const result = await this.ai.call({
                model: AI_MODELS.PLANNING,
                contents: [{
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: 'image/png', data: imageData.split(',')[1] } }
                    ]
                }],
                thinkingBudget: THINKING_BUDGETS.LOW,
                logLabel: `Identify Element at (${x}, ${y})`,
            });

            const cleanDescription = result.text.trim();
            console.log(`🤖 Agentic Service: Element identified: "${cleanDescription}"`);
            return cleanDescription;

        } catch (error) {
            console.error('🤖 Agentic Service: Element identification failed:', error);
            return `Unknown element at (${x}, ${y})`;
        }
    }

    /**
     * Resolve reference points to element descriptions and execute a command
     * @param imageData Base64-encoded image data
     * @param referencePoints Array of labeled reference points (e.g., [{label: 'A', x: 100, y: 200}])
     * @param command User's natural language command (e.g., "Move A to B")
     * @param imageWidth Width of the image in pixels
     * @param imageHeight Height of the image in pixels
     * @returns AI's interpretation and suggested manipulation
     */
    async resolveReferencesAndExecute(
        imageData: string,
        referencePoints: Array<{label: string, x: number, y: number}>,
        command: string,
        imageWidth: number,
        imageHeight: number
    ): Promise<string> {
        console.log('🤖 Agentic Service: Resolving references and executing command');
        console.log(`🤖 Reference points:`, referencePoints);
        console.log(`🤖 Command: "${command}"`);

        // Start an operation if one isn't already active
        const needsOperation = !aiLogService.isActive();
        if (needsOperation) {
            aiLogService.startOperation('processing', `Resolving: "${command}"`);
        }

        aiLogService.appendThinking(`## Reference Resolution\n\n**Command:** "${command}"\n\n**Reference points:** ${referencePoints.map(p => p.label).join(', ')}\n\n---\n\n`);

        // Step 1: Identify what's at each reference point
        const resolvedReferences: Array<{label: string, x: number, y: number, description: string}> = [];

        aiLogService.appendThinking(`### Step 1: Identifying Elements\n\n`);

        for (const point of referencePoints) {
            aiLogService.appendThinking(`**Point ${point.label}** at (${point.x}, ${point.y}):\n`);

            const description = await this.identifyElementAtPoint(
                imageData,
                point.x,
                point.y,
                imageWidth,
                imageHeight
            );

            resolvedReferences.push({
                label: point.label,
                x: point.x,
                y: point.y,
                description
            });

            aiLogService.appendThinking(`→ "${description}"\n\n`);
        }

        // Step 2: Build context string
        const referenceContext = resolvedReferences
            .map(ref => `- Point ${ref.label} (at coordinates ${ref.x}, ${ref.y}): ${ref.description}`)
            .join('\n');

        // Step 3: Create prompt combining context with command
        // IMPORTANT: We ask the model to produce a CLEAN editing prompt that describes
        // the elements by what they ARE, not by labels like "A" or "B"
        const finalPrompt = `You are helping translate a user's reference-based command into a clear image editing instruction.

The user placed reference markers on an image:
${referenceContext}

The user's command using these references: "${command}"

YOUR TASK: Write a CLEAN image editing prompt that describes what to do WITHOUT using labels like "A", "B", "Point A", etc.

Instead, describe the elements by what they actually are. For example:
- If the user says "Move A to B" where A is a button and B is a sidebar, write: "Move the blue Submit button to the sidebar area"
- If the user says "Make A look like B" where A is a heading and B is a styled label, write: "Style the main heading to match the font and color of the styled label below"

Respond with ONLY the clean editing prompt, nothing else. Do not include coordinates, point labels, or explanations.`;

        console.log('🤖 Agentic Service: Sending resolution prompt to Gemini');
        aiLogService.updateOperation({ step: 'calling_api', message: 'Translating command...' });

        try {
            // Use the wrapper - it automatically logs prompt, thinking, and response
            const result = await this.ai.call({
                model: AI_MODELS.PLANNING,
                contents: [{
                    role: 'user',
                    parts: [
                        { text: finalPrompt },
                        { inlineData: { mimeType: 'image/png', data: imageData.split(',')[1] } }
                    ]
                }],
                thinkingBudget: THINKING_BUDGETS.MEDIUM,
                logLabel: 'Translate Reference Command',
            });

            const cleanResponse = result.text.trim();
            console.log(`🤖 Agentic Service: Resolution response: "${cleanResponse.substring(0, 150)}..."`);

            if (needsOperation) {
                aiLogService.endOperation('complete', 'Reference resolution complete');
            }

            return cleanResponse;

        } catch (error) {
            console.error('🤖 Agentic Service: Reference resolution failed:', error);

            if (needsOperation) {
                aiLogService.endOperation('error', 'Resolution failed');
            }

            throw new Error(`Failed to resolve references: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Build descriptions of markup shapes for the AI prompt
     */
    private describeMarkupShapes(markupShapes: Shape[]): string {
        if (!markupShapes || markupShapes.length === 0) {
            return '';
        }

        const descriptions: string[] = [];

        for (const shape of markupShapes) {
            if (!shape.isMarkup) continue;

            switch (shape.type) {
                case DrawingTool.PEN: {
                    const penShape = shape as PenShape;
                    if (penShape.points.length >= 4) {
                        // Calculate bounding box from points
                        const xs = penShape.points.filter((_, i) => i % 2 === 0);
                        const ys = penShape.points.filter((_, i) => i % 2 === 1);
                        const minX = Math.round(Math.min(...xs));
                        const minY = Math.round(Math.min(...ys));
                        const maxX = Math.round(Math.max(...xs));
                        const maxY = Math.round(Math.max(...ys));
                        descriptions.push(`- **Freehand drawing** (orange pen stroke) spanning from (${minX}, ${minY}) to (${maxX}, ${maxY})`);
                    }
                    break;
                }
                case DrawingTool.RECTANGLE: {
                    const rectShape = shape as RectShape;
                    descriptions.push(`- **Rectangle markup** (orange outline) at (${Math.round(rectShape.x)}, ${Math.round(rectShape.y)}) with size ${Math.round(rectShape.width)}x${Math.round(rectShape.height)} pixels`);
                    break;
                }
                case DrawingTool.CIRCLE: {
                    const circleShape = shape as CircleShape;
                    descriptions.push(`- **Circle/ellipse markup** (orange outline) centered at (${Math.round(circleShape.x)}, ${Math.round(circleShape.y)}) with radius ${Math.round(circleShape.radiusX)}x${Math.round(circleShape.radiusY)} pixels`);
                    break;
                }
                case DrawingTool.ARROW: {
                    const arrowShape = shape as ArrowShape;
                    const [x1, y1, x2, y2] = arrowShape.points;
                    descriptions.push(`- **Line/arrow markup** (orange) from (${Math.round(x1)}, ${Math.round(y1)}) to (${Math.round(x2)}, ${Math.round(y2)})`);
                    break;
                }
            }
        }

        return descriptions.join('\n');
    }

    /**
     * Plan a move operation with visual annotations and confirmation
     * This is the enhanced version that provides rich context before execution
     * @param imageData Base64-encoded image data
     * @param referencePoints Array of labeled reference points
     * @param command User's natural language command
     * @param imageWidth Width of the image in pixels
     * @param imageHeight Height of the image in pixels
     * @param markupShapes Optional array of markup shapes drawn by user
     * @returns MovePlan with annotated image, descriptions, and suggested prompt
     */
    async planMoveOperation(
        imageData: string,
        referencePoints: Array<{label: string, x: number, y: number}>,
        command: string,
        imageWidth: number,
        imageHeight: number,
        markupShapes?: Shape[]
    ): Promise<MovePlan> {
        console.log('🤖 Agentic Service: Planning move operation');
        console.log(`🤖 Reference points:`, referencePoints);
        console.log(`🤖 Markup shapes:`, markupShapes?.length || 0);
        console.log(`🤖 Command: "${command}"`);

        // Start logging this operation
        aiLogService.startOperation('planning', `Planning: "${command}"`);

        const pointLabels = referencePoints.map(p => p.label).join(', ') || '(none)';
        const markupDescriptions = this.describeMarkupShapes(markupShapes || []);

        let inputSummary = `## Move Operation Planning\n\n**Command:** "${command}"\n\n`;
        inputSummary += `**Reference points (pins):** ${pointLabels}\n\n`;

        if (markupDescriptions) {
            inputSummary += `**Markup annotations:**\n${markupDescriptions}\n\n`;
        } else {
            inputSummary += `**Markup annotations:** (none)\n\n`;
        }

        inputSummary += `---\n`;
        aiLogService.appendThinking(inputSummary);

        // Step 1: Parse command to detect arrows for visualization
        const labels = referencePoints.map(p => p.label);
        const arrows = parseCommandForArrows(command, labels);
        console.log('🤖 Detected arrows:', arrows);

        // Step 2: Create annotated image with circles at each point (and arrows if detected)
        const annotationPoints = referencePoints.map(p => ({
            label: p.label,
            x: p.x,
            y: p.y
        }));

        const annotatedImage = await annotateImage(imageData, {
            points: annotationPoints,
            arrows: arrows.length > 0 ? arrows : undefined
        });
        console.log('🤖 Created annotated image');
        aiLogService.appendThinking(`\n**Step 1:** Created annotated image with pins${arrows.length > 0 ? ' and arrows' : ''}\n\n`);

        // Step 3: Get detailed descriptions for each point using the ANNOTATED image
        // This helps the AI see the labels directly on the image
        const descriptions: Array<{label: string, x: number, y: number, description: string}> = [];

        aiLogService.updateOperation({ step: 'processing', message: 'Identifying reference points...' });
        aiLogService.appendThinking(`**Step 2:** Identifying what's at each reference point...\n\n`);

        for (const point of referencePoints) {
            aiLogService.appendThinking(`- Analyzing point **${point.label}** at (${point.x}, ${point.y})... `);

            const description = await this.identifyElementAtPoint(
                annotatedImage,
                point.x,
                point.y,
                imageWidth,
                imageHeight
            );

            descriptions.push({
                label: point.label,
                x: point.x,
                y: point.y,
                description
            });

            aiLogService.appendThinking(`\n  → "${description}"\n\n`);
        }
        console.log('🤖 Got descriptions for all points');

        // Step 4: Build rich context for interpretation
        const referenceContext = descriptions
            .map(ref => `- **${ref.label}** at coordinates (${ref.x}, ${ref.y}): ${ref.description}`)
            .join('\n');

        // Build markup shapes context
        const markupContext = this.describeMarkupShapes(markupShapes || []);
        const hasMarkups = markupContext.length > 0;

        // Step 5: Ask AI to interpret the command and explain what it will do
        aiLogService.updateOperation({ step: 'calling_api', message: 'Interpreting command...' });
        aiLogService.appendThinking(`**Step 3:** Sending to AI for interpretation...\n\n`);

        // Build the reference section - pins and/or markups
        let annotationsSection = '';
        if (descriptions.length > 0) {
            annotationsSection += `The user marked labeled points on the image:\n\n${referenceContext}\n\n`;
        }
        if (hasMarkups) {
            annotationsSection += `The user also drew markup annotations (in bright orange) to highlight areas of interest:\n\n${markupContext}\n\n`;
            annotationsSection += `**Important:** These orange markups are visual indicators only - they should be REMOVED from the final output while executing the edit.\n\n`;
        }

        const interpretationPrompt = `You are translating a user's reference-based command into an image editing instruction.

${annotationsSection}User's command: "${command}"

CRITICAL RULES:
- The letters A, B, C are ONLY labels the user used to mark locations
- Your output must NEVER contain the letters A, B, C, or phrases like "Point A", "marker A", "location A"
- Replace every reference to a letter with the FULL description of what's actually there
- The editing AI will NOT see any labels - only the raw image${hasMarkups ? `
- When the user refers to "what I circled", "what I drew", "the marked area", etc., refer to the orange markup annotations
- The markup annotations indicate areas the user wants you to focus on or modify
- In your EDITING_PROMPT, be sure to instruct the editor to REMOVE the orange markups from the final output` : ''}

OUTPUT FORMAT:

INTERPRETATION: [2-4 sentences explaining what will be done, describing the elements involved, their visual appearance, exact locations, and the transformation. Be specific and detailed - NO LETTERS]

EDITING_PROMPT: [Detailed instruction for the image editor. Include: precise coordinates, visual descriptions (colors, sizes, textures), what to preserve, what to modify, how to handle edges/transitions, and any cleanup needed. Multiple sentences encouraged - NO LETTERS ALLOWED]

IMPORTANT: Always include actual pixel coordinates like (x, y) or regions like "from (x1, y1) to (x2, y2)" whenever possible. These coordinates help verify the edit was applied correctly. Look at the image and estimate coordinates for elements you reference.

EXAMPLE:
User command: "Move A to B"
Where A = "blue Submit button at (150, 200)" and B = "gray sidebar at (50, 300)"

INTERPRETATION: I will relocate the blue Submit button from its current position at (150, 200) to the gray sidebar area at (50, 300). The button is a rectangular element with white text on a blue background. The destination is a vertical gray panel on the left side of the interface.

EDITING_PROMPT: Move the blue Submit button currently located at coordinates (150, 200) to the gray sidebar area at coordinates (50, 300). The button is approximately 80x30 pixels with rounded corners, white "Submit" text, and a #4285f4 blue background. Place it within the gray sidebar while maintaining its original size and appearance. Fill the vacated area at (150, 200) by extending the surrounding white background naturally. Ensure clean edges where the button integrates into the sidebar.${hasMarkups ? `

EXAMPLE WITH MARKUPS:
User command: "Remove what I circled"
Where there is a circle markup around an ad banner at (200, 100) to (500, 180)

INTERPRETATION: I will remove the ad banner that the user highlighted with the orange circle markup. The banner spans from coordinates (200, 100) to (500, 180) and appears to be a promotional element. The orange markup annotation itself must also be removed from the final output.

EDITING_PROMPT: Remove the ad banner located in the region from (200, 100) to (500, 180). This is a rectangular promotional element approximately 300x80 pixels. Fill the area naturally by extending the surrounding background content - match the texture, color, and any patterns from adjacent areas. Remove all bright orange markup lines or shapes from the image. Ensure the filled region blends seamlessly with no visible seams or artifacts.` : ''}

YOUR RESPONSE:`;

        try {
            // Use the wrapper - it automatically logs prompt, thinking, and response
            const result = await this.ai.call({
                model: AI_MODELS.PLANNING,
                contents: [{
                    role: 'user',
                    parts: [
                        { text: interpretationPrompt },
                        { inlineData: { mimeType: 'image/png', data: annotatedImage.split(',')[1] } }
                    ]
                }],
                thinkingBudget: THINKING_BUDGETS.MEDIUM,
                logLabel: 'Interpret Move Command',
            });

            const response = result.text;

            // Parse the response
            const interpretationMatch = response.match(/INTERPRETATION:\s*(.+?)(?=EDITING_PROMPT:|$)/s);
            const editingPromptMatch = response.match(/EDITING_PROMPT:\s*(.+?)$/s);

            // Helper to strip any remaining letter references
            const stripLetterReferences = (text: string): string => {
                return text
                    // Remove standalone letter references like "A", "B", "C" when used as labels
                    .replace(/\b(point|marker|location|label|reference)\s+[A-C]\b/gi, '')
                    .replace(/\b[A-C]\s+(point|marker|location|label|reference)\b/gi, '')
                    // Remove "at A", "to B", "from C" patterns
                    .replace(/\b(at|to|from|of)\s+[A-C]\b/gi, '')
                    // Clean up double spaces
                    .replace(/\s{2,}/g, ' ')
                    .trim();
            };

            let interpretation = interpretationMatch
                ? stripLetterReferences(interpretationMatch[1].trim())
                : 'Unable to interpret the command. Please try rephrasing.';

            let suggestedPrompt = editingPromptMatch
                ? stripLetterReferences(editingPromptMatch[1].trim())
                : await this.resolveReferencesAndExecute(imageData, referencePoints, command, imageWidth, imageHeight);

            console.log('🤖 Interpretation:', interpretation);
            console.log('🤖 Suggested prompt:', suggestedPrompt.substring(0, 100) + '...');

            aiLogService.appendThinking(`**Interpretation:**\n> ${interpretation}\n\n**Editing prompt:**\n> ${suggestedPrompt}\n`);
            aiLogService.endOperation('complete', 'Planning complete - ready for confirmation');

            return {
                annotatedImage,
                descriptions,
                interpretation,
                suggestedPrompt,
                originalCommand: command
            };

        } catch (error) {
            console.error('🤖 Agentic Service: Planning failed:', error);

            aiLogService.appendThinking(`\n**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\nUsing fallback interpretation...\n`);

            // Fallback: return basic plan without AI interpretation
            const fallbackPrompt = await this.resolveReferencesAndExecute(
                imageData, referencePoints, command, imageWidth, imageHeight
            );

            aiLogService.endOperation('complete', 'Planning complete (fallback)');

            return {
                annotatedImage,
                descriptions,
                interpretation: `Execute command: "${command}"`,
                suggestedPrompt: fallbackPrompt,
                originalCommand: command
            };
        }
    }
}
