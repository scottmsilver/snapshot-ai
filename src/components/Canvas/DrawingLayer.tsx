import React, { useEffect } from 'react';
import { Layer, Line, Rect, Circle, Arrow, Text, Group, Transformer } from 'react-konva';
import Konva from 'konva';
import { useDrawing } from '@/hooks/useDrawing';
import { DrawingTool } from '@/types/drawing';
import type { Shape, PenShape, RectShape, CircleShape, ArrowShape, TextShape } from '@/types/drawing';

interface DrawingLayerProps {
  stageRef: React.RefObject<Konva.Stage>;
}

export const DrawingLayer: React.FC<DrawingLayerProps> = ({ stageRef }) => {
  const {
    activeTool,
    currentStyle,
    isDrawing,
    shapes,
    tempPoints,
    selectedShapeIds,
    startDrawing,
    continueDrawing,
    finishDrawing,
    getSortedShapes,
    selectShape,
    clearSelection,
    updateShape,
  } = useDrawing();

  // Set up mouse event handlers
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Check if clicking on empty space (no shape)
      const clickedOnEmpty = e.target === stage || e.target.getLayer();
      
      if (activeTool === DrawingTool.SELECT) {
        if (clickedOnEmpty) {
          clearSelection();
        }
        return;
      }

      if (clickedOnEmpty) {
        startDrawing(pos, e.evt);
      }
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
      const pos = stage.getPointerPosition();
      if (!pos) return;

      if (isDrawing) {
        continueDrawing(pos, e.evt);
      }
    };

    const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isDrawing) {
        const pos = stage.getPointerPosition();
        finishDrawing(pos || undefined, e.evt);
      }
    };

    // Add event listeners
    stage.on('mousedown touchstart', handleMouseDown);
    stage.on('mousemove touchmove', handleMouseMove);
    stage.on('mouseup touchend', handleMouseUp);

    // Cleanup
    return () => {
      stage.off('mousedown touchstart', handleMouseDown);
      stage.off('mousemove touchmove', handleMouseMove);
      stage.off('mouseup touchend', handleMouseUp);
    };
  }, [
    stageRef,
    activeTool,
    isDrawing,
    startDrawing,
    continueDrawing,
    finishDrawing,
    clearSelection,
  ]);

  // Render temporary drawing preview
  const renderTempDrawing = () => {
    if (!isDrawing || tempPoints.length === 0) return null;

    switch (activeTool) {
      case DrawingTool.PEN:
        if (tempPoints.length < 2) return null;
        const penPoints = tempPoints.flatMap(p => [p.x, p.y]);
        return (
          <Line
            points={penPoints}
            stroke={currentStyle.stroke}
            strokeWidth={currentStyle.strokeWidth}
            opacity={currentStyle.opacity}
            lineCap={currentStyle.lineCap}
            lineJoin={currentStyle.lineJoin}
            tension={0.5}
            globalCompositeOperation="source-over"
            listening={false}
          />
        );

      case DrawingTool.RECTANGLE:
        if (tempPoints.length < 2) return null;
        const rectStart = tempPoints[0];
        const rectEnd = tempPoints[1];
        const rectX = Math.min(rectStart.x, rectEnd.x);
        const rectY = Math.min(rectStart.y, rectEnd.y);
        const rectWidth = Math.abs(rectEnd.x - rectStart.x);
        const rectHeight = Math.abs(rectEnd.y - rectStart.y);
        
        return (
          <Rect
            x={rectX}
            y={rectY}
            width={rectWidth}
            height={rectHeight}
            stroke={currentStyle.stroke}
            strokeWidth={currentStyle.strokeWidth}
            fill={currentStyle.fill}
            opacity={currentStyle.opacity}
            listening={false}
          />
        );

      case DrawingTool.CIRCLE:
        if (tempPoints.length < 2) return null;
        const circleStart = tempPoints[0];
        const circleEnd = tempPoints[1];
        const radiusX = Math.abs(circleEnd.x - circleStart.x) / 2;
        const radiusY = Math.abs(circleEnd.y - circleStart.y) / 2;
        const centerX = (circleStart.x + circleEnd.x) / 2;
        const centerY = (circleStart.y + circleEnd.y) / 2;
        
        return (
          <Circle
            x={centerX}
            y={centerY}
            radiusX={radiusX}
            radiusY={radiusY}
            stroke={currentStyle.stroke}
            strokeWidth={currentStyle.strokeWidth}
            fill={currentStyle.fill}
            opacity={currentStyle.opacity}
            listening={false}
          />
        );

      case DrawingTool.ARROW:
        if (tempPoints.length < 2) return null;
        const arrowStart = tempPoints[0];
        const arrowEnd = tempPoints[1];
        
        return (
          <Arrow
            points={[arrowStart.x, arrowStart.y, arrowEnd.x, arrowEnd.y]}
            stroke={currentStyle.stroke}
            strokeWidth={currentStyle.strokeWidth}
            opacity={currentStyle.opacity}
            pointerLength={10}
            pointerWidth={10}
            listening={false}
          />
        );

      default:
        return null;
    }
  };

  // Render a shape based on its type
  const renderShape = (shape: Shape) => {
    const isSelected = selectedShapeIds.includes(shape.id);
    
    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const newPosition = node.position();
      
      // Update shape position based on its type
      if (shape.type === DrawingTool.PEN) {
        // For pen shapes, we need to update all points
        const penShape = shape as PenShape;
        const dx = newPosition.x;
        const dy = newPosition.y;
        const newPoints = [...penShape.points];
        for (let i = 0; i < newPoints.length; i += 2) {
          newPoints[i] += dx;
          newPoints[i + 1] += dy;
        }
        updateShape(shape.id, { points: newPoints });
        // Reset the position after updating points
        node.position({ x: 0, y: 0 });
      } else if (shape.type === DrawingTool.ARROW) {
        // For arrow shapes, update the points
        const arrowShape = shape as ArrowShape;
        const dx = newPosition.x;
        const dy = newPosition.y;
        const newPoints: [number, number, number, number] = [
          arrowShape.points[0] + dx,
          arrowShape.points[1] + dy,
          arrowShape.points[2] + dx,
          arrowShape.points[3] + dy,
        ];
        updateShape(shape.id, { points: newPoints });
        node.position({ x: 0, y: 0 });
      } else {
        // For other shapes, update x/y position
        const shapeWithPos = shape as any; // Type assertion for shapes with x/y
        updateShape(shape.id, { 
          x: shapeWithPos.x + newPosition.x, 
          y: shapeWithPos.y + newPosition.y 
        });
      }
    };
    
    const commonProps = {
      id: shape.id,
      opacity: shape.style.opacity,
      visible: shape.visible,
      listening: true,
      draggable: activeTool === DrawingTool.SELECT && isSelected,
      onClick: () => {
        if (activeTool === DrawingTool.SELECT) {
          selectShape(shape.id, false);
        }
      },
      onTap: () => {
        if (activeTool === DrawingTool.SELECT) {
          selectShape(shape.id, false);
        }
      },
      onDragEnd: handleDragEnd,
      shadowColor: isSelected ? '#4a90e2' : undefined,
      shadowBlur: isSelected ? 5 : 0,
      shadowOpacity: isSelected ? 0.5 : 0,
      // Change cursor when hovering over draggable shapes
      onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (stage && activeTool === DrawingTool.SELECT) {
          stage.container().style.cursor = 'move';
        }
      },
      onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (stage && activeTool === DrawingTool.SELECT) {
          stage.container().style.cursor = 'default';
        }
      },
    };

    switch (shape.type) {
      case DrawingTool.PEN:
        const penShape = shape as PenShape;
        return (
          <Line
            key={shape.id}
            {...commonProps}
            points={penShape.points}
            stroke={penShape.style.stroke}
            strokeWidth={penShape.style.strokeWidth}
            lineCap={penShape.style.lineCap}
            lineJoin={penShape.style.lineJoin}
            tension={penShape.tension || 0.5}
            globalCompositeOperation="source-over"
          />
        );

      case DrawingTool.RECTANGLE:
        const rectShape = shape as RectShape;
        return (
          <Rect
            key={shape.id}
            {...commonProps}
            x={rectShape.x}
            y={rectShape.y}
            width={rectShape.width}
            height={rectShape.height}
            stroke={rectShape.style.stroke}
            strokeWidth={rectShape.style.strokeWidth}
            fill={rectShape.style.fill}
            cornerRadius={rectShape.cornerRadius}
          />
        );

      case DrawingTool.CIRCLE:
        const circleShape = shape as CircleShape;
        return (
          <Circle
            key={shape.id}
            {...commonProps}
            x={circleShape.x}
            y={circleShape.y}
            radiusX={circleShape.radiusX}
            radiusY={circleShape.radiusY}
            stroke={circleShape.style.stroke}
            strokeWidth={circleShape.style.strokeWidth}
            fill={circleShape.style.fill}
          />
        );

      case DrawingTool.ARROW:
        const arrowShape = shape as ArrowShape;
        return (
          <Arrow
            key={shape.id}
            {...commonProps}
            points={arrowShape.points}
            stroke={arrowShape.style.stroke}
            strokeWidth={arrowShape.style.strokeWidth}
            pointerLength={arrowShape.pointerLength}
            pointerWidth={arrowShape.pointerWidth}
          />
        );

      case DrawingTool.TEXT:
        const textShape = shape as TextShape;
        return (
          <Text
            key={shape.id}
            {...commonProps}
            x={textShape.x}
            y={textShape.y}
            text={textShape.text}
            fontSize={textShape.fontSize}
            fontFamily={textShape.fontFamily}
            fontStyle={textShape.fontStyle}
            fill={textShape.style.stroke}
            align={textShape.align}
            width={textShape.width}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Layer>
      {/* Render all shapes in z-order */}
      {getSortedShapes().map(renderShape)}
      
      {/* Render temporary drawing preview */}
      {renderTempDrawing()}
    </Layer>
  );
};