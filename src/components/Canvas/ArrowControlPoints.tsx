import React from 'react';
import { Line, Circle } from 'react-konva';
import Konva from 'konva';
import type { ArrowShape } from '@/types/drawing';

interface ArrowControlPointsProps {
  arrowShape: ArrowShape;
  arrowPoints: [number, number, number, number];
  nodePosition: { x: number; y: number };
  updateShape: (id: string, props: Partial<ArrowShape>) => void;
  startControlPointDrag: () => void;
  endControlPointDrag: () => void;
  isDraggingControlPointRef: React.MutableRefObject<boolean>;
  setDraggingControlPointIndex: (index: number | null) => void;
}

/**
 * Renders interactive control points for arrow start/end points.
 * Blue control point = arrow tail (start)
 * Red control point = arrow head (end)
 */
export const ArrowControlPoints: React.FC<ArrowControlPointsProps> = ({
  arrowShape,
  arrowPoints,
  nodePosition,
  updateShape,
  startControlPointDrag,
  endControlPointDrag,
  isDraggingControlPointRef,
  setDraggingControlPointIndex,
}) => {
  const [x1, y1, x2, y2] = arrowPoints;

  // Add the node's current position to get actual control point positions
  const actualX1 = x1 + nodePosition.x;
  const actualY1 = y1 + nodePosition.y;
  const actualX2 = x2 + nodePosition.x;
  const actualY2 = y2 + nodePosition.y;

  const handleControlPointDragMove = (index: number, e: Konva.KonvaEventObject<DragEvent>): void => {
    const pos = e.target.position();
    const newPoints: [number, number, number, number] = [...arrowShape.points];

    // Subtract the arrow node's position to get relative coordinates
    const relativeX = pos.x - nodePosition.x;
    const relativeY = pos.y - nodePosition.y;

    if (index === 0) {
      // Update start point
      newPoints[0] = relativeX;
      newPoints[1] = relativeY;
    } else {
      // Update end point
      newPoints[2] = relativeX;
      newPoints[3] = relativeY;
    }

    // Update the arrow shape immediately for real-time feedback
    updateShape(arrowShape.id, { points: newPoints });
  };

  const handleControlPointDragEnd = (_index: number, e: Konva.KonvaEventObject<DragEvent>): void => {
    e.cancelBubble = true;
    setTimeout(() => {
      isDraggingControlPointRef.current = false;
      endControlPointDrag();
    }, 50);
  };

  const handleMouseEnter = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    const stage = e.target.getStage();
    if (stage) {
      stage.container().style.cursor = 'move';
    }
  };

  const handleMouseLeave = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    const stage = e.target.getStage();
    if (stage) {
      stage.container().style.cursor = 'default';
    }
  };

  // Calculate offset for the head control point
  const offsetDistance = 15;
  const dx = actualX2 - actualX1;
  const dy = actualY2 - actualY1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const offsetX = length > 0 ? (dx / length) * offsetDistance : offsetDistance;
  const offsetY = length > 0 ? (dy / length) * offsetDistance : 0;

  return (
    <>
      {/* Visual guide line */}
      <Line
        points={[actualX1, actualY1, actualX2, actualY2]}
        stroke="#4a90e2"
        strokeWidth={1}
        dash={[5, 5]}
        opacity={0.5}
        listening={false}
      />

      {/* Tail control point (blue - arrow start) */}
      <Circle
        x={actualX1}
        y={actualY1}
        radius={5}
        fill="#4a90e2"
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
          setDraggingControlPointIndex(0);
          startControlPointDrag();
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          handleControlPointDragEnd(0, e);
        }}
        onDragMove={(e) => handleControlPointDragMove(0, e)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {/* Head control point (red - arrow head where pointer is) */}
      <Circle
        x={actualX2 + offsetX}
        y={actualY2 + offsetY}
        radius={5}
        fill="#e24a4a"
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
          setDraggingControlPointIndex(1);
          startControlPointDrag();
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          handleControlPointDragEnd(1, e);
        }}
        onDragMove={(e) => handleControlPointDragMove(1, e)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
    </>
  );
};
