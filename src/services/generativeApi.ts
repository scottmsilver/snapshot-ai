import { GoogleGenAI } from '@google/genai';
import { base64ToImageData, imageDataToBase64 } from '@/utils/maskRendering';

export interface InpaintRequest {
  sourceImage: string;  // Base64 PNG
  maskImage: string;    // Base64 PNG (binary: white=selected, black=not)
  prompt: string;       // Freeform user instruction
}

export interface InpaintResponse {
  generatedImage: string;  // Base64 PNG
  error?: string;
}

// Helper to convert ImageData to a format Google GenAI expects
function imageDataToBlob(imageData: ImageData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to blob'));
      }
    }, 'image/png');
  });
}

/**
 * Service for AI-powered inpainting using external APIs
 */
export type AIModel = 'gemini' | 'imagen';

export class GenerativeInpaintService {
  private apiKey: string;
  private apiEndpoint: string;
  private model: AIModel;
  private googleCloudProjectId?: string;
  private inpaintingModel?: AIModel;
  private textOnlyModel?: AIModel;

  constructor(
    apiKey: string,
    apiEndpoint: string,
    model: AIModel = 'gemini',
    googleCloudProjectId?: string,
    inpaintingModel?: AIModel,
    textOnlyModel?: AIModel
  ) {
    this.apiKey = apiKey;
    this.apiEndpoint = apiEndpoint;
    this.model = model; // Fallback/legacy model
    this.googleCloudProjectId = googleCloudProjectId;
    this.inpaintingModel = inpaintingModel;
    this.textOnlyModel = textOnlyModel;
  }

  /**
   * Perform text-only editing with Gemini (no mask)
   */
  async textOnlyWithGemini(
    sourceImage: ImageData,
    prompt: string
  ): Promise<ImageData> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    // Convert ImageData to base64
    const sourceBase64 = imageDataToBase64(sourceImage);

    console.log('🔍 DEBUG: Gemini text-only - Source image size:', sourceImage.width, 'x', sourceImage.height);
    console.log('🔍 DEBUG: Gemini text-only - Prompt:', prompt);

    const editPrompt = `${prompt}

Make SIGNIFICANT, VISIBLE changes to create the requested modification. The result should look clearly different from the original.`;

    try {
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'SOURCE IMAGE:' },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: sourceBase64.split(',')[1],
                },
              },
              { text: editPrompt },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['image'],
        } as Record<string, unknown>,
      } as Parameters<typeof ai.models.generateContent>[0]);

      // Extract image from response
      if (result.candidates && result.candidates.length > 0) {
        const candidate = result.candidates[0];

        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              const generatedBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
              let resultImageData = await base64ToImageData(generatedBase64);

              // Resize if needed
              if (resultImageData.width !== sourceImage.width || resultImageData.height !== sourceImage.height) {
                const resizedCanvas = document.createElement('canvas');
                resizedCanvas.width = sourceImage.width;
                resizedCanvas.height = sourceImage.height;
                const resizedCtx = resizedCanvas.getContext('2d')!;

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = resultImageData.width;
                tempCanvas.height = resultImageData.height;
                const tempCtx = tempCanvas.getContext('2d')!;
                tempCtx.putImageData(resultImageData, 0, 0);

                resizedCtx.drawImage(tempCanvas, 0, 0, sourceImage.width, sourceImage.height);
                resultImageData = resizedCtx.getImageData(0, 0, sourceImage.width, sourceImage.height);
              }

              return resultImageData;
            }
          }
        }
      }

      throw new Error('No image data returned from Gemini');
    } catch (error) {
      console.error('Gemini text-only error:', error);
      throw new Error(`Gemini text-only editing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform text-only editing with Imagen (no mask)
   */
  async textOnlyWithImagen(
    sourceImage: ImageData,
    prompt: string
  ): Promise<ImageData> {
    if (!this.googleCloudProjectId) {
      throw new Error('Google Cloud Project ID is required for Imagen');
    }

    // Convert ImageData to base64
    const sourceBase64 = imageDataToBase64(sourceImage);

    console.log('🔍 DEBUG: Imagen text-only - Source image size:', sourceImage.width, 'x', sourceImage.height);
    console.log('🔍 DEBUG: Imagen text-only - Prompt:', prompt);

    try {
      // Use Vertex AI REST API for Imagen with text-only editing
      const location = 'us-central1';
      const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${this.googleCloudProjectId}/locations/${location}/publishers/google/models/imagen-3.0-capability-001:predict`;

      const requestBody = {
        instances: [{
          prompt: prompt,
          referenceImages: [
            {
              referenceType: 'REFERENCE_TYPE_RAW',
              referenceId: 1,
              referenceImage: {
                bytesBase64Encoded: sourceBase64.split(',')[1]
              }
            }
          ]
        }],
        parameters: {
          sampleCount: 1,
          editMode: 'EDIT_MODE_PRODUCT_IMAGE',
          editConfig: {
            baseSteps: 35
          }
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Imagen API request failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      // Extract the generated image from the response
      if (result.predictions && result.predictions.length > 0) {
        const prediction = result.predictions[0];
        if (prediction.bytesBase64Encoded) {
          const generatedBase64 = `data:image/png;base64,${prediction.bytesBase64Encoded}`;
          let resultImageData = await base64ToImageData(generatedBase64);

          // Resize if needed
          if (resultImageData.width !== sourceImage.width || resultImageData.height !== sourceImage.height) {
            const resizedCanvas = document.createElement('canvas');
            resizedCanvas.width = sourceImage.width;
            resizedCanvas.height = sourceImage.height;
            const resizedCtx = resizedCanvas.getContext('2d')!;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = resultImageData.width;
            tempCanvas.height = resultImageData.height;
            const tempCtx = tempCanvas.getContext('2d')!;
            tempCtx.putImageData(resultImageData, 0, 0);

            resizedCtx.drawImage(tempCanvas, 0, 0, sourceImage.width, sourceImage.height);
            resultImageData = resizedCtx.getImageData(0, 0, sourceImage.width, sourceImage.height);
          }

          console.log('🔍 DEBUG: Imagen text-only response size:', resultImageData.width, 'x', resultImageData.height);
          (window as any).debugImagenTextOutput = generatedBase64;
          console.log('🔍 DEBUG: Access Imagen text-only output via window.debugImagenTextOutput');

          return resultImageData;
        }
      }

      throw new Error('No image data returned from Imagen');
    } catch (error) {
      console.error('Imagen text-only error:', error);
      throw new Error(`Imagen text-only editing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform inpainting using Gemini 2.5 Flash image editing
   */
  async inpaintWithGemini(
    sourceImage: ImageData,
    maskImage: ImageData,
    prompt: string
  ): Promise<ImageData> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    // Convert ImageData to base64
    const sourceBase64 = imageDataToBase64(sourceImage);
    const maskBase64 = imageDataToBase64(maskImage);

    // DEBUG: Log what we're sending to Gemini
    console.log('🔍 DEBUG: Source image size:', sourceImage.width, 'x', sourceImage.height);
    console.log('🔍 DEBUG: Mask image size:', maskImage.width, 'x', maskImage.height);
    console.log('🔍 DEBUG: Prompt:', prompt);

    // Create data URLs for debugging
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = sourceImage.width;
    sourceCanvas.height = sourceImage.height;
    const sourceCtx = sourceCanvas.getContext('2d')!;
    sourceCtx.putImageData(sourceImage, 0, 0);
    const sourceDebugUrl = sourceCanvas.toDataURL('image/png');
    console.log('🔍 DEBUG: Source image data URL (right-click to save):', sourceDebugUrl.substring(0, 100) + '...');

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskImage.width;
    maskCanvas.height = maskImage.height;
    const maskCtx = maskCanvas.getContext('2d')!;
    maskCtx.putImageData(maskImage, 0, 0);
    const maskDebugUrl = maskCanvas.toDataURL('image/png');
    console.log('🔍 DEBUG: Mask image data URL (right-click to save):', maskDebugUrl.substring(0, 100) + '...');

    // Store in window for easy access from console
    (window as any).debugSourceImage = sourceDebugUrl;
    (window as any).debugMaskImage = maskDebugUrl;
    console.log('🔍 DEBUG: Access images via window.debugSourceImage and window.debugMaskImage');

    // Build the edit instruction prompt for inpainting
    const editPrompt = `${prompt}

Make SIGNIFICANT, VISIBLE changes to create the requested modification. The result should look clearly different from the original in the edited area.`;


    try {

      // Use Gemini 2.5 Flash with image editing
      // Send source image first, then mask, then repeat the instruction
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'SOURCE IMAGE:' },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: sourceBase64.split(',')[1], // Remove data URL prefix
                },
              },
              { text: 'BINARY MASK (WHITE=edit, BLACK=keep):' },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: maskBase64.split(',')[1], // Remove data URL prefix
                },
              },
              { text: editPrompt },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['image'],
        } as Record<string, unknown>,
      } as Parameters<typeof ai.models.generateContent>[0]);

      // Extract image from response
      if (result.candidates && result.candidates.length > 0) {
        const candidate = result.candidates[0];

        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              // Convert base64 to ImageData
              const generatedBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
              let resultImageData = await base64ToImageData(generatedBase64);

              // DEBUG: Log what Gemini returned
              console.log('🔍 DEBUG: Raw Gemini response size:', resultImageData.width, 'x', resultImageData.height);
              const debugCanvas = document.createElement('canvas');
              debugCanvas.width = resultImageData.width;
              debugCanvas.height = resultImageData.height;
              const debugCtx = debugCanvas.getContext('2d')!;
              debugCtx.putImageData(resultImageData, 0, 0);
              const geminiDebugUrl = debugCanvas.toDataURL('image/png');
              console.log('🔍 DEBUG: Gemini raw output data URL (right-click to save):', geminiDebugUrl.substring(0, 100) + '...');
              (window as any).debugGeminiOutput = geminiDebugUrl;
              console.log('🔍 DEBUG: Access Gemini output via window.debugGeminiOutput');

              // Gemini may return a slightly different size - resize to match source
              if (resultImageData.width !== sourceImage.width || resultImageData.height !== sourceImage.height) {
                const resizedCanvas = document.createElement('canvas');
                resizedCanvas.width = sourceImage.width;
                resizedCanvas.height = sourceImage.height;
                const resizedCtx = resizedCanvas.getContext('2d')!;

                // Draw the result image at the correct size
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = resultImageData.width;
                tempCanvas.height = resultImageData.height;
                const tempCtx = tempCanvas.getContext('2d')!;
                tempCtx.putImageData(resultImageData, 0, 0);

                resizedCtx.drawImage(tempCanvas, 0, 0, sourceImage.width, sourceImage.height);
                resultImageData = resizedCtx.getImageData(0, 0, sourceImage.width, sourceImage.height);
              }

              // Manually composite using the mask
              // Gemini doesn't respect the mask properly, so we do it ourselves
              const compositedImageData = new ImageData(
                new Uint8ClampedArray(sourceImage.data),
                sourceImage.width,
                sourceImage.height
              );

              // Copy only white-masked pixels from generated image to source
              const maskData = maskImage.data;
              const generatedData = resultImageData.data;
              const compositedData = compositedImageData.data;

              for (let i = 0; i < maskData.length; i += 4) {
                // Check if this pixel is white in the mask (should be edited)
                if (maskData[i] > 128) { // White pixel
                  // Copy RGB from generated image
                  compositedData[i] = generatedData[i];       // R
                  compositedData[i + 1] = generatedData[i + 1]; // G
                  compositedData[i + 2] = generatedData[i + 2]; // B
                  compositedData[i + 3] = 255; // Full opacity
                }
                // Otherwise keep the source pixel (already copied from sourceImage.data)
              }

              return compositedImageData;
            }
          }
        }
      }

      throw new Error('No image data returned from Gemini');
    } catch (error) {
      console.error('Gemini inpainting error:', error);
      throw new Error(`Gemini inpainting failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform inpainting using Imagen 3.0 on Vertex AI
   */
  async inpaintWithImagen(
    sourceImage: ImageData,
    maskImage: ImageData,
    prompt: string
  ): Promise<ImageData> {
    if (!this.googleCloudProjectId) {
      throw new Error('Google Cloud Project ID is required for Imagen');
    }

    // Convert ImageData to base64
    const sourceBase64 = imageDataToBase64(sourceImage);
    const maskBase64 = imageDataToBase64(maskImage);

    // DEBUG: Log what we're sending to Imagen
    console.log('🔍 DEBUG: Imagen - Source image size:', sourceImage.width, 'x', sourceImage.height);
    console.log('🔍 DEBUG: Imagen - Mask image size:', maskImage.width, 'x', maskImage.height);
    console.log('🔍 DEBUG: Imagen - Prompt:', prompt);

    try {
      // Use Vertex AI REST API for Imagen
      const location = 'us-central1'; // Imagen is available in us-central1
      const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${this.googleCloudProjectId}/locations/${location}/publishers/google/models/imagen-3.0-capability-001:predict`;

      const requestBody = {
        instances: [{
          prompt: prompt,
          referenceImages: [
            {
              referenceType: 'REFERENCE_TYPE_RAW',
              referenceId: 1,
              referenceImage: {
                bytesBase64Encoded: sourceBase64.split(',')[1]
              }
            },
            {
              referenceType: 'REFERENCE_TYPE_MASK',
              referenceId: 2,
              referenceImage: {
                bytesBase64Encoded: maskBase64.split(',')[1]
              },
              maskImageConfig: {
                maskMode: 'MASK_MODE_USER_PROVIDED',
                dilation: 0.01
              }
            }
          ]
        }],
        parameters: {
          sampleCount: 1,
          editMode: 'EDIT_MODE_INPAINT_INSERTION',
          editConfig: {
            baseSteps: 35
          }
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Imagen API request failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      // Extract the generated image from the response
      if (result.predictions && result.predictions.length > 0) {
        const prediction = result.predictions[0];
        if (prediction.bytesBase64Encoded) {
          const generatedBase64 = `data:image/png;base64,${prediction.bytesBase64Encoded}`;
          const resultImageData = await base64ToImageData(generatedBase64);

          // DEBUG: Log what Imagen returned
          console.log('🔍 DEBUG: Imagen response size:', resultImageData.width, 'x', resultImageData.height);
          (window as any).debugImagenOutput = generatedBase64;
          console.log('🔍 DEBUG: Access Imagen output via window.debugImagenOutput');

          return resultImageData;
        }
      }

      throw new Error('No image data returned from Imagen');
    } catch (error) {
      console.error('Imagen inpainting error:', error);
      throw new Error(`Imagen inpainting failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform image editing with automatic mode detection
   * If maskImage is provided, uses inpainting mode. Otherwise, uses text-only mode.
   */
  async edit(
    sourceImage: ImageData,
    prompt: string,
    maskImage?: ImageData
  ): Promise<ImageData> {
    if (maskImage) {
      // Inpainting mode - use mask with inpainting model preference
      const modelToUse = this.inpaintingModel || this.model;
      if (modelToUse === 'imagen') {
        return this.inpaintWithImagen(sourceImage, maskImage, prompt);
      } else {
        return this.inpaintWithGemini(sourceImage, maskImage, prompt);
      }
    } else {
      // Text-only mode - no mask with text-only model preference
      const modelToUse = this.textOnlyModel || this.model;
      if (modelToUse === 'imagen') {
        return this.textOnlyWithImagen(sourceImage, prompt);
      } else {
        return this.textOnlyWithGemini(sourceImage, prompt);
      }
    }
  }

  /**
   * Perform inpainting on the source image using the mask and prompt
   */
  async inpaint(
    sourceImage: ImageData,
    maskImage: ImageData,
    prompt: string
  ): Promise<ImageData> {
    // Use the selected model
    if (this.model === 'imagen') {
      return this.inpaintWithImagen(sourceImage, maskImage, prompt);
    } else if (this.apiKey) {
      return this.inpaintWithGemini(sourceImage, maskImage, prompt);
    }

    // Fallback to generic API (if endpoint is provided)
    if (this.apiEndpoint) {
      // Convert ImageData to base64
      const sourceBase64 = imageDataToBase64(sourceImage);
      const maskBase64 = imageDataToBase64(maskImage);

      // Prepare request payload
      const requestBody: InpaintRequest = {
        sourceImage: sourceBase64,
        maskImage: maskBase64,
        prompt: prompt,
      };

      // Call AI API
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.statusText} - ${errorText}`);
      }

      const result: InpaintResponse = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      // Convert result back to ImageData
      const generatedImage = await base64ToImageData(result.generatedImage);

      return generatedImage;
    }

    throw new Error('No API key or endpoint configured');
  }

  /**
   * Mock implementation for testing without an API key
   * Returns a colored rectangle as a placeholder
   */
  async mockInpaint(
    sourceImage: ImageData,
    _maskImage: ImageData,
    _prompt: string
  ): Promise<ImageData> {
    // Create a mock result (colored overlay)
    const canvas = document.createElement('canvas');
    canvas.width = sourceImage.width;
    canvas.height = sourceImage.height;
    const ctx = canvas.getContext('2d')!;

    // Draw original
    ctx.putImageData(sourceImage, 0, 0);

    // Add semi-transparent overlay to show it "worked"
    ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add text
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = 'AI Generated (Mock)';
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
}

/**
 * Create a service instance from environment variables or user settings
 * @param apiKey - Optional API key to use (e.g., from SettingsManager)
 * @param model - AI model to use ('gemini' or 'imagen') - legacy parameter
 * @param googleCloudProjectId - Google Cloud project ID (for Imagen)
 * @param inpaintingModel - AI model to use for inpainting (mask-based)
 * @param textOnlyModel - AI model to use for text-only (conversational)
 */
export function createGenerativeService(
  apiKey?: string,
  model: AIModel = 'gemini',
  googleCloudProjectId?: string,
  inpaintingModel?: AIModel,
  textOnlyModel?: AIModel
): GenerativeInpaintService {
  // Priority: provided key > environment variables
  const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GENERATIVE_API_KEY || '';
  const apiEndpoint = import.meta.env.VITE_GENERATIVE_API_ENDPOINT || '';

  return new GenerativeInpaintService(key, apiEndpoint, model, googleCloudProjectId, inpaintingModel, textOnlyModel);
}
