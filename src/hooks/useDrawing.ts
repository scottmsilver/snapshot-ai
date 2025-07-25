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
  type CalloutShape,
  type StarShape,
  type MeasurementLineShape,
} from '@/types/drawing';
import { calculateInitialPerimeterOffset, perimeterOffsetToPoint, getOptimalControlPoints } from '@/utils/calloutGeometry';

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
      case DrawingTool.CALLOUT:
      case DrawingTool.STAR:
      case DrawingTool.MEASURE:
      case DrawingTool.CALIBRATE:
      case DrawingTool.SCREENSHOT:
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
      case DrawingTool.CALLOUT:
      case DrawingTool.STAR:
      case DrawingTool.MEASURE:
      case DrawingTool.CALIBRATE:
      case DrawingTool.SCREENSHOT:
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

      case DrawingTool.CALLOUT:
        // Calculate text box dimensions
        const textBoxWidth = 120;
        const textBoxHeight = 40;
        const padding = 10;
        
        // First click is arrow tip (what we're pointing at)
        // End point is where the text box should be
        const arrowTipX = startPoint.x;
        const arrowTipY = startPoint.y;
        
        // Calculate text box position based on drag direction
        // Ensure reasonable distance from arrow tip
        const minDistance = 100; // Increased minimum distance
        const calloutDx = endPoint.x - startPoint.x;
        const calloutDy = endPoint.y - startPoint.y;
        const distance = Math.sqrt(calloutDx * calloutDx + calloutDy * calloutDy);
        
        let textX: number, textY: number;
        
        if (distance < 10) {
          // If it's essentially a click (no drag), position text box to the upper-right by default
          // This is a common annotation pattern
          textX = arrowTipX + minDistance * 0.7 - textBoxWidth / 2;
          textY = arrowTipY - minDistance * 0.7 - textBoxHeight / 2;
        } else if (distance < minDistance) {
          // If drag was too short, extend in the same direction
          const angle = Math.atan2(calloutDy, calloutDx);
          textX = arrowTipX + Math.cos(angle) * minDistance - textBoxWidth / 2;
          textY = arrowTipY + Math.sin(angle) * minDistance - textBoxHeight / 2;
        } else {
          // Position text box centered at end point
          textX = endPoint.x - textBoxWidth / 2;
          textY = endPoint.y - textBoxHeight / 2;
        }
        
        // Calculate initial perimeter offset for arrow base
        const textBox = {
          x: textX,
          y: textY,
          width: textBoxWidth,
          height: textBoxHeight
        };
        
        const perimeterOffset = calculateInitialPerimeterOffset(textBox, { x: arrowTipX, y: arrowTipY });
        const basePoint = perimeterOffsetToPoint(textBox, perimeterOffset);
        
        // Use optimal cubic Bezier control points to avoid rectangle intersection
        const controlPoints = getOptimalControlPoints(
          basePoint, 
          { x: arrowTipX, y: arrowTipY },
          textBox
        );
        
        newShape = {
          id: generateId(),
          type: DrawingTool.CALLOUT,
          textX: textX,
          textY: textY,
          text: 'Callout',
          fontSize: 16,
          fontFamily: state.currentStyle.fontFamily || 'Arial',
          textWidth: textBoxWidth,
          textHeight: textBoxHeight,
          padding: padding,
          arrowX: arrowTipX,
          arrowY: arrowTipY,
          perimeterOffset: perimeterOffset,
          curveControl1X: controlPoints.control1.x,
          curveControl1Y: controlPoints.control1.y,
          curveControl2X: controlPoints.control2.x,
          curveControl2Y: controlPoints.control2.y,
          backgroundColor: '#ffffff',
          borderRadius: 4,
          style: { ...state.currentStyle },
          visible: true,
          locked: false,
          zIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as CalloutShape;
        break;

      case DrawingTool.STAR:
        // Calculate radius from center point (start) to edge (end)
        const starDx = endPoint.x - startPoint.x;
        const starDy = endPoint.y - startPoint.y;
        const starRadius = Math.sqrt(starDx * starDx + starDy * starDy);
        
        newShape = {
          id: generateId(),
          type: DrawingTool.STAR,
          x: startPoint.x,
          y: startPoint.y,
          radius: starRadius,
          innerRadius: starRadius * 0.38, // Golden ratio for nice-looking stars
          points: 5,
          style: { ...state.currentStyle },
          visible: true,
          locked: false,
          zIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          rotation: -18, // Point upward by default
        } as StarShape;
        break;

      case DrawingTool.MEASURE:
        if (state.tempPoints.length >= 2) {
          const [p1, p2] = state.tempPoints;
          
          newShape = {
            id: generateId(),
            type: DrawingTool.MEASURE,
            points: [p1.x, p1.y, p2.x, p2.y],
            isCalibration: false, // Will be set to true by measurement logic if needed
            style: { 
              ...state.currentStyle,
              stroke: '#333333', // Default color for measurement lines
            },
            visible: true,
            locked: false,
            zIndex: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          } as MeasurementLineShape;
        }
        break;

      case DrawingTool.CALIBRATE:
        if (state.tempPoints.length >= 2) {
          const [p1, p2] = state.tempPoints;
          
          newShape = {
            id: generateId(),
            type: DrawingTool.MEASURE,
            points: [p1.x, p1.y, p2.x, p2.y],
            isCalibration: true, // This is a calibration line
            style: { 
              ...state.currentStyle,
              stroke: '#4a90e2', // Blue for calibration
              dash: [5, 5], // Dashed line
            },
            visible: true,
            locked: false,
            zIndex: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          } as MeasurementLineShape;
        }
        break;

      case DrawingTool.SCREENSHOT:
        // For screenshot, we don't create a shape immediately
        // Instead, we'll capture the area and create an IMAGE shape
        // The capture logic will be handled in the component
        setDrawingState({
          ...state,
          isDrawing: false,
          tempPoints: [],
          startPoint: null,
          lastPoint: null,
        });
        
        // Return the selected area bounds for the parent to handle
        const screenshotBounds = {
          x: Math.min(startPoint.x, endPoint.x),
          y: Math.min(startPoint.y, endPoint.y),
          width: Math.abs(endPoint.x - startPoint.x),
          height: Math.abs(endPoint.y - startPoint.y)
        };
        
        // Trigger a custom event with the bounds
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('screenshot-area-selected', {
            detail: screenshotBounds
          }));
        }
        return;
    }

    // Add shape if created
    if (newShape) {
      addShape(newShape);
      
      // Select the shape after a small delay to ensure it's been added to state
      setTimeout(() => {
        selectShape(newShape.id);
      }, 10);
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
    selectShape,
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
      case 'l':
        setActiveTool(DrawingTool.CALLOUT);
        break;
      case 's':
        setActiveTool(DrawingTool.STAR);
        break;
      case 'm':
        setActiveTool(DrawingTool.MEASURE);
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