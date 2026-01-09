import React, { useState } from 'react';
import { Rect } from 'react-konva';
import Konva from 'konva';
import { DrawingActionType } from '@/contexts/DrawingContext';
import { SelectionOverlay } from '@/components/GenerativeFill/SelectionOverlay';
import { ResultOverlay } from '@/components/GenerativeFill/ResultOverlay';
import type { Point, Rectangle, GenerativeFillSelectionTool } from '@/types/drawing';

export interface GenerativeFillModeState {
  isActive: boolean;
  mode: 'inpainting' | 'text-only';
  selectionTool: GenerativeFillSelectionTool | null;
  selectionPoints: Point[];
  selectionRectangle: Rectangle | null;
  brushWidth: number;
  showPromptDialog: boolean;
  promptInput: string;
  isGenerating: boolean;
  generatedResult: {
    imageData: string;
    bounds: Rectangle;
  } | null;
  previewImages: {
    sourceImage: string;
    maskImage: string;
  } | null;
}

// Action type for generative fill selection updates
interface GenerativeFillSelectionAction {
  type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION;
  points?: Point[];
  rectangle?: Rectangle | null;
  brushWidth?: number;
}

interface GenerativeFillOverlayProps {
  generativeFillMode: GenerativeFillModeState | null;
  zoomLevel: number;
  stageRef: React.RefObject<Konva.Stage | null>;
  dispatch: (action: GenerativeFillSelectionAction) => void;
}

export const GenerativeFillOverlay: React.FC<GenerativeFillOverlayProps> = ({
  generativeFillMode,
  zoomLevel,
  stageRef,
  dispatch,
}) => {
  // Track if mouse is down for generative fill drawing
  const [isGenerativeFillDrawing, setIsGenerativeFillDrawing] = useState(false);
  const [polygonPreviewPoint, setPolygonPreviewPoint] = useState<Point | null>(null);

  // Return null if not active
  console.log('[GenerativeFillOverlay] render check - isActive:', generativeFillMode?.isActive, 'stageRef:', !!stageRef.current);
  if (!generativeFillMode?.isActive || !stageRef.current) {
    return null;
  }
  console.log('[GenerativeFillOverlay] ACTIVE - selectionTool:', generativeFillMode.selectionTool);

  // Helper function to check if a point is near the first point of the polygon
  const isNearFirstPoint = (currentPos: Point, firstPoint: Point, threshold: number = 10): boolean => {
    const dx = currentPos.x - firstPoint.x;
    const dy = currentPos.y - firstPoint.y;
    return Math.sqrt(dx * dx + dy * dy) <= threshold;
  };

  // Mouse event handlers
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    console.log('[GenerativeFillOverlay] handleMouseDown triggered');
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) {
      console.log('[GenerativeFillOverlay] handleMouseDown - no pos');
      return;
    }

    const { selectionTool, selectionPoints } = generativeFillMode;
    console.log('[GenerativeFillOverlay] handleMouseDown - tool:', selectionTool, 'pos:', pos);

    if (selectionTool === 'polygon') {
      // Polygon is click-based, not drag-based
      const newPoint = { x: pos.x / zoomLevel, y: pos.y / zoomLevel };
      
      // Check if we should close the polygon
      if (selectionPoints.length >= 3 && isNearFirstPoint(newPoint, selectionPoints[0], 10 / zoomLevel)) {
        // Close polygon - trigger completion
        setPolygonPreviewPoint(null);
        return;
      }
      
      // Add point to polygon
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        points: [...selectionPoints, newPoint],
      });
      return;
    }

    setIsGenerativeFillDrawing(true);

    if (selectionTool === 'brush' || selectionTool === 'lasso') {
      // Start collecting points
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        points: [{ x: pos.x / zoomLevel, y: pos.y / zoomLevel }],
      });
    } else if (selectionTool === 'rectangle') {
      // Start rectangle
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        rectangle: { x: pos.x / zoomLevel, y: pos.y / zoomLevel, width: 0, height: 0 },
      });
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (!e.target.getStage()) return;

    const pos = e.target.getStage()!.getPointerPosition();
    if (!pos) return;

    const { selectionTool, selectionPoints, selectionRectangle } = generativeFillMode;

    // Handle polygon preview point
    if (selectionTool === 'polygon') {
      setPolygonPreviewPoint({ x: pos.x / zoomLevel, y: pos.y / zoomLevel });
      return;
    }

    // Other tools require mouse to be down
    if (!isGenerativeFillDrawing) return;

    if ((selectionTool === 'brush' || selectionTool === 'lasso') && selectionPoints.length > 0) {
      // Add point to path
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        points: [...selectionPoints, { x: pos.x / zoomLevel, y: pos.y / zoomLevel }],
      });
    } else if (selectionTool === 'rectangle' && selectionRectangle) {
      // Update rectangle size
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        rectangle: {
          ...selectionRectangle,
          width: (pos.x / zoomLevel) - selectionRectangle.x,
          height: (pos.y / zoomLevel) - selectionRectangle.y,
        },
      });
    }
  };

  const handleMouseUp = (): void => {
    setIsGenerativeFillDrawing(false);
  };

  const handleDoubleClick = (): void => {
    const { selectionTool, selectionPoints } = generativeFillMode;
    
    // Close polygon on double-click if we have at least 3 points
    if (selectionTool === 'polygon' && selectionPoints.length >= 3) {
      setPolygonPreviewPoint(null);
    }
  };

  return (
    <>
      {/* Invisible rect to capture mouse events for generative fill */}
      <Rect
        x={0}
        y={0}
        width={stageRef.current.width() / zoomLevel}
        height={stageRef.current.height() / zoomLevel}
        fill="transparent"
        listening={true}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleDoubleClick}
      />

      {/* Render selection overlay */}
      <SelectionOverlay
        selectionTool={generativeFillMode.selectionTool}
        selectionPoints={generativeFillMode.selectionPoints}
        selectionRectangle={generativeFillMode.selectionRectangle}
        brushWidth={generativeFillMode.brushWidth}
        polygonPreviewPoint={polygonPreviewPoint ?? undefined}
      />

      {/* Render result preview */}
      {generativeFillMode.generatedResult && (
        <ResultOverlay
          imageData={generativeFillMode.generatedResult.imageData}
          bounds={generativeFillMode.generatedResult.bounds}
        />
      )}
    </>
  );
};
