import { useCallback, useRef } from 'react';
import { useDrawingContext } from '@/contexts/DrawingContext';
import {
  DrawingTool,
  LayerOperation,
  type Point,
  type Shape,
  type PenShape,
  type RectShape,
  type CircleShape,
  type ArrowShape,
} from '@/types/drawing';

export const useDrawing = () => {
  const {
    state,
    setActiveTool,
    updateStyle,
    addShape,
    updateShape,
    deleteShape,
    deleteSelected,
    selectShape,
    selectMultiple,
    clearSelection,
    setDrawingState,
    setTempPoints,
    setActiveShape,
    reorderShape,
    getSortedShapes,
  } = useDrawingContext();

  const isDrawingRef = useRef(false);

  // Generate unique ID for shapes
  const generateId = () => `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;


  // Start drawing based on current tool
  const startDrawing = useCallback((point: Point, _event?: React.MouseEvent) => {
    if (state.activeTool === DrawingTool.SELECT) {
      // Handle selection logic
      return;
    }

    isDrawingRef.current = true;
    setDrawingState(true, point, point);
    setTempPoints([point]);

    // Handle different tools
    switch (state.activeTool) {
      case DrawingTool.PEN:
        // Initialize pen drawing
        break;

      case DrawingTool.RECTANGLE:
      case DrawingTool.CIRCLE:
      case DrawingTool.ARROW:
        // These tools need start and end points
        break;

      case DrawingTool.TEXT:
        // Text tool is handled in DrawingLayer with dialog
        return;
    }
  }, [state.activeTool, setDrawingState, setTempPoints]);

  // Continue drawing (mouse move)
  const continueDrawing = useCallback((point: Point, _event?: React.MouseEvent) => {
    if (!isDrawingRef.current || !state.isDrawing) return;

    const startPoint = state.startPoint;
    if (!startPoint) return;

    setDrawingState(true, startPoint, point);

    switch (state.activeTool) {
      case DrawingTool.PEN:
        // Add point to path
        setTempPoints([...state.tempPoints, point]);
        break;

      case DrawingTool.RECTANGLE:
      case DrawingTool.CIRCLE:
      case DrawingTool.ARROW:
        // Update end point for preview
        setTempPoints([startPoint, point]);
        break;
    }
  }, [state.activeTool, state.isDrawing, state.startPoint, state.tempPoints, setDrawingState, setTempPoints]);

  // Finish drawing (mouse up)
  const finishDrawing = useCallback((point?: Point, _event?: React.MouseEvent) => {
    if (!isDrawingRef.current || !state.isDrawing) return;

    const startPoint = state.startPoint;
    if (!startPoint) return;

    const endPoint = point || state.lastPoint;
    if (!endPoint) return;

    let newShape: Shape | null = null;

    switch (state.activeTool) {
      case DrawingTool.PEN:
        if (state.tempPoints.length > 1) {
          // Convert points to flat array
          const flatPoints: number[] = [];
          state.tempPoints.forEach(p => {
            flatPoints.push(p.x, p.y);
          });

          newShape = {
            id: generateId(),
            type: DrawingTool.PEN,
            points: flatPoints,
            style: { ...state.currentStyle },
            visible: true,
            locked: false,
            zIndex: 0, // Will be set by addShape
            createdAt: Date.now(),
            updatedAt: Date.now(),
            tension: 0.5,
          } as PenShape;
        }
        break;

      case DrawingTool.RECTANGLE:
        const width = endPoint.x - startPoint.x;
        const height = endPoint.y - startPoint.y;
        
        newShape = {
          id: generateId(),
          type: DrawingTool.RECTANGLE,
          x: Math.min(startPoint.x, endPoint.x),
          y: Math.min(startPoint.y, endPoint.y),
          width: Math.abs(width),
          height: Math.abs(height),
          style: { ...state.currentStyle },
          visible: true,
          locked: false,
          zIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as RectShape;
        break;

      case DrawingTool.CIRCLE:
        // Calculate distance from start point to end point
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        // Use the larger dimension to create a perfect circle
        const radius = Math.max(Math.abs(dx), Math.abs(dy)) / 2;
        // Center based on the start point and the direction of drag
        const centerX = startPoint.x + (dx > 0 ? radius : -radius);
        const centerY = startPoint.y + (dy > 0 ? radius : -radius);

        newShape = {
          id: generateId(),
          type: DrawingTool.CIRCLE,
          x: centerX,
          y: centerY,
          radiusX: radius,
          radiusY: radius,
          style: { ...state.currentStyle },
          visible: true,
          locked: false,
          zIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as CircleShape;
        break;

      case DrawingTool.ARROW:
        newShape = {
          id: generateId(),
          type: DrawingTool.ARROW,
          points: [startPoint.x, startPoint.y, endPoint.x, endPoint.y],
          style: { ...state.currentStyle },
          visible: true,
          locked: false,
          zIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          pointerLength: 10,
          pointerWidth: 10,
        } as ArrowShape;
        break;
    }

    // Add shape if created
    if (newShape) {
      addShape(newShape);
    }

    // Reset drawing state
    isDrawingRef.current = false;
    setDrawingState(false, null, null);
    setTempPoints([]);
    setActiveShape(null);
    
    // Switch to select tool after creating a shape (except for pen tool which allows continuous drawing)
    if (newShape && state.activeTool !== DrawingTool.PEN) {
      setActiveTool(DrawingTool.SELECT);
    }
  }, [
    state.activeTool,
    state.isDrawing,
    state.startPoint,
    state.lastPoint,
    state.tempPoints,
    state.currentStyle,
    addShape,
    setDrawingState,
    setTempPoints,
    setActiveShape,
    setActiveTool,
  ]);

  // Cancel current drawing operation
  const cancelDrawing = useCallback(() => {
    isDrawingRef.current = false;
    setDrawingState(false, null, null);
    setTempPoints([]);
    setActiveShape(null);
  }, [setDrawingState, setTempPoints, setActiveShape]);

  // Handle keyboard shortcuts for tools
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    // Don't handle if user is typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'v':
        setActiveTool(DrawingTool.SELECT);
        break;
      case 'p':
        setActiveTool(DrawingTool.PEN);
        break;
      case 'r':
        setActiveTool(DrawingTool.RECTANGLE);
        break;
      case 'c':
        setActiveTool(DrawingTool.CIRCLE);
        break;
      case 'a':
        setActiveTool(DrawingTool.ARROW);
        break;
      case 't':
        setActiveTool(DrawingTool.TEXT);
        break;
      case 'delete':
      case 'backspace':
        if (state.selectedShapeIds.length > 0) {
          deleteSelected();
        }
        break;
      case 'escape':
        if (state.isDrawing) {
          cancelDrawing();
        } else {
          clearSelection();
        }
        break;
    }

    // Layer operations
    if (e.ctrlKey || e.metaKey) {
      if (state.selectedShapeIds.length === 1) {
        const shapeId = state.selectedShapeIds[0];
        if (e.key === ']') {
          if (e.shiftKey) {
            reorderShape(shapeId, LayerOperation.BRING_TO_FRONT);
          } else {
            reorderShape(shapeId, LayerOperation.BRING_FORWARD);
          }
        } else if (e.key === '[') {
          if (e.shiftKey) {
            reorderShape(shapeId, LayerOperation.SEND_TO_BACK);
          } else {
            reorderShape(shapeId, LayerOperation.SEND_BACKWARD);
          }
        }
      }
    }
  }, [
    state.selectedShapeIds,
    state.isDrawing,
    setActiveTool,
    deleteSelected,
    clearSelection,
    cancelDrawing,
    reorderShape,
  ]);

  return {
    // State
    activeTool: state.activeTool,
    currentStyle: state.currentStyle,
    isDrawing: state.isDrawing,
    shapes: state.shapes,
    selectedShapeIds: state.selectedShapeIds,
    tempPoints: state.tempPoints,
    
    // Tool management
    setActiveTool,
    
    // Style management
    updateStyle,
    
    // Drawing operations
    startDrawing,
    continueDrawing,
    finishDrawing,
    cancelDrawing,
    
    // Shape management
    addShape,
    updateShape,
    deleteShape,
    deleteSelected,
    
    // Selection
    selectShape,
    selectMultiple,
    clearSelection,
    
    // Z-order
    reorderShape,
    
    // Helpers
    getSortedShapes,
    handleKeyPress,
  };
};