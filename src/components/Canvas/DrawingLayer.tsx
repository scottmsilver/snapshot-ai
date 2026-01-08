import React, { useEffect, useRef, useState } from 'react';
import { Layer, Line, Rect, Circle, Arrow, Text, Transformer, Group, Path, Star, RegularPolygon, Image } from 'react-konva';
import Konva from 'konva';
import { useDrawing } from '@/hooks/useDrawing';
import { useDrawingContext, DrawingActionType } from '@/contexts/DrawingContext';
import { useSelectionMachine } from '@/hooks/useSelectionMachine';
import { DrawingTool, AIReferenceSubTool } from '@/types/drawing';
import { SelectionOverlay } from '@/components/GenerativeFill/SelectionOverlay';
import { ResultOverlay } from '@/components/GenerativeFill/ResultOverlay';
import { SelectionBoxRenderer } from '@/components/Canvas/SelectionBoxRenderer';
import { MarkupPreview } from './MarkupPreview';
import { TempDrawingPreview } from './TempDrawingPreview';
import type { Shape, PenShape, RectShape, CircleShape, ArrowShape, TextShape, CalloutShape, StarShape, MeasurementLineShape, ImageShape, Point } from '@/types/drawing';
import {
  perimeterOffsetToPoint,
  getArrowPathString,
  calculateArrowHeadRotation,
  pointToPerimeterOffset,
  calculateInitialPerimeterOffset,
  isValidControlPoint,
  getOptimalControlPoints
} from '@/utils/calloutGeometry';
import { pixelsToMeasurement, formatMeasurement, type MeasurementUnit } from '@/utils/measurementUtils';

interface DrawingLayerProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  zoomLevel?: number;
  onTextClick?: (position: Point) => void;
  onTextShapeEdit?: (shapeId: string) => void;
  onImageToolComplete?: (bounds: { x: number; y: number; width: number; height: number }) => void;
}

type ShapeCommonProps = {
  id: string;
  opacity: number;
  visible: boolean;
  listening: boolean;
  draggable: boolean;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  onMouseUp: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => void;
};

const imageCache = new Map<string, HTMLImageElement>();

// Component for rendering image shapes
const ImageShapeComponent: React.FC<{
  shape: ImageShape;
  commonProps: ShapeCommonProps;
  onRef: (node: Konva.Node | null) => void;
}> = ({ shape, commonProps, onRef }) => {
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  // Load image from base64 data
  useEffect(() => {
    if (shape.imageData) {
      const cachedImage = imageCache.get(shape.imageData);
      if (cachedImage) {
        setLoadedImage(cachedImage);
        return;
      }
      const img = new window.Image();
      img.onload = () => {
        imageCache.set(shape.imageData, img);
        setLoadedImage(img);
      };
      img.src = shape.imageData;
    }
  }, [shape.imageData]);

  if (!loadedImage) return null;

  return (
    <Image
      {...commonProps}
      image={loadedImage}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rotation={shape.rotation || 0}
      stroke={shape.style.stroke}
      strokeWidth={shape.style.strokeWidth}
      ref={onRef}
    />
  );
};

export const DrawingLayer: React.FC<DrawingLayerProps> = ({ stageRef, zoomLevel = 1, onTextClick, onTextShapeEdit, onImageToolComplete }) => {
  const {
    activeTool,
    currentStyle,
    isDrawing,
    shapes,
    tempPoints,
    startDrawing,
    continueDrawing,
    finishDrawing,
    cancelDrawing,
    getSortedShapes,
    updateShape,
    updateShapes,
    deleteSelected,
    selectMultiple,
    selectedShapeIds: drawingSelectedShapeIds,
    selectShape,
    clearSelection,
  } = useDrawing();

  const { state: drawingState, dispatch, addReferencePoint, addAiMarkupShape } = useDrawingContext();

  // Track if mouse is down for generative fill
  const [isGenerativeFillDrawing, setIsGenerativeFillDrawing] = useState(false);
  const [polygonPreviewPoint, setPolygonPreviewPoint] = useState<Point | null>(null);

  // Track markup drawing state for AI Reference mode
  const [isMarkupDrawing, setIsMarkupDrawing] = useState(false);
  const [markupStartPoint, setMarkupStartPoint] = useState<Point | null>(null);
  const [markupTempPoints, setMarkupTempPoints] = useState<Point[]>([]);
  const [isPolygonMarkupDrawing, setIsPolygonMarkupDrawing] = useState(false);
  const [polygonMarkupPreviewPoint, setPolygonMarkupPreviewPoint] = useState<Point | null>(null);

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
  const [currentlyDraggingShapeId, setCurrentlyDraggingShapeId] = useState<string | null>(null);
  const justFinishedDraggingRef = useRef(false);
  const [isSnapping, setIsSnapping] = useState(false);

  // Drag session tracking
  const dragSessionRef = useRef<{ id: string; session: string; oldPoints: number[] } | null>(null);
  const positionSessionRef = useRef<{ id: string; session: string; oldPos: { x: number; y: number } } | null>(null);

  const postDragSessionRef = useRef<{
    id: string;
    session: string;
    oldPoints: number[];
    newPoints: number[];
    seenNewPoints: boolean;
    reapplied: boolean;
  } | null>(null);
  const postDragPositionRef = useRef<{
    id: string;
    session: string;
    oldPos: { x: number; y: number };
    newPos: { x: number; y: number };
    seenNew: boolean;
    reapplied: boolean;
  } | null>(null);

  const pendingNodeResetRef = useRef<{ id: string; node: Konva.Node } | null>(null);

  // Track which control point is being dragged (0 = start, 1 = end)
  const setDraggingControlPointIndex = useState<number | null>(null)[1];

  // Track callout selection modes (text-only vs whole)
  const [calloutSelectionModes, setCalloutSelectionModes] = useState<Map<string, 'text-only' | 'whole'>>(new Map());

  // Track if we're currently dragging a callout
  const [draggingCalloutId, setDraggingCalloutId] = useState<string | null>(null);

  // Track callout drag start position for calculating delta
  const calloutDragStart = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Snap angles for rotation
  const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

  const pointsEqual = (a?: number[], b?: number[]): boolean => {
    if (!a || !b || a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  };

  const positionsEqual = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => a.x === b.x && a.y === b.y;

  const monitorPostDragPosition = (shapeId: string, current: { x: number; y: number }): { x: number; y: number } => {
    const applyPendingReset = (): void => {
      const pending = pendingNodeResetRef.current;
      if (pending && pending.id === shapeId) {
        const pos = pending.node.position();
        if (pos.x !== 0 || pos.y !== 0) {
          pending.node.position({ x: 0, y: 0 });
          pending.node.getLayer()?.batchDraw();
        }
        pendingNodeResetRef.current = null;
      }
    };

    const session = postDragPositionRef.current;
    if (!session || session.id !== shapeId) {
      applyPendingReset();
      return current;
    }

    if (positionsEqual(current, session.newPos)) {
      session.seenNew = true;
      applyPendingReset();
      return current;
    }

    if (session.seenNew && positionsEqual(current, session.oldPos)) {
      if (!session.reapplied) {
        session.reapplied = true;
        requestAnimationFrame(() => {
          const currentSession = postDragPositionRef.current;
          if (currentSession && currentSession.session === session.session) {
            updateShape(session.id, { x: session.newPos.x, y: session.newPos.y });
            postDragPositionRef.current = null;
          }
        });
      }
      return session.newPos;
    }

    return current;
  };

  // Clean up callout selection modes when selection changes
  useEffect(() => {
    // Remove modes for shapes that are no longer selected
    setCalloutSelectionModes(prev => {
      const newMap = new Map(prev);
      for (const [id] of newMap) {
        if (!drawingSelectedShapeIds.includes(id)) {
          newMap.delete(id);
        }
      }
      return newMap;
    });
  }, [drawingSelectedShapeIds]);

  // Reset callout group positions when not dragging
  useEffect(() => {
    if (!draggingCalloutId) {
      // When not dragging, ensure all callout groups are at origin
      shapes.forEach(shape => {
        if (shape.type === DrawingTool.CALLOUT) {
          const groupNode = selectedShapeRefs.current.get(shape.id);
          if (groupNode) {
            const pos = groupNode.position();
            if (pos.x !== 0 || pos.y !== 0) {
              groupNode.position({ x: 0, y: 0 });
            }
          }
        }
      });
    }
  }, [draggingCalloutId, shapes]);


  // Update transformer when selection changes
  useEffect(() => {
    if (transformerRef.current) {
      const nodes: Konva.Node[] = [];
      drawingSelectedShapeIds.forEach(id => {
        const shape = shapes.find(s => s.id === id);
        if (shape?.type === DrawingTool.CALLOUT) {
          // For callouts, check the selection mode
          const mode = calloutSelectionModes.get(id) || 'whole';

          if (mode === 'text-only') {
            // Transform only the text box rect
            const rectNode = selectedShapeRefs.current.get(id + '_textbox');
            if (rectNode) {
              nodes.push(rectNode);
            }
          } else {
            // Transform the whole group
            const groupNode = selectedShapeRefs.current.get(id);
            if (groupNode) {
              nodes.push(groupNode);
            }
          }
        } else if (shape?.type === DrawingTool.MEASURE) {
          // Skip measurement lines - they have their own control points
          return;
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
  }, [drawingSelectedShapeIds, shapes, calloutSelectionModes]);

  // Force updates while dragging arrow
  useEffect(() => {
    if (!draggedArrowId) return;

    let animationId: number;
    const updateFrame = (): void => {
      forceUpdate({});
      animationId = requestAnimationFrame(updateFrame);
    };

    animationId = requestAnimationFrame(updateFrame);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [draggedArrowId]);

  // Enforce crosshair cursor when in AI reference mode
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const container = stage.container();
    if (drawingState.aiReferenceMode) {
      container.style.cursor = 'crosshair';
    }

    // Also set up an interval to enforce crosshair (in case other handlers override it)
    let intervalId: number | undefined;
    if (drawingState.aiReferenceMode) {
      intervalId = window.setInterval(() => {
        container.style.cursor = 'crosshair';
      }, 100);
    }

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [drawingState.aiReferenceMode, stageRef]);

  // Set up mouse event handlers
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
      // Use Konva's built-in pointer position which handles all transformations
      const pos = stage.getPointerPosition();

      if (!pos) return;

      // Adjust for layer scale
      const adjustedPos = {
        x: pos.x / zoomLevel,
        y: pos.y / zoomLevel
      };

      // Early check: if AI Reference Mode is active, handle pin drops or markup drawing
      if (drawingState.aiReferenceMode) {
        if (drawingState.aiReferenceSubTool === AIReferenceSubTool.PIN) {
          // Drop a pin at the click location
          addReferencePoint(adjustedPos);
        } else if (drawingState.aiReferenceSubTool === AIReferenceSubTool.POLYGON) {
          // Handle polygon click-based drawing
          if (!isPolygonMarkupDrawing) {
            // First click: start polygon
            setIsPolygonMarkupDrawing(true);
            setMarkupTempPoints([adjustedPos]);
          } else {
            // Subsequent clicks: add point or close polygon
            const firstPoint = markupTempPoints[0];
            const dx = adjustedPos.x - firstPoint.x;
            const dy = adjustedPos.y - firstPoint.y;
            const distanceToFirst = Math.sqrt(dx * dx + dy * dy);
            
            // If clicked near first point (within 10px) and have at least 3 points, close polygon
            if (distanceToFirst < 10 && markupTempPoints.length >= 3) {
              // Close the polygon
              const flatPoints = markupTempPoints.flatMap(p => [p.x, p.y]);
              const timestamp = Date.now();
              const newShape: PenShape = {
                id: `markup-polygon-${timestamp}`,
                type: DrawingTool.PEN,
                points: flatPoints,
                style: { stroke: '#FF6B00', strokeWidth: 3, opacity: 1, lineCap: 'round', lineJoin: 'round' },
                visible: true,
                locked: true,
                zIndex: 0,
                createdAt: timestamp,
                updatedAt: timestamp,
                isMarkup: true,
              };
              addAiMarkupShape(newShape);
              
              // Reset polygon drawing state
              setIsPolygonMarkupDrawing(false);
              setMarkupTempPoints([]);
              setPolygonMarkupPreviewPoint(null);
            } else {
              // Add point to polygon
              setMarkupTempPoints(prev => [...prev, adjustedPos]);
            }
          }
        } else {
          // Start markup drawing for pen/circle/rectangle sub-tools
          setIsMarkupDrawing(true);
          setMarkupStartPoint(adjustedPos);
          setMarkupTempPoints([adjustedPos]);
        }
        return; // Bypass all normal drawing behavior
      }

      // Check if clicking on empty space (no shape)
      const clickedOnEmpty = e.target === stage ||
                           e.target.getLayer() === stage.findOne('Layer') ||
                           e.target.getClassName() === 'Layer' ||
                           e.target.getClassName() === 'Image' ||
                           (!e.target.id() && e.target.getClassName() !== 'Transformer' && e.target.name?.() !== 'measurement-control-point');

      // Check if clicking on transformer or its anchors
      const targetName = e.target.name?.() || '';
      const targetClass = e.target.getClassName?.() || '';
      const isTransformerClick = targetClass === 'Transformer' ||
                                targetName.includes('_anchor') ||
                                targetName.includes('rotater');

      // Check if this is a control point
      const isControlPoint = targetName === 'measurement-control-point' ||
                            (targetClass === 'Circle' && e.target.draggable());

      // Handle deselection on empty click for any tool
      if (clickedOnEmpty && !isTransformerClick && !isDraggingControlPoint && !isControlPoint) {
        const shouldMultiSelect = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
        if (!shouldMultiSelect && drawingSelectedShapeIds.length > 0) {
          clearSelection();
        }
      }

      if (activeTool === DrawingTool.SELECT) {
        if (clickedOnEmpty && !isTransformerClick && !isDraggingControlPoint && !isControlPoint) {
          // Check if we should start drag selection
          if (e.evt.button === 0) { // Left mouse button
            startDragSelection(adjustedPos);
          }
        } else if (!isTransformerClick && e.target.id() && !isDraggingControlPoint && !isControlPoint) {
          // Shape clicks and dragging are handled by the shape's event handlers
        }
        return;
      }

      if (activeTool === DrawingTool.TEXT) {
        // For text tool, notify parent to show dialog
        if (clickedOnEmpty && onTextClick) {
          onTextClick(adjustedPos);
        }
        return;
      }

      if (clickedOnEmpty) {
        startDrawing(adjustedPos);
      }
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>): void => {
      // Use Konva's built-in pointer position which handles all transformations
      const pos = stage.getPointerPosition();

      if (!pos) return;

      // Adjust for layer scale
      const adjustedPos = {
        x: pos.x / zoomLevel,
        y: pos.y / zoomLevel
      };

      // Handle markup drawing for AI Reference mode
      if (drawingState.aiReferenceMode) {
        const subTool = drawingState.aiReferenceSubTool;
        
        // Handle polygon preview
        if (subTool === AIReferenceSubTool.POLYGON && isPolygonMarkupDrawing) {
          setPolygonMarkupPreviewPoint(adjustedPos);
          return;
        }
        
        // Handle other markup tools
        if (isMarkupDrawing) {
          if (subTool === AIReferenceSubTool.PEN) {
            // For pen, accumulate points
            setMarkupTempPoints(prev => [...prev, adjustedPos]);
          } else {
            // For line/circle/rectangle, just update the end point
            setMarkupTempPoints(prev => prev.length > 0 ? [prev[0], adjustedPos] : [adjustedPos]);
          }
          return;
        }
      }

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
          updateDragSelection(adjustedPos, shapes);
        }
        // Shape dragging is now handled by Konva's native dragging
      } else if (isDrawing) {
        continueDrawing(adjustedPos);
      }
    };

    const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>): void => {

      // Check if we clicked on transformer anchors or control points
      const target = e.target;
      const targetName = target.name?.() || '';
      const targetClass = target.getClassName?.() || '';
      const isTransformerClick = targetClass === 'Transformer' ||
                                targetName.includes('_anchor') ||
                                targetName.includes('rotater');

      // Check if this is a control point (they're Circle shapes that are draggable)
      const isControlPoint = (targetClass === 'Circle' && target.draggable() &&
                            target.getAttr('fill') && (target.getAttr('fill') === '#4a90e2' || target.getAttr('fill') === '#e24a4a')) ||
                            targetName === 'measurement-control-point';

      if (isTransformerClick || isControlPoint) {
        // Don't process mouseup from transformer handles or control points
        return;
      }

      // Handle markup drawing completion for AI Reference mode
      if (isMarkupDrawing && drawingState.aiReferenceMode) {
        const subTool = drawingState.aiReferenceSubTool;
        const startPt = markupStartPoint;
        const points = markupTempPoints;

        // Reset markup drawing state
        setIsMarkupDrawing(false);
        setMarkupStartPoint(null);
        setMarkupTempPoints([]);

        if (!startPt || points.length === 0) return;

        // Get the current mouse position
        const pos = stage.getPointerPosition();
        const endPt = pos ? { x: pos.x / zoomLevel, y: pos.y / zoomLevel } : points[points.length - 1];

        // Bright orange markup style
        const markupStyle = {
          stroke: '#FF6B00',
          strokeWidth: 3,
          opacity: 1,
          lineCap: 'round' as const,
          lineJoin: 'round' as const,
        };

        const timestamp = Date.now();
        const shapeId = `markup_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

        let newShape: Shape | null = null;

        if (subTool === AIReferenceSubTool.PEN) {
          // Create pen shape from accumulated points
          if (points.length > 1) {
            const flatPoints: number[] = [];
            points.forEach(p => {
              flatPoints.push(p.x, p.y);
            });

            newShape = {
              id: shapeId,
              type: DrawingTool.PEN,
              points: flatPoints,
              style: markupStyle,
              visible: true,
              locked: true,
              zIndex: 0,
              createdAt: timestamp,
              updatedAt: timestamp,
              tension: 0.5,
              isMarkup: true,
            } as PenShape;
          }
        } else if (subTool === AIReferenceSubTool.LINE) {
          // Create straight line from start to end point
          const lineLength = Math.sqrt(Math.pow(endPt.x - startPt.x, 2) + Math.pow(endPt.y - startPt.y, 2));
          if (lineLength > 5) {
            newShape = {
              id: shapeId,
              type: DrawingTool.PEN,
              points: [startPt.x, startPt.y, endPt.x, endPt.y],
              style: markupStyle,
              visible: true,
              locked: true,
              zIndex: 0,
              createdAt: timestamp,
              updatedAt: timestamp,
              isMarkup: true,
            } as PenShape;
          }
        } else if (subTool === AIReferenceSubTool.CIRCLE) {
          // Create circle/ellipse from start and end points
          const dx = endPt.x - startPt.x;
          const dy = endPt.y - startPt.y;
          const radiusX = Math.abs(dx) / 2;
          const radiusY = Math.abs(dy) / 2;
          const centerX = startPt.x + dx / 2;
          const centerY = startPt.y + dy / 2;

          if (radiusX > 2 && radiusY > 2) {
            newShape = {
              id: shapeId,
              type: DrawingTool.CIRCLE,
              x: centerX,
              y: centerY,
              radiusX: radiusX,
              radiusY: radiusY,
              style: { ...markupStyle, fill: undefined },
              visible: true,
              locked: true,
              zIndex: 0,
              createdAt: timestamp,
              updatedAt: timestamp,
              isMarkup: true,
            } as CircleShape;
          }
        } else if (subTool === AIReferenceSubTool.RECTANGLE) {
          // Create rectangle from start and end points
          const width = Math.abs(endPt.x - startPt.x);
          const height = Math.abs(endPt.y - startPt.y);

          if (width > 2 && height > 2) {
            newShape = {
              id: shapeId,
              type: DrawingTool.RECTANGLE,
              x: Math.min(startPt.x, endPt.x),
              y: Math.min(startPt.y, endPt.y),
              width: width,
              height: height,
              style: { ...markupStyle, fill: undefined },
              visible: true,
              locked: true,
              zIndex: 0,
              createdAt: timestamp,
              updatedAt: timestamp,
              isMarkup: true,
            } as RectShape;
          }
        }

        if (newShape) {
          addAiMarkupShape(newShape);
        }
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
        }
      } else if (isDrawing) {
        // Use Konva's built-in pointer position which handles all transformations
        const pos = stage.getPointerPosition();

        if (!pos) return;

        // Adjust for layer scale
        const adjustedPos = {
          x: pos.x / zoomLevel,
          y: pos.y / zoomLevel
        };

        // Special handling for IMAGE tool
        if (activeTool === DrawingTool.IMAGE && tempPoints.length >= 2 && onImageToolComplete) {
          const startPoint = tempPoints[0];
          const endPoint = tempPoints[tempPoints.length - 1];
          const bounds = {
            x: Math.min(startPoint.x, endPoint.x),
            y: Math.min(startPoint.y, endPoint.y),
            width: Math.abs(endPoint.x - startPoint.x),
            height: Math.abs(endPoint.y - startPoint.y)
          };

          // Cancel the drawing operation
          cancelDrawing();

          // Notify parent to show file picker
          onImageToolComplete(bounds);
        } else {
          finishDrawing(adjustedPos || undefined, zoomLevel);
        }
      }

      // Control point dragging is handled by state machine
    };

    // Double-click handler to close polygon
    const handleDoubleClick = (_e: Konva.KonvaEventObject<MouseEvent>): void => {
      if (drawingState.aiReferenceMode && 
          drawingState.aiReferenceSubTool === AIReferenceSubTool.POLYGON && 
          isPolygonMarkupDrawing && 
          markupTempPoints.length >= 3) {
        // Close the polygon
        const flatPoints = markupTempPoints.flatMap(p => [p.x, p.y]);
        const timestamp = Date.now();
        const newShape: PenShape = {
          id: `markup-polygon-${timestamp}`,
          type: DrawingTool.PEN,
          points: flatPoints,
          style: { stroke: '#FF6B00', strokeWidth: 3, opacity: 1, lineCap: 'round', lineJoin: 'round' },
          visible: true,
          locked: true,
          zIndex: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
          isMarkup: true,
        };
        addAiMarkupShape(newShape);
        
        // Reset polygon drawing state
        setIsPolygonMarkupDrawing(false);
        setMarkupTempPoints([]);
        setPolygonMarkupPreviewPoint(null);
      }
    };

    // Add event listeners
    stage.on('mousedown touchstart', handleMouseDown);
    stage.on('mousemove touchmove', handleMouseMove);
    stage.on('mouseup touchend', handleMouseUp);
    stage.on('dblclick', handleDoubleClick);

    // Keyboard handler for escape and delete
    const handleKeyDown = (e: KeyboardEvent): void => {
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
      stage.off('dblclick', handleDoubleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    stageRef,
    activeTool,
    isDrawing,
    shapes,
    tempPoints,
    startDrawing,
    continueDrawing,
    finishDrawing,
    cancelDrawing,
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
    updateShapes,
    deleteSelected,
    isDraggingControlPoint,
    startControlPointDrag,
    endControlPointDrag,
    onTextClick,
    onImageToolComplete,
    selectShape,
    clearSelection,
    selectedShapeIds,
    selectMultiple,
    zoomLevel,
    isMarkupDrawing,
    markupStartPoint,
    markupTempPoints,
    isPolygonMarkupDrawing,
    polygonMarkupPreviewPoint,
    drawingState.aiReferenceMode,
    drawingState.aiReferenceSubTool,
    addAiMarkupShape,
    addReferencePoint,
  ]);

  // Render a shape based on its type
  const renderShape = (shape: Shape): React.ReactNode => {
    const isSelected = drawingSelectedShapeIds.includes(shape.id);
    const isHovered = hoveredShapeId === shape.id && activeTool === DrawingTool.SELECT;

    const computeShapeUpdateFromNode = (
      targetShape: Shape,
      node: Konva.Node,
    ): { updates: Partial<Shape>; resetNode?: boolean } | null => {
      const nodePosition = node.position();
      const adjustedPosition = {
        x: nodePosition.x / zoomLevel,
        y: nodePosition.y / zoomLevel,
      };

      if (targetShape.type === DrawingTool.PEN || targetShape.type === DrawingTool.ARROW || targetShape.type === DrawingTool.MEASURE) {
        if ('points' in targetShape && Array.isArray(targetShape.points)) {
          const newPoints = [...targetShape.points];
          for (let i = 0; i < newPoints.length; i += 2) {
            newPoints[i] += adjustedPosition.x;
            newPoints[i + 1] += adjustedPosition.y;
          }

          const updates: Partial<Shape> = { points: newPoints };

          if (
            targetShape.type === DrawingTool.MEASURE &&
            drawingState.measurementCalibration.pixelsPerUnit
          ) {
            const pixelDistance = Math.sqrt(
              Math.pow(newPoints[2] - newPoints[0], 2) +
              Math.pow(newPoints[3] - newPoints[1], 2),
            );
            const value = pixelsToMeasurement(
              pixelDistance,
              drawingState.measurementCalibration.pixelsPerUnit,
              drawingState.measurementCalibration.unit as MeasurementUnit,
            );

            (updates as Partial<MeasurementLineShape>).measurement = {
              value,
              unit: drawingState.measurementCalibration.unit,
              pixelDistance,
            };
          }

          return { updates, resetNode: true };
        }
        return null;
      }

      if (targetShape.type === DrawingTool.CALLOUT) {
        const calloutShape = targetShape as CalloutShape;
        const updates: Partial<CalloutShape> = {
          textX: calloutShape.textX + adjustedPosition.x,
          textY: calloutShape.textY + adjustedPosition.y,
          arrowX: calloutShape.arrowX + adjustedPosition.x,
          arrowY: calloutShape.arrowY + adjustedPosition.y,
        };

        if (calloutShape.curveControl1X !== undefined && calloutShape.curveControl1Y !== undefined) {
          updates.curveControl1X = calloutShape.curveControl1X + adjustedPosition.x;
          updates.curveControl1Y = calloutShape.curveControl1Y + adjustedPosition.y;
        }
        if (calloutShape.curveControl2X !== undefined && calloutShape.curveControl2Y !== undefined) {
          updates.curveControl2X = calloutShape.curveControl2X + adjustedPosition.x;
          updates.curveControl2Y = calloutShape.curveControl2Y + adjustedPosition.y;
        }

        return { updates, resetNode: true };
      }

      if (targetShape.type === DrawingTool.RECTANGLE) {
        const rectShape = targetShape as RectShape;
        return {
          updates: {
            x: adjustedPosition.x - rectShape.width / 2,
            y: adjustedPosition.y - rectShape.height / 2,
          },
        };
      }

      if (targetShape.type === DrawingTool.TEXT) {
        const textShape = targetShape as TextShape;
        const lines = textShape.text.split('\n').length;
        const estimatedHeight = textShape.fontSize * lines * 1.2;
        return {
          updates: {
            x: adjustedPosition.x - (textShape.width || 0) / 2,
            y: adjustedPosition.y - estimatedHeight / 2,
          },
        };
      }

      return {
        updates: {
          x: adjustedPosition.x,
          y: adjustedPosition.y,
        },
      };
    };

    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>): void => {
      if (shape.type === DrawingTool.CALLOUT) {
        // Callout drag updates are handled in the shared drag-end logic below
        return;
      }

      const result = computeShapeUpdateFromNode(shape, e.target);
      if (!result) {
        return;
      }

      // Set up post-drag session for arrows to prevent bounce
      if (shape.type === DrawingTool.ARROW && dragSessionRef.current && dragSessionRef.current.id === shape.id) {
        const updatesWithPoints = result.updates as Partial<ArrowShape>;
        const newPoints = Array.isArray(updatesWithPoints.points) ? [...updatesWithPoints.points] : null;
        if (newPoints) {
          postDragSessionRef.current = {
            id: shape.id,
            session: dragSessionRef.current.session,
            oldPoints: dragSessionRef.current.oldPoints,
            newPoints,
            seenNewPoints: false,
            reapplied: false
          };

          // Auto-clear session after a timeout to prevent getting stuck
          const sessionToCheck = dragSessionRef.current.session;
          setTimeout(() => {
            if (postDragSessionRef.current && postDragSessionRef.current.session === sessionToCheck) {
              postDragSessionRef.current = null;
            }
          }, 500); // Clear after 500ms if still stuck
        }
        dragSessionRef.current = null;
      }

      updateShape(shape.id, result.updates);

      if (result.resetNode) {
        const node = e.target;
        if (shape.type === DrawingTool.ARROW) {
          pendingNodeResetRef.current = { id: shape.id, node };
        } else {
          pendingNodeResetRef.current = { id: shape.id, node };
        }
      } else {
        const updates = result.updates as Record<string, unknown>;
        if ('x' in updates || 'y' in updates) {
          const node = e.target;
          pendingNodeResetRef.current = { id: shape.id, node };
        }
      }

      if (positionSessionRef.current && positionSessionRef.current.id === shape.id) {
        const { session, oldPos } = positionSessionRef.current;
        const updates = result.updates as Partial<{ x: number; y: number }>;
        const newPos = {
          x: typeof updates.x === 'number' ? updates.x : oldPos.x,
          y: typeof updates.y === 'number' ? updates.y : oldPos.y,
        };
        if (newPos.x !== oldPos.x || newPos.y !== oldPos.y) {
          postDragPositionRef.current = {
            id: shape.id,
            session,
            oldPos,
            newPos,
            seenNew: false,
            reapplied: false,
          };
          setTimeout(() => {
            if (postDragPositionRef.current && postDragPositionRef.current.session === session) {
              postDragPositionRef.current = null;
            }
          }, 500);
        }
        positionSessionRef.current = null;
      }
    };

    // Disable shape interaction when in AI Reference mode with a drawing sub-tool
    const isAiReferenceDrawing = drawingState.aiReferenceMode &&
      drawingState.aiReferenceSubTool !== AIReferenceSubTool.PIN;

    const commonProps: ShapeCommonProps = {
      id: shape.id,
      opacity: shape.style.opacity,
      visible: shape.visible,
      listening: !isAiReferenceDrawing && (currentlyDraggingShapeId === shape.id || (!currentlyDraggingShapeId && activeTool === DrawingTool.SELECT)),
      draggable: !isAiReferenceDrawing && activeTool === DrawingTool.SELECT && !isDraggingControlPoint,
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
      onTap: () => {
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

        // Set currently dragging shape
        setCurrentlyDraggingShapeId(shape.id);
        pendingNodeResetRef.current = null;

        // Track arrow dragging
        if (shape.type === DrawingTool.ARROW) {
          setDraggedArrowId(shape.id);
          // Clear any existing post-drag session when starting a new drag
          if (postDragSessionRef.current && postDragSessionRef.current.id === shape.id) {
            postDragSessionRef.current = null;
          }
          // Create drag session to prevent bounce
          const arrowShape = shape as ArrowShape;
          const sessionId = `drag-${Date.now()}-${Math.random()}`;
          dragSessionRef.current = {
            id: shape.id,
            session: sessionId,
            oldPoints: [...arrowShape.points]  // Store the original points
          };
        }

        // Track callout dragging
        if (shape.type === DrawingTool.CALLOUT) {
          setDraggingCalloutId(shape.id);
          // Always start from 0,0 since the group is reset after each drag
          calloutDragStart.current.set(shape.id, { x: 0, y: 0 });
        }

        if ('x' in shape && 'y' in shape) {
          const sessionId = `pos-${Date.now()}-${Math.random()}`;
          const startX = (shape as { x?: number }).x ?? 0;
          const startY = (shape as { y?: number }).y ?? 0;
          positionSessionRef.current = {
            id: shape.id,
            session: sessionId,
            oldPos: { x: startX, y: startY },
          };
          // Clear any lingering post-drag state for this shape
          if (postDragPositionRef.current && postDragPositionRef.current.id === shape.id) {
            postDragPositionRef.current = null;
          }
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

        const isMultiDrag = drawingSelectedShapeIds.length > 1;

        if (!isMultiDrag) {
          handleDragEnd(e);
        }

        // Set flag to prevent deselection on mouse up
        justFinishedDraggingRef.current = true;
        setTimeout(() => {
          justFinishedDraggingRef.current = false;
        }, 100);

        // Clear dragging states
        setCurrentlyDraggingShapeId(null);
        if (shape.type === DrawingTool.ARROW) {
          setDraggedArrowId(null);
        }
        if (shape.type === DrawingTool.CALLOUT) {
          // Don't clear dragging state yet - we need it for calculating the update
        }

        if (isMultiDrag) {
          const batchUpdates: Array<{ id: string; updates: Partial<Shape> }> = [];

          drawingSelectedShapeIds.forEach(id => {
            const targetShape = shapes.find(s => s.id === id);
            const nodeRef = id === shape.id ? e.target : selectedShapeRefs.current.get(id);

            if (!targetShape || !nodeRef) {
              return;
            }

            const result = computeShapeUpdateFromNode(targetShape, nodeRef);
            if (!result) {
              return;
            }

            batchUpdates.push({ id, updates: result.updates });
            if (result.resetNode) {
              nodeRef.position({ x: 0, y: 0 });
            }
          });

          if (batchUpdates.length > 0) {
            updateShapes(batchUpdates);
          }
        }

        // Handle single shape drag for special shape types
        if (!isMultiDrag && drawingSelectedShapeIds.length === 1 && shape.id === drawingSelectedShapeIds[0]) {
          if (shape.type === DrawingTool.CALLOUT) {
            const calloutShape = shape as CalloutShape;
            const mode = calloutSelectionModes.get(shape.id) || 'whole';

            // Get the drag delta directly from the event target
            const node = e.target;
            const dx = node.x() / zoomLevel;
            const dy = node.y() / zoomLevel;

            if (mode === 'whole') {
              // Move entire callout including arrow tip
              updateShape(shape.id, {
                textX: calloutShape.textX + dx,
                textY: calloutShape.textY + dy,
                arrowX: calloutShape.arrowX + dx,
                arrowY: calloutShape.arrowY + dy,
                // Update control points if they exist
                ...(calloutShape.curveControl1X !== undefined && calloutShape.curveControl1Y !== undefined && {
                  curveControl1X: calloutShape.curveControl1X + dx,
                  curveControl1Y: calloutShape.curveControl1Y + dy,
                }),
                ...(calloutShape.curveControl2X !== undefined && calloutShape.curveControl2Y !== undefined && {
                  curveControl2X: calloutShape.curveControl2X + dx,
                  curveControl2Y: calloutShape.curveControl2Y + dy,
                })
              });
            } else {
              // Text-only mode: only move the text box - arrow tip stays anchored
              const newTextX = calloutShape.textX + dx;
              const newTextY = calloutShape.textY + dy;

              // Recalculate optimal control points for the new text box position
              const newTextBox = {
                x: newTextX,
                y: newTextY,
                width: calloutShape.textWidth || 120,
                height: calloutShape.textHeight || 40
              };

              const arrowTip = { x: calloutShape.arrowX, y: calloutShape.arrowY };

              // Recalculate the optimal perimeter offset for the new text box position
              const newPerimeterOffset = calculateInitialPerimeterOffset(newTextBox, arrowTip);
              const newBasePoint = perimeterOffsetToPoint(newTextBox, newPerimeterOffset);

              // Always recalculate control points based on new positions
              const newControlPoints = getOptimalControlPoints(newBasePoint, arrowTip, newTextBox);

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
            }

            // Reset node position to origin
            node.position({ x: 0, y: 0 });

            // Clear dragging state
            setDraggingCalloutId(null);
            calloutDragStart.current.delete(shape.id);
          }
        }

        if (isDraggingShape) {
          endDragShape();
        }

        // Clean up drag attributes
        e.target.setAttrs({ _dragStartX: undefined, _dragStartY: undefined });
      },
      // Change cursor when hovering over shapes (but not in AI reference mode)
      onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (stage && activeTool === DrawingTool.SELECT && !drawingState.aiReferenceMode) {
          stage.container().style.cursor = isSelected ? 'move' : 'pointer';
        }
      },
      onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (stage && activeTool === DrawingTool.SELECT && !drawingState.aiReferenceMode) {
          stage.container().style.cursor = 'default';
        }
      },
    };

    switch (shape.type) {
      case DrawingTool.PEN:
        const penShape = shape as PenShape;
        // Check if this is a polygon markup (closed shape with straight edges)
        const isPolygonMarkup = penShape.isMarkup && penShape.id.includes('polygon');
        return (
          <Line
            key={shape.id}
            {...commonProps}
            points={penShape.points}
            stroke={penShape.style.stroke}
            strokeWidth={penShape.style.strokeWidth * (isHovered && !isSelected ? 1.2 : 1)}
            lineCap={penShape.style.lineCap}
            lineJoin={penShape.style.lineJoin}
            tension={isPolygonMarkup ? 0 : (penShape.tension || 0.5)}
            closed={isPolygonMarkup}
            globalCompositeOperation="source-over"
            hitStrokeWidth={Math.max(penShape.style.strokeWidth, 10)}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
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
        const monitoredRectPos = monitorPostDragPosition(shape.id, { x: rectShape.x, y: rectShape.y });
        const rectRenderShape =
          monitoredRectPos.x === rectShape.x && monitoredRectPos.y === rectShape.y
            ? rectShape
            : { ...rectShape, x: monitoredRectPos.x, y: monitoredRectPos.y };
        return (
          <Rect
            key={shape.id}
            {...commonProps}
            x={rectRenderShape.x + rectRenderShape.width / 2}
            y={rectRenderShape.y + rectRenderShape.height / 2}
            width={rectRenderShape.width}
            height={rectRenderShape.height}
            offsetX={rectRenderShape.width / 2}
            offsetY={rectRenderShape.height / 2}
            stroke={rectRenderShape.style.stroke}
            strokeWidth={rectRenderShape.style.strokeWidth * (isHovered && !isSelected ? 1.2 : 1)}
            fill={rectRenderShape.style.fill}
            cornerRadius={rectRenderShape.cornerRadius}
            rotation={rectRenderShape.rotation || 0}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
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
        const monitoredCirclePos = monitorPostDragPosition(shape.id, { x: circleShape.x, y: circleShape.y });
        const circleRenderShape =
          monitoredCirclePos.x === circleShape.x && monitoredCirclePos.y === circleShape.y
            ? circleShape
            : { ...circleShape, x: monitoredCirclePos.x, y: monitoredCirclePos.y };
        return (
          <Circle
            key={shape.id}
            {...commonProps}
            x={circleRenderShape.x}
            y={circleRenderShape.y}
            radius={circleRenderShape.radiusX} // Use radiusX as the radius (they should be equal for circles)
            stroke={circleRenderShape.style.stroke}
            strokeWidth={circleRenderShape.style.strokeWidth * (isHovered && !isSelected ? 1.2 : 1)}
            fill={circleRenderShape.style.fill}
            rotation={circleRenderShape.rotation || 0}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
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
        let currentPoints = arrowShape.points;

        const activeSession = postDragSessionRef.current;
        if (activeSession && activeSession.id === shape.id) {
          const pointsMatchNew = pointsEqual(currentPoints, activeSession.newPoints);
          const pointsMatchOld = pointsEqual(currentPoints, activeSession.oldPoints);

          if (pointsMatchNew) {
            if (pendingNodeResetRef.current && pendingNodeResetRef.current.id === shape.id) {
              const pendingNode = pendingNodeResetRef.current.node;
              const pendingPos = pendingNode.position();
              if (pendingPos.x !== 0 || pendingPos.y !== 0) {
                pendingNode.position({ x: 0, y: 0 });
                pendingNode.getLayer()?.batchDraw();
              }
              pendingNodeResetRef.current = null;
            }
            activeSession.seenNewPoints = true;
          } else if (activeSession.seenNewPoints && pointsMatchOld) {
            currentPoints = activeSession.newPoints as [number, number, number, number];

            if (!activeSession.reapplied) {
              activeSession.reapplied = true;
              requestAnimationFrame(() => {
                const currentSession = postDragSessionRef.current;
                if (currentSession && currentSession.session === activeSession.session) {
                  updateShape(activeSession.id, { points: activeSession.newPoints });
                  postDragSessionRef.current = null;
                }
              });
            }
          }
        }

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

                  let minX = Infinity;
                  let minY = Infinity;
                  let maxX = -Infinity;
                  let maxY = -Infinity;

                  for (let i = 0; i < points.length; i += 2) {
                    minX = Math.min(minX, points[i]);
                    maxX = Math.max(maxX, points[i]);
                    minY = Math.min(minY, points[i + 1]);
                    maxY = Math.max(maxY, points[i + 1]);
                  }

                  const pointerLength = this.pointerLength() || 10;
                  const pointerWidth = this.pointerWidth() || 10;
                  const padding = Math.max(pointerLength, pointerWidth);

                  return {
                    x: minX - padding,
                    y: minY - padding,
                    width: maxX - minX + padding * 2,
                    height: maxY - minY + padding * 2,
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
        const monitoredTextPos = monitorPostDragPosition(shape.id, { x: textShape.x, y: textShape.y });
        const textRenderShape =
          monitoredTextPos.x === textShape.x && monitoredTextPos.y === textShape.y
            ? textShape
            : { ...textShape, x: monitoredTextPos.x, y: monitoredTextPos.y };
        // Center rotation point for text
        const textOffsetX = textRenderShape.width ? textRenderShape.width / 2 : 0;
        const textOffsetY = textRenderShape.height ? textRenderShape.height / 2 : 0;

        return (
          <Text
            key={shape.id}
            {...commonProps}
            x={textRenderShape.x + textOffsetX}
            y={textRenderShape.y + textOffsetY}
            offsetX={textOffsetX}
            offsetY={textOffsetY}
            text={textRenderShape.text}
            fontSize={textRenderShape.fontSize}
            fontFamily={textRenderShape.fontFamily}
            fontStyle={textRenderShape.fontStyle}
            fill={textRenderShape.style.stroke}
            align={textRenderShape.align || 'left'}
            width={textRenderShape.width}
            height={textRenderShape.height}
            wrap="word"
            ellipsis={true}
            rotation={textRenderShape.rotation || 0}
            onDblClick={(e) => {
              e.cancelBubble = true;
              if (onTextShapeEdit) {
                onTextShapeEdit(shape.id);
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

      case DrawingTool.CALLOUT:
        const calloutShape = shape as CalloutShape;
        // Calculate text dimensions
        const textPadding = calloutShape.padding;
        const bgWidth = calloutShape.textWidth || 120;
        const bgHeight = calloutShape.textHeight || 40;

        // Get the current group position (for drag preview)
        const groupNode = selectedShapeRefs.current.get(shape.id);
        // Only use group position while actively dragging to prevent glitches
        const isDraggingThis = draggingCalloutId === shape.id;
        const rawGroupPos = groupNode ? groupNode.position() : { x: 0, y: 0 };
        const groupPos = isDraggingThis ? rawGroupPos : { x: 0, y: 0 };

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

        // Use stored perimeter offset if available, otherwise calculate it
        const currentPerimeterOffset = calloutShape.perimeterOffset !== undefined
          ? calloutShape.perimeterOffset
          : calculateInitialPerimeterOffset(textBox, arrowTip);
        const basePoint = perimeterOffsetToPoint(textBox, currentPerimeterOffset);

        // Use stored control points if available, otherwise calculate optimal ones
        let control1: Point, control2: Point;
        if (calloutShape.curveControl1X !== undefined && calloutShape.curveControl1Y !== undefined &&
            calloutShape.curveControl2X !== undefined && calloutShape.curveControl2Y !== undefined) {
          control1 = { x: calloutShape.curveControl1X, y: calloutShape.curveControl1Y };
          control2 = { x: calloutShape.curveControl2X, y: calloutShape.curveControl2Y };
        } else {
          const optimalPoints = getOptimalControlPoints(basePoint, arrowTip, textBox);
          control1 = optimalPoints.control1;
          control2 = optimalPoints.control2;
        }

        // Modify commonProps based on selection mode
        const calloutGroupProps = {
          ...commonProps,
          // Group is draggable in both modes (just handles the drag differently)
          draggable: activeTool === DrawingTool.SELECT && !isDraggingControlPoint,
        };

        return (
          <Group
            key={shape.id}
            {...calloutGroupProps}
            x={0}
            y={0}
            ref={(node) => {
              if (node) {
                selectedShapeRefs.current.set(shape.id, node);
                // Ensure the group is at origin on initial render
                if (node.x() !== 0 || node.y() !== 0) {
                  node.position({ x: 0, y: 0 });
                }
              } else {
                selectedShapeRefs.current.delete(shape.id);
              }
            }}
            onDblClick={(e) => {
              e.cancelBubble = true;
              if (onTextShapeEdit) {
                onTextShapeEdit(shape.id);
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
              listening={activeTool === DrawingTool.SELECT}
              onClick={(e) => {
                if (activeTool === DrawingTool.SELECT) {
                  e.cancelBubble = true;
                  // Set mode to text-only when clicking text box
                  setCalloutSelectionModes(prev => {
                    const newMap = new Map(prev);
                    newMap.set(shape.id, 'text-only');
                    return newMap;
                  });
                  selectShape(shape.id);
                }
              }}
              draggable={false}
              ref={(node) => {
                if (node) {
                  selectedShapeRefs.current.set(shape.id + '_textbox', node);
                } else {
                  selectedShapeRefs.current.delete(shape.id + '_textbox');
                }
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
              listening={activeTool === DrawingTool.SELECT}
              hitStrokeWidth={Math.max(calloutShape.style.strokeWidth * 3, 10)}
              onClick={(e) => {
                if (activeTool === DrawingTool.SELECT) {
                  e.cancelBubble = true;
                  // Set mode to whole when clicking arrow
                  setCalloutSelectionModes(prev => {
                    const newMap = new Map(prev);
                    newMap.set(shape.id, 'whole');
                    return newMap;
                  });
                  selectShape(shape.id);
                }
              }}
            />

            {/* Arrow head - also subtract group position */}
            <RegularPolygon
              sides={3}
              radius={5}
              x={arrowTip.x - groupPos.x}
              y={arrowTip.y - groupPos.y}
              rotation={calculateArrowHeadRotation(control2, arrowTip)}
              fill={calloutShape.style.stroke}
              listening={activeTool === DrawingTool.SELECT}
              onClick={(e) => {
                if (activeTool === DrawingTool.SELECT) {
                  e.cancelBubble = true;
                  // Set mode to whole when clicking arrowhead
                  setCalloutSelectionModes(prev => {
                    const newMap = new Map(prev);
                    newMap.set(shape.id, 'whole');
                    return newMap;
                  });
                  selectShape(shape.id);
                }
              }}
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
              height={bgHeight - textPadding * 2}
              wrap="word"
              ellipsis={true}
              listening={false}
            />
          </Group>
        );

      case DrawingTool.STAR:
        const starShape = shape as StarShape;
        const monitoredStarPos = monitorPostDragPosition(shape.id, { x: starShape.x, y: starShape.y });
        const starRenderShape =
          monitoredStarPos.x === starShape.x && monitoredStarPos.y === starShape.y
            ? starShape
            : { ...starShape, x: monitoredStarPos.x, y: monitoredStarPos.y };
        return (
          <Star
            key={shape.id}
            {...commonProps}
            x={starRenderShape.x}
            y={starRenderShape.y}
            numPoints={starRenderShape.points || 5}
            outerRadius={starRenderShape.radius}
            innerRadius={starRenderShape.innerRadius || starRenderShape.radius * 0.4}
            stroke={starRenderShape.style.stroke}
            strokeWidth={starRenderShape.style.strokeWidth * (isHovered && !isSelected ? 1.2 : 1)}
            fill={starRenderShape.style.fill}
            opacity={starRenderShape.style.opacity}
            rotation={starRenderShape.rotation || -18}
            ref={(node) => {
              if (node) {
                selectedShapeRefs.current.set(shape.id, node);
              } else {
                selectedShapeRefs.current.delete(shape.id);
              }
            }}
          />
        );

      case DrawingTool.MEASURE:
        const measureShape = shape as MeasurementLineShape;
        const [x1, y1, x2, y2] = measureShape.points;

        // Calculate midpoint for label
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        // Calculate angle for text rotation
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        // Flip text if it would be upside down
        const textAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;

        // Get measurement label
        const measurementLabel = measureShape.measurement
          ? formatMeasurement(measureShape.measurement.value, measureShape.measurement.unit as MeasurementUnit)
          : `${Math.round(Math.sqrt(dx * dx + dy * dy))}px`;

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
            <Line
              points={measureShape.points}
              stroke={measureShape.isCalibration ? '#4a90e2' : measureShape.style.stroke}
              strokeWidth={measureShape.style.strokeWidth * (isHovered && !isSelected ? 1.2 : 1)}
              lineCap="round"
              lineJoin="round"
              opacity={measureShape.style.opacity}
              dash={measureShape.isCalibration ? [5, 5] : undefined}
              hitStrokeWidth={20} // Make it easier to select the line
            />

            {/* End caps */}
            <Line
              points={[x1 - 5 * Math.sin(angle * Math.PI / 180), y1 + 5 * Math.cos(angle * Math.PI / 180),
                      x1 + 5 * Math.sin(angle * Math.PI / 180), y1 - 5 * Math.cos(angle * Math.PI / 180)]}
              stroke={measureShape.isCalibration ? '#4a90e2' : measureShape.style.stroke}
              strokeWidth={measureShape.style.strokeWidth}
              opacity={measureShape.style.opacity}
            />
            <Line
              points={[x2 - 5 * Math.sin(angle * Math.PI / 180), y2 + 5 * Math.cos(angle * Math.PI / 180),
                      x2 + 5 * Math.sin(angle * Math.PI / 180), y2 - 5 * Math.cos(angle * Math.PI / 180)]}
              stroke={measureShape.isCalibration ? '#4a90e2' : measureShape.style.stroke}
              strokeWidth={measureShape.style.strokeWidth}
              opacity={measureShape.style.opacity}
            />

            {/* Measurement label with background */}
            <Group
              x={midX}
              y={midY}
              rotation={textAngle}
              listening={false}
            >
              {/* Background rectangle */}
              <Rect
                x={-50} // Will be updated by ref
                y={-30} // 20px above line + 10px for half height
                width={100} // Will be updated by ref
                height={20}
                fill="#ffffff"
                opacity={0.85}
                cornerRadius={2}
                listening={false}
              />
              {/* Text */}
              <Text
                x={0}
                y={-26} // 20px above line + 6px for text baseline
                text={measurementLabel}
                fontSize={12 / zoomLevel}
                fontFamily="Arial"
                fill={measureShape.isCalibration ? '#4a90e2' : '#333333'}
                align="center"
                listening={false}
                ref={(node) => {
                  if (node) {
                    const textWidth = node.width();
                    const boxWidth = textWidth + 8;

                    // Center the text horizontally
                    node.x(-textWidth / 2);

                    // Update background rectangle
                    const parent = node.getParent();
                    if (parent) {
                      const bgRect = parent.findOne('Rect');
                      if (bgRect) {
                        bgRect.setAttrs({
                          x: -boxWidth / 2,
                          width: boxWidth,
                        });
                      }
                    }
                  }
                }}
              />
            </Group>

            {/* Calibration icon */}
            {measureShape.isCalibration && (
              <Text
                x={x1 - 15}
                y={y1 - 15}
                text="📐"
                fontSize={16 / zoomLevel}
                listening={false}
              />
            )}
          </Group>
        );

      case DrawingTool.IMAGE:
        const imageShape = shape as ImageShape;
        const monitoredImagePos = monitorPostDragPosition(shape.id, { x: imageShape.x, y: imageShape.y });
        const imageRenderShape =
          monitoredImagePos.x === imageShape.x && monitoredImagePos.y === imageShape.y
            ? imageShape
            : { ...imageShape, x: monitoredImagePos.x, y: monitoredImagePos.y };
        return (
          <ImageShapeComponent
            key={shape.id}
            shape={imageRenderShape}
            commonProps={commonProps}
            onRef={(node) => {
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

  // Render measurement control points
  const renderMeasurementControlPoints = (): React.ReactNode => {
    if (activeTool !== DrawingTool.SELECT || drawingSelectedShapeIds.length !== 1) {
      return null;
    }

    const selectedShape = shapes.find(s => s.id === drawingSelectedShapeIds[0]);
    if (!selectedShape || selectedShape.type !== DrawingTool.MEASURE) {
      return null;
    }

    // Don't show control points if we're transforming
    if (isTransforming) {
      return null;
    }

    const measureShape = selectedShape as MeasurementLineShape;
    const measureNode = selectedShapeRefs.current.get(measureShape.id);
    if (!measureNode) return null;

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
      if (drawingState.measurementCalibration.pixelsPerUnit) {
        const pixelDistance = Math.sqrt(
          Math.pow(newPoints[2] - newPoints[0], 2) +
          Math.pow(newPoints[3] - newPoints[1], 2)
        );
        const value = pixelsToMeasurement(
          pixelDistance,
          drawingState.measurementCalibration.pixelsPerUnit,
          drawingState.measurementCalibration.unit as MeasurementUnit
        );

        updateShape(measureShape.id, {
          points: newPoints,
          measurement: {
            value,
            unit: drawingState.measurementCalibration.unit,
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

  // Render arrow control points
  const renderArrowControlPoints = (): React.ReactNode => {

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

    const arrowShape = selectedShape as ArrowShape;
    let arrowPoints = arrowShape.points;

    const postDragSession = postDragSessionRef.current;
    if (
      postDragSession &&
      postDragSession.id === arrowShape.id &&
      postDragSession.seenNewPoints &&
      pointsEqual(arrowShape.points, postDragSession.oldPoints)
    ) {
      arrowPoints = postDragSession.newPoints as [number, number, number, number];
    }

    // Don't show control points if the arrow itself is being dragged
    // This prevents control points from updating with stale data
    if (draggedArrowId === arrowShape.id || currentlyDraggingShapeId === arrowShape.id) {
      return null;
    }

    const arrowNode = selectedShapeRefs.current.get(arrowShape.id);
    if (!arrowNode) return null;

    // Get the arrow's current position (changes during drag)
    const nodePos = arrowNode.position();
    const [x1, y1, x2, y2] = arrowPoints;


    // Add the node's current position to get actual control point positions
    const actualX1 = x1 + nodePos.x;
    const actualY1 = y1 + nodePos.y;
    const actualX2 = x2 + nodePos.x;
    const actualY2 = y2 + nodePos.y;

    const handleControlPointDragMove = (index: number, e: Konva.KonvaEventObject<DragEvent>): void => {
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

    const handleControlPointDragEnd = (_index: number, e: Konva.KonvaEventObject<DragEvent>): void => {
      e.cancelBubble = true;
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
  const renderCalloutControlPoints = (): React.ReactNode => {
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
                  const newArrowTip = { x: arrowTip.x + dx, y: arrowTip.y + dy };

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
        })()}
      </>
    );
  };

  // Helper function to check if a point is near the first point of the polygon
  const isNearFirstPoint = (currentPos: Point, firstPoint: Point, threshold: number = 10): boolean => {
    const dx = currentPos.x - firstPoint.x;
    const dy = currentPos.y - firstPoint.y;
    return Math.sqrt(dx * dx + dy * dy) <= threshold;
  };

  // Generative fill mouse event handlers
  const handleGenerativeFillMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (!drawingState.generativeFillMode?.isActive) return;

    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;

    const { selectionTool, selectionPoints } = drawingState.generativeFillMode;

    if (selectionTool === 'polygon') {
      // Polygon is click-based, not drag-based
      const newPoint = { x: pos.x / zoomLevel, y: pos.y / zoomLevel };
      
      // Check if we should close the polygon
      if (selectionPoints.length >= 3 && isNearFirstPoint(newPoint, selectionPoints[0], 10 / zoomLevel)) {
        // Close polygon - trigger completion
        // TODO: This will be handled by the completion logic
        setPolygonPreviewPoint(null);
        return;
      }
      
      // Add point to polygon
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        points: [...selectionPoints, newPoint],
      });
      return;
    }

    setIsGenerativeFillDrawing(true);

    if (selectionTool === 'brush' || selectionTool === 'lasso') {
      // Start collecting points
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        points: [{ x: pos.x / zoomLevel, y: pos.y / zoomLevel }],
      });
    } else if (selectionTool === 'rectangle') {
      // Start rectangle
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        rectangle: { x: pos.x / zoomLevel, y: pos.y / zoomLevel, width: 0, height: 0 },
      });
    }
  };

  const handleGenerativeFillMouseMove = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (!drawingState.generativeFillMode?.isActive) return;
    if (!e.target.getStage()) return;

    const pos = e.target.getStage()!.getPointerPosition();
    if (!pos) return;

    const { selectionTool, selectionPoints, selectionRectangle } = drawingState.generativeFillMode;

    // Handle polygon preview point
    if (selectionTool === 'polygon') {
      setPolygonPreviewPoint({ x: pos.x / zoomLevel, y: pos.y / zoomLevel });
      return;
    }

    // Other tools require mouse to be down
    if (!isGenerativeFillDrawing) return;

    if ((selectionTool === 'brush' || selectionTool === 'lasso') && selectionPoints.length > 0) {
      // Add point to path
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        points: [...selectionPoints, { x: pos.x / zoomLevel, y: pos.y / zoomLevel }],
      });
    } else if (selectionTool === 'rectangle' && selectionRectangle) {
      // Update rectangle size
      dispatch({
        type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION,
        rectangle: {
          ...selectionRectangle,
          width: (pos.x / zoomLevel) - selectionRectangle.x,
          height: (pos.y / zoomLevel) - selectionRectangle.y,
        },
      });
    }
  };

  const handleGenerativeFillMouseUp = (): void => {
    setIsGenerativeFillDrawing(false);
  };

  const handleGenerativeFillDoubleClick = (): void => {
    if (!drawingState.generativeFillMode?.isActive) return;
    
    const { selectionTool, selectionPoints } = drawingState.generativeFillMode;
    
    // Close polygon on double-click if we have at least 3 points
    if (selectionTool === 'polygon' && selectionPoints.length >= 3) {
      // TODO: Trigger polygon completion
      setPolygonPreviewPoint(null);
    }
  };

  return (
    <Layer
      name="drawingLayer"
      scaleX={zoomLevel}
      scaleY={zoomLevel}
    >
      {/* Invisible rect to capture mouse events for generative fill */}
      {drawingState.generativeFillMode?.isActive && stageRef.current && (
        <Rect
          x={0}
          y={0}
          width={stageRef.current.width() / zoomLevel}
          height={stageRef.current.height() / zoomLevel}
          fill="transparent"
          listening={true}
          onMouseDown={handleGenerativeFillMouseDown}
          onMouseMove={handleGenerativeFillMouseMove}
          onMouseUp={handleGenerativeFillMouseUp}
          onDblClick={handleGenerativeFillDoubleClick}
        />
      )}

      {/* Render all shapes in z-order */}
      {getSortedShapes().map(renderShape)}

      {/* Render AI markup shapes (separate from main shapes, not in undo history) */}
      {drawingState.aiMarkupShapes.map(renderShape)}

      {/* Render temporary drawing preview above other shapes */}
      <Group listening={false}>
        <TempDrawingPreview
          activeTool={activeTool}
          tempPoints={tempPoints}
          currentStyle={currentStyle}
          zoomLevel={zoomLevel}
          measurementCalibration={drawingState.measurementCalibration}
          isDrawing={isDrawing}
        />
      </Group>

      {/* Render markup preview for AI Reference mode */}
      {drawingState.aiReferenceMode && (
        <Group listening={false}>
          <MarkupPreview
            aiReferenceSubTool={drawingState.aiReferenceSubTool}
            isMarkupDrawing={isMarkupDrawing}
            isPolygonMarkupDrawing={isPolygonMarkupDrawing}
            markupTempPoints={markupTempPoints}
            polygonMarkupPreviewPoint={polygonMarkupPreviewPoint}
          />
        </Group>
      )}

      {/* Render generative fill selection overlay */}
      {drawingState.generativeFillMode?.isActive && (
        <SelectionOverlay
          selectionTool={drawingState.generativeFillMode.selectionTool}
          selectionPoints={drawingState.generativeFillMode.selectionPoints}
          selectionRectangle={drawingState.generativeFillMode.selectionRectangle}
          brushWidth={drawingState.generativeFillMode.brushWidth}
          polygonPreviewPoint={polygonPreviewPoint ?? undefined}
        />
      )}

      {/* Render generative fill result preview */}
      {drawingState.generativeFillMode?.generatedResult && (
        <ResultOverlay
          imageData={drawingState.generativeFillMode.generatedResult.imageData}
          bounds={drawingState.generativeFillMode.generatedResult.bounds}
        />
      )}

      {/* AI thinking overlay now rendered in WorkspaceCanvas as HTML/CSS overlay */}

      {/* Render selection rectangle */}
      <SelectionBoxRenderer
        isDragSelecting={isDragSelecting}
        selectionBox={selectionBox}
      />

      {/* Render transformer for selected shapes (hidden in AI Reference drawing mode) */}
      {activeTool === DrawingTool.SELECT && drawingSelectedShapeIds.length > 0 &&
       !(drawingState.aiReferenceMode && drawingState.aiReferenceSubTool !== AIReferenceSubTool.PIN) && (
        <Transformer
          key={drawingSelectedShapeIds.join(',')}
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
          resizeEnabled={(() => {
            // Check if we have a callout in whole mode
            if (drawingSelectedShapeIds.length === 1) {
              const shape = shapes.find(s => s.id === drawingSelectedShapeIds[0]);
              if (shape?.type === DrawingTool.CALLOUT) {
                const mode = calloutSelectionModes.get(shape.id) || 'whole';
                // Disable resize in whole mode
                return mode === 'text-only';
              }
            }
            return true;
          })()}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
          ignoreStroke={false}
          rotationSnaps={[]}
          keepRatio={false}
          rotationSnapTolerance={5}
          boundBoxFunc={(oldBox, newBox) => {
            // Check if any selected shape is a measurement line
            const hasMeasurementLine = drawingSelectedShapeIds.some(id => {
              const shape = shapes.find(s => s.id === id);
              return shape?.type === DrawingTool.MEASURE;
            });

            // If it's a measurement line, prevent resize (only allow rotation/move)
            if (hasMeasurementLine) {
              return {
                ...newBox,
                width: oldBox.width,
                height: oldBox.height
              };
            }

            // For other shapes, allow resize but enforce minimum size
            return {
              ...newBox,
              width: Math.max(10, newBox.width),
              height: Math.max(10, newBox.height)
            };
          }}
          onTransformStart={(e) => {
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
          }}
          onTransform={(e) => {
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
          }}
          onTransformEnd={() => {
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
          }}
          />
        )}

      {/* Render arrow control points */}
      {renderArrowControlPoints()}

      {/* Render measurement control points */}
      {renderMeasurementControlPoints()}

      {/* Render callout control points */}
      {renderCalloutControlPoints()}
    </Layer>
  );
};
