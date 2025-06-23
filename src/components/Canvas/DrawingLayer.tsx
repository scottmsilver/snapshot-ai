import React, { useEffect, useRef, useState } from 'react';
import { Layer, Line, Rect, Circle, Arrow, Text, Transformer, Group, Path, RegularPolygon } from 'react-konva';
import Konva from 'konva';
import { useDrawing } from '@/hooks/useDrawing';
import { useSelectionMachine } from '@/hooks/useSelectionMachine';
import { DrawingTool } from '@/types/drawing';
import type { Shape, PenShape, RectShape, CircleShape, ArrowShape, TextShape, CalloutShape, Point } from '@/types/drawing';
import { 
  perimeterOffsetToPoint, 
  getArrowPathString, 
  calculateArrowHeadRotation, 
  pointToPerimeterOffset, 
  calculateInitialPerimeterOffset,
  autoAdjustControlPoint,
  isValidControlPoint,
  getOptimalControlPoints
} from '@/utils/calloutGeometry';

interface DrawingLayerProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  onTextClick?: (position: Point) => void;
}

export const DrawingLayer: React.FC<DrawingLayerProps> = ({ stageRef, onTextClick }) => {
  const {
    activeTool,
    currentStyle,
    isDrawing,
    shapes,
    tempPoints,
    startDrawing,
    continueDrawing,
    finishDrawing,
    getSortedShapes,
    updateShape,
    deleteSelected,
    selectMultiple,
    selectedShapeIds: drawingSelectedShapeIds,
    selectShape,
    clearSelection,
  } = useDrawing();
  
  const {
    context: selectionContext,
    handleShapeClick,
    handleEmptyClick,
    handleShapeHover,
    startDragSelection,
    updateDragSelection,
    endDragSelection,
    startDragShape,
    updateDragShape,
    endDragShape,
    cancelDrag,
    selectedShapeIds,
    hoveredShapeId,
    selectionBox,
    isDragSelecting,
    isDraggingShape,
    isTransforming,
    startTransform,
    endTransform,
    startControlPointDrag,
    endControlPointDrag,
    isDraggingControlPoint,
  } = useSelectionMachine();
  
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectedShapeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const isTransformingRef = useRef(false);
  const isDraggingControlPointRef = useRef(false);
  const [draggedArrowId, setDraggedArrowId] = useState<string | null>(null);
  const [, forceUpdate] = useState({});
  const justFinishedDraggingRef = useRef(false);
  
  // Track which control point is being dragged (0 = start, 1 = end)
  const [_draggingControlPointIndex, setDraggingControlPointIndex] = useState<number | null>(null);

  // Log selection changes for debugging
  useEffect(() => {
  }, [drawingSelectedShapeIds]);

  // Update transformer when selection changes
  useEffect(() => {
    if (transformerRef.current) {
      const nodes: Konva.Node[] = [];
      drawingSelectedShapeIds.forEach(id => {
        const shape = shapes.find(s => s.id === id);
        if (shape?.type === DrawingTool.CALLOUT) {
          // For callouts, only transform the text box rect
          const rectNode = selectedShapeRefs.current.get(id + '_textbox');
          if (rectNode) {
            nodes.push(rectNode);
          }
        } else {
          // For other shapes, transform the whole shape
          const node = selectedShapeRefs.current.get(id);
          if (node) {
            nodes.push(node);
          }
        }
      });
      transformerRef.current.nodes(nodes);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [drawingSelectedShapeIds, shapes]);
  
  // Force updates while dragging arrow
  useEffect(() => {
    if (!draggedArrowId) return;
    
    let animationId: number;
    const updateFrame = () => {
      forceUpdate({});
      animationId = requestAnimationFrame(updateFrame);
    };
    
    animationId = requestAnimationFrame(updateFrame);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [draggedArrowId]);

  // Set up mouse event handlers
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Check if clicking on empty space (no shape)
      const clickedOnEmpty = e.target === stage || 
                           e.target.getLayer() === stage.findOne('Layer') ||
                           e.target.getClassName() === 'Layer';
      
      // Check if clicking on transformer or its anchors
      const targetName = e.target.name?.() || '';
      const targetClass = e.target.getClassName?.() || '';
      const isTransformerClick = targetClass === 'Transformer' || 
                                targetName.includes('_anchor') ||
                                targetName.includes('rotater');
      
      
      if (activeTool === DrawingTool.SELECT) {
        if (clickedOnEmpty && !isTransformerClick && !isDraggingControlPoint) {
          // Check if we should start drag selection
          if (e.evt.button === 0) { // Left mouse button
            startDragSelection(pos);
          }
        } else if (!isTransformerClick && e.target.id() && !isDraggingControlPoint) {
          // Shape clicks and dragging are handled by the shape's event handlers
        }
        return;
      }

      if (activeTool === DrawingTool.TEXT) {
        // For text tool, notify parent to show dialog
        if (clickedOnEmpty && onTextClick) {
          onTextClick(pos);
        }
        return;
      }
      

      if (clickedOnEmpty) {
        startDrawing(pos, e.evt as any);
      }
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
      const pos = stage.getPointerPosition();
      if (!pos) return;

      if (activeTool === DrawingTool.SELECT) {
        // Handle hover
        const target = e.target;
        if (target && target.id() && target.getClassName() !== 'Transformer' && !isDraggingControlPoint) {
          handleShapeHover(target.id());
        } else if (!isDraggingControlPoint) {
          handleShapeHover(null);
        }
        
        // Handle drag operations
        if (isDragSelecting && !isDraggingControlPoint) {
          updateDragSelection(pos, shapes);
        }
        // Shape dragging is now handled by Konva's native dragging
      } else if (isDrawing) {
        continueDrawing(pos, e.evt as any);
      }
    };

    const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
      
      // Check if we clicked on transformer anchors or control points
      const target = e.target;
      const targetName = target.name?.() || '';
      const targetClass = target.getClassName?.() || '';
      const isTransformerClick = targetClass === 'Transformer' || 
                                targetName.includes('_anchor') ||
                                targetName.includes('rotater');
      
      // Check if this is a control point (they're Circle shapes that are draggable)
      const isControlPoint = targetClass === 'Circle' && target.draggable() && 
                            target.getAttr('fill') && (target.getAttr('fill') === '#4a90e2' || target.getAttr('fill') === '#e24a4a');
      
      if (isTransformerClick || isControlPoint) {
        // Don't process mouseup from transformer handles or control points
        return;
      }
      
      if (activeTool === DrawingTool.SELECT) {
        if (isDragSelecting) {
          endDragSelection();
        } else if (isDraggingShape) {
          endDragShape();
          // Also set the flag here for drag selection
          justFinishedDraggingRef.current = true;
          setTimeout(() => {
            justFinishedDraggingRef.current = false;
          }, 100);
        } else if (isTransformingRef.current) {
          // Don't deselect when finishing a transform
          return;
        } else if (isDraggingControlPoint || isDraggingControlPointRef.current) {
          // Don't deselect when finishing control point drag
          return;
        } else if (e.target === stage || (e.target.getLayer() && e.target.getClassName() === 'Layer')) {
          // Click on empty space (not drag)
          // Don't clear selection if we just finished dragging
          if (!justFinishedDraggingRef.current) {
            clearSelection();
          }
        }
      } else if (isDrawing) {
        const pos = stage.getPointerPosition();
        finishDrawing(pos || undefined, e.evt as any);
      }
      
      // Control point dragging is handled by state machine
    };

    // Add event listeners
    stage.on('mousedown touchstart', handleMouseDown);
    stage.on('mousemove touchmove', handleMouseMove);
    stage.on('mouseup touchend', handleMouseUp);
    
    // Keyboard handler for escape and delete
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'Escape') {
        if (isDragSelecting || isDraggingShape) {
          cancelDrag();
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && drawingSelectedShapeIds.length > 0) {
        e.preventDefault();
        deleteSelected();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      stage.off('mousedown touchstart', handleMouseDown);
      stage.off('mousemove touchmove', handleMouseMove);
      stage.off('mouseup touchend', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    stageRef,
    activeTool,
    isDrawing,
    shapes,
    startDrawing,
    continueDrawing,
    finishDrawing,
    handleShapeClick,
    handleEmptyClick,
    handleShapeHover,
    startDragSelection,
    updateDragSelection,
    endDragSelection,
    startDragShape,
    updateDragShape,
    endDragShape,
    cancelDrag,
    isDragSelecting,
    isDraggingShape,
    isTransforming,
    startTransform,
    endTransform,
    drawingSelectedShapeIds,
    selectionContext,
    updateShape,
    deleteSelected,
    isDraggingControlPoint,
    startControlPointDrag,
    endControlPointDrag,
    onTextClick,
    selectShape,
    clearSelection,
    selectedShapeIds,
    selectMultiple,
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
        // Calculate distance from start point to end point
        const dx = circleEnd.x - circleStart.x;
        const dy = circleEnd.y - circleStart.y;
        // Use the larger dimension to create a perfect circle
        const radius = Math.max(Math.abs(dx), Math.abs(dy)) / 2;
        // Center based on the start point and the direction of drag
        const centerX = circleStart.x + (dx > 0 ? radius : -radius);
        const centerY = circleStart.y + (dy > 0 ? radius : -radius);
        
        return (
          <Circle
            x={centerX}
            y={centerY}
            radius={radius}
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

      case DrawingTool.CALLOUT:
        if (tempPoints.length < 2) return null;
        const calloutStart = tempPoints[0]; // Arrow tip (what we're pointing at)
        const calloutEnd = tempPoints[1];   // Where text box will be
        
        // Calculate text box dimensions and position
        const textPadding = 10;
        const textWidth = 120;
        const textHeight = 40;
        const bgWidth = textWidth;
        const bgHeight = textHeight;
        
        // Calculate text box position based on drag
        const minDistance = 50;
        const calloutDx = calloutEnd.x - calloutStart.x;
        const calloutDy = calloutEnd.y - calloutStart.y;
        const distance = Math.sqrt(calloutDx * calloutDx + calloutDy * calloutDy);
        
        let textX: number, textY: number;
        
        if (distance < minDistance) {
          // If drag is too short, position with minimum distance
          const angle = Math.atan2(calloutDy, calloutDx);
          textX = calloutStart.x + Math.cos(angle) * minDistance - bgWidth / 2;
          textY = calloutStart.y + Math.sin(angle) * minDistance - bgHeight / 2;
        } else {
          // Position text box centered at cursor
          textX = calloutEnd.x - bgWidth / 2;
          textY = calloutEnd.y - bgHeight / 2;
        }
        
        // Calculate perimeter-based arrow for preview
        const previewTextBox = {
          x: textX,
          y: textY,
          width: bgWidth,
          height: bgHeight
        };
        const previewPerimeterOffset = calculateInitialPerimeterOffset(previewTextBox, calloutStart);
        const previewBasePoint = perimeterOffsetToPoint(previewTextBox, previewPerimeterOffset);
        const previewControlPoints = getOptimalControlPoints(previewBasePoint, calloutStart, previewTextBox);
        
        return (
          <Group>
            {/* Background rectangle */}
            <Rect
              x={textX}
              y={textY}
              width={bgWidth}
              height={bgHeight}
              fill="#ffffff"
              stroke={currentStyle.stroke}
              strokeWidth={currentStyle.strokeWidth}
              cornerRadius={4}
              opacity={0.8}
              shadowColor="rgba(0, 0, 0, 0.1)"
              shadowBlur={3}
              shadowOffset={{ x: 1, y: 1 }}
              listening={false}
            />
            
            {/* Curved arrow using Path */}
            <Path
              data={getArrowPathString(
                previewBasePoint,
                previewControlPoints.control1,
                previewControlPoints.control2,
                calloutStart  // Arrow points to start point
              )}
              stroke={currentStyle.stroke}
              strokeWidth={currentStyle.strokeWidth}
              opacity={currentStyle.opacity}
              listening={false}
            />
            
            {/* Arrow head */}
            <RegularPolygon
              sides={3}
              radius={5}
              x={calloutStart.x}  // Arrow head at start point
              y={calloutStart.y}
              rotation={calculateArrowHeadRotation(previewControlPoints.control2, calloutStart)}
              fill={currentStyle.stroke}
              listening={false}
            />
            
            {/* Text preview */}
            <Text
              x={textX + textPadding}
              y={textY + textPadding}
              text="Callout"
              fontSize={16}
              fontFamily={currentStyle.fontFamily || 'Arial'}
              fill={currentStyle.stroke}
              width={textWidth - textPadding * 2}
              listening={false}
            />
          </Group>
        );

      default:
        return null;
    }
  };

  // Render a shape based on its type
  const renderShape = (shape: Shape) => {
    const isSelected = drawingSelectedShapeIds.includes(shape.id);
    const isHovered = hoveredShapeId === shape.id && activeTool === DrawingTool.SELECT;
    
    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const newPosition = node.position();
      
      // Update shape position based on its type
      if (shape.type === DrawingTool.PEN || shape.type === DrawingTool.ARROW) {
        // For pen and arrow shapes, we need to update the points array
        const dx = newPosition.x;
        const dy = newPosition.y;
        
        if ('points' in shape && Array.isArray(shape.points)) {
          const newPoints = [...shape.points];
          // Update all points by the drag offset
          for (let i = 0; i < newPoints.length; i += 2) {
            newPoints[i] += dx;
            newPoints[i + 1] += dy;
          }
          updateShape(shape.id, { points: newPoints });
          
          // Reset the node position since we updated the points
          node.position({ x: 0, y: 0 });
        }
      } else if (shape.type === DrawingTool.CALLOUT) {
        // For callout shapes, only update text position - arrow tip stays anchored
        const calloutShape = shape as CalloutShape;
        console.log('First handleDragEnd for callout - skipping, will handle in commonProps');
        
        // This will be handled in the onDragEnd of commonProps
        // Don't reset position here - we need it in the second handler
      } else {
        // For other shapes, update x/y position
        updateShape(shape.id, { 
          x: newPosition.x, 
          y: newPosition.y 
        });
      }
    };
    
    const commonProps = {
      id: shape.id,
      opacity: shape.style.opacity,
      visible: shape.visible,
      listening: true,
      draggable: activeTool === DrawingTool.SELECT && !isDraggingControlPoint,
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (activeTool === DrawingTool.SELECT) {
          const isSelected = drawingSelectedShapeIds.includes(shape.id);
          
          // Don't handle click if we're dragging or if drag distance was significant
          const node = e.target;
          const wasDragged = node.attrs._wasDragged;
          if (isDraggingShape || wasDragged) {
            node.setAttrs({ _wasDragged: false });
            return;
          }
          
          if (!isSelected || e.evt.ctrlKey || e.evt.metaKey) {
            // Use DrawingContext's selection
            if (e.evt.ctrlKey || e.evt.metaKey || e.evt.shiftKey) {
              // Multi-select: toggle selection
              if (isSelected) {
                selectMultiple(drawingSelectedShapeIds.filter(id => id !== shape.id));
              } else {
                selectMultiple([...drawingSelectedShapeIds, shape.id]);
              }
            } else {
              // Single select
              selectShape(shape.id);
            }
          }
        }
      },
      onTap: (_e: Konva.KonvaEventObject<MouseEvent>) => {
        // Don't cancel bubble - let it reach stage mousedown handler
      },
      onMouseUp: (e: Konva.KonvaEventObject<MouseEvent>) => {
        // Cancel bubble to prevent stage mouseup when releasing on a shape after drag
        if (justFinishedDraggingRef.current) {
          e.cancelBubble = true;
        }
      },
      onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
        const isSelected = drawingSelectedShapeIds.includes(shape.id);
        
        // Track arrow dragging
        if (shape.type === DrawingTool.ARROW) {
          setDraggedArrowId(shape.id);
        }
        
        // If shape is not selected, select it first
        if (!isSelected) {
          selectShape(shape.id);
        }
        
        const pos = e.target.getStage()?.getPointerPosition();
        if (pos && !isDraggingShape) {
          startDragShape(pos, shapes);
        }
        
        // Store initial positions for multi-drag
        if (drawingSelectedShapeIds.length > 1 || (!isSelected && !e.evt.ctrlKey && !e.evt.metaKey)) {
          e.target.setAttrs({ _dragStartX: e.target.x(), _dragStartY: e.target.y() });
        }
      },
      onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
        const node = e.target;
        
        // Real-time update for callout dragging - arrow "stretches" like a rubber band
        if (shape.type === DrawingTool.CALLOUT && drawingSelectedShapeIds.length === 1) {
          const pos = node.position();
          console.log('Callout drag move:', { nodeId: node.id(), x: pos.x, y: pos.y });
          // Force a re-render to update the arrow path based on group position
          forceUpdate({});
        }
        
        // Force update for arrow dragging
        if (shape.type === DrawingTool.ARROW) {
          // The animation frame in useEffect will handle updates
        }
        
        // Mark that drag occurred (to prevent click after drag)
        const dragDistance = Math.abs(node.x() - (node.attrs._dragStartX || node.x())) + 
                           Math.abs(node.y() - (node.attrs._dragStartY || node.y()));
        if (dragDistance > 2) {
          node.setAttrs({ _wasDragged: true });
        }
        
        // Handle multi-shape dragging
        if (drawingSelectedShapeIds.length > 1) {
          const dx = node.x() - (node.attrs._dragStartX || node.x());
          const dy = node.y() - (node.attrs._dragStartY || node.y());
          
          // Move other selected shapes by the same amount
          drawingSelectedShapeIds.forEach(id => {
            if (id !== shape.id) {
              const otherNode = selectedShapeRefs.current.get(id);
              if (otherNode) {
                const initialPos = selectionContext.initialShapePositions.get(id);
                if (initialPos) {
                  otherNode.position({
                    x: initialPos.x + dx,
                    y: initialPos.y + dy
                  });
                }
              }
            }
          });
        }
      },
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
        
        // Prevent the event from bubbling to stage
        e.cancelBubble = true;
        
        handleDragEnd(e);
        
        // Set flag to prevent deselection on mouse up
        justFinishedDraggingRef.current = true;
        setTimeout(() => {
          justFinishedDraggingRef.current = false;
        }, 100);
        
        // Clear arrow dragging state
        if (shape.type === DrawingTool.ARROW) {
          setDraggedArrowId(null);
        }
        
        // Handle multi-shape drag end
        if (drawingSelectedShapeIds.length > 1) {
          const dx = e.target.x() - (e.target.attrs._dragStartX || e.target.x());
          const dy = e.target.y() - (e.target.attrs._dragStartY || e.target.y());
          
          // Update positions for all other selected shapes
          drawingSelectedShapeIds.forEach(id => {
            if (id !== shape.id) {
              const otherShape = shapes.find(s => s.id === id);
              const otherNode = selectedShapeRefs.current.get(id);
              
              if (otherShape && otherNode) {
                if (otherShape.type === DrawingTool.PEN || otherShape.type === DrawingTool.ARROW) {
                  // For pen and arrow shapes, update points
                  if ('points' in otherShape && Array.isArray(otherShape.points)) {
                    const newPoints = [...otherShape.points];
                    for (let i = 0; i < newPoints.length; i += 2) {
                      newPoints[i] += dx;
                      newPoints[i + 1] += dy;
                    }
                    updateShape(id, { points: newPoints });
                    otherNode.position({ x: 0, y: 0 });
                  }
                } else if (otherShape.type === DrawingTool.CALLOUT) {
                  // For callout shapes in multi-selection, move everything including arrow tip
                  const calloutShape = otherShape as CalloutShape;
                  const updates: Partial<CalloutShape> = {
                    textX: calloutShape.textX + dx,
                    textY: calloutShape.textY + dy,
                    arrowX: calloutShape.arrowX + dx,
                    arrowY: calloutShape.arrowY + dy
                  };
                  
                  // Update control points if they exist
                  if (calloutShape.curveControl1X !== undefined && calloutShape.curveControl1Y !== undefined) {
                    updates.curveControl1X = calloutShape.curveControl1X + dx;
                    updates.curveControl1Y = calloutShape.curveControl1Y + dy;
                  }
                  if (calloutShape.curveControl2X !== undefined && calloutShape.curveControl2Y !== undefined) {
                    updates.curveControl2X = calloutShape.curveControl2X + dx;
                    updates.curveControl2Y = calloutShape.curveControl2Y + dy;
                  }
                  
                  updateShape(id, updates);
                  otherNode.position({ x: 0, y: 0 });
                } else {
                  // For other shapes, update position
                  const newPos = otherNode.position();
                  updateShape(id, { x: newPos.x, y: newPos.y });
                }
              }
            }
          });
        }
        
        // Handle single shape drag for special shape types
        if (drawingSelectedShapeIds.length === 1 && shape.id === drawingSelectedShapeIds[0]) {
          if (shape.type === DrawingTool.CALLOUT) {
            // For callouts, only move the text box - arrow tip stays anchored
            const calloutShape = shape as CalloutShape;
            
            // Get the group node position
            const groupNode = selectedShapeRefs.current.get(shape.id);
            console.log('Callout drag end - groupNode:', groupNode?.id());
            if (!groupNode) return;
            
            const groupPos = groupNode.position();
            const dx = groupPos.x;
            const dy = groupPos.y;
            console.log('Callout drag end - position:', { dx, dy });
            
            // Calculate new text box position
            const newTextX = calloutShape.textX + dx;
            const newTextY = calloutShape.textY + dy;
            console.log('Callout drag end - new text position:', { newTextX, newTextY, oldX: calloutShape.textX, oldY: calloutShape.textY });
            
            // Recalculate optimal control points for the new text box position
            const newTextBox = {
              x: newTextX,
              y: newTextY,
              width: calloutShape.textWidth || 120,
              height: calloutShape.textHeight || 40
            };
            
            const arrowTip = { x: calloutShape.arrowX, y: calloutShape.arrowY };
            
            // Recalculate the optimal perimeter offset for the new text box position
            // This makes the arrow "string" connect to the best point on the text box
            const newPerimeterOffset = calculateInitialPerimeterOffset(newTextBox, arrowTip);
            const newBasePoint = perimeterOffsetToPoint(newTextBox, newPerimeterOffset);
            const newControlPoints = getOptimalControlPoints(newBasePoint, arrowTip, newTextBox);
            
            console.log('Callout drag end - updating shape with:', {
              textX: newTextX,
              textY: newTextY,
              perimeterOffset: newPerimeterOffset,
              control1: newControlPoints.control1,
              control2: newControlPoints.control2
            });
            
            updateShape(shape.id, {
              textX: newTextX,
              textY: newTextY,
              // Arrow tip stays the same - only the "string" stretches and adjusts
              perimeterOffset: newPerimeterOffset,
              curveControl1X: newControlPoints.control1.x,
              curveControl1Y: newControlPoints.control1.y,
              curveControl2X: newControlPoints.control2.x,
              curveControl2Y: newControlPoints.control2.y
            });
            
            // Reset group node position since we've updated the shape data
            console.log('Callout drag end - resetting group position to (0,0)');
            groupNode.position({ x: 0, y: 0 });
          } else {
            const node = e.target;
            const newPos = node.position();
            
            if (shape.type === DrawingTool.PEN || shape.type === DrawingTool.ARROW) {
              // For pen and arrow shapes, update points
              if ('points' in shape && Array.isArray(shape.points)) {
                const newPoints = [...shape.points];
                for (let i = 0; i < newPoints.length; i += 2) {
                  newPoints[i] += newPos.x;
                  newPoints[i + 1] += newPos.y;
                }
                updateShape(shape.id, { points: newPoints });
                node.position({ x: 0, y: 0 });
              }
            } else {
              // For other shapes (rect, circle, text), just update position
              updateShape(shape.id, { x: newPos.x, y: newPos.y });
              node.position({ x: 0, y: 0 });
            }
          }
        }
        
        if (isDraggingShape) {
          endDragShape();
        }
        
        // Clean up drag attributes
        e.target.setAttrs({ _dragStartX: undefined, _dragStartY: undefined });
      },
      // Change cursor when hovering over shapes
      onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (stage && activeTool === DrawingTool.SELECT) {
          stage.container().style.cursor = isSelected ? 'move' : 'pointer';
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
            strokeWidth={penShape.style.strokeWidth * (isHovered && !isSelected ? 1.2 : 1)}
            lineCap={penShape.style.lineCap}
            lineJoin={penShape.style.lineJoin}
            tension={penShape.tension || 0.5}
            globalCompositeOperation="source-over"
            hitStrokeWidth={Math.max(penShape.style.strokeWidth, 10)}
            ref={(node) => {
              if (node) {
                // Add custom getSelfRect for line to help Transformer
                node.getSelfRect = function() {
                  const points = this.points();
                  if (!points || points.length < 2) {
                    return { x: 0, y: 0, width: 0, height: 0 };
                  }
                  
                  let minX = Infinity, minY = Infinity;
                  let maxX = -Infinity, maxY = -Infinity;
                  
                  for (let i = 0; i < points.length; i += 2) {
                    minX = Math.min(minX, points[i]);
                    maxX = Math.max(maxX, points[i]);
                    minY = Math.min(minY, points[i + 1]);
                    maxY = Math.max(maxY, points[i + 1]);
                  }
                  
                  // Add padding based on stroke width
                  const strokeWidth = this.strokeWidth() || 1;
                  const padding = strokeWidth * 2;
                  
                  return {
                    x: minX - padding,
                    y: minY - padding,
                    width: maxX - minX + padding * 2,
                    height: maxY - minY + padding * 2
                  };
                };
                
                selectedShapeRefs.current.set(shape.id, node);
              } else {
                selectedShapeRefs.current.delete(shape.id);
              }
            }}
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
            strokeWidth={rectShape.style.strokeWidth * (isHovered && !isSelected ? 1.2 : 1)}
            fill={rectShape.style.fill}
            cornerRadius={rectShape.cornerRadius}
            rotation={rectShape.rotation || 0}
            ref={(node) => {
              if (node) {
                selectedShapeRefs.current.set(shape.id, node);
              } else {
                selectedShapeRefs.current.delete(shape.id);
              }
            }}
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
            radius={circleShape.radiusX} // Use radiusX as the radius (they should be equal for circles)
            stroke={circleShape.style.stroke}
            strokeWidth={circleShape.style.strokeWidth * (isHovered && !isSelected ? 1.2 : 1)}
            fill={circleShape.style.fill}
            rotation={circleShape.rotation || 0}
            ref={(node) => {
              if (node) {
                selectedShapeRefs.current.set(shape.id, node);
              } else {
                selectedShapeRefs.current.delete(shape.id);
              }
            }}
          />
        );

      case DrawingTool.ARROW:
        const arrowShape = shape as ArrowShape;
        // Get current points - either from dragging or from shape data
        const currentPoints = arrowShape.points;
        
        return (
          <Arrow
            key={shape.id}
            {...commonProps}
            points={currentPoints}
            stroke={arrowShape.style.stroke}
            strokeWidth={arrowShape.style.strokeWidth * (isHovered && !isSelected ? 1.2 : 1)}
            pointerLength={arrowShape.pointerLength}
            pointerWidth={arrowShape.pointerWidth}
            hitStrokeWidth={Math.max(arrowShape.style.strokeWidth, 10)}
            ref={(node) => {
              if (node) {
                // Add custom getSelfRect for arrow to help Transformer
                node.getSelfRect = function() {
                  const points = this.points();
                  if (!points || points.length < 4) {
                    return { x: 0, y: 0, width: 0, height: 0 };
                  }
                  
                  let minX = Infinity, minY = Infinity;
                  let maxX = -Infinity, maxY = -Infinity;
                  
                  for (let i = 0; i < points.length; i += 2) {
                    minX = Math.min(minX, points[i]);
                    maxX = Math.max(maxX, points[i]);
                    minY = Math.min(minY, points[i + 1]);
                    maxY = Math.max(maxY, points[i + 1]);
                  }
                  
                  // Add padding for the arrow head
                  const pointerLength = this.pointerLength() || 10;
                  const pointerWidth = this.pointerWidth() || 10;
                  const padding = Math.max(pointerLength, pointerWidth);
                  
                  return {
                    x: minX - padding,
                    y: minY - padding,
                    width: maxX - minX + padding * 2,
                    height: maxY - minY + padding * 2
                  };
                };
                
                selectedShapeRefs.current.set(shape.id, node);
              } else {
                selectedShapeRefs.current.delete(shape.id);
              }
            }}
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
            rotation={textShape.rotation || 0}
            ref={(node) => {
              if (node) {
                selectedShapeRefs.current.set(shape.id, node);
              } else {
                selectedShapeRefs.current.delete(shape.id);
              }
            }}
          />
        );

      case DrawingTool.CALLOUT:
        const calloutShape = shape as CalloutShape;
        
        // Calculate text dimensions
        const textPadding = calloutShape.padding;
        const bgWidth = calloutShape.textWidth || 120;
        const bgHeight = calloutShape.textHeight || 40;
        
        // Get the current group position (for drag preview)
        const groupNode = selectedShapeRefs.current.get(shape.id);
        const groupPos = groupNode ? groupNode.position() : { x: 0, y: 0 };
        
        if (groupPos.x !== 0 || groupPos.y !== 0) {
          console.log('Callout render - group position:', groupPos, 'shape text pos:', { x: calloutShape.textX, y: calloutShape.textY });
        }
        
        // Calculate arrow base point from perimeter offset
        // Account for group position during drag
        const textBox = {
          x: calloutShape.textX + groupPos.x,
          y: calloutShape.textY + groupPos.y,
          width: bgWidth,
          height: bgHeight
        };
        
        // Recalculate perimeter offset for current position
        const arrowTip = {
          x: calloutShape.arrowX,
          y: calloutShape.arrowY
        };
        
        const currentPerimeterOffset = calculateInitialPerimeterOffset(textBox, arrowTip);
        const basePoint = perimeterOffsetToPoint(textBox, currentPerimeterOffset);
        
        // Calculate optimal control points for current positions
        const optimalPoints = getOptimalControlPoints(basePoint, arrowTip, textBox);
        const control1 = optimalPoints.control1;
        const control2 = optimalPoints.control2;
        
        return (
          <Group
            key={shape.id}
            {...commonProps}
            ref={(node) => {
              if (node) {
                selectedShapeRefs.current.set(shape.id, node);
              } else {
                selectedShapeRefs.current.delete(shape.id);
              }
            }}
          >
            {/* Background rectangle - registered separately for transformer */}
            <Rect
              id={shape.id + '_textbox'}
              x={calloutShape.textX}
              y={calloutShape.textY}
              width={bgWidth}
              height={bgHeight}
              fill={calloutShape.backgroundColor || '#ffffff'}
              stroke={calloutShape.style.stroke}
              strokeWidth={calloutShape.style.strokeWidth}
              cornerRadius={calloutShape.borderRadius || 4}
              shadowColor="rgba(0, 0, 0, 0.1)"
              shadowBlur={3}
              shadowOffset={{ x: 1, y: 1 }}
              ref={(node) => {
                if (node) {
                  selectedShapeRefs.current.set(shape.id + '_textbox', node);
                } else {
                  selectedShapeRefs.current.delete(shape.id + '_textbox');
                }
              }}
              onTransform={(e) => {
                // When the text box is transformed, update the callout shape
                const node = e.target;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                
                // Reset scale on node
                node.scaleX(1);
                node.scaleY(1);
                
                // Apply scale to shape data
                const newWidth = Math.max(50, node.width() * scaleX);
                const newHeight = Math.max(30, node.height() * scaleY);
                const newX = node.x();
                const newY = node.y();
                
                // Recalculate arrow base point for new text box position
                const newTextBox = {
                  x: newX,
                  y: newY,
                  width: newWidth,
                  height: newHeight
                };
                
                const newBasePoint = perimeterOffsetToPoint(newTextBox, calloutShape.perimeterOffset);
                const newControlPoints = getOptimalControlPoints(
                  newBasePoint,
                  { x: calloutShape.arrowX, y: calloutShape.arrowY },
                  newTextBox
                );
                
                updateShape(shape.id, {
                  textX: newX,
                  textY: newY,
                  textWidth: newWidth,
                  textHeight: newHeight,
                  curveControl1X: newControlPoints.control1.x,
                  curveControl1Y: newControlPoints.control1.y,
                  curveControl2X: newControlPoints.control2.x,
                  curveControl2Y: newControlPoints.control2.y
                });
              }}
            />
            
            {/* Curved arrow using Path with cubic Bezier */}
            {/* Subtract group position to keep arrow tip anchored */}
            <Path
              data={getArrowPathString(
                { x: basePoint.x - groupPos.x, y: basePoint.y - groupPos.y },
                { x: control1.x - groupPos.x, y: control1.y - groupPos.y },
                { x: control2.x - groupPos.x, y: control2.y - groupPos.y },
                { x: arrowTip.x - groupPos.x, y: arrowTip.y - groupPos.y }
              )}
              stroke={calloutShape.style.stroke}
              strokeWidth={calloutShape.style.strokeWidth}
              opacity={calloutShape.style.opacity}
              listening={false}
            />
            
            {/* Arrow head - also subtract group position */}
            <RegularPolygon
              sides={3}
              radius={5}
              x={arrowTip.x - groupPos.x}
              y={arrowTip.y - groupPos.y}
              rotation={calculateArrowHeadRotation(control2, arrowTip)}
              fill={calloutShape.style.stroke}
              listening={false}
            />
            
            {/* Text */}
            <Text
              x={calloutShape.textX + textPadding}
              y={calloutShape.textY + textPadding}
              text={calloutShape.text}
              fontSize={calloutShape.fontSize}
              fontFamily={calloutShape.fontFamily}
              fill={calloutShape.style.stroke}
              width={bgWidth - textPadding * 2}
              listening={false}
            />
          </Group>
        );
        
      default:
        return null;
    }
  };

  // Render arrow control points
  const renderArrowControlPoints = () => {
    
    if (activeTool !== DrawingTool.SELECT || drawingSelectedShapeIds.length !== 1) {
      return null;
    }

    const selectedShape = shapes.find(s => s.id === drawingSelectedShapeIds[0]);
    if (!selectedShape || selectedShape.type !== DrawingTool.ARROW) {
      return null;
    }
    
    // Don't show control points if we're transforming
    if (isTransforming) {
      return null;
    }
    
    // Force update when arrow is being dragged
    // This ensures control points follow the arrow

    const arrowShape = selectedShape as ArrowShape;
    const arrowNode = selectedShapeRefs.current.get(arrowShape.id);
    if (!arrowNode) return null;
    
    // Get the arrow's current position (changes during drag)
    const nodePos = arrowNode.position();
    const [x1, y1, x2, y2] = arrowShape.points;
    
    
    // Add the node's current position to get actual control point positions
    const actualX1 = x1 + nodePos.x;
    const actualY1 = y1 + nodePos.y;
    const actualX2 = x2 + nodePos.x;
    const actualY2 = y2 + nodePos.y;

    const handleControlPointDragMove = (index: number, e: Konva.KonvaEventObject<DragEvent>) => {
      const pos = e.target.position();
      const newPoints: [number, number, number, number] = [...arrowShape.points];
      
      // Subtract the arrow node's position to get relative coordinates
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
      
      // Update the arrow shape immediately for real-time feedback
      updateShape(arrowShape.id, { points: newPoints });
    };
    
    const handleControlPointDragEnd = (_index: number, _e: Konva.KonvaEventObject<DragEvent>) => {
      setTimeout(() => {
        isDraggingControlPointRef.current = false;
        endControlPointDrag();
      }, 50);
    };

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
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) {
              stage.container().style.cursor = 'move';
            }
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) {
              stage.container().style.cursor = 'default';
            }
          }}
        />
        
        {/* Head control point (red - arrow head where pointer is) */}
        {(() => {
          // Offset from arrow head
          const offsetDistance = 15;
          const dx = actualX2 - actualX1;
          const dy = actualY2 - actualY1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const offsetX = length > 0 ? (dx / length) * offsetDistance : offsetDistance;
          const offsetY = length > 0 ? (dy / length) * offsetDistance : 0;
          
          return (
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
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) {
              stage.container().style.cursor = 'move';
            }
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) {
              stage.container().style.cursor = 'default';
            }
          }}
        />
          );
        })()}
      </>
    );
  };

  // Render callout control points
  const renderCalloutControlPoints = () => {
    if (activeTool !== DrawingTool.SELECT || drawingSelectedShapeIds.length !== 1) {
      return null;
    }

    const selectedShape = shapes.find(s => s.id === drawingSelectedShapeIds[0]);
    if (!selectedShape || selectedShape.type !== DrawingTool.CALLOUT) {
      return null;
    }
    
    const calloutShape = selectedShape as CalloutShape;
    const calloutNode = selectedShapeRefs.current.get(calloutShape.id);
    if (!calloutNode) return null;
    
    // Get current position
    const nodePos = calloutNode.position();
    
    // Calculate actual positions
    const textBox = {
      x: calloutShape.textX + nodePos.x,
      y: calloutShape.textY + nodePos.y,
      width: calloutShape.textWidth || 120,
      height: calloutShape.textHeight || 40
    };
    
    const arrowTip = {
      x: calloutShape.arrowX + nodePos.x,
      y: calloutShape.arrowY + nodePos.y
    };
    
    // Get base point from perimeter offset
    const basePoint = perimeterOffsetToPoint(textBox, calloutShape.perimeterOffset);
    
    // Get control points - they are stored relative to the shape, not absolute
    let control1: Point, control2: Point;
    
    if (calloutShape.curveControl1X !== undefined && calloutShape.curveControl1Y !== undefined &&
        calloutShape.curveControl2X !== undefined && calloutShape.curveControl2Y !== undefined) {
      // Control points are stored in local coordinates, need to convert to global
      control1 = { x: calloutShape.curveControl1X, y: calloutShape.curveControl1Y };
      control2 = { x: calloutShape.curveControl2X, y: calloutShape.curveControl2Y };
    } else {
      // Calculate optimal points - these will be in global coordinates
      const optimalPoints = getOptimalControlPoints(basePoint, arrowTip, textBox);
      control1 = optimalPoints.control1;
      control2 = optimalPoints.control2;
    }

    return (
      <>
        {/* Arrow tip control (red) - offset from arrow head */}
        {(() => {
          // Calculate offset position to be tangent to arrow tip
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
          
          return (
            <>
              {/* Small line connecting handle to arrow tip */}
              <Line
                points={[handleX, handleY, arrowTip.x, arrowTip.y]}
                stroke="#e74c3c"
                strokeWidth={1}
                opacity={0.3}
                listening={false}
              />
              
              {/* Control handle */}
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
                  const dx = pos.x - handleX;
                  const dy = pos.y - handleY;
                  
                  // Update arrow tip position
                  const newArrowX = arrowTip.x + dx - nodePos.x;
                  const newArrowY = arrowTip.y + dy - nodePos.y;
                  
                  // Auto-adjust control points if needed
                  const newArrowTip = { x: newArrowX + nodePos.x, y: newArrowY + nodePos.y };
                  const newControlPoints = autoAdjustControlPoint(
                    basePoint,
                    newArrowTip,
                    control1,
                    control2,
                    textBox
                  );
                  
                  updateShape(calloutShape.id, {
                    arrowX: newArrowX,
                    arrowY: newArrowY,
                    curveControl1X: newControlPoints.control1.x - nodePos.x,
                    curveControl1Y: newControlPoints.control1.y - nodePos.y,
                    curveControl2X: newControlPoints.control2.x - nodePos.x,
                    curveControl2Y: newControlPoints.control2.y - nodePos.y
                  });
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  setTimeout(() => {
                    isDraggingControlPointRef.current = false;
                  }, 50);
                }}
                onMouseEnter={(e) => {
                  const stage = e.target.getStage();
                  if (stage) {
                    stage.container().style.cursor = 'move';
                  }
                }}
                onMouseLeave={(e) => {
                  const stage = e.target.getStage();
                  if (stage) {
                    stage.container().style.cursor = 'default';
                  }
                }}
              />
            </>
          );
        })()}
        
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
            const localTextBox = {
              x: calloutShape.textX,
              y: calloutShape.textY,
              width: calloutShape.textWidth || 120,
              height: calloutShape.textHeight || 40
            };
            const newOffset = pointToPerimeterOffset(localTextBox, { x: pos.x - nodePos.x, y: pos.y - nodePos.y });
            
            // Get new base point position
            const newBasePoint = perimeterOffsetToPoint(localTextBox, newOffset);
            const globalNewBase = { x: newBasePoint.x + nodePos.x, y: newBasePoint.y + nodePos.y };
            
            // Auto-adjust control points if needed
            const newControlPoints = autoAdjustControlPoint(
              globalNewBase,
              arrowTip,
              control1,
              control2,
              textBox
            );
            
            updateShape(calloutShape.id, {
              perimeterOffset: newOffset,
              curveControl1X: newControlPoints.control1.x - nodePos.x,
              curveControl1Y: newControlPoints.control1.y - nodePos.y,
              curveControl2X: newControlPoints.control2.x - nodePos.x,
              curveControl2Y: newControlPoints.control2.y - nodePos.y
            });
            
            // Snap the control point to the perimeter
            const snappedPoint = perimeterOffsetToPoint(localTextBox, newOffset);
            e.target.position({ x: snappedPoint.x + nodePos.x, y: snappedPoint.y + nodePos.y });
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            setTimeout(() => {
              isDraggingControlPointRef.current = false;
            }, 50);
          }}
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) {
              stage.container().style.cursor = 'move';
            }
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) {
              stage.container().style.cursor = 'default';
            }
          }}
        />
        
        {/* Curve control point 1 (blue - closer to base) */}
        <Circle
          x={control1.x + nodePos.x}
          y={control1.y + nodePos.y}
          radius={5}
          fill="#3498db"
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
            updateShape(calloutShape.id, {
              curveControl1X: pos.x - nodePos.x,
              curveControl1Y: pos.y - nodePos.y
            });
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            setTimeout(() => {
              isDraggingControlPointRef.current = false;
            }, 50);
          }}
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) {
              stage.container().style.cursor = 'move';
            }
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) {
              stage.container().style.cursor = 'default';
            }
          }}
        />
        
        {/* Curve control point 2 (purple - closer to tip) */}
        <Circle
          x={control2.x + nodePos.x}
          y={control2.y + nodePos.y}
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
          onDragMove={(e) => {
            const pos = e.target.position();
            updateShape(calloutShape.id, {
              curveControl2X: pos.x - nodePos.x,
              curveControl2Y: pos.y - nodePos.y
            });
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            setTimeout(() => {
              isDraggingControlPointRef.current = false;
            }, 50);
          }}
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) {
              stage.container().style.cursor = 'move';
            }
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) {
              stage.container().style.cursor = 'default';
            }
          }}
        />
        
        {/* Visual guides */}
        {(() => {
          const isValid = isValidControlPoint(basePoint, control1, control2, arrowTip, textBox);
          const guideColor = isValid ? "#3498db" : "#e74c3c";
          
          return (
            <>
              <Line
                points={[basePoint.x, basePoint.y, control1.x + nodePos.x, control1.y + nodePos.y]}
                stroke={guideColor}
                strokeWidth={1}
                dash={[5, 5]}
                opacity={0.5}
                listening={false}
              />
              <Line
                points={[control1.x + nodePos.x, control1.y + nodePos.y, control2.x + nodePos.x, control2.y + nodePos.y]}
                stroke={guideColor}
                strokeWidth={1}
                dash={[5, 5]}
                opacity={0.5}
                listening={false}
              />
              <Line
                points={[control2.x + nodePos.x, control2.y + nodePos.y, arrowTip.x, arrowTip.y]}
                stroke={guideColor}
                strokeWidth={1}
                dash={[5, 5]}
                opacity={0.5}
                listening={false}
              />
            </>
          );
        })()}
      </>
    );
  };

  return (
    <Layer>
      {/* Render all shapes in z-order */}
      {getSortedShapes().map(renderShape)}
      
      {/* Render temporary drawing preview */}
      {renderTempDrawing()}
      
      {/* Render selection rectangle */}
      {isDragSelecting && selectionBox.visible && (
        <Rect
          x={selectionBox.x}
          y={selectionBox.y}
          width={selectionBox.width}
          height={selectionBox.height}
          fill="rgba(74, 144, 226, 0.1)"
          stroke="#4a90e2"
          strokeWidth={1}
          dash={[5, 5]}
          listening={false}
        />
      )}
      
      {/* Render transformer for selected shapes */}
      {activeTool === DrawingTool.SELECT && drawingSelectedShapeIds.length > 0 && (
        <Transformer
          key={drawingSelectedShapeIds.join(',')}
          ref={transformerRef}
          borderEnabled={true}
          borderStroke="#4a90e2"
          borderStrokeWidth={1}
          borderDash={[4, 4]}
          anchorFill="white"
          anchorStroke="#4a90e2"
          anchorStrokeWidth={2}
          anchorSize={8}
          rotateEnabled={true}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
          ignoreStroke={false}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            // Check if any selected shape is a circle
            const hasCircle = drawingSelectedShapeIds.some(id => {
              const shape = shapes.find(s => s.id === id);
              return shape?.type === DrawingTool.CIRCLE;
            });
            
            // For circles, maintain aspect ratio
            if (hasCircle && drawingSelectedShapeIds.length === 1) {
              const size = Math.max(newBox.width, newBox.height);
              return {
                ...newBox,
                width: size,
                height: size
              };
            }
            
            // Prevent negative width/height which can cause issues with arrows
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
          onTransformStart={() => {
            isTransformingRef.current = true;
            startTransform();
            
          }}
          onTransform={() => {
            // Live update during transform - optional for visual feedback
            const nodes = transformerRef.current?.nodes();
            if (nodes) {
              nodes.forEach(node => {
                node.getLayer()?.batchDraw();
              });
            }
          }}
          onTransformEnd={(_e) => {
            // End transform state
            setTimeout(() => {
              isTransformingRef.current = false;
              endTransform();
            }, 50); // Small delay to ensure mouseup is processed first
            
            // Get transformed nodes from the transformer
            const nodes = transformerRef.current?.nodes();
            if (!nodes || nodes.length === 0) return;
            
            nodes.forEach(node => {
              if (!node || typeof node.scaleX !== 'function') return;
              
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();
              const rotation = node.rotation();
              const x = node.x();
              const y = node.y();
              
              
              let shapeId = node.id();
              if (!shapeId) return;
              
              // Handle callout textbox nodes
              let shape;
              if (shapeId.endsWith('_textbox')) {
                // Extract the actual shape ID
                shapeId = shapeId.replace('_textbox', '');
                shape = shapes.find(s => s.id === shapeId);
                // Skip the standard transform handling for callouts as it's handled in onTransform
                if (shape?.type === DrawingTool.CALLOUT) {
                  node.scaleX(1);
                  node.scaleY(1);
                  return;
                }
              } else {
                shape = shapes.find(s => s.id === shapeId);
              }
              
              if (!shape) return;
              
            
            // Update shape based on its type
            try {
              if (shape.type === DrawingTool.RECTANGLE) {
                const rectShape = shape as RectShape;
                // Calculate new dimensions and position
                const newWidth = Math.max(5, rectShape.width * scaleX);
                const newHeight = Math.max(5, rectShape.height * scaleY);
                
                updateShape(shapeId, {
                  x: x,
                  y: y,
                  width: newWidth,
                  height: newHeight,
                  rotation: rotation
                });
                
                // Reset transform but keep the visual position
                node.scaleX(1);
                node.scaleY(1);
                node.x(x);
                node.y(y);
                node.rotation(rotation);
                
              } else if (shape.type === DrawingTool.CIRCLE) {
                const circleShape = shape as CircleShape;
                // Keep it as a perfect circle by using the larger scale factor
                const scale = Math.max(scaleX, scaleY);
                const newRadius = Math.max(5, circleShape.radiusX * scale);
                
                updateShape(shapeId, {
                  x: x,
                  y: y,
                  radiusX: newRadius,
                  radiusY: newRadius,
                  rotation: rotation
                });
                
                // Reset transform
                node.scaleX(1);
                node.scaleY(1);
                node.x(x);
                node.y(y);
                node.rotation(rotation);
                
              } else if (shape.type === DrawingTool.TEXT) {
                const textShape = shape as TextShape;
                const newFontSize = Math.max(8, textShape.fontSize * scaleY);
                
                updateShape(shapeId, {
                  x: x,
                  y: y,
                  fontSize: newFontSize,
                  rotation: rotation
                });
                
                // Reset transform
                node.scaleX(1);
                node.scaleY(1);
                node.x(x);
                node.y(y);
                node.rotation(rotation);
                
              } else if (shape.type === DrawingTool.ARROW || shape.type === DrawingTool.PEN) {
                // For arrow and pen shapes, apply scale to points
                if ('points' in shape && Array.isArray(shape.points)) {
                  const transformedPoints = [...shape.points];
                  
                  // Apply scale and rotation to points
                  for (let i = 0; i < transformedPoints.length; i += 2) {
                    const px = transformedPoints[i] * scaleX;
                    const py = transformedPoints[i + 1] * scaleY;
                    
                    // Apply rotation if needed
                    if (rotation !== 0) {
                      const rad = (rotation * Math.PI) / 180;
                      const cos = Math.cos(rad);
                      const sin = Math.sin(rad);
                      transformedPoints[i] = px * cos - py * sin;
                      transformedPoints[i + 1] = px * sin + py * cos;
                    } else {
                      transformedPoints[i] = px;
                      transformedPoints[i + 1] = py;
                    }
                  }
                  
                  // Add the node position to all points
                  for (let i = 0; i < transformedPoints.length; i += 2) {
                    transformedPoints[i] += x;
                    transformedPoints[i + 1] += y;
                  }
                  
                  updateShape(shapeId, {
                    points: transformedPoints,
                    rotation: 0 // Reset rotation since it's baked into points
                  });
                  
                  // Reset transform and position
                  node.scaleX(1);
                  node.scaleY(1);
                  node.x(0);
                  node.y(0);
                  node.rotation(0);
                }
              }
            } catch (error) {
              console.error('Error updating shape after transform:', error);
            }
            });
            
            
            // Force a redraw to ensure the updated dimensions are reflected
            transformerRef.current?.getLayer()?.batchDraw();
          }}
          />
        )}
        
      {/* Render arrow control points */}
      {renderArrowControlPoints()}
      
      {/* Render callout control points */}
      {renderCalloutControlPoints()}
    </Layer>
  );
};