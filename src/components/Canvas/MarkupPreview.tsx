import React from 'react';
import { Line, Circle, Rect } from 'react-konva';
import { AIReferenceSubTool } from '@/types/drawing';
import type { Point } from '@/types/drawing';

export interface MarkupPreviewProps {
  aiReferenceSubTool: AIReferenceSubTool;
  isMarkupDrawing: boolean;
  isPolygonMarkupDrawing: boolean;
  markupTempPoints: Point[];
  polygonMarkupPreviewPoint: Point | null;
}

export const MarkupPreview: React.FC<MarkupPreviewProps> = ({
  aiReferenceSubTool,
  isMarkupDrawing,
  isPolygonMarkupDrawing,
  markupTempPoints,
  polygonMarkupPreviewPoint,
}) => {
  // Check for polygon drawing separately since it doesn't use isMarkupDrawing
  if (aiReferenceSubTool === AIReferenceSubTool.POLYGON && isPolygonMarkupDrawing && markupTempPoints.length > 0) {
    const flatPoints = markupTempPoints.flatMap(p => [p.x, p.y]);
    return (
      <>
        <Line points={flatPoints} stroke="#FF6B00" strokeWidth={3} listening={false} />
        {markupTempPoints.map((p, i) => (
          <Circle key={i} x={p.x} y={p.y} radius={4} fill="#FF6B00" listening={false} />
        ))}
        {polygonMarkupPreviewPoint && markupTempPoints.length > 0 && (
          <Line 
            points={[markupTempPoints[markupTempPoints.length-1].x, markupTempPoints[markupTempPoints.length-1].y, polygonMarkupPreviewPoint.x, polygonMarkupPreviewPoint.y]}
            stroke="#FF6B00" strokeWidth={2} dash={[5,5]} listening={false}
          />
        )}
      </>
    );
  }
  
  if (!isMarkupDrawing || markupTempPoints.length === 0) {
    return null;
  }

  const markupStyle = {
    stroke: '#FF6B00',
    strokeWidth: 3,
    opacity: 0.8,
  };

  if (aiReferenceSubTool === AIReferenceSubTool.PEN) {
    if (markupTempPoints.length < 2) return null;
    const penPoints = markupTempPoints.flatMap(p => [p.x, p.y]);
    return (
      <Line
        points={penPoints}
        stroke={markupStyle.stroke}
        strokeWidth={markupStyle.strokeWidth}
        opacity={markupStyle.opacity}
        lineCap="round"
        lineJoin="round"
        tension={0.5}
        listening={false}
      />
    );
  } else if (aiReferenceSubTool === AIReferenceSubTool.LINE) {
    if (markupTempPoints.length < 2) return null;
    const startPt = markupTempPoints[0];
    const endPt = markupTempPoints[markupTempPoints.length - 1];
    return (
      <Line
        points={[startPt.x, startPt.y, endPt.x, endPt.y]}
        stroke={markupStyle.stroke}
        strokeWidth={markupStyle.strokeWidth}
        opacity={markupStyle.opacity}
        lineCap="round"
        listening={false}
      />
    );
  } else if (aiReferenceSubTool === AIReferenceSubTool.CIRCLE) {
    if (markupTempPoints.length < 2) return null;
    const startPt = markupTempPoints[0];
    const endPt = markupTempPoints[markupTempPoints.length - 1];
    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;
    const radiusX = Math.abs(dx) / 2;
    const radiusY = Math.abs(dy) / 2;
    const centerX = startPt.x + dx / 2;
    const centerY = startPt.y + dy / 2;

    return (
      <Circle
        x={centerX}
        y={centerY}
        radiusX={radiusX}
        radiusY={radiusY}
        stroke={markupStyle.stroke}
        strokeWidth={markupStyle.strokeWidth}
        opacity={markupStyle.opacity}
        listening={false}
      />
    );
  } else if (aiReferenceSubTool === AIReferenceSubTool.RECTANGLE) {
    if (markupTempPoints.length < 2) return null;
    const startPt = markupTempPoints[0];
    const endPt = markupTempPoints[markupTempPoints.length - 1];
    const x = Math.min(startPt.x, endPt.x);
    const y = Math.min(startPt.y, endPt.y);
    const width = Math.abs(endPt.x - startPt.x);
    const height = Math.abs(endPt.y - startPt.y);

    return (
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        stroke={markupStyle.stroke}
        strokeWidth={markupStyle.strokeWidth}
        opacity={markupStyle.opacity}
        listening={false}
      />
    );
  }

  return null;
};
