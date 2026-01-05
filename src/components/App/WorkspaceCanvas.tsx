import React from 'react';
import { Stage, Layer, Rect, Line } from 'react-konva';
import Konva from 'konva';
import { DrawingLayer } from '@/components/Canvas/DrawingLayer';
import { CoordinateMarker } from '@/components/Canvas/CoordinateMarker';
import { ImageUploader } from '@/components/ImageUploader';
import { PDFViewer } from '@/components/PDFViewer/PDFViewer';
import { DrawingTool, type Point } from '@/types/drawing';
import { useDrawingContext } from '@/contexts/DrawingContext';
import { useAIProgress } from '@/contexts/AIProgressContext';
import { ReferenceLabelOverlay } from '@/components/AIReference';
import { DragPreview } from '@/components/AIMove';
import { ThinkingOverlay } from '@/components/GenerativeFill/ThinkingOverlay';

interface CanvasSize {
  width: number;
  height: number;
}

interface WorkspaceCanvasProps {
  isLoadingSharedFile: boolean;
  sharedFileError: string | null;
  onDismissSharedFileError: () => void;
  isCanvasInitialized: boolean;
  canvasSize: CanvasSize | null;
  showGrid: boolean;
  canvasBackground: string;
  zoomLevel: number;
  stageRef: React.RefObject<Konva.Stage | null>;
  activeTool: DrawingTool;
  handleImageUpload: (file: File) => Promise<void>;
  handlePDFUpload: (file: File) => void;
  pdfFile: File | null;
  onPdfPageLoad: (image: HTMLImageElement, pageInfo: { current: number; total: number }) => Promise<void>;
  onPdfError: (error: Error) => void;
  onTextClick: (position: Point) => void;
  onTextShapeEdit: (shapeId: string) => void;
  onImageToolComplete: (bounds: { x: number; y: number; width: number; height: number }) => void;
  onReferenceManipulate?: () => void;
  onReferenceClear?: () => void;
  onAiMoveClick?: (x: number, y: number) => void;
  isManipulationDialogOpen?: boolean;
}

export const WorkspaceCanvas: React.FC<WorkspaceCanvasProps> = ({
  isLoadingSharedFile,
  sharedFileError,
  onDismissSharedFileError,
  isCanvasInitialized,
  canvasSize,
  showGrid,
  canvasBackground,
  zoomLevel,
  stageRef,
  activeTool,
  handleImageUpload,
  handlePDFUpload,
  pdfFile,
  onPdfPageLoad,
  onPdfError,
  onTextClick,
  onTextShapeEdit,
  onImageToolComplete,
  onReferenceManipulate,
  onReferenceClear,
  onAiMoveClick,
  isManipulationDialogOpen,
}) => {
  const { state: drawingState, setAiMoveState } = useDrawingContext();
  const { state: aiProgressState } = useAIProgress();
  const [showRainbowBorder, setShowRainbowBorder] = React.useState(false);
  const lastCanvasSizeRef = React.useRef<CanvasSize | null>(null);

  // Load visual settings
  const loadRainbowSetting = React.useCallback(() => {
    try {
      const cached = localStorage.getItem('screenmark_settings_show_rainbow_border');
      setShowRainbowBorder(cached === 'true');
    } catch (e) {
      console.warn('Failed to load rainbow border setting:', e);
    }
  }, []);

  React.useEffect(() => {
    loadRainbowSetting();
    window.addEventListener('storage', loadRainbowSetting);
    // Also check when status changes to 'thinking' in case it was just updated
    if (aiProgressState.thinkingStatus === 'thinking') {
      loadRainbowSetting();
    }
    return () => window.removeEventListener('storage', loadRainbowSetting);
  }, [loadRainbowSetting, aiProgressState.thinkingStatus]);

  React.useEffect(() => {
    if (canvasSize) {
      lastCanvasSizeRef.current = canvasSize;
    }
  }, [canvasSize]);

  const effectiveCanvasSize = canvasSize ?? lastCanvasSizeRef.current;

  // Handle mouse move during AI Move drag phase
  const handleMouseMove = React.useCallback(() => {
    const aiMoveState = drawingState.aiMoveState;
    if (!aiMoveState || aiMoveState.phase !== 'dragging') {
      return;
    }

    const stage = stageRef.current;
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    // Update current drag point (in canvas coordinates, not zoomed)
    setAiMoveState({
      currentDragPoint: {
        x: pointerPos.x / zoomLevel,
        y: pointerPos.y / zoomLevel,
      },
    });
  }, [drawingState.aiMoveState, stageRef, zoomLevel, setAiMoveState]);

  // Handle mouse up to complete drag and transition to executing phase
  const handleMouseUp = React.useCallback(() => {
    const aiMoveState = drawingState.aiMoveState;
    if (!aiMoveState || aiMoveState.phase !== 'dragging') {
      return;
    }

    // Transition to executing phase (the actual move will be handled elsewhere)
    setAiMoveState({
      phase: 'executing',
    });
  }, [drawingState.aiMoveState, setAiMoveState]);
  if (isLoadingSharedFile) {
    return (
      <section
        style={{
          flex: 1,
          backgroundColor: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              border: '3px solid #e0e0e0',
              borderTopColor: '#4285f4',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <p style={{ color: '#666', fontSize: '0.875rem' }}>Loading shared project...</p>
        </div>
      </section>
    );
  }

  if (sharedFileError) {
    return (
      <section
        style={{
          flex: 1,
          backgroundColor: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '8px',
            maxWidth: '400px',
            textAlign: 'center',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Failed to load shared project</h3>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem' }}>{sharedFileError}</p>
          <button
            onClick={onDismissSharedFileError}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#c62828',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Continue
          </button>
        </div>
      </section>
    );
  }

  if (!isCanvasInitialized) {
    return (
      <>
        <section
          style={{
            flex: 1,
            backgroundColor: '#f5f5f5',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            position: 'relative',
            overflow: 'auto',
          }}
        >
          <ImageUploader onImageUpload={handleImageUpload} onPDFUpload={handlePDFUpload} />
        </section>
        {pdfFile ? (
          <PDFViewer
            file={pdfFile}
            onPageLoad={onPdfPageLoad}
            onError={error => {
              console.error('PDF Error:', error);
              onPdfError(error);
            }}
          />
        ) : null}
      </>
    );
  }

  if (!effectiveCanvasSize) {
    return null;
  }

  const renderGridLines = (): React.ReactNode[] => {
    if (!showGrid) {
      return [];
    }

    const gridSize = 20;
    const lines: React.ReactNode[] = [];

    for (let x = 0; x <= effectiveCanvasSize.width; x += gridSize) {
      lines.push(
        <Line
          key={`v-${x}`}
          name="gridLine"
          points={[x, 0, x, effectiveCanvasSize.height]}
          stroke="#e0e0e0"
          strokeWidth={1}
          listening={false}
        />,
      );
    }

    for (let y = 0; y <= effectiveCanvasSize.height; y += gridSize) {
      lines.push(
        <Line
          key={`h-${y}`}
          name="gridLine"
          points={[0, y, effectiveCanvasSize.width, y]}
          stroke="#e0e0e0"
          strokeWidth={1}
          listening={false}
        />,
      );
    }

    return lines;
  };

  return (
    <section
      style={{
        flex: 1,
        backgroundColor: '#f5f5f5',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        position: 'relative',
        overflow: 'auto',
        cursor: drawingState.aiReferenceMode ? 'crosshair' : undefined,
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          padding: 0,
          width: 'fit-content',
          height: 'fit-content',
        }}
      >
        {activeTool === DrawingTool.CALIBRATE && (
          <div
            style={{
              position: 'fixed',
              top: '120px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(74, 144, 226, 0.95)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '4px',
              fontSize: '14px',
              zIndex: 100,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            Click and drag to draw a reference line for calibration
          </div>
        )}
        <div
          style={{
            position: 'relative',
            width: effectiveCanvasSize.width * zoomLevel,
            height: effectiveCanvasSize.height * zoomLevel,
            overflow: 'visible',
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <Stage
            width={effectiveCanvasSize.width * zoomLevel}
            height={effectiveCanvasSize.height * zoomLevel}
            ref={stageRef}
            scaleX={1}
            scaleY={1}
            style={{
              backgroundColor: '#fafafa',
              cursor: drawingState.aiReferenceMode
                ? 'crosshair'
                : drawingState.generativeFillMode?.isActive
                  ? 'crosshair'
                  : (activeTool === DrawingTool.SELECT ? 'default' : 'crosshair'),
            }}
          >
            <Layer name="backgroundLayer" scaleX={zoomLevel} scaleY={zoomLevel}>
              <Rect
                name="canvasBackground"
                x={0}
                y={0}
                width={effectiveCanvasSize.width}
                height={effectiveCanvasSize.height}
                fill={canvasBackground}
              />
              {renderGridLines()}
            </Layer>

            <DrawingLayer
              stageRef={stageRef}
              zoomLevel={zoomLevel}
              onTextClick={onTextClick}
              onTextShapeEdit={onTextShapeEdit}
              onImageToolComplete={onImageToolComplete}
              onAiMoveClick={onAiMoveClick}
            />
          </Stage>
          {/* AI Reference Mode overlay - positioned relative to canvas, hidden when dialog is open */}
          {drawingState.aiReferenceMode && !isManipulationDialogOpen && (
            <ReferenceLabelOverlay
              onManipulate={onReferenceManipulate}
              onClear={onReferenceClear}
              zoomLevel={zoomLevel}
            />
          )}
          {/* AI Move drag preview overlay */}
          <DragPreview zoomLevel={zoomLevel} />
          {/* Coordinate highlight marker (from AI console hover) */}
          <CoordinateMarker
            zoomLevel={zoomLevel}
            canvasWidth={effectiveCanvasSize.width}
            canvasHeight={effectiveCanvasSize.height}
          />
          {/* Apple Intelligence-style gradient border when AI is thinking */}
          <ThinkingOverlay
            status={aiProgressState.thinkingStatus}
            canvasWidth={effectiveCanvasSize.width}
            canvasHeight={effectiveCanvasSize.height}
            zoomLevel={zoomLevel}
            image={aiProgressState.thinkingImage}
            showRainbowBorder={showRainbowBorder}
          />
        </div>
      </div>

      {pdfFile ? (
        <PDFViewer
          file={pdfFile}
          onPageLoad={onPdfPageLoad}
          onError={error => {
            console.error('PDF Error:', error);
            onPdfError(error);
          }}
        />
      ) : null}
    </section>
  );
};
