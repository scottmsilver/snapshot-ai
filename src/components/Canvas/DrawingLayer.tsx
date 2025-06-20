import React, { useEffect, useRef } from 'react';
import { Layer, Line, Rect, Circle, Arrow, Text, Group, Transformer } from 'react-konva';
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
  } = useSelectionMachine();
  
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectedShapeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const isTransformingRef = useRef(false);

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
        if (clickedOnEmpty && !isTransformerClick) {
          // Check if we should start drag selection
          if (e.evt.button === 0) { // Left mouse button
            startDragSelection(pos);
          }
        } else if (!isTransformerClick && e.target.id()) {
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
        startDrawing(pos, e.evt);
      }
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
      const pos = stage.getPointerPosition();
      if (!pos) return;

      if (activeTool === DrawingTool.SELECT) {
        // Handle hover
        const target = e.target;
        if (target && target.id() && target.getClassName() !== 'Transformer') {
          handleShapeHover(target.id());
        } else {
          handleShapeHover(null);
        }
        
        // Handle drag operations
        if (isDragSelecting) {
          updateDragSelection(pos, shapes);
        }
        // Shape dragging is now handled by Konva's native dragging
      } else if (isDrawing) {
        continueDrawing(pos, e.evt);
      }
    };

    const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Check if we clicked on transformer anchors
      const target = e.target;
      const targetName = target.name?.() || '';
      const targetClass = target.getClassName?.() || '';
      const isTransformerClick = targetClass === 'Transformer' || 
                                targetName.includes('_anchor') ||
                                targetName.includes('rotater');
      
      if (isTransformerClick) {
        // Don't process mouseup from transformer handles
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
        } else if (e.target === stage || e.target.getLayer()) {
          // Click on empty space (not drag)
          handleEmptyClick();
        }
      } else if (isDrawing) {
        const pos = stage.getPointerPosition();
        finishDrawing(pos || undefined, e.evt);
      }
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
        // For pen and arrow shapes, apply transform directly without updating data
        // This allows Konva to handle the dragging naturally
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
      draggable: activeTool === DrawingTool.SELECT,
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
      onTap: (e: Konva.KonvaEventObject<MouseEvent>) => {
        // Don't cancel bubble - let it reach stage mousedown handler
      },
      onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
        const isSelected = selectedShapeIds.includes(shape.id);
        
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
        return (
          <Arrow
            key={shape.id}
            {...commonProps}
            points={arrowShape.points}
            stroke={arrowShape.style.stroke}
            strokeWidth={arrowShape.style.strokeWidth * (isHovered && !isSelected ? 1.2 : 1)}
            pointerLength={arrowShape.pointerLength}
            pointerWidth={arrowShape.pointerWidth}
            hitStrokeWidth={Math.max(arrowShape.style.strokeWidth, 10)}
            ref={(node) => {
              if (node) {
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
          ignoreStroke={true}
          keepRatio={false}
          onTransformStart={() => {
            isTransformingRef.current = true;
            startTransform();
          }}
          onTransform={(e) => {
            // Live update during transform - optional for visual feedback
            const nodes = transformerRef.current?.nodes();
            if (nodes) {
              nodes.forEach(node => {
                node.getLayer()?.batchDraw();
              });
            }
          }}
          onTransformEnd={(e) => {
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
      </Layer>
    );
};