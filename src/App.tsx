import React, { useState, useRef, useCallback, useMemo } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import Konva from 'konva';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useDrawing } from '@/hooks/useDrawing';
import { useDrawingContext } from '@/contexts/DrawingContext';
import { useHistory } from '@/hooks/useHistory';
import { useMeasurement } from '@/hooks/useMeasurement';
import { useSharedProjectLoader } from '@/hooks/useSharedProjectLoader';
import { useProjectController } from '@/hooks/useProjectController';
import { useScreenshotCapture } from '@/hooks/useScreenshotCapture';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useHistorySync } from '@/hooks/useHistorySync';
import { useClipboardPaste } from '@/hooks/useClipboardPaste';
import { useMeasurementEffects } from '@/hooks/useMeasurementEffects';
import { useFileImports } from '@/hooks/useFileImports';
import { useExport } from '@/hooks/useExport';
import { captureCleanCanvas } from '@/utils/exportUtils';
import {
  type Point,
  type MeasurementLineShape,
} from '@/types/drawing';

import { AuthGate } from '@/components/App/AuthGate';
import { WorkspaceHeader } from '@/components/App/WorkspaceHeader';
import { WorkspaceToolbar } from '@/components/App/WorkspaceToolbar';
import { WorkspaceCanvas } from '@/components/App/WorkspaceCanvas';

import { AIProgressPanel } from '@/components/GenerativeFill/AIProgressPanel';
import { GenerativeFillController } from '@/components/GenerativeFill/GenerativeFillController';
import { SettingsDialog } from '@/components/Settings';

import { InlineTextPlayground } from '@/components/Test/InlineTextPlayground';
import { useAIReferenceController } from '@/components/AIReference';
import { CalibrationController } from '@/components/Measurement/CalibrationController';
import { TextEditController, type TextEditControllerRef } from '@/components/Text';

const CANVAS_PADDING = 100;

// Wrapper component to handle test mode routing without violating hooks rules
function App(): React.ReactElement {
  const isTestMode = new URLSearchParams(window.location.search).has('test');
  if (isTestMode) {
    return <InlineTextPlayground />;
  }
  return <MainApp />;
}

function MainApp(): React.ReactElement {
  const stageRef = useRef<Konva.Stage | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const textEditControllerRef = useRef<TextEditControllerRef>(null);

  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [canvasBackground, setCanvasBackground] = useState('#ffffff');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isLoadingSharedFile, setIsLoadingSharedFile] = useState(false);
  const [sharedFileError, setSharedFileError] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState('Untitled');
  const [isEditingName, setIsEditingName] = useState(false);
  const [pendingCalibrationLine, setPendingCalibrationLine] = useState<MeasurementLineShape | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [aiDrawerVisible, setAIDrawerVisible] = useState(true);

  const authContext = useOptionalAuth();

  const captureAiSourceAndMask = useCallback((stage: Konva.Stage) => {
    const sourceCanvas = captureCleanCanvas(stage);
    const sourceCtx = sourceCanvas.getContext('2d')!;
    const sourceImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    const maskCanvas = captureCleanCanvas(stage, { hideBackground: true });
    const maskCtx = maskCanvas.getContext('2d')!;
    const alphaMaskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

    return { sourceCanvas, sourceImageData, alphaMaskImageData };
  }, []);

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

  const { state: drawingState, setShapes, setMeasurementCalibration, copySelectedShapes, pasteShapes, clearReferencePoints, setAiReferenceMode, clearAiMarkupShapes } = useDrawingContext();
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

  const { handleCopyToClipboard, handleDownloadImage, handleDownloadPdf } = useExport({ stageRef });

  const {
    loadedFileId,
    setLoadedFileId,
    saveStatus,
    setSaveStatus: _setSaveStatus,
    handleProjectLoad: _handleProjectLoad,
    handleNewProject: _handleNewProject,
    fileMenuProps,
  } = useProjectController({
    clearSelection,
    setShapes,
    clearPdfFile,
    setDocumentName,
    setCanvasSize,
    setIsCanvasInitialized,
    stageRef,
    documentName,
    handleDownloadImage,
    handleDownloadPdf,
    showGrid,
    setShowGrid,
    canvasBackground,
    setCanvasBackground,
  });

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
    },
  });

  const handleTextShapeEdit = useCallback(
    (shapeId: string) => {
      textEditControllerRef.current?.handleTextShapeEdit(shapeId);
    },
    [],
  );

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

  const handleCalibrationClose = useCallback(() => {
    setPendingCalibrationLine(null);
  }, []);

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

  // AI Reference Controller - handles all AI reference mode functionality
  const {
    component: aiReferenceComponent,
    openManipulationDialog,
    clearReference,
    isDialogOpen: isAIReferenceDialogOpen,
  } = useAIReferenceController({
    stageRef,
    shapes,
    zoomLevel,
    authContext: authContext ? {
      isAuthenticated: authContext.isAuthenticated,
      getAccessToken: () => authContext.getAccessToken?.() ?? '',
    } : null,
    onAddShape: addShape,
    onSelectShape: selectShape,
    onSettingsOpen: () => setSettingsDialogOpen(true),
  });

  const handleCanvasTextClick = useCallback(
    (position: Point) => {
      textEditControllerRef.current?.handleCanvasTextClick(position);
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
          isAIDrawerVisible={aiDrawerVisible}
          onToggleAIDrawer={() => setAIDrawerVisible(v => !v)}
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
            onReferenceManipulate={openManipulationDialog}
            onReferenceClear={() => {
              clearReferencePoints();
              clearAiMarkupShapes();
              setAiReferenceMode(false);
              clearReference();
            }}
            isManipulationDialogOpen={isAIReferenceDialogOpen}
          />

          {/* AI Console - side panel for AI operation logs */}
          {aiDrawerVisible && <AIProgressPanel />}
        </main>

        {/* Text Edit Controller - manages text dialog state and rendering */}
        <TextEditController
          ref={textEditControllerRef}
          shapes={shapes}
          currentStyle={currentStyle}
          onUpdateShape={updateShape}
          onAddShape={addShape}
          onSetActiveTool={setActiveTool}
        />

        {/* Calibration Controller - manages calibration dialog state */}
        <CalibrationController
          pendingCalibrationLine={pendingCalibrationLine}
          measurement={measurement}
          onDeleteShape={deleteShapes}
          onClose={handleCalibrationClose}
          onSetMeasurementCalibration={setMeasurementCalibration}
        />

        {/* Settings Dialog */}
        <SettingsDialog
          isOpen={settingsDialogOpen}
          onClose={() => setSettingsDialogOpen(false)}
        />

        {/* Generative Fill Controller - manages all generative fill/AI inpainting functionality */}
        <GenerativeFillController
          stageRef={stageRef}
          shapes={shapes}
          activeTool={activeTool}
          authContext={authContext}
          onAddShape={addShape}
          onSelectShape={selectShape}
          onSettingsOpen={() => setSettingsDialogOpen(true)}
          captureAiSourceAndMask={captureAiSourceAndMask}
        />

        {/* AI Reference Controller - renders dialogs for AI reference mode */}
        {aiReferenceComponent}

      </motion.div>
    </AuthGate>
  );
}

export default App;
