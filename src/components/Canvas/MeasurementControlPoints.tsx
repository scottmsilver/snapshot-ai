import React from 'react';
import { Group, Line, Circle } from 'react-konva';
import Konva from 'konva';
import type { MeasurementLineShape } from '@/types/drawing';
import { pixelsToMeasurement, type MeasurementUnit } from '@/utils/measurementUtils';

interface MeasurementCalibration {
  pixelsPerUnit: number | null;
  unit: string;
  calibrationLineId: string | null;
}

interface MeasurementControlPointsProps {
  measureShape: MeasurementLineShape;
  measurementCalibration: MeasurementCalibration;
  updateShape: (id: string, updates: Partial<MeasurementLineShape>) => void;
  startControlPointDrag: () => void;
  endControlPointDrag: () => void;
  zoomLevel: number;
  measureNode: Konva.Node;
  isDraggingControlPointRef: React.MutableRefObject<boolean>;
  setDraggingControlPointIndex: (index: number | null) => void;
}

export const MeasurementControlPoints: React.FC<MeasurementControlPointsProps> = ({
  measureShape,
  measurementCalibration,
  updateShape,
  startControlPointDrag,
  endControlPointDrag,
  measureNode,
  isDraggingControlPointRef,
  setDraggingControlPointIndex,
}) => {
  // Get the measurement line's current position (changes during drag)
  const nodePos = measureNode.position();
  const [x1, y1, x2, y2] = measureShape.points;

  // Add the node's current position to get actual control point positions
  const actualX1 = x1 + nodePos.x;
  const actualY1 = y1 + nodePos.y;
  const actualX2 = x2 + nodePos.x;
  const actualY2 = y2 + nodePos.y;

  const handleControlPointDragMove = (index: number, e: Konva.KonvaEventObject<DragEvent>): void => {
    const pos = e.target.position();
    const newPoints: [number, number, number, number] = [...measureShape.points];

    // Subtract the measurement node's position to get relative coordinates
    const relativeX = pos.x - nodePos.x;
    const relativeY = pos.y - nodePos.y;

    if (index === 0) {
      // Update start point
      newPoints[0] = relativeX;
      newPoints[1] = relativeY;
    } else {
      // Update end point
      newPoints[2] = relativeX;
      newPoints[3] = relativeY;
    }

    // If calibrated, update the measurement value
    if (measurementCalibration.pixelsPerUnit) {
      const pixelDistance = Math.sqrt(
        Math.pow(newPoints[2] - newPoints[0], 2) +
        Math.pow(newPoints[3] - newPoints[1], 2)
      );
      const value = pixelsToMeasurement(
        pixelDistance,
        measurementCalibration.pixelsPerUnit,
        measurementCalibration.unit as MeasurementUnit
      );

      updateShape(measureShape.id, {
        points: newPoints,
        measurement: {
          value,
          unit: measurementCalibration.unit,
          pixelDistance
        }
      });
    } else {
      // Just update points if not calibrated
      updateShape(measureShape.id, { points: newPoints });
    }
  };

  const handleControlPointDragEnd = (_index: number, e: Konva.KonvaEventObject<DragEvent>): void => {
    e.cancelBubble = true;
    setTimeout(() => {
      isDraggingControlPointRef.current = false;
      endControlPointDrag();
    }, 50);
  };

  return (
    <Group listening={true}>
      {/* Visual guide line */}
      <Line
        points={[actualX1, actualY1, actualX2, actualY2]}
        stroke="#4a90e2"
        strokeWidth={1}
        dash={[5, 5]}
        opacity={0.5}
        listening={false}
      />

      {/* Start point control (blue) */}
      <Circle
        name="measurement-control-point"
        x={actualX1}
        y={actualY1}
        radius={10}
        fill="#4a90e2"
        stroke="#fff"
        strokeWidth={3}
        shadowColor="rgba(0,0,0,0.5)"
        shadowBlur={10}
        shadowOffset={{ x: 2, y: 2 }}
        draggable={true}
        onDragStart={(e) => {
          e.cancelBubble = true;
          startControlPointDrag();
          isDraggingControlPointRef.current = true;
          setDraggingControlPointIndex(0);
        }}
        onDragMove={(e) => handleControlPointDragMove(0, e)}
        onDragEnd={(e) => handleControlPointDragEnd(0, e)}
        onClick={(e) => {
          e.cancelBubble = true;
        }}
        onMouseEnter={(e) => {
          const container = e.target.getStage()?.container();
          if (container) {
            container.style.cursor = 'move';
          }
        }}
        onMouseLeave={(e) => {
          const container = e.target.getStage()?.container();
          if (container) {
            container.style.cursor = 'default';
          }
        }}
      />

      {/* End point control (red) */}
      <Circle
        name="measurement-control-point"
        x={actualX2}
        y={actualY2}
        radius={10}
        fill="#e24a4a"
        stroke="#fff"
        strokeWidth={3}
        shadowColor="rgba(0,0,0,0.5)"
        shadowBlur={10}
        shadowOffset={{ x: 2, y: 2 }}
        draggable={true}
        onDragStart={(e) => {
          e.cancelBubble = true;
          startControlPointDrag();
          isDraggingControlPointRef.current = true;
          setDraggingControlPointIndex(1);
        }}
        onDragMove={(e) => handleControlPointDragMove(1, e)}
        onDragEnd={(e) => handleControlPointDragEnd(1, e)}
        onClick={(e) => {
          e.cancelBubble = true;
        }}
        onMouseEnter={(e) => {
          const container = e.target.getStage()?.container();
          if (container) {
            container.style.cursor = 'move';
          }
        }}
        onMouseLeave={(e) => {
          const container = e.target.getStage()?.container();
          if (container) {
            container.style.cursor = 'default';
          }
        }}
      />
    </Group>
  );
};
