import React, { useState, useCallback } from 'react';
import { Transformer } from 'react-konva';
import Konva from 'konva';
import type { Box } from 'konva/lib/shapes/Transformer';
import { DrawingTool, AIReferenceSubTool } from '@/types/drawing';
import type {
  Shape,
  PenShape,
  RectShape,
  CircleShape,
  ArrowShape,
  TextShape,
  CalloutShape,
  StarShape,
  ImageShape,
} from '@/types/drawing';
import type { DrawingState } from '@/types/drawing';
import {
  perimeterOffsetToPoint,
  getOptimalControlPoints,
} from '@/utils/calloutGeometry';

// Snap angles for rotation (every 45 degrees)
const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export interface TransformerWrapperProps {
  transformerRef: React.RefObject<Konva.Transformer | null>;
  selectedShapeIds: string[];
  shapes: Shape[];
  activeTool: DrawingTool;
  drawingState: DrawingState;
  calloutSelectionModes: Map<string, 'text-only' | 'whole'>;
  zoomLevel: number;
  updateShapes: (updates: Array<{ id: string; updates: Partial<Shape> }>) => void;
  startTransform: () => void;
  endTransform: () => void;
  isTransformingRef: React.MutableRefObject<boolean>;
}

export const TransformerWrapper: React.FC<TransformerWrapperProps> = ({
  transformerRef,
  selectedShapeIds,
  shapes,
  activeTool,
  drawingState,
  calloutSelectionModes,
  zoomLevel,
  updateShapes,
  startTransform,
  endTransform,
  isTransformingRef,
}) => {
  const [isSnapping, setIsSnapping] = useState(false);

  // Determine if resize should be enabled based on selected shapes
  const getResizeEnabled = useCallback(() => {
    if (selectedShapeIds.length === 1) {
      const shape = shapes.find(s => s.id === selectedShapeIds[0]);
      if (shape?.type === DrawingTool.CALLOUT) {
        const mode = calloutSelectionModes.get(shape.id) || 'whole';
        // Disable resize in whole mode
        return mode === 'text-only';
      }
    }
    return true;
  }, [selectedShapeIds, shapes, calloutSelectionModes]);

  // Handle transform start
  const handleTransformStart = useCallback((e: Konva.KonvaEventObject<Event>) => {
    isTransformingRef.current = true;
    startTransform();

    // Disable dragging on nodes during transform
    const nodes = transformerRef.current?.nodes();
    if (nodes) {
      nodes.forEach(node => {
        node.draggable(false);
      });
    }

    // Check if shift is pressed and update snaps
    const shiftPressed = (e.evt as KeyboardEvent).shiftKey;
    if (transformerRef.current) {
      transformerRef.current.rotationSnaps(shiftPressed ? SNAP_ANGLES : []);
    }
    setIsSnapping(shiftPressed);
  }, [transformerRef, startTransform, isTransformingRef]);

  // Handle transform (during)
  const handleTransform = useCallback((e: Konva.KonvaEventObject<Event>) => {
    // Update snaps dynamically based on shift key
    const shiftPressed = (e.evt as KeyboardEvent).shiftKey;
    if (transformerRef.current) {
      transformerRef.current.rotationSnaps(shiftPressed ? SNAP_ANGLES : []);
      // Also maintain aspect ratio when shift is held during resize
      transformerRef.current.keepRatio(shiftPressed);
    }
    setIsSnapping(shiftPressed);

    // Live update during transform
    const nodes = transformerRef.current?.nodes();
    if (nodes) {
      nodes.forEach(node => {
        node.getLayer()?.batchDraw();
      });
    }
  }, [transformerRef]);

  // Handle transform end
  const handleTransformEnd = useCallback(() => {
    // Reset snapping state
    setIsSnapping(false);

    // End transform state
    setTimeout(() => {
      isTransformingRef.current = false;
      endTransform();
    }, 50); // Small delay to ensure mouseup is processed first

    // Get transformed nodes from the transformer
    const nodes = transformerRef.current?.nodes();
    if (!nodes || nodes.length === 0) return;

    // Re-enable dragging on nodes after transform
    nodes.forEach(node => {
      node.draggable(true);
    });

    const batchUpdates: Array<{ id: string; updates: Partial<Shape> }> = [];

    nodes.forEach(node => {
      if (!node) return;

      const rotation = node.rotation();
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const x = node.x();
      const y = node.y();

      let shapeId = node.id();
      if (!shapeId) return;

      let shape;
      let isCalloutTextbox = false;
      if (shapeId.endsWith('_textbox')) {
        shapeId = shapeId.replace('_textbox', '');
        shape = shapes.find(s => s.id === shapeId);
        isCalloutTextbox = shape?.type === DrawingTool.CALLOUT;
      } else {
        shape = shapes.find(s => s.id === shapeId);
      }

      if (isCalloutTextbox && shape?.type === DrawingTool.CALLOUT) {
        const calloutShape = shape as CalloutShape;

        const newWidth = Math.max(50, node.width() * scaleX);
        const newHeight = Math.max(30, node.height() * scaleY);
        const newX = x / zoomLevel;
        const newY = y / zoomLevel;

        node.scaleX(1);
        node.scaleY(1);
        node.position({ x: newX * zoomLevel, y: newY * zoomLevel });

        const newTextBox = {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        };

        const newBasePoint = perimeterOffsetToPoint(newTextBox, calloutShape.perimeterOffset);
        const newControlPoints = getOptimalControlPoints(
          newBasePoint,
          { x: calloutShape.arrowX, y: calloutShape.arrowY },
          newTextBox,
        );

        batchUpdates.push({
          id: shapeId,
          updates: {
            textX: newX,
            textY: newY,
            textWidth: newWidth,
            textHeight: newHeight,
            curveControl1X: newControlPoints.control1.x,
            curveControl1Y: newControlPoints.control1.y,
            curveControl2X: newControlPoints.control2.x,
            curveControl2Y: newControlPoints.control2.y,
          },
        });
        return;
      }

      if (!shape) return;

      node.scaleX(1);
      node.scaleY(1);

      const updates: Partial<Record<string, unknown>> = {};

      if (Math.abs(rotation - (('rotation' in shape ? shape.rotation : 0) || 0)) > 0.01) {
        updates.rotation = rotation;
      }

      if (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
        switch (shape.type) {
          case DrawingTool.RECTANGLE:
          case DrawingTool.IMAGE: {
            const rectShape = shape as RectShape | ImageShape;
            updates.x = x;
            updates.y = y;
            updates.width = Math.max(10, rectShape.width * scaleX);
            updates.height = Math.max(10, rectShape.height * scaleY);
            break;
          }
          case DrawingTool.CIRCLE: {
            const circleShape = shape as CircleShape;
            updates.x = x;
            updates.y = y;
            updates.radiusX = Math.max(5, circleShape.radiusX * scaleX);
            updates.radiusY = Math.max(5, circleShape.radiusY * scaleY);
            break;
          }
          case DrawingTool.STAR: {
            const starShape = shape as StarShape;
            updates.x = x;
            updates.y = y;
            updates.radius = Math.max(5, starShape.radius * Math.max(scaleX, scaleY));
            if (starShape.innerRadius) {
              updates.innerRadius = starShape.innerRadius * Math.max(scaleX, scaleY);
            }
            break;
          }
          case DrawingTool.TEXT: {
            const textShape = shape as TextShape;
            updates.x = x;
            updates.y = y;
            updates.width = textShape.width
              ? Math.max(50, textShape.width * scaleX)
              : Math.max(50, 100 * scaleX);
            updates.height = textShape.height
              ? Math.max(20, textShape.height * scaleY)
              : Math.max(20, 30 * scaleY);
            break;
          }
          case DrawingTool.CALLOUT:
            return;
          case DrawingTool.ARROW: {
            const arrowShape = shape as ArrowShape;
            const [x1, y1, x2, y2] = arrowShape.points;
            const dx = (x2 - x1) * scaleX;
            const dy = (y2 - y1) * scaleY;
            updates.points = [x1, y1, x1 + dx, y1 + dy];
            break;
          }
          case DrawingTool.PEN: {
            const penShape = shape as PenShape;
            const penPoints = [...penShape.points];
            const centerX = penPoints.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) / (penPoints.length / 2);
            const centerY = penPoints.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) / (penPoints.length / 2);

            const scaledPoints = penPoints.map((point, idx) => (
              idx % 2 === 0
                ? centerX + (point - centerX) * scaleX
                : centerY + (point - centerY) * scaleY
            ));
            updates.points = scaledPoints;
            break;
          }
          case DrawingTool.MEASURE:
            return;
        }
      }

      if (Object.keys(updates).length > 0) {
        batchUpdates.push({ id: shapeId, updates });
      }
    });

    if (batchUpdates.length > 0) {
      try {
        updateShapes(batchUpdates);
      } catch (error) {
        console.error('Error updating shapes:', error);
      }
    }

    // Force a redraw to ensure the updated dimensions are reflected
    transformerRef.current?.getLayer()?.batchDraw();
  }, [transformerRef, shapes, zoomLevel, updateShapes, isTransformingRef, endTransform]);

  // Handle bounding box constraint
  const boundBoxFunc = useCallback((oldBox: Box, newBox: Box) => {
    // Check if any selected shape is a measurement line
    const hasMeasurementLine = selectedShapeIds.some(id => {
      const shape = shapes.find(s => s.id === id);
      return shape?.type === DrawingTool.MEASURE;
    });

    // If it's a measurement line, prevent resize (only allow rotation/move)
    if (hasMeasurementLine) {
      return {
        ...newBox,
        width: oldBox.width,
        height: oldBox.height,
      };
    }

    // For other shapes, allow resize but enforce minimum size
    return {
      ...newBox,
      width: Math.max(10, newBox.width),
      height: Math.max(10, newBox.height),
    };
  }, [selectedShapeIds, shapes]);

  // Don't render if conditions aren't met
  const shouldRender = 
    activeTool === DrawingTool.SELECT &&
    selectedShapeIds.length > 0 &&
    !(drawingState.aiReferenceMode && drawingState.aiReferenceSubTool !== AIReferenceSubTool.PIN);

  if (!shouldRender) {
    return null;
  }

  return (
    <Transformer
      key={selectedShapeIds.join(',')}
      ref={transformerRef}
      borderEnabled={true}
      borderStroke={isSnapping ? "#00ff00" : "#4a90e2"}
      borderStrokeWidth={1}
      borderDash={[4, 4]}
      anchorFill="white"
      anchorStroke={isSnapping ? "#00ff00" : "#4a90e2"}
      anchorStrokeWidth={2}
      anchorSize={8}
      rotateEnabled={true}
      resizeEnabled={getResizeEnabled()}
      enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
      ignoreStroke={false}
      rotationSnaps={[]}
      keepRatio={false}
      rotationSnapTolerance={5}
      boundBoxFunc={boundBoxFunc}
      onTransformStart={handleTransformStart}
      onTransform={handleTransform}
      onTransformEnd={handleTransformEnd}
    />
  );
};
