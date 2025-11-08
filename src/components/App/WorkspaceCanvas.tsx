import React from 'react';
import { Stage, Layer, Rect, Line } from 'react-konva';
import Konva from 'konva';
import { DrawingLayer } from '@/components/Canvas/DrawingLayer';
import { ImageUploader } from '@/components/ImageUploader';
import { PDFViewer } from '@/components/PDFViewer/PDFViewer';
import { DrawingTool, type Point } from '@/types/drawing';
import { useDrawingContext } from '@/contexts/DrawingContext';

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
}) => {
  const { state: drawingState } = useDrawingContext();
  if (isLoadingSharedFile) {
    return (
      <section
        style={{
          flex: 1,
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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

  if (!canvasSize) {
    return null;
  }

  const renderGridLines = (): React.ReactNode[] => {
    if (!showGrid) {
      return [];
    }

    const gridSize = 20;
    const lines: React.ReactNode[] = [];

    for (let x = 0; x <= canvasSize.width; x += gridSize) {
      lines.push(
        <Line key={`v-${x}`} points={[x, 0, x, canvasSize.height]} stroke="#e0e0e0" strokeWidth={1} listening={false} />,
      );
    }

    for (let y = 0; y <= canvasSize.height; y += gridSize) {
      lines.push(
        <Line key={`h-${y}`} points={[0, y, canvasSize.width, y]} stroke="#e0e0e0" strokeWidth={1} listening={false} />,
      );
    }

    return lines;
  };

  return (
    <section
      style={{
        flex: 1,
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        position: 'relative',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          padding: 20,
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
            width: canvasSize.width * zoomLevel,
            height: canvasSize.height * zoomLevel,
            overflow: 'visible',
          }}
        >
          <Stage
            width={canvasSize.width * zoomLevel}
            height={canvasSize.height * zoomLevel}
            ref={stageRef}
            scaleX={1}
            scaleY={1}
            style={{
              border: '1px solid #ddd',
              backgroundColor: '#fafafa',
              cursor: drawingState.generativeFillMode?.isActive ? 'crosshair' : (activeTool === DrawingTool.SELECT ? 'default' : 'crosshair'),
            }}
          >
            <Layer scaleX={zoomLevel} scaleY={zoomLevel}>
              <Rect x={0} y={0} width={canvasSize.width} height={canvasSize.height} fill={canvasBackground} />
              {renderGridLines()}
            </Layer>

            <DrawingLayer
              stageRef={stageRef}
              zoomLevel={zoomLevel}
              onTextClick={onTextClick}
              onTextShapeEdit={onTextShapeEdit}
              onImageToolComplete={onImageToolComplete}
            />
          </Stage>
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
