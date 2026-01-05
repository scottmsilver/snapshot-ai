import React from 'react';
import { Line, Rect, Circle } from 'react-konva';
import { GenerativeFillSelectionTool, type Point, type Rectangle } from '@/types/drawing';

interface SelectionOverlayProps {
  selectionTool: GenerativeFillSelectionTool | null;
  selectionPoints: Point[];
  selectionRectangle: Rectangle | null;
  brushWidth: number;
  polygonPreviewPoint?: Point;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  selectionTool,
  selectionPoints,
  selectionRectangle,
  brushWidth,
  polygonPreviewPoint,
}) => {
  // Render nothing if no selection tool is active
  if (!selectionTool) return null;

  // Render brush selection
  if (
    selectionTool === GenerativeFillSelectionTool.BRUSH &&
    selectionPoints.length > 0
  ) {
    const flatPoints = selectionPoints.flatMap((p) => [p.x, p.y]);
    return (
      <Line
        name="selectionOverlay"
        points={flatPoints}
        stroke="rgba(74, 144, 226, 0.8)"
        strokeWidth={brushWidth}
        fill="rgba(74, 144, 226, 0.2)"
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
    );
  }

  // Render rectangle selection
  if (
    selectionTool === GenerativeFillSelectionTool.RECTANGLE &&
    selectionRectangle &&
    selectionRectangle.width !== 0 &&
    selectionRectangle.height !== 0
  ) {
    return (
      <Rect
        name="selectionOverlay"
        x={selectionRectangle.x}
        y={selectionRectangle.y}
        width={selectionRectangle.width}
        height={selectionRectangle.height}
        stroke="rgba(74, 144, 226, 0.8)"
        strokeWidth={2}
        fill="rgba(74, 144, 226, 0.2)"
        dash={[5, 5]}
        listening={false}
      />
    );
  }

  // Render lasso selection
  if (
    selectionTool === GenerativeFillSelectionTool.LASSO &&
    selectionPoints.length > 1
  ) {
    const flatPoints = selectionPoints.flatMap((p) => [p.x, p.y]);
    return (
      <Line
        name="selectionOverlay"
        points={flatPoints}
        stroke="rgba(74, 144, 226, 0.8)"
        strokeWidth={2}
        fill="rgba(74, 144, 226, 0.2)"
        closed={true}
        listening={false}
      />
    );
  }

  // Render polygon selection
  if (
    selectionTool === GenerativeFillSelectionTool.POLYGON &&
    selectionPoints.length > 0
  ) {
    const flatPoints = selectionPoints.flatMap((p) => [p.x, p.y]);
    
    // Determine if polygon is complete (closed)
    // For now, we'll render as closed if there are at least 3 points and no preview point
    const isComplete = selectionPoints.length >= 3 && !polygonPreviewPoint;
    
    return (
      <>
        {/* Main polygon line */}
        <Line
          name="selectionOverlay"
          points={flatPoints}
          stroke="rgba(74, 144, 226, 0.8)"
          strokeWidth={2}
          fill={isComplete ? "rgba(74, 144, 226, 0.2)" : undefined}
          closed={isComplete}
          listening={false}
        />
        
        {/* Preview line from last vertex to cursor */}
        {polygonPreviewPoint && selectionPoints.length > 0 && (
          <Line
            name="selectionPreviewLine"
            points={[
              selectionPoints[selectionPoints.length - 1].x,
              selectionPoints[selectionPoints.length - 1].y,
              polygonPreviewPoint.x,
              polygonPreviewPoint.y,
            ]}
            stroke="rgba(74, 144, 226, 0.8)"
            strokeWidth={2}
            dash={[5, 5]}
            listening={false}
          />
        )}
        
        {/* Vertex circles */}
        {selectionPoints.map((point, index) => (
          <Circle
            key={`vertex-${index}`}
            name="polygonVertex"
            x={point.x}
            y={point.y}
            radius={4}
            fill="rgba(74, 144, 226, 0.9)"
            stroke="white"
            strokeWidth={1}
            listening={false}
          />
        ))}
      </>
    );
  }

  return null;
};
