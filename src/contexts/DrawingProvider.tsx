import React, { useReducer, useCallback, type ReactNode } from 'react';
import {
  DrawingTool,
  type DrawingStyle,
  type Shape,
  type Point,
  LayerOperation,
  AIReferenceSubTool,
  getNextZIndex,
  sortShapesByZIndex,
} from '@/types/drawing';
import {
  DrawingContext,
  DrawingActionType,
  drawingReducer,
  initialState,
  type DrawingContextType,
} from '@/contexts/DrawingContext';

interface DrawingProviderProps {
  children: ReactNode;
}

export const DrawingProvider: React.FC<DrawingProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(drawingReducer, initialState);

  const setActiveTool = useCallback((tool: DrawingTool) => {
    dispatch({ type: DrawingActionType.SET_TOOL, tool });
  }, []);

  const updateStyle = useCallback((style: Partial<DrawingStyle>) => {
    dispatch({ type: DrawingActionType.UPDATE_STYLE, style });
  }, []);

  const setShapes = useCallback((shapes: Shape[]) => {
    dispatch({ type: DrawingActionType.SET_SHAPES, shapes });
  }, []);

  const addShape = useCallback((shape: Omit<Shape, 'zIndex'>) => {
    const fullShape: Shape = {
      ...shape,
      zIndex: getNextZIndex(state.shapes),
    } as Shape;
    dispatch({ type: DrawingActionType.ADD_SHAPE, shape: fullShape });
  }, [state.shapes]);

  const updateShape = useCallback((id: string, updates: Partial<Shape>) => {
    dispatch({ type: DrawingActionType.UPDATE_SHAPE, id, updates });
  }, []);

  const updateShapes = useCallback((updates: Array<{ id: string; updates: Partial<Shape> }>) => {
    if (updates.length === 0) {
      return;
    }
    dispatch({ type: DrawingActionType.UPDATE_SHAPES, updates });
  }, []);

  const deleteShape = useCallback((id: string) => {
    dispatch({ type: DrawingActionType.DELETE_SHAPE, id });
  }, []);

  const deleteShapes = useCallback((ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    dispatch({ type: DrawingActionType.DELETE_SHAPES, ids });
  }, []);

  const deleteSelected = useCallback(() => {
    deleteShapes(state.selectedShapeIds);
  }, [deleteShapes, state.selectedShapeIds]);

  const selectShape = useCallback((id: string, multi?: boolean) => {
    dispatch({ type: DrawingActionType.SELECT_SHAPE, id, multi });
  }, []);

  const selectMultiple = useCallback((ids: string[]) => {
    dispatch({ type: DrawingActionType.SELECT_MULTIPLE, ids });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: DrawingActionType.CLEAR_SELECTION });
  }, []);

  const setDrawingState = useCallback((
    isDrawing: boolean,
    startPoint?: Point | null,
    lastPoint?: Point | null,
  ) => {
    dispatch({
      type: DrawingActionType.SET_DRAWING_STATE,
      isDrawing,
      startPoint,
      lastPoint,
    });
  }, []);

  const setTempPoints = useCallback((points: Point[]) => {
    dispatch({ type: DrawingActionType.SET_TEMP_POINTS, points });
  }, []);

  const setActiveShape = useCallback((shape: Shape | null) => {
    dispatch({ type: DrawingActionType.SET_ACTIVE_SHAPE, shape });
  }, []);

  const reorderShape = useCallback((id: string, operation: LayerOperation) => {
    dispatch({ type: DrawingActionType.REORDER_SHAPE, id, operation });
  }, []);

  const setMeasurementCalibration = useCallback((calibration: {
    pixelsPerUnit: number | null;
    unit: string;
    calibrationLineId: string | null;
  }) => {
    dispatch({ type: DrawingActionType.SET_MEASUREMENT_CALIBRATION, calibration });
  }, []);

  const getSortedShapes = useCallback(() => {
    return sortShapesByZIndex(state.shapes);
  }, [state.shapes]);

  const copySelectedShapes = useCallback(() => {
    const selectedShapes = state.shapes.filter(shape => state.selectedShapeIds.includes(shape.id));
    if (selectedShapes.length > 0) {
      dispatch({ type: DrawingActionType.COPY_SHAPES, shapes: selectedShapes });
    }
  }, [state.shapes, state.selectedShapeIds]);

  const pasteShapes = useCallback((offset?: Point) => {
    if (state.clipboard.length > 0) {
      dispatch({ type: DrawingActionType.PASTE_SHAPES, offset });
    }
  }, [state.clipboard]);

  const setAiReferenceMode = useCallback((enabled: boolean) => {
    dispatch({ type: DrawingActionType.SET_AI_REFERENCE_MODE, enabled });
  }, []);

  const addReferencePoint = useCallback((point: { x: number; y: number }) => {
    dispatch({ type: DrawingActionType.ADD_REFERENCE_POINT, point });
  }, []);

  const clearReferencePoints = useCallback(() => {
    dispatch({ type: DrawingActionType.CLEAR_REFERENCE_POINTS });
  }, []);

  const removeReferencePoint = useCallback((id: string) => {
    dispatch({ type: DrawingActionType.REMOVE_REFERENCE_POINT, id });
  }, []);

  const setAiMoveState = useCallback((state: Partial<import('@/types/drawing').AiMoveState>) => {
    dispatch({ type: DrawingActionType.SET_AI_MOVE_STATE, state });
  }, []);

  const clearAiMoveState = useCallback(() => {
    dispatch({ type: DrawingActionType.CLEAR_AI_MOVE_STATE });
  }, []);

  const setAiReferenceSubTool = useCallback((subTool: AIReferenceSubTool) => {
    dispatch({ type: DrawingActionType.SET_AI_REFERENCE_SUB_TOOL, subTool });
  }, []);

  const addAiMarkupShape = useCallback((shape: Shape) => {
    dispatch({ type: DrawingActionType.ADD_AI_MARKUP_SHAPE, shape });
  }, []);

  const clearAiMarkupShapes = useCallback(() => {
    dispatch({ type: DrawingActionType.CLEAR_AI_MARKUP_SHAPES });
  }, []);

  const value: DrawingContextType = {
    state,
    dispatch,
    setActiveTool,
    updateStyle,
    setShapes,
    addShape,
    updateShape,
    updateShapes,
    deleteShape,
    deleteShapes,
    deleteSelected,
    selectShape,
    selectMultiple,
    clearSelection,
    setDrawingState,
    setTempPoints,
    setActiveShape,
    reorderShape,
    setMeasurementCalibration,
    getSortedShapes,
    copySelectedShapes,
    pasteShapes,
    setAiReferenceMode,
    addReferencePoint,
    clearReferencePoints,
    removeReferencePoint,
    setAiMoveState,
    clearAiMoveState,
    setAiReferenceSubTool,
    addAiMarkupShape,
    clearAiMarkupShapes,
  };

  return <DrawingContext.Provider value={value}>{children}</DrawingContext.Provider>;
};
