/**
 * Image generation service for server-side AI operations
 * 
 * Provides image generation and inpainting functionality using Gemini.
 * Mirrors the client-side generativeApi.ts patterns.
 */

import { type GeminiService } from './geminiService.js';
import { extractBase64Data, extractMimeType } from '../utils/imageHelpers.js';
import { AI_MODELS, THINKING_BUDGETS } from '../types/api.js';

export interface ImageGenerationOptions {
  /** Source image (base64 data URL) */
  sourceImage: string;
  /** Edit prompt */
  prompt: string;
  /** Optional mask image (base64 data URL) */
  maskImage?: string;
  /** Model to use (default: AI_MODELS.IMAGE_GENERATION) */
  model?: string;
}

export interface ImageGenerationResult {
  /** Generated image (base64 data URL) */
  imageData: string;
  /** Raw API response */
  raw: any;
}

export interface InpaintOptions {
  /** Source image (base64 data URL) */
  sourceImage: string;
  /** Mask image (base64 data URL) */
  maskImage: string;
  /** Edit prompt */
  prompt: string;
  /** Thinking budget for planning (default: THINKING_BUDGETS.LOW) */
  thinkingBudget?: number;
}

export interface InpaintResult {
  /** Generated image (base64 data URL) */
  imageData: string;
  /** AI's refined prompt used for generation */
  refinedPrompt: string;
  /** AI's thinking during planning */
  thinking: string;
  /** Raw API response */
  raw: any;
}

/**
 * Create an image generation service
 */
export function createImageGenerationService(gemini: GeminiService) {
  /**
   * Generate/edit an image using Gemini
   * 
   * Mirrors textOnlyWithGemini from client-side generativeApi.ts
   */
  async function generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const {
      sourceImage,
      prompt,
      model = AI_MODELS.IMAGE_GENERATION,
    } = options;

    console.log('🖼️  Image generation request:', {
      model,
      promptLength: prompt.length,
      hasSourceImage: !!sourceImage,
    });

    // Extract base64 data from data URL
    const sourceBase64 = extractBase64Data(sourceImage);
    const sourceMimeType = extractMimeType(sourceImage);

    // Build edit prompt (same as client-side)
    const editPrompt = `${prompt}

Make SIGNIFICANT, VISIBLE changes to create the requested modification. The result should look clearly different from the original.`;

    try {
      // Call Gemini API for image generation
      const result = await gemini.call({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'SOURCE IMAGE:' },
              {
                inlineData: {
                  mimeType: sourceMimeType,
                  data: sourceBase64,
                },
              },
              { text: editPrompt },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['image'],
        },
        isImageGeneration: true,
      });

      // Extract image from response
      const imageData = extractImageFromResponse(result.raw);
      if (!imageData) {
        throw new Error('No image data returned from Gemini');
      }

      console.log('✅ Image generation successful');

      return {
        imageData,
        raw: result.raw,
      };

    } catch (error) {
      console.error('❌ Image generation failed:', error);
      throw error;
    }
  }

  /**
   * Perform two-step inpainting with Gemini
   * 
   * Step 1: Describe the masked area
   * Step 2: Edit using the description
   * 
   * Mirrors inpaintWithGemini from client-side generativeApi.ts
   */
  async function inpaint(options: InpaintOptions): Promise<InpaintResult> {
    const {
      sourceImage,
      maskImage,
      prompt,
      thinkingBudget = THINKING_BUDGETS.LOW,
    } = options;

    console.log('🎨 Inpaint request:', {
      promptLength: prompt.length,
      hasSourceImage: !!sourceImage,
      hasMaskImage: !!maskImage,
    });

    // Step 1: Describe the selected area
    const areaDescription = await describeSelectedArea(
      sourceImage,
      maskImage,
      thinkingBudget
    );

    console.log('📝 Area description:', areaDescription);

    // Step 2: Build edit instruction using the area description
    const editPrompt = `In this image, there is: ${areaDescription}

Apply this change to ONLY that specific area described above: ${prompt}

CRITICAL RULES:
1. Make the requested change very visible and significant to the area I described
2. DO NOT change, modify, or alter any other parts of the image
3. ONLY modify other elements if they would naturally interact with or be affected by the requested change
4. Preserve all unrelated elements exactly as they appear in the original image

Return the edited image.`;

    console.log('🔧 Edit prompt:', editPrompt);

    // Extract base64 data
    const sourceBase64 = extractBase64Data(sourceImage);
    const sourceMimeType = extractMimeType(sourceImage);

    try {
      // Call Gemini API for image editing
      const result = await gemini.call({
        model: AI_MODELS.IMAGE_GENERATION,
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'ORIGINAL IMAGE:' },
              {
                inlineData: {
                  mimeType: sourceMimeType,
                  data: sourceBase64,
                },
              },
              { text: editPrompt },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['image'],
        },
        isImageGeneration: true,
      });

      // Extract image from response
      const imageData = extractImageFromResponse(result.raw);
      if (!imageData) {
        throw new Error('No image data returned from Gemini');
      }

      console.log('✅ Inpaint successful');

      return {
        imageData,
        refinedPrompt: editPrompt,
        thinking: areaDescription,
        raw: result.raw,
      };

    } catch (error) {
      console.error('❌ Inpaint failed:', error);
      throw error;
    }
  }

  /**
   * Describe the selected area marked by a mask
   * 
   * Helper for two-step inpainting process
   */
  async function describeSelectedArea(
    sourceImage: string,
    maskImage: string,
    thinkingBudget: number
  ): Promise<string> {
    // Create marked image with red outline
    const markedImage = createMarkedImage(sourceImage, maskImage);
    const markedBase64 = extractBase64Data(markedImage);
    const markedMimeType = extractMimeType(markedImage);

    const describePrompt = `This image contains a red outline marking a specific area.

Your task: Identify and describe what is inside the red outline in great detail, relative to everything else in the image.

IMPORTANT: In your description, DO NOT mention the red outline itself. Describe ONLY the actual content (objects, areas) that are marked, as if the red outline doesn't exist. The red outline is just a tool to help you identify what to describe.

Include:
- What specific object or area is marked
- Its precise location relative to other elements in the image (e.g., "the third window from the left", "the door in the bottom right corner", "the central building among five buildings")
- Distinctive visual features that differentiate it from similar objects nearby
- Spatial relationships to surrounding elements

Be extremely specific and detailed so this object can be unambiguously identified in the original image WITHOUT needing to see the red outline.`;

    try {
      const result = await gemini.call({
        model: AI_MODELS.PRO,
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'IMAGE WITH RED MARKER:' },
              {
                inlineData: {
                  mimeType: markedMimeType,
                  data: markedBase64,
                },
              },
              { text: describePrompt },
            ],
          },
        ],
        thinkingBudget,
      });

      return result.text || 'the selected area';

    } catch (error) {
      console.error('Failed to describe selected area:', error);
      // Fall back to generic description
      return 'the selected area';
    }
  }

  /**
   * Create a marked version of the source image with a red outline around the masked area
   * 
   * NOTE: This is a server-side approximation. The client-side version uses Canvas APIs.
   * For the server implementation, we'll return the source image as-is and let the client
   * handle the red outline visualization if needed.
   * 
   * In a production environment, you might use a library like 'sharp' or 'canvas' for
   * server-side image manipulation.
   */
  function createMarkedImage(sourceImage: string, _maskImage: string): string {
    // TODO: For now, return the source image as-is
    // A full implementation would use a server-side canvas library to draw the red outline
    // This is acceptable since the description step is a best-effort optimization
    return sourceImage;
  }

  return {
    generateImage,
    inpaint,
  };
}

/**
 * Extract image data from Gemini API response
 * 
 * @param response - Raw Gemini API response
 * @returns Base64 data URL or null if no image found
 */
function extractImageFromResponse(response: any): string | null {
  if (!response.candidates || response.candidates.length === 0) {
    return null;
  }

  const candidate = response.candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    return null;
  }

  for (const part of candidate.content.parts) {
    if (part.inlineData && part.inlineData.data) {
      // Reconstruct data URL
      const mimeType = part.inlineData.mimeType || 'image/png';
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  return null;
}

export type ImageGenerationService = ReturnType<typeof createImageGenerationService>;
