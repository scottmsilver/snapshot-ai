import React from 'react';
import { Line, Rect } from 'react-konva';
import { GenerativeFillSelectionTool, type Point, type Rectangle } from '@/types/drawing';

interface SelectionOverlayProps {
  selectionTool: GenerativeFillSelectionTool | null;
  selectionPoints: Point[];
  selectionRectangle: Rectangle | null;
  brushWidth: number;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  selectionTool,
  selectionPoints,
  selectionRectangle,
  brushWidth,
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

  return null;
};
