import { useState, useRef, useCallback, useMemo } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import Konva from 'konva';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useDrawing } from '@/hooks/useDrawing';
import { useDrawingContext } from '@/contexts/DrawingContext';
import { useHistory } from '@/hooks/useHistory';
import { useMeasurement } from '@/hooks/useMeasurement';
import { useSharedProjectLoader } from '@/hooks/useSharedProjectLoader';
import { useScreenshotCapture } from '@/hooks/useScreenshotCapture';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useHistorySync } from '@/hooks/useHistorySync';
import { useClipboardPaste } from '@/hooks/useClipboardPaste';
import { useMeasurementEffects } from '@/hooks/useMeasurementEffects';
import { useFileImports } from '@/hooks/useFileImports';
import { copyCanvasToClipboard, downloadCanvasAsImage } from '@/utils/exportUtils';
import {
  DrawingTool,
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

const CANVAS_PADDING = 100;

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

function App(): JSX.Element {
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

  const authContext = useOptionalAuth();
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
  const { state: drawingState, setShapes, setMeasurementCalibration, copySelectedShapes, pasteShapes } = useDrawingContext();
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
            gap: '1rem',
            padding: '1rem',
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
          />
        </main>

        <WorkspaceDialogs
          textDialogProps={textDialogProps}
          calibrationDialogProps={calibrationDialogProps}
        />
      </motion.div>
    </AuthGate>
  );
}

export default App;
