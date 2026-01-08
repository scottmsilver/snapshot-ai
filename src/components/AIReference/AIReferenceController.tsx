import React, { useState, useRef, useCallback } from 'react';
import Konva from 'konva';
import { useDrawingContext } from '@/contexts/DrawingContext';
import { useAIProgress } from '@/contexts/AIProgressContext';
import { captureCleanCanvas } from '@/utils/exportUtils';
import { applySmartTransparencyMask } from '@/utils/aiImageRemask';
import { annotateImage } from '@/utils/imageAnnotation';
import { imageDataToBase64 } from '@/utils/maskRendering';
import { downloadAiManipulationCase } from '@/utils/aiCaseRecorder';
import { createGenerativeService } from '@/services/generativeApi';
import { AgenticPainterService, type MovePlan } from '@/services/agenticService';
import { settingsManager } from '@/services/settingsManager';
import { ManipulationDialog, MoveConfirmationDialog } from '@/components/AIReference';
import {
  DrawingTool,
  getNextZIndex,
  type Shape,
} from '@/types/drawing';

interface AuthContextType {
  isAuthenticated: boolean;
  getAccessToken: () => string;
}

export interface AIReferenceControllerProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  shapes: Shape[];
  zoomLevel: number;
  authContext: AuthContextType | null;
  onAddShape: (shape: Shape) => void;
  onSelectShape: (id: string) => void;
  onSettingsOpen: () => void;
}

export interface AIReferenceControllerState {
  manipulationDialogOpen: boolean;
  moveConfirmationOpen: boolean;
}

export const AIReferenceController: React.FC<AIReferenceControllerProps> = ({
  stageRef,
  shapes,
  zoomLevel,
  authContext,
  onAddShape,
  onSelectShape,
  onSettingsOpen,
}) => {
  const [manipulationDialogOpen, setManipulationDialogOpen] = useState(false);
  const [manipulationPreviewImage, setManipulationPreviewImage] = useState<string | null>(null);
  const [moveConfirmationOpen, setMoveConfirmationOpen] = useState(false);
  const [movePlan, setMovePlan] = useState<MovePlan | null>(null);
  const [isPlanningMove, setIsPlanningMove] = useState(false);

  const { state: drawingState, clearReferencePoints, setAiReferenceMode, clearAiMarkupShapes } = useDrawingContext();
  const { updateProgress } = useAIProgress();

  // Store reference points and canvas data for the confirmation flow
  const pendingManipulationRef = useRef<{
    referencePoints: Array<{label: string, x: number, y: number}>;
    markupShapes: Shape[];
    command: string;
    imageDataUrl: string;
    canvasWidth: number;
    canvasHeight: number;
    alphaMaskImageData: ImageData;
    geminiApiKey: string;
    useLangGraph: boolean;
  } | null>(null);

  // AI Reference Mode - Manipulation Handler (now with confirmation)
  const handleManipulationSubmit = useCallback(async (command: string) => {
    // Capture reference points and markup shapes BEFORE closing dialog
    const referencePointsCopy = [...drawingState.referencePoints];
    const markupShapesCopy = [...drawingState.aiMarkupShapes];

    // Close the command dialog but keep reference mode active
    setManipulationDialogOpen(false);

    try {
      const stage = stageRef.current;
      if (!stage) return;

      // Capture clean canvas (without grid, selection UI, overlays, etc.)
      const canvas = captureCleanCanvas(stage);
      const imageDataUrl = canvas.toDataURL('image/png');
      const maskCanvas = captureCleanCanvas(stage, { hideBackground: true });
      const maskCtx = maskCanvas.getContext('2d')!;
      const alphaMaskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

      // Get API key and LangGraph preference
      let geminiApiKey: string | null = null;
      let useLangGraph = false;
      if (authContext?.isAuthenticated && authContext?.getAccessToken) {
        try {
          const accessToken = authContext.getAccessToken();
          if (accessToken) {
            await settingsManager.initialize(accessToken);
            geminiApiKey = await settingsManager.getGeminiApiKey();
            useLangGraph = await settingsManager.getUseLangGraph();
          }
        } catch (error) {
          console.error('Failed to get settings:', error);
        }
      }

      const effectiveGeminiKey = geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GENERATIVE_API_KEY || '';

      if (!effectiveGeminiKey) {
        console.error('No API key');
        alert('Please add your Gemini API key in Settings to use AI Reference Mode.');
        onSettingsOpen();
        return;
      }

      // Store data for confirmation flow
      pendingManipulationRef.current = {
        referencePoints: referencePointsCopy,
        markupShapes: markupShapesCopy,
        command,
        imageDataUrl,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        alphaMaskImageData,
        geminiApiKey: effectiveGeminiKey,
        useLangGraph,
      };

      // Open confirmation dialog and start planning
      setMoveConfirmationOpen(true);
      setIsPlanningMove(true);

      // Create service and get plan
      const nanoBananaService = createGenerativeService(
        effectiveGeminiKey,
        'gemini',
        undefined,
        'gemini',
        'gemini'
      );
      const agenticService = new AgenticPainterService(effectiveGeminiKey, nanoBananaService);

      // Get the plan with annotations and descriptions
      // Pass markup shapes so the AI knows about circles, lines, etc. the user drew
      const plan = await agenticService.planMoveOperation(
        imageDataUrl,
        referencePointsCopy,
        command,
        canvas.width,
        canvas.height,
        markupShapesCopy
      );

      setMovePlan(plan);
      setIsPlanningMove(false);

    } catch (error) {
      console.error('Planning failed:', error);
      setMoveConfirmationOpen(false);
      setIsPlanningMove(false);
      setMovePlan(null);
      alert('Failed to plan operation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }, [drawingState.referencePoints, drawingState.aiMarkupShapes, authContext, stageRef, onSettingsOpen]);

  // Handler for confirming the move operation
  const handleMoveConfirm = useCallback(async () => {
    if (!movePlan || !pendingManipulationRef.current) return;

    const {
      imageDataUrl,
      canvasWidth,
      canvasHeight,
      alphaMaskImageData,
      geminiApiKey,
      referencePoints,
      markupShapes,
      command,
      useLangGraph,
    } = pendingManipulationRef.current;

    // Close confirmation and clear reference mode
    setMoveConfirmationOpen(false);
    clearReferencePoints();
    setAiReferenceMode(false);

    try {
      // Create service
      const nanoBananaService = createGenerativeService(
        geminiApiKey,
        'gemini',
        undefined,
        'gemini',
        'gemini'
      );
      const agenticService = new AgenticPainterService(geminiApiKey, nanoBananaService);

      // Convert to ImageData
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageDataUrl;
      });

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasWidth;
      tempCanvas.height = canvasHeight;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.drawImage(img, 0, 0);
      const sourceImageData = tempCtx.getImageData(0, 0, canvasWidth, canvasHeight);

      // Build a rich prompt that includes all the learned context
      const descriptionsContext = movePlan.descriptions
        .map(d => `- "${d.description}" located at coordinates (${d.x}, ${d.y})`)
        .join('\n');

      // Check if there are any markup shapes that will be visible in the image
      const hasMarkupShapes = (drawingState.aiMarkupShapes?.length || 0) > 0;

      const markupRemovalNote = hasMarkupShapes
        ? `\n\nCRITICAL - MARKUP REMOVAL: The image contains bright orange freehand annotations (lines, circles, or rectangles) drawn by the user to indicate areas of interest. You MUST:
1. Remove ALL orange markup lines/shapes from the output
2. Restore the underlying content naturally where the markups were
3. Execute the user's edit request as described above`
        : '';

      const enrichedPrompt = `CONTEXT - Elements in this image that are relevant to the edit:
${descriptionsContext}

TASK:
${movePlan.suggestedPrompt}

IMPORTANT: Use the exact coordinates provided above to locate elements. The descriptions tell you precisely what each element looks like and where it is.${markupRemovalNote}`;

      updateProgress({
        step: 'processing',
        message: 'Executing confirmed operation...',
        thinkingText: `Executing:\n\n${movePlan.interpretation}\n\n**Full prompt with context:**\n${enrichedPrompt}`,
      });

      // Execute the edit with the enriched prompt (includes all learned context)
      const resultImageData = await agenticService.edit(
        sourceImageData,
        enrichedPrompt,
        undefined,
        updateProgress,
        { useLangGraph }
      );
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

      if (localStorage.getItem('recordAiManipulationCases') === 'true') {
        const alphaMaskBase64 = imageDataToBase64(alphaMaskImageData);
        try {
          await downloadAiManipulationCase({
            id: `ai-manipulation-${new Date().toISOString()}`,
            type: 'ai_reference_manipulation',
            createdAt: new Date().toISOString(),
            canvas: {
              width: canvasWidth,
              height: canvasHeight,
            },
            command,
            enrichedPrompt,
            movePlan,
            referencePoints,
            markupShapes,
            sourceImageDataUrl: imageDataUrl,
            alphaMaskDataUrl: alphaMaskBase64,
            outputImageDataUrl: resultBase64,
            models: {
              planning: 'gemini',
              generation: 'gemini',
            },
          });
        } catch (error) {
          console.warn('Failed to download AI manipulation bundle:', error);
        }
      }

      // Create image shape and add to canvas
      const imageShape: Shape = {
        id: `image-${Date.now()}`,
        type: DrawingTool.IMAGE,
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
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

      // Clear any markup shapes before adding the new image
      clearAiMarkupShapes();

      onAddShape(imageShape);
      onSelectShape(imageShape.id);

      updateProgress({
        step: 'complete',
        message: 'Image manipulation completed successfully!',
        thinkingText: 'Your edited image has been added to the canvas.',
      });

    } catch (error) {
      console.error('Manipulation failed:', error);
      updateProgress({
        step: 'error',
        message: 'Failed to process manipulation',
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
        },
      });
      alert('Failed to process manipulation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setMovePlan(null);
      pendingManipulationRef.current = null;
    }
  }, [movePlan, clearReferencePoints, setAiReferenceMode, updateProgress, shapes, onAddShape, onSelectShape, drawingState.aiMarkupShapes, clearAiMarkupShapes]);

  // Handler for editing the command (go back to manipulation dialog)
  const handleMoveEditCommand = useCallback(() => {
    setMoveConfirmationOpen(false);
    setMovePlan(null);
    setManipulationDialogOpen(true);
  }, []);

  // Handler for replanning with edited command text
  const handleReplan = useCallback(async (editedCommand: string) => {
    if (!pendingManipulationRef.current) return;

    try {
      // Set loading state
      setIsPlanningMove(true);

      // Update the stored command with the edited version
      pendingManipulationRef.current.command = editedCommand;

      const {
        imageDataUrl,
        referencePoints,
        canvasWidth,
        canvasHeight,
        markupShapes,
        geminiApiKey,
      } = pendingManipulationRef.current;

      // Create service and regenerate plan with edited command
      const nanoBananaService = createGenerativeService(
        geminiApiKey,
        'gemini',
        undefined,
        'gemini',
        'gemini'
      );
      const agenticService = new AgenticPainterService(geminiApiKey, nanoBananaService);

      // Get the new plan with the edited command
      const plan = await agenticService.planMoveOperation(
        imageDataUrl,
        referencePoints,
        editedCommand,
        canvasWidth,
        canvasHeight,
        markupShapes
      );

      setMovePlan(plan);
      setIsPlanningMove(false);

    } catch (error) {
      console.error('Replanning failed:', error);
      setIsPlanningMove(false);
      alert('Failed to replan operation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }, []);

  // Handler for closing the confirmation dialog
  const handleMoveConfirmationClose = useCallback(() => {
    setMoveConfirmationOpen(false);
    setMovePlan(null);
    setIsPlanningMove(false);
    pendingManipulationRef.current = null;
  }, []);

  // Handler for opening the manipulation dialog with annotated preview
  const _handleOpenManipulationDialog = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) {
      setManipulationDialogOpen(true);
      return;
    }

    try {
      // Capture clean canvas (without grid, selection UI, overlays, etc.)
      const canvas = captureCleanCanvas(stage);
      const imageDataUrl = canvas.toDataURL('image/png');

      // Create annotated preview with pins
      const annotationPoints = drawingState.referencePoints.map((p: { label: string; x: number; y: number }) => ({
        label: p.label,
        x: p.x * zoomLevel, // Scale to match captured canvas
        y: p.y * zoomLevel,
      }));

      const annotatedPreview = await annotateImage(imageDataUrl, {
        points: annotationPoints,
      });

      setManipulationPreviewImage(annotatedPreview);
    } catch (error) {
      console.error('Failed to capture preview:', error);
      setManipulationPreviewImage(null);
    }

    setManipulationDialogOpen(true);
  }, [drawingState.referencePoints, zoomLevel, stageRef]);

  // Handler for clearing reference state
  const _handleReferenceClear = useCallback(() => {
    clearReferencePoints();
    clearAiMarkupShapes();
    setAiReferenceMode(false);
  }, [clearReferencePoints, clearAiMarkupShapes, setAiReferenceMode]);

  // Check if dialog is open (used by parent for isManipulationDialogOpen)
  const _isDialogOpen = manipulationDialogOpen || moveConfirmationOpen;

  return (
    <>
      {/* AI Reference Mode - Manipulation Dialog only (overlay is in WorkspaceCanvas) */}
      <ManipulationDialog
        open={manipulationDialogOpen}
        onClose={() => {
          setManipulationDialogOpen(false);
          setManipulationPreviewImage(null);
        }}
        onSubmit={handleManipulationSubmit}
        referencePoints={drawingState.referencePoints}
        previewImage={manipulationPreviewImage || undefined}
      />

      {/* AI Reference Mode - Move Confirmation Dialog */}
      <MoveConfirmationDialog
        open={moveConfirmationOpen}
        onClose={handleMoveConfirmationClose}
        onConfirm={handleMoveConfirm}
        onEditCommand={handleMoveEditCommand}
        onReplan={handleReplan}
        plan={movePlan}
        isLoading={isPlanningMove}
      />
    </>
  );
};

// Named exports for controller methods - parent can access via ref pattern or prop callbacks
export type AIReferenceControllerHandle = {
  openManipulationDialog: () => Promise<void>;
  clearReference: () => void;
  isDialogOpen: boolean;
};

// Export a hook-based approach for parent integration
export function useAIReferenceController(props: AIReferenceControllerProps): {
  component: React.ReactNode;
  openManipulationDialog: () => Promise<void>;
  clearReference: () => void;
  isDialogOpen: boolean;
} {
  const [manipulationDialogOpen, setManipulationDialogOpen] = useState(false);
  const [manipulationPreviewImage, setManipulationPreviewImage] = useState<string | null>(null);
  const [moveConfirmationOpen, setMoveConfirmationOpen] = useState(false);
  const [movePlan, setMovePlan] = useState<MovePlan | null>(null);
  const [isPlanningMove, setIsPlanningMove] = useState(false);

  const { stageRef, shapes, zoomLevel, authContext, onAddShape, onSelectShape, onSettingsOpen } = props;
  const { state: drawingState, clearReferencePoints, setAiReferenceMode, clearAiMarkupShapes } = useDrawingContext();
  const { updateProgress } = useAIProgress();

  // Store reference points and canvas data for the confirmation flow
  const pendingManipulationRef = useRef<{
    referencePoints: Array<{label: string, x: number, y: number}>;
    markupShapes: Shape[];
    command: string;
    imageDataUrl: string;
    canvasWidth: number;
    canvasHeight: number;
    alphaMaskImageData: ImageData;
    geminiApiKey: string;
    useLangGraph: boolean;
  } | null>(null);

  // AI Reference Mode - Manipulation Handler (now with confirmation)
  const handleManipulationSubmit = useCallback(async (command: string) => {
    // Capture reference points and markup shapes BEFORE closing dialog
    const referencePointsCopy = [...drawingState.referencePoints];
    const markupShapesCopy = [...drawingState.aiMarkupShapes];

    // Close the command dialog but keep reference mode active
    setManipulationDialogOpen(false);

    try {
      const stage = stageRef.current;
      if (!stage) return;

      // Capture clean canvas (without grid, selection UI, overlays, etc.)
      const canvas = captureCleanCanvas(stage);
      const imageDataUrl = canvas.toDataURL('image/png');
      const maskCanvas = captureCleanCanvas(stage, { hideBackground: true });
      const maskCtx = maskCanvas.getContext('2d')!;
      const alphaMaskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

      // Get API key and LangGraph preference
      let geminiApiKey: string | null = null;
      let useLangGraph = false;
      if (authContext?.isAuthenticated && authContext?.getAccessToken) {
        try {
          const accessToken = authContext.getAccessToken();
          if (accessToken) {
            await settingsManager.initialize(accessToken);
            geminiApiKey = await settingsManager.getGeminiApiKey();
            useLangGraph = await settingsManager.getUseLangGraph();
          }
        } catch (error) {
          console.error('Failed to get settings:', error);
        }
      }

      const effectiveGeminiKey = geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GENERATIVE_API_KEY || '';

      if (!effectiveGeminiKey) {
        console.error('No API key');
        alert('Please add your Gemini API key in Settings to use AI Reference Mode.');
        onSettingsOpen();
        return;
      }

      // Store data for confirmation flow
      pendingManipulationRef.current = {
        referencePoints: referencePointsCopy,
        markupShapes: markupShapesCopy,
        command,
        imageDataUrl,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        alphaMaskImageData,
        geminiApiKey: effectiveGeminiKey,
        useLangGraph,
      };

      // Open confirmation dialog and start planning
      setMoveConfirmationOpen(true);
      setIsPlanningMove(true);

      // Create service and get plan
      const nanoBananaService = createGenerativeService(
        effectiveGeminiKey,
        'gemini',
        undefined,
        'gemini',
        'gemini'
      );
      const agenticService = new AgenticPainterService(effectiveGeminiKey, nanoBananaService);

      // Get the plan with annotations and descriptions
      // Pass markup shapes so the AI knows about circles, lines, etc. the user drew
      const plan = await agenticService.planMoveOperation(
        imageDataUrl,
        referencePointsCopy,
        command,
        canvas.width,
        canvas.height,
        markupShapesCopy
      );

      setMovePlan(plan);
      setIsPlanningMove(false);

    } catch (error) {
      console.error('Planning failed:', error);
      setMoveConfirmationOpen(false);
      setIsPlanningMove(false);
      setMovePlan(null);
      alert('Failed to plan operation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }, [drawingState.referencePoints, drawingState.aiMarkupShapes, authContext, stageRef, onSettingsOpen]);

  // Handler for confirming the move operation
  const handleMoveConfirm = useCallback(async () => {
    if (!movePlan || !pendingManipulationRef.current) return;

    const {
      imageDataUrl,
      canvasWidth,
      canvasHeight,
      alphaMaskImageData,
      geminiApiKey,
      referencePoints,
      markupShapes,
      command,
      useLangGraph,
    } = pendingManipulationRef.current;

    // Close confirmation and clear reference mode
    setMoveConfirmationOpen(false);
    clearReferencePoints();
    setAiReferenceMode(false);

    try {
      // Create service
      const nanoBananaService = createGenerativeService(
        geminiApiKey,
        'gemini',
        undefined,
        'gemini',
        'gemini'
      );
      const agenticService = new AgenticPainterService(geminiApiKey, nanoBananaService);

      // Convert to ImageData
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageDataUrl;
      });

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasWidth;
      tempCanvas.height = canvasHeight;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.drawImage(img, 0, 0);
      const sourceImageData = tempCtx.getImageData(0, 0, canvasWidth, canvasHeight);

      // Build a rich prompt that includes all the learned context
      const descriptionsContext = movePlan.descriptions
        .map(d => `- "${d.description}" located at coordinates (${d.x}, ${d.y})`)
        .join('\n');

      // Check if there are any markup shapes that will be visible in the image
      const hasMarkupShapes = (drawingState.aiMarkupShapes?.length || 0) > 0;

      const markupRemovalNote = hasMarkupShapes
        ? `\n\nCRITICAL - MARKUP REMOVAL: The image contains bright orange freehand annotations (lines, circles, or rectangles) drawn by the user to indicate areas of interest. You MUST:
1. Remove ALL orange markup lines/shapes from the output
2. Restore the underlying content naturally where the markups were
3. Execute the user's edit request as described above`
        : '';

      const enrichedPrompt = `CONTEXT - Elements in this image that are relevant to the edit:
${descriptionsContext}

TASK:
${movePlan.suggestedPrompt}

IMPORTANT: Use the exact coordinates provided above to locate elements. The descriptions tell you precisely what each element looks like and where it is.${markupRemovalNote}`;

      updateProgress({
        step: 'processing',
        message: 'Executing confirmed operation...',
        thinkingText: `Executing:\n\n${movePlan.interpretation}\n\n**Full prompt with context:**\n${enrichedPrompt}`,
      });

      // Execute the edit with the enriched prompt (includes all learned context)
      const resultImageData = await agenticService.edit(
        sourceImageData,
        enrichedPrompt,
        undefined,
        updateProgress,
        { useLangGraph }
      );
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

      if (localStorage.getItem('recordAiManipulationCases') === 'true') {
        const alphaMaskBase64 = imageDataToBase64(alphaMaskImageData);
        try {
          await downloadAiManipulationCase({
            id: `ai-manipulation-${new Date().toISOString()}`,
            type: 'ai_reference_manipulation',
            createdAt: new Date().toISOString(),
            canvas: {
              width: canvasWidth,
              height: canvasHeight,
            },
            command,
            enrichedPrompt,
            movePlan,
            referencePoints,
            markupShapes,
            sourceImageDataUrl: imageDataUrl,
            alphaMaskDataUrl: alphaMaskBase64,
            outputImageDataUrl: resultBase64,
            models: {
              planning: 'gemini',
              generation: 'gemini',
            },
          });
        } catch (error) {
          console.warn('Failed to download AI manipulation bundle:', error);
        }
      }

      // Create image shape and add to canvas
      const imageShape: Shape = {
        id: `image-${Date.now()}`,
        type: DrawingTool.IMAGE,
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
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

      // Clear any markup shapes before adding the new image
      clearAiMarkupShapes();

      onAddShape(imageShape);
      onSelectShape(imageShape.id);

      updateProgress({
        step: 'complete',
        message: 'Image manipulation completed successfully!',
        thinkingText: 'Your edited image has been added to the canvas.',
      });

    } catch (error) {
      console.error('Manipulation failed:', error);
      updateProgress({
        step: 'error',
        message: 'Failed to process manipulation',
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
        },
      });
      alert('Failed to process manipulation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setMovePlan(null);
      pendingManipulationRef.current = null;
    }
  }, [movePlan, clearReferencePoints, setAiReferenceMode, updateProgress, shapes, onAddShape, onSelectShape, drawingState.aiMarkupShapes, clearAiMarkupShapes]);

  // Handler for editing the command (go back to manipulation dialog)
  const handleMoveEditCommand = useCallback(() => {
    setMoveConfirmationOpen(false);
    setMovePlan(null);
    setManipulationDialogOpen(true);
  }, []);

  // Handler for replanning with edited command text
  const handleReplan = useCallback(async (editedCommand: string) => {
    if (!pendingManipulationRef.current) return;

    try {
      // Set loading state
      setIsPlanningMove(true);

      // Update the stored command with the edited version
      pendingManipulationRef.current.command = editedCommand;

      const {
        imageDataUrl,
        referencePoints,
        canvasWidth,
        canvasHeight,
        markupShapes,
        geminiApiKey,
      } = pendingManipulationRef.current;

      // Create service and regenerate plan with edited command
      const nanoBananaService = createGenerativeService(
        geminiApiKey,
        'gemini',
        undefined,
        'gemini',
        'gemini'
      );
      const agenticService = new AgenticPainterService(geminiApiKey, nanoBananaService);

      // Get the new plan with the edited command
      const plan = await agenticService.planMoveOperation(
        imageDataUrl,
        referencePoints,
        editedCommand,
        canvasWidth,
        canvasHeight,
        markupShapes
      );

      setMovePlan(plan);
      setIsPlanningMove(false);

    } catch (error) {
      console.error('Replanning failed:', error);
      setIsPlanningMove(false);
      alert('Failed to replan operation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }, []);

  // Handler for closing the confirmation dialog
  const handleMoveConfirmationClose = useCallback(() => {
    setMoveConfirmationOpen(false);
    setMovePlan(null);
    setIsPlanningMove(false);
    pendingManipulationRef.current = null;
  }, []);

  // Handler for opening the manipulation dialog with annotated preview
  const openManipulationDialog = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) {
      setManipulationDialogOpen(true);
      return;
    }

    try {
      // Capture clean canvas (without grid, selection UI, overlays, etc.)
      const canvas = captureCleanCanvas(stage);
      const imageDataUrl = canvas.toDataURL('image/png');

      // Create annotated preview with pins
      const annotationPoints = drawingState.referencePoints.map((p: { label: string; x: number; y: number }) => ({
        label: p.label,
        x: p.x * zoomLevel, // Scale to match captured canvas
        y: p.y * zoomLevel,
      }));

      const annotatedPreview = await annotateImage(imageDataUrl, {
        points: annotationPoints,
      });

      setManipulationPreviewImage(annotatedPreview);
    } catch (error) {
      console.error('Failed to capture preview:', error);
      setManipulationPreviewImage(null);
    }

    setManipulationDialogOpen(true);
  }, [drawingState.referencePoints, zoomLevel, stageRef]);

  // Handler for clearing reference state
  const clearReference = useCallback(() => {
    clearReferencePoints();
    clearAiMarkupShapes();
    setAiReferenceMode(false);
  }, [clearReferencePoints, clearAiMarkupShapes, setAiReferenceMode]);

  const isDialogOpen = manipulationDialogOpen || moveConfirmationOpen;

  const component = (
    <>
      {/* AI Reference Mode - Manipulation Dialog only (overlay is in WorkspaceCanvas) */}
      <ManipulationDialog
        open={manipulationDialogOpen}
        onClose={() => {
          setManipulationDialogOpen(false);
          setManipulationPreviewImage(null);
        }}
        onSubmit={handleManipulationSubmit}
        referencePoints={drawingState.referencePoints}
        previewImage={manipulationPreviewImage || undefined}
      />

      {/* AI Reference Mode - Move Confirmation Dialog */}
      <MoveConfirmationDialog
        open={moveConfirmationOpen}
        onClose={handleMoveConfirmationClose}
        onConfirm={handleMoveConfirm}
        onEditCommand={handleMoveEditCommand}
        onReplan={handleReplan}
        plan={movePlan}
        isLoading={isPlanningMove}
      />
    </>
  );

  return {
    component,
    openManipulationDialog,
    clearReference,
    isDialogOpen,
  };
}
