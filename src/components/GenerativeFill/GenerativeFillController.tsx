import React, { useCallback, useEffect } from 'react';
import Konva from 'konva';
import { useDrawingContext, DrawingActionType } from '@/contexts/DrawingContext';
import { useAIProgress } from '@/contexts/AIProgressContext';
import { captureCleanCanvas } from '@/utils/exportUtils';
import { applySmartTransparencyMask } from '@/utils/aiImageRemask';
import {
  DrawingTool,
  GenerativeFillSelectionTool,
  getNextZIndex,
  type Shape,
} from '@/types/drawing';
import { isServerAIEnabled } from '@/config/apiConfig';
import { createGenerativeService } from '@/services/generativeApi';
import { AgenticPainterService } from '@/services/agenticService';
import { settingsManager } from '@/services/settingsManager';
import { generateBrushMask, generateRectangleMask, generateLassoMask, base64ToImageData } from '@/utils/maskRendering';
import { createAPIClient } from '@/services/apiClient';
import { GenerativeFillToolbar } from './GenerativeFillToolbar';
import { GenerativeFillDialog } from './GenerativeFillDialog';
import { LoadingOverlay } from '@/components/App/LoadingOverlay';

export interface GenerativeFillControllerProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  shapes: Shape[];
  activeTool: DrawingTool;
  authContext: {
    isAuthenticated: boolean;
    getAccessToken?: () => string | null;
  } | null;
  onAddShape: (shape: Shape) => void;
  onSelectShape: (id: string) => void;
  onSettingsOpen: () => void;
  captureAiSourceAndMask: (stage: Konva.Stage) => {
    sourceCanvas: HTMLCanvasElement;
    sourceImageData: ImageData;
    alphaMaskImageData: ImageData;
  };
}

export const GenerativeFillController: React.FC<GenerativeFillControllerProps> = ({
  stageRef,
  shapes,
  activeTool,
  authContext,
  onAddShape,
  onSelectShape,
  onSettingsOpen,
  captureAiSourceAndMask,
}) => {
  const { state: drawingState, dispatch } = useDrawingContext();
  const { updateProgress, setExportData } = useAIProgress();

  // Activate generative fill mode when tool is selected
  useEffect(() => {
    if (activeTool === DrawingTool.GENERATIVE_FILL && !drawingState.generativeFillMode) {
      // Default to inpainting mode - user can switch to text-only from toolbar
      dispatch({ type: DrawingActionType.START_GENERATIVE_FILL, mode: 'inpainting' });
    }
  }, [activeTool, drawingState.generativeFillMode, dispatch]);

  const handleGenerativeFillSelectTool = useCallback(
    (selectionTool: GenerativeFillSelectionTool) => {
      dispatch({
        type: DrawingActionType.SET_GENERATIVE_FILL_SELECTION_TOOL,
        selectionTool,
      });
    },
    [dispatch]
  );

  const handleGenerativeFillBrushWidthChange = useCallback(
    (brushWidth: number) => {
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        brushWidth,
      });
    },
    [dispatch]
  );

  const handleGenerativeFillComplete = useCallback(() => {
    // Selection complete - generate preview images and show dialog
    if (!stageRef.current || !drawingState.generativeFillMode) return;

    try {
      const stage = stageRef.current;
      const { selectionTool, selectionPoints, selectionRectangle, brushWidth } = drawingState.generativeFillMode;

      // Capture clean canvas (without grid, selection UI, overlays, etc.)
      const canvas = captureCleanCanvas(stage);

      console.log('🔍 DEBUG: Captured canvas size:', canvas.width, 'x', canvas.height);

      // Generate mask based on selection tool
      let maskExport;

      if (selectionTool === GenerativeFillSelectionTool.BRUSH) {
        maskExport = generateBrushMask(canvas, selectionPoints, brushWidth);
      } else if (selectionTool === GenerativeFillSelectionTool.RECTANGLE && selectionRectangle) {
        maskExport = generateRectangleMask(canvas, selectionRectangle);
      } else if (selectionTool === GenerativeFillSelectionTool.LASSO || selectionTool === GenerativeFillSelectionTool.POLYGON) {
        maskExport = generateLassoMask(canvas, selectionPoints);
      } else {
        console.error('Invalid selection tool or missing selection data');
        return;
      }

      // Convert to base64 for preview
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = maskExport.sourceImageData.width;
      sourceCanvas.height = maskExport.sourceImageData.height;
      const sourceCtx = sourceCanvas.getContext('2d')!;
      sourceCtx.putImageData(maskExport.sourceImageData, 0, 0);
      const sourceBase64 = sourceCanvas.toDataURL('image/png');

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = maskExport.maskImageData.width;
      maskCanvas.height = maskExport.maskImageData.height;
      const maskCtx = maskCanvas.getContext('2d')!;
      maskCtx.putImageData(maskExport.maskImageData, 0, 0);
      const maskBase64 = maskCanvas.toDataURL('image/png');

      dispatch({
        type: DrawingActionType.COMPLETE_GENERATIVE_FILL_SELECTION,
        sourceImage: sourceBase64,
        maskImage: maskBase64,
      });
    } catch (error) {
      console.error('Failed to generate preview images:', error);
    }
  }, [dispatch, drawingState.generativeFillMode, stageRef]);

  const handleGenerativeFillCancel = useCallback(() => {
    dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
  }, [dispatch]);

  const handleSkipToConversational = useCallback(() => {
    // Switch to text-only mode and open dialog immediately
    dispatch({ type: DrawingActionType.START_GENERATIVE_FILL, mode: 'text-only' });
  }, [dispatch]);

  const handleGenerativeFillPromptSubmit = useCallback(
    async (prompt: string) => {
      if (!stageRef.current || !drawingState.generativeFillMode) return;

      dispatch({ type: DrawingActionType.SET_GENERATIVE_FILL_PROMPT, prompt });
      dispatch({ type: DrawingActionType.START_GENERATIVE_FILL_GENERATION });

      try {
        const stage = stageRef.current;
        const { mode, selectionTool, selectionPoints, selectionRectangle, brushWidth } = drawingState.generativeFillMode;

        // Capture clean canvas and alpha mask for smart transparency remask
        const { sourceCanvas, sourceImageData, alphaMaskImageData } = captureAiSourceAndMask(stage);

        // Convert source to base64 for export
        const sourceBase64ForExport = sourceCanvas.toDataURL('image/png');

        // Generate mask only if in inpainting mode
        let maskExport;
        let maskBase64ForExport: string | undefined;
        if (mode === 'inpainting') {
          if (selectionTool === GenerativeFillSelectionTool.BRUSH) {
            maskExport = generateBrushMask(sourceCanvas, selectionPoints, brushWidth);
          } else if (selectionTool === GenerativeFillSelectionTool.RECTANGLE && selectionRectangle) {
            maskExport = generateRectangleMask(sourceCanvas, selectionRectangle);
          } else if (selectionTool === GenerativeFillSelectionTool.LASSO) {
            maskExport = generateLassoMask(sourceCanvas, selectionPoints);
          } else {
            throw new Error('Invalid selection tool or missing selection data');
          }

          // Convert mask to base64 for export
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = maskExport.maskImageData.width;
          maskCanvas.height = maskExport.maskImageData.height;
          const maskCtx = maskCanvas.getContext('2d')!;
          maskCtx.putImageData(maskExport.maskImageData, 0, 0);
          maskBase64ForExport = maskCanvas.toDataURL('image/png');
        }

        // Get settings
        let geminiApiKey: string | null = null;
        let inpaintingModel: string | null = null;
        let textOnlyModel: string | null = null;
        let googleCloudProjectId: string | null = null;
        let oauthAccessToken: string | null = null;

        if (authContext?.isAuthenticated && authContext?.getAccessToken) {
          try {
            const accessToken = authContext.getAccessToken();
            oauthAccessToken = accessToken;
            if (accessToken) {
              await settingsManager.initialize(accessToken);
              geminiApiKey = await settingsManager.getGeminiApiKey();
              inpaintingModel = await settingsManager.getInpaintingModel();
              textOnlyModel = await settingsManager.getTextOnlyModel();
              googleCloudProjectId = await settingsManager.getGoogleCloudProjectId();
            }
          } catch (error) {
            console.error('Failed to get settings:', error);
          }
        }

        // Default to gemini for inpainting, gemini for text-only
        const selectedInpaintingModel = (inpaintingModel || 'gemini') as 'gemini' | 'imagen';
        const selectedTextOnlyModel = (textOnlyModel || 'gemini') as 'gemini' | 'imagen';

        // Determine which model to validate based on mode
        const modelToValidate = mode === 'inpainting' ? selectedInpaintingModel : selectedTextOnlyModel;

        // Check authentication and API key based on model
        // In server mode, Gemini API key is handled server-side
        if (modelToValidate === 'gemini' && !isServerAIEnabled()) {
          if (!geminiApiKey && !import.meta.env.VITE_GEMINI_API_KEY && !import.meta.env.VITE_GENERATIVE_API_KEY) {
            dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
            alert('Please add your Gemini API key in Settings to use Generative Fill (or enable server mode).');
            onSettingsOpen();
            return;
          }
        } else if (modelToValidate === 'imagen') {
          if (!oauthAccessToken) {
            dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
            alert('Please sign in with Google to use Imagen.');
            return;
          }
          if (!googleCloudProjectId) {
            dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
            alert('Please add your Google Cloud Project ID in Settings to use Imagen.');
            onSettingsOpen();
            return;
          }
        }

        // Call API service with both model preferences
        // Resolve Gemini API Key for the Agent (and Nano Banana tool)
        const effectiveGeminiKey = geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GENERATIVE_API_KEY || '';

        let resultImageData: ImageData;

        // Use SSE streaming for inpainting mode when server AI is enabled
        if (isServerAIEnabled() && mode === 'inpainting' && maskExport && maskBase64ForExport) {
          // Use new SSE streaming inpaint endpoint
          console.log('🎨 App: Starting inpaintStream...');
          const apiClient = createAPIClient();
          const result = await apiClient.inpaintStream(
            sourceBase64ForExport,
            maskBase64ForExport,
            prompt,
            {
              onProgress: updateProgress,
            }
          );
          console.log('🎨 App: inpaintStream resolved!', { hasImageData: !!result.imageData, imageDataLength: result.imageData?.length || 0 });
          resultImageData = await base64ToImageData(result.imageData);
        } else {
          // Create specific service for the Nano Banana tool (always Gemini)
          const nanoBananaService = createGenerativeService(
            effectiveGeminiKey,
            'gemini',
            undefined,
            'gemini',
            'gemini'
          );

          // Use Agentic Service for text-only mode or when server AI is disabled
          const agenticService = new AgenticPainterService(effectiveGeminiKey, nanoBananaService);

          // Call edit() method which handles both inpainting and text-only modes
          resultImageData = mode === 'inpainting' && maskExport
            ? await agenticService.edit(sourceImageData, prompt, maskExport.maskImageData, updateProgress)
            : await agenticService.edit(sourceImageData, prompt, undefined, updateProgress);
        }
        const remaskedResult = applySmartTransparencyMask(
          resultImageData,
          sourceImageData,
          alphaMaskImageData
        );

        // Convert result to base64
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = remaskedResult.width;
        resultCanvas.height = remaskedResult.height;
        const resultCtx = resultCanvas.getContext('2d')!;
        resultCtx.putImageData(remaskedResult, 0, 0);
        const resultBase64 = resultCanvas.toDataURL('image/png');

        // Result is now full-size, so bounds should be full canvas
        const fullCanvasBounds = {
          x: 0,
          y: 0,
          width: sourceCanvas.width,
          height: sourceCanvas.height,
        };

        // Create the image shape immediately and add it to canvas
        const imageShape: Shape = {
          id: `image-${Date.now()}`,
          type: DrawingTool.IMAGE,
          x: fullCanvasBounds.x,
          y: fullCanvasBounds.y,
          width: fullCanvasBounds.width,
          height: fullCanvasBounds.height,
          imageData: resultBase64,
          style: {
            stroke: 'transparent',
            strokeWidth: 0,
            fill: 'transparent',
            opacity: 1,
          },
          rotation: 0,
          zIndex: getNextZIndex(shapes),
          visible: true,
          locked: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Add the shape and select it
        onAddShape(imageShape);
        onSelectShape(imageShape.id);

        // Set export data for Save button in AI Progress Panel
        setExportData({
          sourceImage: sourceBase64ForExport,
          resultImage: resultBase64,
          prompt,
          maskImage: maskBase64ForExport,
          type: mode === 'inpainting' ? 'ai_fill' : 'ai_fill_text_only',
          canvas: {
            width: sourceCanvas.width,
            height: sourceCanvas.height,
          },
        });

        // Exit generative fill mode
        dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
      } catch (error) {
        console.error('Generative fill failed:', error);
        alert(`Generative fill failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Reset to allow retry
        dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
      }
    },
    [dispatch, drawingState.generativeFillMode, stageRef, shapes, onAddShape, onSelectShape, authContext, updateProgress, setExportData, captureAiSourceAndMask, onSettingsOpen]
  );

  const handleGenerativeFillDialogCancel = useCallback(() => {
    // Just close the dialog, keep the selection
    if (!drawingState.generativeFillMode) return;
    dispatch({
      type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
    });
    // Need to close dialog - we'll dispatch a new action or handle via state
    dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
  }, [dispatch, drawingState.generativeFillMode]);

  return (
    <>
      {/* Generative Fill Toolbar - only show in inpainting mode when not showing dialog or generating */}
      {drawingState.generativeFillMode?.isActive &&
        drawingState.generativeFillMode.mode === 'inpainting' &&
        !drawingState.generativeFillMode.showPromptDialog &&
        !drawingState.generativeFillMode.isGenerating && (
          <GenerativeFillToolbar
            selectedTool={drawingState.generativeFillMode.selectionTool || GenerativeFillSelectionTool.BRUSH}
            brushWidth={drawingState.generativeFillMode.brushWidth}
            hasSelection={
              drawingState.generativeFillMode.selectionPoints.length > 0 ||
              drawingState.generativeFillMode.selectionRectangle !== null
            }
            onSelectTool={handleGenerativeFillSelectTool}
            onBrushWidthChange={handleGenerativeFillBrushWidthChange}
            onComplete={handleGenerativeFillComplete}
            onCancel={handleGenerativeFillCancel}
            onSkipToConversational={handleSkipToConversational}
          />
        )}

      {/* Generative Fill Dialog */}
      {drawingState.generativeFillMode && (
        <GenerativeFillDialog
          isOpen={drawingState.generativeFillMode.showPromptDialog}
          isGenerating={drawingState.generativeFillMode.isGenerating}
          mode={drawingState.generativeFillMode.mode}
          onSubmit={handleGenerativeFillPromptSubmit}
          onCancel={handleGenerativeFillDialogCancel}
          sourceImagePreview={drawingState.generativeFillMode.previewImages?.sourceImage}
          maskImagePreview={drawingState.generativeFillMode.previewImages?.maskImage}
        />
      )}

      {/* Loading Overlay - block all interactions while generating */}
      <LoadingOverlay isVisible={drawingState.generativeFillMode?.isGenerating ?? false} />
    </>
  );
};
