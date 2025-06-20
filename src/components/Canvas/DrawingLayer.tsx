import React, { useEffect, useRef, useState } from 'react';
import { Layer, Line, Rect, Circle, Arrow, Text, Transformer } from 'react-konva';
import Konva from 'konva';
import { useDrawing } from '@/hooks/useDrawing';
import { useSelectionMachine } from '@/hooks/useSelectionMachine';
import { DrawingTool } from '@/types/drawing';
import type { Shape, PenShape, RectShape, CircleShape, ArrowShape, TextShape, Point } from '@/types/drawing';

interface DrawingLayerProps {
  stageRef: React.RefObject<Konva.Stage>;
  onTextClick?: (position: Point) => void;
  onTextEdit?: (shapeId: string) => void;
}

export const DrawingLayer: React.FC<DrawingLayerProps> = ({ stageRef, onTextClick, onTextEdit }) => {
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
  
  // Track which control point is being dragged (0 = start, 1 = end)
  const [_draggingControlPointIndex, setDraggingControlPointIndex] = useState<number | null>(null);

  // Sync selection state with drawing context
  useEffect(() => {
    selectMultiple(selectedShapeIds);
  }, [selectedShapeIds, selectMultiple]);

  // Update transformer when selection changes
  useEffect(() => {
    if (transformerRef.current) {
      const nodes: Konva.Node[] = [];
      selectedShapeIds.forEach(id => {
        const node = selectedShapeRefs.current.get(id);
        if (node) {
          nodes.push(node);
        }
      });
      transformerRef.current.nodes(nodes);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedShapeIds]);
  
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
      const clickedOnEmpty = e.target === stage || e.target.getLayer() === stage.findOne('Layer');
      
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
        } else if (isTransformingRef.current) {
          // Don't deselect when finishing a transform
          return;
        } else if (isDraggingControlPoint || isDraggingControlPointRef.current) {
          // Don't deselect when finishing control point drag
          return;
        } else if (e.target === stage || e.target.getLayer()) {
          // Click on empty space (not drag)
          handleEmptyClick();
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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeIds.length > 0) {
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
    selectedShapeIds,
    selectionContext,
    updateShape,
    deleteSelected,
    isDraggingControlPoint,
    startControlPointDrag,
    endControlPointDrag,
    onTextClick,
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
          const isSelected = selectedShapeIds.includes(shape.id);
          
          // Don't handle click if we're dragging or if drag distance was significant
          const node = e.target;
          const wasDragged = node.attrs._wasDragged;
          if (isDraggingShape || wasDragged) {
            node.setAttrs({ _wasDragged: false });
            return;
          }
          
          if (!isSelected || e.evt.ctrlKey || e.evt.metaKey) {
            // Select the shape if not selected or using modifier keys
            handleShapeClick(shape.id, {
              ctrlKey: e.evt.ctrlKey || e.evt.metaKey,
              shiftKey: e.evt.shiftKey
            });
          }
        }
      },
      onTap: (_e: Konva.KonvaEventObject<MouseEvent>) => {
        // Don't cancel bubble - let it reach stage mousedown handler
      },
      onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
        const isSelected = selectedShapeIds.includes(shape.id);
        
        // Track arrow dragging
        if (shape.type === DrawingTool.ARROW) {
          setDraggedArrowId(shape.id);
        }
        
        // If shape is not selected, select it first
        if (!isSelected) {
          handleShapeClick(shape.id, {
            ctrlKey: e.evt.ctrlKey || e.evt.metaKey,
            shiftKey: e.evt.shiftKey
          });
        }
        
        const pos = e.target.getStage()?.getPointerPosition();
        if (pos && !isDraggingShape) {
          startDragShape(pos, shapes);
        }
        
        // Store initial positions for multi-drag
        if (selectedShapeIds.length > 1 || (!isSelected && !e.evt.ctrlKey && !e.evt.metaKey)) {
          e.target.setAttrs({ _dragStartX: e.target.x(), _dragStartY: e.target.y() });
        }
      },
      onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
        const node = e.target;
        
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
        if (selectedShapeIds.length > 1) {
          const dx = node.x() - (node.attrs._dragStartX || node.x());
          const dy = node.y() - (node.attrs._dragStartY || node.y());
          
          // Move other selected shapes by the same amount
          selectedShapeIds.forEach(id => {
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
        handleDragEnd(e);
        
        // Clear arrow dragging state
        if (shape.type === DrawingTool.ARROW) {
          setDraggedArrowId(null);
        }
        
        // Handle multi-shape drag end
        if (selectedShapeIds.length > 1) {
          const dx = e.target.x() - (e.target.attrs._dragStartX || e.target.x());
          const dy = e.target.y() - (e.target.attrs._dragStartY || e.target.y());
          
          // Update positions for all other selected shapes
          selectedShapeIds.forEach(id => {
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
                } else {
                  // For other shapes, update position
                  const newPos = otherNode.position();
                  updateShape(id, { x: newPos.x, y: newPos.y });
                }
              }
            }
          });
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
            radiusX={circleShape.radiusX}
            radiusY={circleShape.radiusY}
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
            onDblClick={() => {
              if (onTextEdit) {
                onTextEdit(shape.id);
              }
            }}
            onDblTap={() => {
              if (onTextEdit) {
                onTextEdit(shape.id);
              }
            }}
            ref={(node) => {
              if (node) {
                selectedShapeRefs.current.set(shape.id, node);
              } else {
                selectedShapeRefs.current.delete(shape.id);
              }
            }}
          />
        );

      default:
        return null;
    }
  };

  // Render arrow control points
  const renderArrowControlPoints = () => {
    
    if (activeTool !== DrawingTool.SELECT || selectedShapeIds.length !== 1) {
      return null;
    }

    const selectedShape = shapes.find(s => s.id === selectedShapeIds[0]);
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
          radius={8}
          fill="#4a90e2"
          stroke="white"
          strokeWidth={2}
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
        <Circle
          x={actualX2}
          y={actualY2}
          radius={8}
          fill="#e24a4a"
          stroke="white"
          strokeWidth={2}
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
      {activeTool === DrawingTool.SELECT && selectedShapeIds.length > 0 && (
        <Transformer
          key={selectedShapeIds.join(',')}
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
          onTransform={(_e) => {
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
              
              
              const shapeId = node.id();
              if (!shapeId) return;
              
              const shape = shapes.find(s => s.id === shapeId);
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
                const newRadiusX = Math.max(5, circleShape.radiusX * scaleX);
                const newRadiusY = Math.max(5, circleShape.radiusY * scaleY);
                
                updateShape(shapeId, {
                  x: x,
                  y: y,
                  radiusX: newRadiusX,
                  radiusY: newRadiusY,
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
    </Layer>
  );
};