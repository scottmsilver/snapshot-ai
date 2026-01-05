import { base64ToImageData, imageDataToBase64 } from '@/utils/maskRendering';
import { AI_MODELS, THINKING_BUDGETS } from '@/config/aiModels';
import { createAIClient, type AIClient } from './aiClient';
import { createAPIClient, type APIClient } from './apiClient';

export interface InpaintRequest {
  sourceImage: string;  // Base64 PNG
  maskImage: string;    // Base64 PNG (binary: white=selected, black=not)
  prompt: string;       // Freeform user instruction
}

export interface InpaintResponse {
  generatedImage: string;  // Base64 PNG
  error?: string;
}


// Check if we should use server-side API instead of direct Gemini calls
const USE_SERVER_AI = import.meta.env.VITE_USE_SERVER_AI === 'true';

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
  private ai: AIClient;
  private apiClient: APIClient | null;

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
    this.ai = createAIClient(apiKey);
    this.apiClient = USE_SERVER_AI ? createAPIClient() : null;
  }

  /**
   * Perform text-only editing with Gemini (no mask)
   */
  async textOnlyWithGemini(
    sourceImage: ImageData,
    prompt: string
  ): Promise<ImageData> {
    // Delegate to server API if enabled
    if (this.apiClient) {
      const sourceBase64 = imageDataToBase64(sourceImage);
      const result = await this.apiClient.generateImage(
        sourceBase64,
        prompt,
        {
          model: AI_MODELS.IMAGE_GENERATION,
          logLabel: 'Text-Only Image Edit',
        }
      );
      return await base64ToImageData(result.imageData);
    }

    // Convert ImageData to base64
    const sourceBase64 = imageDataToBase64(sourceImage);

    console.log('🔍 DEBUG: Gemini text-only - Source image size:', sourceImage.width, 'x', sourceImage.height);
    console.log('🔍 DEBUG: Gemini text-only - Prompt:', prompt);

    const editPrompt = `${prompt}

Make SIGNIFICANT, VISIBLE changes to create the requested modification. The result should look clearly different from the original.`;

    try {
      // Use the wrapper with isImageGeneration flag - logs automatically at lowest level
      const result = await this.ai.call({
        model: AI_MODELS.IMAGE_GENERATION,
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
        },
        isImageGeneration: true,
        logLabel: 'Text-Only Image Edit',
      });

      // Extract image from response (result.raw contains the API response)
      if (result.raw.candidates && result.raw.candidates.length > 0) {
        const candidate = result.raw.candidates[0];

        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              const generatedBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
              let resultImageData = await base64ToImageData(generatedBase64);
              // Wrapper already logged success, just log dimensions

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
   * Show debug dialog with Gemini interaction details
   */
  private showDebugDialog(): void {
    const debug = (window as any).geminiDebug;
    if (!debug) return;

    // Create dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 8px;
      padding: 20px;
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10000;
    `;

    dialog.innerHTML = `
      <h2 style="margin-top: 0;">Gemini Debug Info</h2>

      <h3>Step 1: Describe Selected Area</h3>
      <div style="margin-bottom: 20px;">
        <p><strong>Image sent:</strong></p>
        <img src="${debug.step1MarkedImage}" style="max-width: 100%; border: 1px solid #ddd; margin-bottom: 10px;" />
        <p><strong>Prompt:</strong></p>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; white-space: pre-wrap;">${debug.step1Prompt}</pre>
        <p><strong>Gemini's Response:</strong></p>
        <pre style="background: #e8f4ff; padding: 10px; border-radius: 4px; white-space: pre-wrap;">${debug.step1Response}</pre>
      </div>

      <h3>Step 2: Edit Image</h3>
      <div style="margin-bottom: 20px;">
        <p><strong>Image sent:</strong></p>
        <img src="${debug.step2MarkedImage}" style="max-width: 100%; border: 1px solid #ddd; margin-bottom: 10px;" />
        <p><strong>Prompt:</strong></p>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; white-space: pre-wrap;">${debug.step2Prompt}</pre>
        <p><strong>Gemini's Raw Output:</strong></p>
        <img src="${debug.step2RawResponse}" style="max-width: 100%; border: 1px solid #ddd;" />
      </div>

      <button id="closeDebugDialog" style="
        padding: 10px 20px;
        background: #4a90e2;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">Close</button>
    `;

    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 9999;
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);

    // Close handler
    const closeBtn = dialog.querySelector('#closeDebugDialog');
    const close = (): void => {
      document.body.removeChild(dialog);
      document.body.removeChild(backdrop);
    };
    closeBtn?.addEventListener('click', close);
    backdrop.addEventListener('click', close);
  }

  /**
   * Create a marked version of the source image with a red outline around the masked area
   */
  private createMarkedImage(sourceImage: ImageData, maskImage: ImageData): string {
    // Create canvas with source image
    const canvas = document.createElement('canvas');
    canvas.width = sourceImage.width;
    canvas.height = sourceImage.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(sourceImage, 0, 0);

    // Draw red outline where mask is white
    const maskData = maskImage.data;
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;

    // Find contours of the mask and draw outline
    // Simple approach: draw red pixels around white mask pixels
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = maskImage.width;
    tempCanvas.height = maskImage.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(maskImage, 0, 0);

    // Use the mask to create an outline
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // Draw thick red border around white areas
    for (let y = 0; y < maskImage.height; y++) {
      for (let x = 0; x < maskImage.width; x++) {
        const idx = (y * maskImage.width + x) * 4;
        if (maskData[idx] > 128) { // White pixel in mask
          // Check if it's an edge pixel
          const isEdge =
            x === 0 || x === maskImage.width - 1 ||
            y === 0 || y === maskImage.height - 1 ||
            (maskData[idx - 4] <= 128) || // left
            (maskData[idx + 4] <= 128) || // right
            (maskData[idx - maskImage.width * 4] <= 128) || // top
            (maskData[idx + maskImage.width * 4] <= 128); // bottom

          if (isEdge) {
            ctx.fillStyle = 'red';
            ctx.fillRect(x - 1, y - 1, 3, 3);
          }
        }
      }
    }
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl || dataUrl.length < 100) {
        console.error('❌ ERROR: createMarkedImage produced invalid data URL');
    }
    return dataUrl;
  }

  /**
   * Use Gemini to describe the selected area identified by the red marker
   * This helps Gemini understand which specific object/area to edit
   */
  private async describeSelectedArea(
    sourceImage: ImageData,
    maskImage: ImageData
  ): Promise<string> {
    // Create marked image with red outline
    const markedImageBase64 = this.createMarkedImage(sourceImage, maskImage);
    const markedBase64Data = markedImageBase64.split(',')[1];

    if (!markedBase64Data) {
        console.error('❌ ERROR: Failed to extract base64 from marked image');
        return 'the selected area';
    }

    console.log('🔍 DEBUG: Describing selected area with marker...');

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
      // Use the wrapper - it automatically logs prompt, thinking, and response
      const result = await this.ai.call({
        model: AI_MODELS.PRO,
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'IMAGE WITH RED MARKER:' },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: markedBase64Data,
                },
              },
              { text: describePrompt },
            ],
          },
        ],
        thinkingBudget: THINKING_BUDGETS.LOW,
        logLabel: 'Describe Selected Area',
      });

      const description = result.text || 'the selected area';
      console.log('🔍 DEBUG: Area description:', description);

      // Store for debug dialog
      (window as any).geminiDebug = (window as any).geminiDebug || {};
      (window as any).geminiDebug.step1MarkedImage = markedImageBase64;
      (window as any).geminiDebug.step1Prompt = describePrompt;
      (window as any).geminiDebug.step1Response = description;

      return description;
    } catch (error) {
      console.error('Failed to describe selected area:', error);
      // Fall back to generic description
      return 'the selected area';
    }
  }

  /**
   * Perform inpainting using Gemini 2.5 Flash image editing with two-step approach:
   * 1. First describe the selected area using the mask
   * 2. Then apply the user's edit instruction to that specific area
   */
  async inpaintWithGemini(
    sourceImage: ImageData,
    maskImage: ImageData,
    prompt: string
  ): Promise<ImageData> {
    // Delegate to server API if enabled
    if (this.apiClient) {
      const sourceBase64 = imageDataToBase64(sourceImage);
      const maskBase64 = imageDataToBase64(maskImage);
      const result = await this.apiClient.inpaint(
        sourceBase64,
        maskBase64,
        prompt,
        {
          thinkingBudget: THINKING_BUDGETS.LOW,
        }
      );
      return await base64ToImageData(result.imageData);
    }

    // Convert ImageData to base64
    const sourceBase64 = imageDataToBase64(sourceImage);

    console.log('🔍 DEBUG: sourceBase64 length:', sourceBase64.length);
    console.log('🔍 DEBUG: sourceBase64 prefix:', sourceBase64.substring(0, 50));

    const base64Data = sourceBase64.split(',')[1];
    if (!base64Data) {
        console.error('❌ ERROR: Failed to extract base64 data from source image data URL');
        throw new Error('Failed to process image data');
    }
    console.log('🔍 DEBUG: Extracted base64 data length:', base64Data.length);

    // DEBUG: Log what we're sending to Gemini
    console.log('🔍 DEBUG: Source image size:', sourceImage.width, 'x', sourceImage.height);
    console.log('🔍 DEBUG: Mask image size:', maskImage.width, 'x', maskImage.height);
    console.log('🔍 DEBUG: User prompt:', prompt);

    // Step 1: Describe the selected area
    const areaDescription = await this.describeSelectedArea(sourceImage, maskImage);

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

    // Step 2: Build the edit instruction using the area description
    // This matches the successful 2step-clean-describe strategy from evaluation
    const editPrompt = `In this image, there is: ${areaDescription}

Apply this change to ONLY that specific area described above: ${prompt}

CRITICAL RULES:
1. Make the requested change very visible and significant to the area I described
2. DO NOT change, modify, or alter any other parts of the image
3. ONLY modify other elements if they would naturally interact with or be affected by the requested change
4. Preserve all unrelated elements exactly as they appear in the original image

Return the edited image.`;

    console.log('🔍 DEBUG: Step 2 - Edit prompt being sent to Gemini:');
    console.log('═══════════════════════════════════════════════════');
    console.log(editPrompt);
    console.log('═══════════════════════════════════════════════════');

    try {
      // Use the wrapper with isImageGeneration flag - logs automatically at lowest level
      // Step 2: Send clean original image (not marked) with description-based instruction
      const result = await this.ai.call({
        model: AI_MODELS.IMAGE_GENERATION,
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'ORIGINAL IMAGE:' },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: sourceBase64.split(',')[1], // Send clean original image
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
        logLabel: 'Inpaint Image Edit',
      });

      // Extract image from response (result.raw contains the API response)
      if (result.raw.candidates && result.raw.candidates.length > 0) {
        const candidate = result.raw.candidates[0];

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

              // Store for debug dialog
              (window as any).geminiDebug.step2MarkedImage = sourceDebugUrl; // Now using clean original image
              (window as any).geminiDebug.step2Prompt = editPrompt;
              (window as any).geminiDebug.step2RawResponse = geminiDebugUrl;

              // Show debug dialog
              this.showDebugDialog();

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

              // Wrapper already logged success
              return compositedImageData;
            }
          }
        }
      }

      throw new Error('No image data returned from Gemini');
    } catch (error) {
      console.error('Gemini inpainting error:', error);
      // Wrapper already logged the error
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
    // Suppress unused parameter warnings - these match the real API signature
    void _maskImage;
    void _prompt;
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
  textOnlyModel?: AIModel,
  apiEndpointOverride?: string
): GenerativeInpaintService {
  const meta = typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string> }) : undefined;
  const env = meta?.env ?? {};

  // Priority: provided key > environment variables
  const key = apiKey || env.VITE_GEMINI_API_KEY || env.VITE_GENERATIVE_API_KEY || '';
  const apiEndpoint = apiEndpointOverride || env.VITE_GENERATIVE_API_ENDPOINT || '';

  return new GenerativeInpaintService(key, apiEndpoint, model, googleCloudProjectId, inpaintingModel, textOnlyModel);
}
