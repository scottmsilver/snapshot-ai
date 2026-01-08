import React from 'react';
import { Circle, Line } from 'react-konva';
import Konva from 'konva';
import type { CalloutShape, Point, Shape } from '@/types/drawing';
import {
  perimeterOffsetToPoint,
  pointToPerimeterOffset,
  isValidControlPoint,
  getOptimalControlPoints
} from '@/utils/calloutGeometry';

interface CalloutControlPointsProps {
  calloutShape: CalloutShape;
  calloutNodePosition: { x: number; y: number };
  updateShape: (id: string, updates: Partial<Shape>) => void;
  isDraggingControlPointRef: React.MutableRefObject<boolean>;
}

export const CalloutControlPoints: React.FC<CalloutControlPointsProps> = ({
  calloutShape,
  calloutNodePosition,
  updateShape,
  isDraggingControlPointRef,
}) => {
  // Calculate actual positions
  const textBox = {
    x: calloutShape.textX + calloutNodePosition.x,
    y: calloutShape.textY + calloutNodePosition.y,
    width: calloutShape.textWidth || 120,
    height: calloutShape.textHeight || 40
  };

  const arrowTip = {
    x: calloutShape.arrowX,
    y: calloutShape.arrowY
  };

  // Get base point from perimeter offset - always use stored value if available
  const basePoint = perimeterOffsetToPoint(textBox, calloutShape.perimeterOffset);

  // Get control points - always use stored values if available
  let control1: Point, control2: Point;

  if (calloutShape.curveControl1X !== undefined && calloutShape.curveControl1Y !== undefined &&
      calloutShape.curveControl2X !== undefined && calloutShape.curveControl2Y !== undefined) {
    // Use stored control points
    control1 = { x: calloutShape.curveControl1X, y: calloutShape.curveControl1Y };
    control2 = { x: calloutShape.curveControl2X, y: calloutShape.curveControl2Y };
  } else {
    // No control points stored, calculate optimal ones
    const optimalPoints = getOptimalControlPoints(basePoint, arrowTip, textBox);
    control1 = optimalPoints.control1;
    control2 = optimalPoints.control2;
  }

  // Calculate offset position for arrow tip handle (tangent to arrow tip)
  const offsetDistance = 15; // Distance from arrow tip

  // Direction from control point to arrow tip (for offset)
  const dx = arrowTip.x - control2.x;
  const dy = arrowTip.y - control2.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  // Normalize and offset in the direction of the arrow
  const offsetX = length > 0 ? (dx / length) * offsetDistance : offsetDistance;
  const offsetY = length > 0 ? (dy / length) * offsetDistance : 0;

  const handleX = arrowTip.x + offsetX;
  const handleY = arrowTip.y + offsetY;

  const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string) => {
    const stage = e.target.getStage();
    if (stage) {
      stage.container().style.cursor = cursor;
    }
  };

  const isValid = isValidControlPoint(basePoint, control1, control2, arrowTip, textBox);
  const guideColor = isValid ? "#3498db" : "#e74c3c";

  return (
    <>
      {/* Arrow tip control (red) - offset from arrow head */}
      {/* Small line connecting handle to arrow tip */}
      <Line
        points={[handleX, handleY, arrowTip.x, arrowTip.y]}
        stroke="#e74c3c"
        strokeWidth={1}
        opacity={0.3}
        listening={false}
      />

      {/* Arrow tip control handle */}
      <Circle
        x={handleX}
        y={handleY}
        radius={5}
        fill="#e74c3c"
        stroke="white"
        strokeWidth={1.5}
        opacity={0.8}
        shadowColor="rgba(0,0,0,0.3)"
        shadowBlur={5}
        shadowOffset={{ x: 1, y: 1 }}
        draggable={true}
        onClick={(e) => {
          e.cancelBubble = true;
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          isDraggingControlPointRef.current = true;
        }}
        onDragMove={(e) => {
          const pos = e.target.position();
          // Calculate offset back to arrow tip
          const deltaX = pos.x - handleX;
          const deltaY = pos.y - handleY;

          // Update arrow tip position
          const newArrowTip = { x: arrowTip.x + deltaX, y: arrowTip.y + deltaY };

          // Only update the arrow position, keep existing control points
          updateShape(calloutShape.id, {
            arrowX: newArrowTip.x,
            arrowY: newArrowTip.y
          });
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          setTimeout(() => {
            isDraggingControlPointRef.current = false;
          }, 50);
        }}
        onMouseEnter={(e) => setCursor(e, 'move')}
        onMouseLeave={(e) => setCursor(e, 'default')}
      />

      {/* Arrow base control point (green) - moves along perimeter */}
      <Circle
        x={basePoint.x}
        y={basePoint.y}
        radius={5}
        fill="#27ae60"
        stroke="white"
        strokeWidth={1.5}
        opacity={0.8}
        shadowColor="rgba(0,0,0,0.3)"
        shadowBlur={5}
        shadowOffset={{ x: 1, y: 1 }}
        draggable={true}
        onClick={(e) => {
          e.cancelBubble = true;
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          isDraggingControlPointRef.current = true;
        }}
        onDragMove={(e) => {
          const pos = e.target.position();
          // Convert position to perimeter offset
          const newOffset = pointToPerimeterOffset(textBox, pos);

          // Get new base point position
          const newBasePoint = perimeterOffsetToPoint(textBox, newOffset);

          // Only update the perimeter offset
          updateShape(calloutShape.id, {
            perimeterOffset: newOffset
          });

          // Snap the control point to the perimeter
          e.target.position(newBasePoint);
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          setTimeout(() => {
            isDraggingControlPointRef.current = false;
          }, 50);
        }}
        onMouseEnter={(e) => setCursor(e, 'move')}
        onMouseLeave={(e) => setCursor(e, 'default')}
      />

      {/* Curve control point 1 (blue - closer to base) */}
      <Circle
        x={control1.x}
        y={control1.y}
        radius={5}
        fill="#3498db"
        stroke="white"
        strokeWidth={1.5}
        opacity={0.8}
        shadowColor="rgba(0,0,0,0.3)"
        shadowBlur={5}
        shadowOffset={{ x: 1, y: 1 }}
        draggable={true}
        dragBoundFunc={(pos) => {
          // Allow free movement
          return pos;
        }}
        onClick={(e) => {
          e.cancelBubble = true;
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          isDraggingControlPointRef.current = true;
        }}
        onDragMove={() => {
          // Don't update shape during drag to avoid double rendering
          // The draggable circle will move on its own
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          const pos = e.target.position();
          // Update shape only on drag end
          updateShape(calloutShape.id, {
            curveControl1X: pos.x,
            curveControl1Y: pos.y
          });
          setTimeout(() => {
            isDraggingControlPointRef.current = false;
          }, 50);
        }}
        onMouseEnter={(e) => setCursor(e, 'move')}
        onMouseLeave={(e) => setCursor(e, 'default')}
      />

      {/* Curve control point 2 (purple - closer to tip) */}
      <Circle
        x={control2.x}
        y={control2.y}
        radius={5}
        fill="#9b59b6"
        stroke="white"
        strokeWidth={1.5}
        opacity={0.8}
        shadowColor="rgba(0,0,0,0.3)"
        shadowBlur={5}
        shadowOffset={{ x: 1, y: 1 }}
        draggable={true}
        onClick={(e) => {
          e.cancelBubble = true;
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          isDraggingControlPointRef.current = true;
        }}
        onDragMove={() => {
          // Don't update shape during drag to avoid double rendering
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          const pos = e.target.position();
          updateShape(calloutShape.id, {
            curveControl2X: pos.x,
            curveControl2Y: pos.y
          });
          setTimeout(() => {
            isDraggingControlPointRef.current = false;
          }, 50);
        }}
        onMouseEnter={(e) => setCursor(e, 'move')}
        onMouseLeave={(e) => setCursor(e, 'default')}
      />

      {/* Visual guides */}
      <Line
        points={[basePoint.x, basePoint.y, control1.x, control1.y]}
        stroke={guideColor}
        strokeWidth={1}
        dash={[5, 5]}
        opacity={0.5}
        listening={false}
      />
      <Line
        points={[control1.x, control1.y, control2.x, control2.y]}
        stroke={guideColor}
        strokeWidth={1}
        dash={[5, 5]}
        opacity={0.5}
        listening={false}
      />
      <Line
        points={[control2.x, control2.y, arrowTip.x, arrowTip.y]}
        stroke={guideColor}
        strokeWidth={1}
        dash={[5, 5]}
        opacity={0.5}
        listening={false}
      />
    </>
  );
};
