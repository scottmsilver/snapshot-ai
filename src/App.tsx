import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import Konva from 'konva';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useDrawing } from '@/hooks/useDrawing';
import { useDrawingContext, DrawingActionType } from '@/contexts/DrawingContext';
import { useHistory } from '@/hooks/useHistory';
import { useMeasurement } from '@/hooks/useMeasurement';
import { useSharedProjectLoader } from '@/hooks/useSharedProjectLoader';
import { useScreenshotCapture } from '@/hooks/useScreenshotCapture';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useHistorySync } from '@/hooks/useHistorySync';
import { useClipboardPaste } from '@/hooks/useClipboardPaste';
import { useMeasurementEffects } from '@/hooks/useMeasurementEffects';
import { useFileImports } from '@/hooks/useFileImports';
import { useAIProgress } from '@/contexts/AIProgressContext';
import { copyCanvasToClipboard, downloadCanvasAsImage } from '@/utils/exportUtils';
import {
  DrawingTool,
  GenerativeFillSelectionTool,
  getNextZIndex,
  type Point,
  type TextShape,
  type CalloutShape,
  type MeasurementLineShape,
  type Shape,
} from '@/types/drawing';
import { calculatePixelDistance, calculatePixelsPerUnit } from '@/utils/measurementUtils';
import type { MeasurementUnit } from '@/utils/measurementUtils';
import { AuthGate } from '@/components/App/AuthGate';
import { WorkspaceHeader } from '@/components/App/WorkspaceHeader';
import { WorkspaceToolbar } from '@/components/App/WorkspaceToolbar';
import { WorkspaceCanvas } from '@/components/App/WorkspaceCanvas';
import { WorkspaceDialogs } from '@/components/App/WorkspaceDialogs';
import { GenerativeFillToolbar } from '@/components/GenerativeFill/GenerativeFillToolbar';
import { GenerativeFillDialog } from '@/components/GenerativeFill/GenerativeFillDialog';
import { GenerativeFillResultToolbar } from '@/components/GenerativeFill/GenerativeFillResultToolbar';
import { AIProgressPanel } from '@/components/GenerativeFill/AIProgressPanel';
import { SettingsDialog } from '@/components/Settings';
import { createGenerativeService } from '@/services/generativeApi';
import { AgenticPainterService, type MovePlan } from '@/services/agenticService';
import { settingsManager } from '@/services/settingsManager';
// SAM service removed - AI Move not yet implemented
import { generateBrushMask, generateRectangleMask, generateLassoMask } from '@/utils/maskRendering';
import { annotateImage } from '@/utils/imageAnnotation';
import { InlineTextPlayground } from '@/components/Test/InlineTextPlayground';
import { ManipulationDialog, MoveConfirmationDialog } from '@/components/AIReference';

const CANVAS_PADDING = 100;

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

function App(): React.ReactElement {
  // Test Playground Route
  const isTestMode = new URLSearchParams(window.location.search).has('test');
  if (isTestMode) {
    return <InlineTextPlayground />;
  }

  const stageRef = useRef<Konva.Stage | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [canvasBackground, setCanvasBackground] = useState('#ffffff');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isLoadingSharedFile, setIsLoadingSharedFile] = useState(false);
  const [sharedFileError, setSharedFileError] = useState<string | null>(null);
  const [loadedFileId, setLoadedFileId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [documentName, setDocumentName] = useState('Untitled');
  const [isEditingName, setIsEditingName] = useState(false);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [calibrationDialogOpen, setCalibrationDialogOpen] = useState(false);
  const [pendingCalibrationLine, setPendingCalibrationLine] = useState<MeasurementLineShape | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [manipulationDialogOpen, setManipulationDialogOpen] = useState(false);
  const [manipulationPreviewImage, setManipulationPreviewImage] = useState<string | null>(null);
  const [moveConfirmationOpen, setMoveConfirmationOpen] = useState(false);
  const [movePlan, setMovePlan] = useState<MovePlan | null>(null);
  const [isPlanningMove, setIsPlanningMove] = useState(false);

  const authContext = useOptionalAuth();
  const { updateProgress } = useAIProgress();
  const {
    shapes,
    activeTool,
    clearSelection,
    addShape,
    updateShape,
    updateShapes,
    deleteShapes,
    currentStyle,
    selectedShapeIds,
    selectShape,
    selectMultiple,
    setActiveTool,
    deleteSelected,
    updateStyle,
  } = useDrawing();
  const { state: drawingState, dispatch, setShapes, setMeasurementCalibration, copySelectedShapes, pasteShapes, clearReferencePoints, setAiReferenceMode, setAiMoveState, clearAiMoveState } = useDrawingContext();
  const { canUndo, canRedo, pushState, undo, redo, getCurrentState, currentIndex } = useHistory();

  const selectedShapes = useMemo(
    () => shapes.filter(shape => selectedShapeIds.includes(shape.id)),
    [shapes, selectedShapeIds],
  );

  const measurement = useMeasurement(shapes, undefined, {
    pixelsPerUnit: drawingState.measurementCalibration.pixelsPerUnit,
    unit: drawingState.measurementCalibration.unit,
    calibrationLineId: drawingState.measurementCalibration.calibrationLineId,
  });

  const {
    pdfFile,
    clearPdfFile,
    createImageShapeFromFile,
    handleImageUpload,
    handlePDFUpload,
    handlePDFPageLoad,
    handleImageToolComplete,
  } = useFileImports({
    canvasSize,
    setCanvasSize,
    isCanvasInitialized,
    setIsCanvasInitialized,
    addShape,
    setActiveTool,
    selectShape,
    canvasPadding: CANVAS_PADDING,
  });

  const editingTextShape = useMemo(() => {
    if (!editingTextId) {
      return undefined;
    }
    const shape = shapes.find(item => item.id === editingTextId);
    if (!shape) {
      return undefined;
    }
    if (shape.type === DrawingTool.TEXT || shape.type === DrawingTool.CALLOUT) {
      return shape as TextShape | CalloutShape;
    }
    return undefined;
  }, [editingTextId, shapes]);

  useSharedProjectLoader({
    isEnabled: Boolean(authContext?.isAuthenticated && authContext?.getAccessToken),
    getAccessToken: authContext?.getAccessToken,
    canvasPadding: CANVAS_PADDING,
    setIsLoadingSharedFile,
    setSharedFileError,
    setDocumentName,
    setShapes,
    setCanvasSize,
    setIsCanvasInitialized,
    setLoadedFileId,
  });

  useScreenshotCapture({ stageRef, canvasSize, shapes, addShape, setActiveTool, selectShape });

  useHistorySync({ drawingState, pushState, getCurrentState, currentIndex, setShapes });

  useClipboardPaste({
    isEnabled: isCanvasInitialized,
    shapes,
    createImageShapeFromFile,
    setActiveTool,
    addShape,
    canvasPadding: CANVAS_PADDING,
  });

  useMeasurementEffects({
    shapes,
    measurement,
    updateShapes,
    setActiveTool,
    onCalibrationLineDetected: line => {
      setPendingCalibrationLine(line);
      setCalibrationDialogOpen(true);
    },
  });

  const handleTextShapeEdit = useCallback(
    (shapeId: string) => {
      const shape = shapes.find(item => item.id === shapeId);
      if (shape && (shape.type === DrawingTool.TEXT || shape.type === DrawingTool.CALLOUT)) {
        setEditingTextId(shapeId);
        setTextDialogOpen(true);
      }
    },
    [shapes],
  );

  const handleCopyToClipboard = useCallback(async () => {
    if (!stageRef.current) {
      return;
    }

    try {
      await copyCanvasToClipboard(stageRef.current);
      const button = document.querySelector('div[title*="Copy"]') as HTMLElement | null;
      if (!button) {
        return;
      }

      const originalTitle = button.title;
      button.title = 'Copied!';
      button.style.backgroundColor = '#4caf50';
      button.style.color = 'white';

      setTimeout(() => {
        button.title = originalTitle;
        button.style.backgroundColor = 'transparent';
        button.style.color = '#5f6368';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert('Failed to copy to clipboard. Your browser may not support this feature.');
      }
    }
  }, []);

  const handleDownloadImage = useCallback(() => {
    if (!stageRef.current) {
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
    downloadCanvasAsImage(stageRef.current, `markup-${timestamp}.png`);
  }, []);

  useKeyboardShortcuts({
    canUndo,
    canRedo,
    undo,
    redo,
    selectedShapeIds,
    copySelectedShapes,
    pasteShapes,
    deleteSelected,
    handleCopyCanvas: () => {
      void handleCopyToClipboard();
    },
    handleDownloadImage,
    setZoomLevel,
    zoomLevel,
  });

  const handleCalibrationConfirm = useCallback(
    (value: number, unit: MeasurementUnit) => {
      if (pendingCalibrationLine) {
        const [x1, y1, x2, y2] = pendingCalibrationLine.points;
        const pixelDistance = calculatePixelDistance(x1, y1, x2, y2);
        const pixelsPerUnit = calculatePixelsPerUnit(pixelDistance, value, unit);

        setMeasurementCalibration({
          pixelsPerUnit,
          unit,
          calibrationLineId: null,
        });

        measurement.setCalibration(pixelDistance, value, unit, '');
        deleteShapes([pendingCalibrationLine.id]);
      }

      setCalibrationDialogOpen(false);
      setPendingCalibrationLine(null);
    },
    [deleteShapes, measurement, pendingCalibrationLine, setMeasurementCalibration],
  );

  const handleCalibrationCancel = useCallback(() => {
    if (pendingCalibrationLine) {
      deleteShapes([pendingCalibrationLine.id]);
    }

    setCalibrationDialogOpen(false);
    setPendingCalibrationLine(null);
  }, [deleteShapes, pendingCalibrationLine]);

  const handleAiMoveClick = useCallback(async (_x: number, _y: number) => {
    // AI Move requires SAM (Segment Anything Model) which is not yet implemented
    console.log('AI Move: Not yet implemented - SAM service needs to be integrated');
    clearAiMoveState();
  }, [clearAiMoveState]);

  // Effect to execute AI move when phase transitions to 'executing'
  useEffect(() => {
    const aiMoveState = drawingState.aiMoveState;
    if (!aiMoveState || aiMoveState.phase !== 'executing') {
      return;
    }

    // Capture required data before async operation
    const { segmentedBounds, originalClickPoint, currentDragPoint } = aiMoveState;
    if (!segmentedBounds || !originalClickPoint || !currentDragPoint) {
      console.error('AI Move: Missing required data for execution');
      clearAiMoveState();
      return;
    }

    // Calculate movement offset
    const offsetX = currentDragPoint.x - originalClickPoint.x;
    const offsetY = currentDragPoint.y - originalClickPoint.y;

    // Skip if no movement
    if (Math.abs(offsetX) < 5 && Math.abs(offsetY) < 5) {
      console.log('AI Move: Movement too small, cancelling');
      clearAiMoveState();
      return;
    }

    const executeMove = async () => {
      try {
        const stage = stageRef.current;
        if (!stage) {
          clearAiMoveState();
          return;
        }

        updateProgress({
          step: 'planning',
          message: 'Preparing AI move operation...',
          thinkingText: `## AI Move Operation\n\nMoving object from (${Math.round(originalClickPoint.x)}, ${Math.round(originalClickPoint.y)}) to (${Math.round(currentDragPoint.x)}, ${Math.round(currentDragPoint.y)})\n\n**Offset:** ${Math.round(offsetX)}px horizontal, ${Math.round(offsetY)}px vertical`,
          iteration: { current: 0, max: 3 }
        });

        // Get settings for API key
        let geminiApiKey: string | null = null;
        if (authContext?.isAuthenticated && authContext?.getAccessToken) {
          try {
            const accessToken = authContext.getAccessToken();
            if (accessToken) {
              await settingsManager.initialize(accessToken);
              geminiApiKey = await settingsManager.getGeminiApiKey();
            }
          } catch (error) {
            console.error('Failed to get settings:', error);
          }
        }

        const apiKey = geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GENERATIVE_API_KEY;
        if (!apiKey) {
          updateProgress({
            step: 'error',
            message: 'No API key configured',
            error: { message: 'Please add your Gemini API key in Settings' }
          });
          clearAiMoveState();
          return;
        }

        // Capture clean canvas
        const canvas = stage.toCanvas();
        const ctx = canvas.getContext('2d')!;
        const sourceImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Build the move prompt describing what to do
        const moveDirection = [];
        if (offsetX > 0) moveDirection.push(`${Math.round(offsetX)} pixels to the right`);
        if (offsetX < 0) moveDirection.push(`${Math.round(Math.abs(offsetX))} pixels to the left`);
        if (offsetY > 0) moveDirection.push(`${Math.round(offsetY)} pixels down`);
        if (offsetY < 0) moveDirection.push(`${Math.round(Math.abs(offsetY))} pixels up`);

        const movePrompt = `Move the object that was at position (${Math.round(originalClickPoint.x)}, ${Math.round(originalClickPoint.y)}) to position (${Math.round(currentDragPoint.x)}, ${Math.round(currentDragPoint.y)}). That's ${moveDirection.join(' and ')}. Fill in the original location naturally to match the surrounding background. Keep the moved object exactly the same but in the new position.`;

        updateProgress({
          step: 'calling_api',
          message: 'Executing AI move...',
          thinkingText: `## AI Move Prompt\n\n${movePrompt}`,
          iteration: { current: 1, max: 3 }
        });

        // Create services and execute edit
        const generativeService = createGenerativeService(apiKey);
        const agenticService = new AgenticPainterService(apiKey, generativeService);

        const result = await agenticService.edit(
          sourceImageData,
          movePrompt,
          undefined, // no mask - let AI figure out what to move based on coordinates
          updateProgress
        );

        // Convert result to image and add to canvas
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = result.width;
        resultCanvas.height = result.height;
        const resultCtx = resultCanvas.getContext('2d')!;
        resultCtx.putImageData(result, 0, 0);
        const resultDataUrl = resultCanvas.toDataURL('image/png');

        // Create image element
        const img = new Image();
        img.src = resultDataUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        // Add as new image shape
        const newShape = {
          id: `ai_move_${Date.now()}`,
          type: DrawingTool.IMAGE as typeof DrawingTool.IMAGE,
          x: 0,
          y: 0,
          width: result.width,
          height: result.height,
          src: resultDataUrl,
          image: img,
          style: {
            stroke: '#000000',
            strokeWidth: 0,
            opacity: 1,
          },
          visible: true,
          locked: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        addShape(newShape);
        setActiveTool(DrawingTool.SELECT);
        selectShape(newShape.id);

        updateProgress({
          step: 'complete',
          message: 'AI move completed!',
          thinkingText: '## Complete\n\nThe object has been moved successfully.',
        });

        clearAiMoveState();
      } catch (error) {
        console.error('AI Move execution failed:', error);
        updateProgress({
          step: 'error',
          message: 'AI move failed',
          error: { message: error instanceof Error ? error.message : 'Unknown error' }
        });
        clearAiMoveState();
      }
    };

    executeMove();
  }, [drawingState.aiMoveState, clearAiMoveState, updateProgress, authContext, addShape, setActiveTool, selectShape]);

  const handleDismissSharedFileError = useCallback(() => {
    setSharedFileError(null);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  const handlePdfError = useCallback((error: Error) => {
    console.error('PDF Error:', error);
    clearPdfFile();
  }, [clearPdfFile]);

  const handleDocumentNameChange = useCallback((value: string) => {
    setDocumentName(value);
  }, []);

  const handleDocumentNameBlur = useCallback(() => {
    setIsEditingName(false);
    if (documentName.trim() === '') {
      setDocumentName('Untitled');
    }
  }, [documentName]);

  const handleDocumentNameKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handleDocumentNameBlur();
      } else if (event.key === 'Escape') {
        setDocumentName(loadedFileId ? 'Saved Project' : 'Untitled');
        setIsEditingName(false);
      }
    },
    [handleDocumentNameBlur, loadedFileId],
  );

  const handleStartEditingName = useCallback(() => {
    setIsEditingName(true);
  }, []);

  const handleProjectLoad = useCallback(
    (projectData: { shapes?: Shape[] }, fileName: string) => {
      clearSelection();
      setShapes(projectData.shapes || []);
      setLoadedFileId(null);
      setSaveStatus('saved');
      setCanvasSize(null);
      setIsCanvasInitialized(false);
      clearPdfFile();
      let displayName = fileName;
      if (fileName.startsWith('Markup - ')) {
        displayName = fileName.substring(9);
      }
      setDocumentName(displayName);

      if (projectData.shapes && projectData.shapes.length > 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        projectData.shapes.forEach(shape => {
          if ('x' in shape && 'y' in shape && 'width' in shape && 'height' in shape) {
            const positionedShape = shape as Shape & { x: number; y: number; width: number; height: number };
            minX = Math.min(minX, positionedShape.x);
            minY = Math.min(minY, positionedShape.y);
            maxX = Math.max(maxX, positionedShape.x + positionedShape.width);
            maxY = Math.max(maxY, positionedShape.y + positionedShape.height);
          }
        });

        if (isFinite(minX)) {
          setCanvasSize({
            width: Math.min(maxX + CANVAS_PADDING, 1400),
            height: Math.min(maxY + CANVAS_PADDING, 900),
          });
          setIsCanvasInitialized(true);
        }
      }
    },
    [clearSelection, clearPdfFile, setShapes],
  );

  const handleNewProject = useCallback(() => {
    clearSelection();
    setShapes([]);
    setLoadedFileId(null);
    setSaveStatus('saved');
    setCanvasSize(null);
    setIsCanvasInitialized(false);
    clearPdfFile();
    setDocumentName('Untitled');
  }, [clearSelection, clearPdfFile, setShapes]);

  const fileMenuProps = useMemo(
    () => ({
      stageRef,
      imageData: null,
      initialFileId: loadedFileId,
      documentName,
      onSaveStatusChange: setSaveStatus,
      onProjectLoad: handleProjectLoad,
      onNew: handleNewProject,
      onExport: handleDownloadImage,
      showGrid,
      onToggleGrid: () => setShowGrid(prev => !prev),
      canvasBackground,
      onChangeBackground: setCanvasBackground,
    }),
    [
      loadedFileId,
      documentName,
      handleProjectLoad,
      handleNewProject,
      handleDownloadImage,
      showGrid,
      canvasBackground,
    ],
  );

  const editMenuProps = useMemo(() => {
    if (!isCanvasInitialized) {
      return undefined;
    }

    return {
      canUndo,
      canRedo,
      onUndo: undo,
      onRedo: redo,
      canCopy: selectedShapeIds.length > 0 || isCanvasInitialized,
      onCopy: () => {
        if (selectedShapeIds.length > 0) {
          copySelectedShapes();
        } else {
          handleCopyToClipboard();
        }
      },
      hasSelection: selectedShapeIds.length > 0,
      onDelete: deleteSelected,
      onSelectAll: () => selectMultiple(shapes.map(shape => shape.id)),
    };
  }, [
    canUndo,
    canRedo,
    undo,
    redo,
    selectedShapeIds,
    isCanvasInitialized,
    copySelectedShapes,
    handleCopyToClipboard,
    deleteSelected,
    selectMultiple,
    shapes,
  ]);

  const editingDialogText = editingTextShape?.text ?? '';
  const editingDialogFontSize = editingTextShape?.fontSize ?? 16;
  const editingDialogFontFamily = editingTextShape?.fontFamily ?? currentStyle.fontFamily ?? 'Arial';

  const textDialogProps = useMemo(
    () => ({
      isOpen: textDialogOpen,
      initialText: editingDialogText,
      initialFontSize: editingDialogFontSize,
      initialFontFamily: editingDialogFontFamily,
      onSubmit: (text: string, fontSize: number, fontFamily: string) => {
        if (editingTextId) {
          updateShape(editingTextId, {
            text,
            fontSize,
            fontFamily,
            updatedAt: Date.now(),
          });
        } else if (textPosition) {
          const textShape: Omit<TextShape, 'zIndex'> = {
            id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: DrawingTool.TEXT,
            x: textPosition.x,
            y: textPosition.y,
            text,
            fontSize,
            fontFamily,
            style: {
              stroke: currentStyle.stroke,
              strokeWidth: 0,
              opacity: currentStyle.opacity,
            },
            visible: true,
            locked: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          addShape(textShape);
          setActiveTool(DrawingTool.SELECT);
        }

        setTextDialogOpen(false);
        setTextPosition(null);
        setEditingTextId(null);
      },
      onCancel: () => {
        setTextDialogOpen(false);
        setTextPosition(null);
        setEditingTextId(null);
      },
    }),
    [
      textDialogOpen,
      editingDialogText,
      editingDialogFontSize,
      editingDialogFontFamily,
      currentStyle,
      editingTextId,
      updateShape,
      textPosition,
      addShape,
      setActiveTool,
    ],
  );

  const calibrationDialogProps = useMemo(
    () => ({
      isOpen: calibrationDialogOpen,
      pixelDistance: pendingCalibrationLine
        ? calculatePixelDistance(...pendingCalibrationLine.points)
        : 0,
      onConfirm: handleCalibrationConfirm,
      onCancel: handleCalibrationCancel,
    }),
    [calibrationDialogOpen, pendingCalibrationLine, handleCalibrationConfirm, handleCalibrationCancel],
  );

  // Generative Fill handlers
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

      // Find the DrawingLayer which contains both shapes AND SelectionOverlay
      // Find the DrawingLayer which contains both shapes AND SelectionOverlay
      const drawingLayer = stage.findOne('.drawingLayer') as Konva.Layer;
      if (!drawingLayer) {
        console.error('Could not find drawing layer');
        return;
      }

      // Find all Shape nodes (Line, Rect) that have blue selection fill
      // Temporarily hide them by setting visible=false
      const overlayNodes = drawingLayer.find((node: any) => {
        // Find nodes with the blue selection color (rgba(74, 144, 226, ...))
        const fill = node.fill?.();
        const stroke = node.stroke?.();
        return (
          (typeof fill === 'string' && fill.includes('74, 144, 226')) ||
          (typeof stroke === 'string' && stroke.includes('74, 144, 226'))
        );
      });

      // Hide overlay nodes temporarily
      const previousVisibility = overlayNodes.map((node: any) => node.visible());
      overlayNodes.forEach((node: any) => node.visible(false));

      // Get clean canvas WITHOUT the selection overlay
      const canvas = stage.toCanvas();

      console.log('🔍 DEBUG: Captured canvas size:', canvas.width, 'x', canvas.height);

      // Verify canvas has content (simple check of center pixel)
      const checkCtx = canvas.getContext('2d');
      if (checkCtx) {
        const pixel = checkCtx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
        console.log(`🔍 DEBUG: Center pixel color: rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${pixel[3]})`);
      } else {
        console.error('❌ ERROR: Failed to get context from captured canvas');
      }

      // Restore overlay visibility immediately
      overlayNodes.forEach((node: any, index: number) => node.visible(previousVisibility[index]));

      // Generate mask based on selection tool
      let maskExport;

      if (selectionTool === GenerativeFillSelectionTool.BRUSH) {
        maskExport = generateBrushMask(canvas, selectionPoints, brushWidth);
      } else if (selectionTool === GenerativeFillSelectionTool.RECTANGLE && selectionRectangle) {
        maskExport = generateRectangleMask(canvas, selectionRectangle);
      } else if (selectionTool === GenerativeFillSelectionTool.LASSO) {
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
  }, [dispatch, drawingState.generativeFillMode]);

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

        // Find the DrawingLayer and temporarily hide selection overlay nodes
        // Find the DrawingLayer which contains both shapes AND SelectionOverlay
        const drawingLayer = stage.findOne('.drawingLayer') as Konva.Layer;
        let overlayNodes: any[] = [];
        let previousVisibility: boolean[] = [];

        if (drawingLayer) {
          // Find all Shape nodes (Line, Rect) that have blue selection fill
          overlayNodes = drawingLayer.find((node: any) => {
            const fill = node.fill?.();
            const stroke = node.stroke?.();
            return (
              (typeof fill === 'string' && fill.includes('74, 144, 226')) ||
              (typeof stroke === 'string' && stroke.includes('74, 144, 226'))
            );
          });

          // Hide overlay nodes temporarily
          previousVisibility = overlayNodes.map((node: any) => node.visible());
          overlayNodes.forEach((node: any) => node.visible(false));
        }

        // Get clean canvas WITHOUT the selection overlay
        const canvas = stage.toCanvas();
        const ctx = canvas.getContext('2d')!;
        const sourceImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Restore overlay visibility immediately
        if (overlayNodes.length > 0) {
          overlayNodes.forEach((node: any, index: number) => node.visible(previousVisibility[index]));
        }

        // Generate mask only if in inpainting mode
        let maskExport;
        if (mode === 'inpainting') {
          if (selectionTool === GenerativeFillSelectionTool.BRUSH) {
            maskExport = generateBrushMask(canvas, selectionPoints, brushWidth);
          } else if (selectionTool === GenerativeFillSelectionTool.RECTANGLE && selectionRectangle) {
            maskExport = generateRectangleMask(canvas, selectionRectangle);
          } else if (selectionTool === GenerativeFillSelectionTool.LASSO) {
            maskExport = generateLassoMask(canvas, selectionPoints);
          } else {
            throw new Error('Invalid selection tool or missing selection data');
          }
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
        if (modelToValidate === 'gemini') {
          if (!geminiApiKey && !import.meta.env.VITE_GEMINI_API_KEY && !import.meta.env.VITE_GENERATIVE_API_KEY) {
            dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
            alert('Please add your Gemini API key in Settings to use Generative Fill.');
            setSettingsDialogOpen(true);
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
            setSettingsDialogOpen(true);
            return;
          }
        }

        // Use appropriate API key/token based on model
        const apiKeyOrToken = modelToValidate === 'imagen' ? oauthAccessToken : geminiApiKey;

        // Call API service with both model preferences
        // Resolve Gemini API Key for the Agent (and Nano Banana tool)
        const effectiveGeminiKey = geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GENERATIVE_API_KEY || '';

        // Create specific service for the Nano Banana tool (always Gemini)
        const nanoBananaService = createGenerativeService(
          effectiveGeminiKey,
          'gemini',
          undefined,
          'gemini',
          'gemini'
        );

        // Use Agentic Service for the interaction
        const agenticService = new AgenticPainterService(effectiveGeminiKey, nanoBananaService);

        // Call edit() method which handles both inpainting and text-only modes
        const resultImageData = mode === 'inpainting' && maskExport
          ? await agenticService.edit(sourceImageData, prompt, maskExport.maskImageData, updateProgress)
          : await agenticService.edit(sourceImageData, prompt, undefined, updateProgress);

        // Convert result to base64
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = resultImageData.width;
        resultCanvas.height = resultImageData.height;
        const resultCtx = resultCanvas.getContext('2d')!;
        resultCtx.putImageData(resultImageData, 0, 0);
        const resultBase64 = resultCanvas.toDataURL('image/png');

        // Result is now full-size, so bounds should be full canvas
        const fullCanvasBounds = {
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
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
        addShape(imageShape);
        selectShape(imageShape.id);

        // Exit generative fill mode
        dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
      } catch (error) {
        console.error('Generative fill failed:', error);
        alert(`Generative fill failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Reset to allow retry
        dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
      }
    },
    [dispatch, drawingState.generativeFillMode, stageRef, shapes, addShape, selectShape, authContext, updateProgress]
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

  const handleGenerativeFillAccept = useCallback(() => {
    // Apply the result to the canvas by adding it as an ImageShape
    if (!drawingState.generativeFillMode?.generatedResult) return;

    const { imageData, bounds } = drawingState.generativeFillMode.generatedResult;

    const imageShape: Shape = {
      id: `image-${Date.now()}`,
      type: DrawingTool.IMAGE,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      imageData: imageData,
      style: {
        stroke: 'transparent',
        strokeWidth: 0,
        opacity: 1,
      },
      visible: true,
      locked: false,
      zIndex: drawingState.maxZIndex + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    dispatch({ type: DrawingActionType.ADD_SHAPE, shape: imageShape });
    dispatch({ type: DrawingActionType.APPLY_GENERATIVE_FILL_RESULT });
    dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
    setActiveTool(DrawingTool.SELECT);
  }, [dispatch, setActiveTool, drawingState.generativeFillMode, drawingState.maxZIndex]);

  const handleGenerativeFillReject = useCallback(() => {
    // Discard the result and go back to selection
    if (!drawingState.generativeFillMode) return;
    dispatch({
      type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
    });
    // Clear the result but keep the selection for retry
    const updatedMode = {
      ...drawingState.generativeFillMode,
      generatedResult: null,
      isGenerating: false,
      showPromptDialog: true, // Show dialog again to allow retry
    };
    // We need a way to update just the generated result - for now cancel and restart
    dispatch({ type: DrawingActionType.CANCEL_GENERATIVE_FILL });
  }, [dispatch, drawingState.generativeFillMode]);

  const handleGenerativeFillRegenerate = useCallback(() => {
    // Re-open dialog with same prompt to regenerate
    if (!drawingState.generativeFillMode) return;

    // Clear the result and show dialog again
    dispatch({
      type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
    });
    // Reset to show dialog - we'll use the existing prompt and preview images
    if (drawingState.generativeFillMode.previewImages) {
      dispatch({
        type: DrawingActionType.COMPLETE_GENERATIVE_FILL_SELECTION,
        sourceImage: drawingState.generativeFillMode.previewImages.sourceImage,
        maskImage: drawingState.generativeFillMode.previewImages.maskImage,
      });
    }
  }, [dispatch, drawingState.generativeFillMode]);

  // Store reference points and canvas data for the confirmation flow
  const pendingManipulationRef = useRef<{
    referencePoints: Array<{label: string, x: number, y: number}>;
    imageDataUrl: string;
    canvasWidth: number;
    canvasHeight: number;
    geminiApiKey: string;
  } | null>(null);

  // AI Reference Mode - Manipulation Handler (now with confirmation)
  const handleManipulationSubmit = useCallback(async (command: string) => {
    // Capture reference points BEFORE closing dialog
    const referencePointsCopy = [...drawingState.referencePoints];

    // Close the command dialog but keep reference mode active
    setManipulationDialogOpen(false);

    try {
      const stage = stageRef.current;
      if (!stage) return;

      const canvas = stage.toCanvas();
      const imageDataUrl = canvas.toDataURL('image/png');

      // Get API key
      let geminiApiKey: string | null = null;
      if (authContext?.isAuthenticated && authContext?.getAccessToken) {
        try {
          const accessToken = authContext.getAccessToken();
          if (accessToken) {
            await settingsManager.initialize(accessToken);
            geminiApiKey = await settingsManager.getGeminiApiKey();
          }
        } catch (error) {
          console.error('Failed to get settings:', error);
        }
      }

      const effectiveGeminiKey = geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GENERATIVE_API_KEY || '';

      if (!effectiveGeminiKey) {
        console.error('No API key');
        alert('Please add your Gemini API key in Settings to use AI Reference Mode.');
        setSettingsDialogOpen(true);
        return;
      }

      // Store data for confirmation flow
      pendingManipulationRef.current = {
        referencePoints: referencePointsCopy,
        imageDataUrl,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        geminiApiKey: effectiveGeminiKey,
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
      const plan = await agenticService.planMoveOperation(
        imageDataUrl,
        referencePointsCopy,
        command,
        canvas.width,
        canvas.height
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
  }, [drawingState.referencePoints, authContext]);

  // Handler for confirming the move operation
  const handleMoveConfirm = useCallback(async () => {
    if (!movePlan || !pendingManipulationRef.current) return;

    const { imageDataUrl, canvasWidth, canvasHeight, geminiApiKey } = pendingManipulationRef.current;

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

      const enrichedPrompt = `CONTEXT - Elements in this image that are relevant to the edit:
${descriptionsContext}

TASK:
${movePlan.suggestedPrompt}

IMPORTANT: Use the exact coordinates provided above to locate elements. The descriptions tell you precisely what each element looks like and where it is.`;

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
        updateProgress
      );

      // Convert result to base64
      const resultCanvas = document.createElement('canvas');
      resultCanvas.width = resultImageData.width;
      resultCanvas.height = resultImageData.height;
      const resultCtx = resultCanvas.getContext('2d')!;
      resultCtx.putImageData(resultImageData, 0, 0);
      const resultBase64 = resultCanvas.toDataURL('image/png');

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

      addShape(imageShape);
      selectShape(imageShape.id);

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
  }, [movePlan, clearReferencePoints, setAiReferenceMode, updateProgress, shapes, addShape, selectShape]);

  // Handler for editing the command (go back to manipulation dialog)
  const handleMoveEditCommand = useCallback(() => {
    setMoveConfirmationOpen(false);
    setMovePlan(null);
    setManipulationDialogOpen(true);
  }, []);

  // Handler for closing the confirmation dialog
  const handleMoveConfirmationClose = useCallback(() => {
    setMoveConfirmationOpen(false);
    setMovePlan(null);
    setIsPlanningMove(false);
    pendingManipulationRef.current = null;
  }, []);

  // Handler for opening the manipulation dialog with annotated preview
  const handleOpenManipulationDialog = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) {
      setManipulationDialogOpen(true);
      return;
    }

    try {
      // Capture the canvas
      const canvas = stage.toCanvas();
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
  }, [drawingState.referencePoints, zoomLevel]);

  // Activate generative fill mode when tool is selected
  useEffect(() => {
    if (activeTool === DrawingTool.GENERATIVE_FILL && !drawingState.generativeFillMode) {
      // Default to inpainting mode - user can switch to text-only from toolbar
      dispatch({ type: DrawingActionType.START_GENERATIVE_FILL, mode: 'inpainting' });
    }
  }, [activeTool, drawingState.generativeFillMode, dispatch]);

  const handleCanvasTextClick = useCallback(
    (position: Point) => {
      setTextPosition(position);
      setEditingTextId(null);
      setTextDialogOpen(true);
    },
    [],
  );

  return (
    <AuthGate authContext={authContext}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          height: '100vh',
          backgroundColor: '#f5f5f5',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <WorkspaceHeader
          documentName={documentName}
          isEditingName={isEditingName}
          onStartEditingName={handleStartEditingName}
          onDocumentNameChange={handleDocumentNameChange}
          onDocumentNameBlur={handleDocumentNameBlur}
          onDocumentNameKeyDown={handleDocumentNameKeyDown}
          nameInputRef={nameInputRef}
          saveStatus={saveStatus}
          isCanvasInitialized={isCanvasInitialized}
          onCopyCanvas={handleCopyToClipboard}
          onOpenSettings={() => setSettingsDialogOpen(true)}
          fileMenuProps={fileMenuProps}
          editMenuProps={editMenuProps}
        />

        <WorkspaceToolbar
          isCanvasInitialized={isCanvasInitialized}
          selectedShapes={selectedShapes}
          activeTool={activeTool}
          currentStyle={currentStyle}
          updateStyle={updateStyle}
          updateShape={updateShape}
          zoomLevel={zoomLevel}
          onZoomChange={value => setZoomLevel(value)}
          onZoomIn={() => setZoomLevel(prev => Math.min(4, prev + 0.25))}
          onZoomOut={() => setZoomLevel(prev => Math.max(0.1, prev - 0.25))}
        />

        <main
          style={{
            flex: 1,
            display: 'flex',
            gap: 0,
            padding: 0,
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          <WorkspaceCanvas
            isLoadingSharedFile={isLoadingSharedFile}
            sharedFileError={sharedFileError}
            onDismissSharedFileError={handleDismissSharedFileError}
            isCanvasInitialized={isCanvasInitialized}
            canvasSize={canvasSize}
            showGrid={showGrid}
            canvasBackground={canvasBackground}
            zoomLevel={zoomLevel}
            stageRef={stageRef}
            activeTool={activeTool}
            handleImageUpload={handleImageUpload}
            handlePDFUpload={handlePDFUpload}
            pdfFile={pdfFile}
            onPdfPageLoad={handlePDFPageLoad}
            onPdfError={handlePdfError}
            onTextClick={handleCanvasTextClick}
            onTextShapeEdit={handleTextShapeEdit}
            onImageToolComplete={handleImageToolComplete}
            onReferenceManipulate={handleOpenManipulationDialog}
            onReferenceClear={() => {
              clearReferencePoints();
              setAiReferenceMode(false);
            }}
            onAiMoveClick={handleAiMoveClick}
            isManipulationDialogOpen={manipulationDialogOpen || moveConfirmationOpen}
          />

          {/* AI Console - side panel for AI operation logs */}
          <AIProgressPanel />
        </main>

        <WorkspaceDialogs
          textDialogProps={textDialogProps}
          calibrationDialogProps={calibrationDialogProps}
        />

        {/* Settings Dialog */}
        <SettingsDialog
          isOpen={settingsDialogOpen}
          onClose={() => setSettingsDialogOpen(false)}
        />

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
        {drawingState.generativeFillMode?.isGenerating && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 999,
              pointerEvents: 'all',
            }}
          >
            <div
              style={{
                backgroundColor: 'white',
                padding: '24px 32px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  border: '4px solid #e5e5e5',
                  borderTopColor: '#4a90e2',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <div style={{ fontSize: '16px', fontWeight: '500', color: '#333' }}>
                Generating with AI...
              </div>
              <div style={{ fontSize: '14px', color: '#666' }}>
                This may take 10-30 seconds
              </div>
            </div>
            <style>
              {`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}
            </style>
          </div>
        )}


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
          plan={movePlan}
          isLoading={isPlanningMove}
        />

      </motion.div>
    </AuthGate>
  );
}

export default App;
