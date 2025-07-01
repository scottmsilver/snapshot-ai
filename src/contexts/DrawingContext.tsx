import React, { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import {
  DrawingTool,
  DrawingMode,
  type DrawingStyle,
  type DrawingState,
  type Shape,
  type Point,
  LayerOperation,
  getNextZIndex,
  reorderShapes,
  sortShapesByZIndex
} from '@/types/drawing';

// Action types
export enum DrawingActionType {
  SET_TOOL = 'SET_TOOL',
  SET_MODE = 'SET_MODE',
  UPDATE_STYLE = 'UPDATE_STYLE',
  SET_SHAPES = 'SET_SHAPES',
  ADD_SHAPE = 'ADD_SHAPE',
  UPDATE_SHAPE = 'UPDATE_SHAPE',
  DELETE_SHAPE = 'DELETE_SHAPE',
  SELECT_SHAPE = 'SELECT_SHAPE',
  SELECT_MULTIPLE = 'SELECT_MULTIPLE',
  CLEAR_SELECTION = 'CLEAR_SELECTION',
  SET_DRAWING_STATE = 'SET_DRAWING_STATE',
  SET_TEMP_POINTS = 'SET_TEMP_POINTS',
  REORDER_SHAPE = 'REORDER_SHAPE',
  SET_ACTIVE_SHAPE = 'SET_ACTIVE_SHAPE',
  SET_MEASUREMENT_CALIBRATION = 'SET_MEASUREMENT_CALIBRATION',
}

// Action definitions
type DrawingAction =
  | { type: DrawingActionType.SET_TOOL; tool: DrawingTool }
  | { type: DrawingActionType.SET_MODE; mode: DrawingMode }
  | { type: DrawingActionType.UPDATE_STYLE; style: Partial<DrawingStyle> }
  | { type: DrawingActionType.SET_SHAPES; shapes: Shape[] }
  | { type: DrawingActionType.ADD_SHAPE; shape: Shape }
  | { type: DrawingActionType.UPDATE_SHAPE; id: string; updates: Partial<Shape> }
  | { type: DrawingActionType.DELETE_SHAPE; id: string }
  | { type: DrawingActionType.SELECT_SHAPE; id: string; multi?: boolean }
  | { type: DrawingActionType.SELECT_MULTIPLE; ids: string[] }
  | { type: DrawingActionType.CLEAR_SELECTION }
  | { 
      type: DrawingActionType.SET_DRAWING_STATE; 
      isDrawing: boolean; 
      startPoint?: Point | null;
      lastPoint?: Point | null;
    }
  | { type: DrawingActionType.SET_TEMP_POINTS; points: Point[] }
  | { type: DrawingActionType.REORDER_SHAPE; id: string; operation: LayerOperation }
  | { type: DrawingActionType.SET_ACTIVE_SHAPE; shape: Shape | null }
  | { 
      type: DrawingActionType.SET_MEASUREMENT_CALIBRATION;
      calibration: {
        pixelsPerUnit: number | null;
        unit: string;
        calibrationLineId: string | null;
      };
    };

// Initial state
const initialState: DrawingState = {
  activeTool: DrawingTool.SELECT,
  drawingMode: DrawingMode.NONE,
  currentStyle: {
    stroke: '#000000',
    strokeWidth: 2,
    fill: undefined,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    fontFamily: 'Arial',
  },
  activeShape: null,
  tempPoints: [],
  shapes: [],
  selectedShapeIds: [],
  isDrawing: false,
  startPoint: null,
  lastPoint: null,
  maxZIndex: 0,
  measurementCalibration: {
    pixelsPerUnit: null,
    unit: 'cm',
    calibrationLineId: null,
  },
};

// Reducer
const drawingReducer = (state: DrawingState, action: DrawingAction): DrawingState => {
  switch (action.type) {
    case DrawingActionType.SET_TOOL:
      return {
        ...state,
        activeTool: action.tool,
        drawingMode: DrawingMode.NONE,
        tempPoints: [],
      };

    case DrawingActionType.SET_MODE:
      return {
        ...state,
        drawingMode: action.mode,
      };

    case DrawingActionType.UPDATE_STYLE:
      return {
        ...state,
        currentStyle: {
          ...state.currentStyle,
          ...action.style,
        },
      };

    case DrawingActionType.SET_SHAPES:
      return {
        ...state,
        shapes: action.shapes,
        maxZIndex: Math.max(0, ...action.shapes.map(s => s.zIndex)),
      };

    case DrawingActionType.ADD_SHAPE:
      const newShapes = [...state.shapes, action.shape];
      return {
        ...state,
        shapes: newShapes,
        maxZIndex: action.shape.zIndex,
        selectedShapeIds: [action.shape.id], // Select the newly created shape
      };

    case DrawingActionType.UPDATE_SHAPE:
      return {
        ...state,
        shapes: state.shapes.map(shape =>
          shape.id === action.id
            ? { ...shape, ...action.updates, updatedAt: Date.now() } as Shape
            : shape
        ),
      };

    case DrawingActionType.DELETE_SHAPE:
      return {
        ...state,
        shapes: state.shapes.filter(shape => shape.id !== action.id),
        selectedShapeIds: state.selectedShapeIds.filter(id => id !== action.id),
      };

    case DrawingActionType.SELECT_SHAPE:
      if (action.multi) {
        const isSelected = state.selectedShapeIds.includes(action.id);
        return {
          ...state,
          selectedShapeIds: isSelected
            ? state.selectedShapeIds.filter(id => id !== action.id)
            : [...state.selectedShapeIds, action.id],
        };
      }
      const newState = {
        ...state,
        selectedShapeIds: [action.id],
      };
      return newState;

    case DrawingActionType.SELECT_MULTIPLE:
      return {
        ...state,
        selectedShapeIds: action.ids,
      };

    case DrawingActionType.CLEAR_SELECTION:
      return {
        ...state,
        selectedShapeIds: [],
      };

    case DrawingActionType.SET_DRAWING_STATE:
      return {
        ...state,
        isDrawing: action.isDrawing,
        startPoint: action.startPoint !== undefined ? action.startPoint : state.startPoint,
        lastPoint: action.lastPoint !== undefined ? action.lastPoint : state.lastPoint,
      };

    case DrawingActionType.SET_TEMP_POINTS:
      return {
        ...state,
        tempPoints: action.points,
      };

    case DrawingActionType.REORDER_SHAPE:
      return {
        ...state,
        shapes: reorderShapes(state.shapes, action.id, action.operation),
      };

    case DrawingActionType.SET_ACTIVE_SHAPE:
      return {
        ...state,
        activeShape: action.shape,
      };

    case DrawingActionType.SET_MEASUREMENT_CALIBRATION:
      return {
        ...state,
        measurementCalibration: action.calibration,
      };

    default:
      return state;
  }
};

// Context type
interface DrawingContextType {
  state: DrawingState;
  dispatch: React.Dispatch<DrawingAction>;
  
  // Tool management
  setActiveTool: (tool: DrawingTool) => void;
  
  // Style management
  updateStyle: (style: Partial<DrawingStyle>) => void;
  
  // Shape management
  setShapes: (shapes: Shape[]) => void;
  addShape: (shape: Omit<Shape, 'zIndex'>) => void;
  updateShape: (id: string, updates: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  deleteSelected: () => void;
  
  // Selection
  selectShape: (id: string, multi?: boolean) => void;
  selectMultiple: (ids: string[]) => void;
  clearSelection: () => void;
  
  // Drawing state
  setDrawingState: (isDrawing: boolean, startPoint?: Point | null, lastPoint?: Point | null) => void;
  setTempPoints: (points: Point[]) => void;
  setActiveShape: (shape: Shape | null) => void;
  
  // Z-order
  reorderShape: (id: string, operation: LayerOperation) => void;
  
  // Measurement
  setMeasurementCalibration: (calibration: {
    pixelsPerUnit: number | null;
    unit: string;
    calibrationLineId: string | null;
  }) => void;
  
  // Helpers
  getSortedShapes: () => Shape[];
}

// Create context
const DrawingContext = createContext<DrawingContextType | undefined>(undefined);

// Provider component
export const DrawingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(drawingReducer, initialState);

  // Tool management
  const setActiveTool = useCallback((tool: DrawingTool) => {
    dispatch({ type: DrawingActionType.SET_TOOL, tool });
  }, []);

  // Style management
  const updateStyle = useCallback((style: Partial<DrawingStyle>) => {
    dispatch({ type: DrawingActionType.UPDATE_STYLE, style });
  }, []);

  // Shape management
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

  const deleteShape = useCallback((id: string) => {
    dispatch({ type: DrawingActionType.DELETE_SHAPE, id });
  }, []);

  const deleteSelected = useCallback(() => {
    state.selectedShapeIds.forEach(id => {
      dispatch({ type: DrawingActionType.DELETE_SHAPE, id });
    });
  }, [state.selectedShapeIds]);

  // Selection
  const selectShape = useCallback((id: string, multi?: boolean) => {
    dispatch({ type: DrawingActionType.SELECT_SHAPE, id, multi });
  }, []);

  const selectMultiple = useCallback((ids: string[]) => {
    dispatch({ type: DrawingActionType.SELECT_MULTIPLE, ids });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: DrawingActionType.CLEAR_SELECTION });
  }, []);

  // Drawing state
  const setDrawingState = useCallback((
    isDrawing: boolean, 
    startPoint?: Point | null, 
    lastPoint?: Point | null
  ) => {
    dispatch({ 
      type: DrawingActionType.SET_DRAWING_STATE, 
      isDrawing, 
      startPoint, 
      lastPoint 
    });
  }, []);

  const setTempPoints = useCallback((points: Point[]) => {
    dispatch({ type: DrawingActionType.SET_TEMP_POINTS, points });
  }, []);

  const setActiveShape = useCallback((shape: Shape | null) => {
    dispatch({ type: DrawingActionType.SET_ACTIVE_SHAPE, shape });
  }, []);

  // Z-order
  const reorderShape = useCallback((id: string, operation: LayerOperation) => {
    dispatch({ type: DrawingActionType.REORDER_SHAPE, id, operation });
  }, []);

  // Measurement
  const setMeasurementCalibration = useCallback((calibration: {
    pixelsPerUnit: number | null;
    unit: string;
    calibrationLineId: string | null;
  }) => {
    dispatch({ type: DrawingActionType.SET_MEASUREMENT_CALIBRATION, calibration });
  }, []);

  // Helpers
  const getSortedShapes = useCallback(() => {
    return sortShapesByZIndex(state.shapes);
  }, [state.shapes]);

  const value: DrawingContextType = {
    state,
    dispatch,
    setActiveTool,
    updateStyle,
    setShapes,
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
    setMeasurementCalibration,
    getSortedShapes,
  };

  return (
    <DrawingContext.Provider value={value}>
      {children}
    </DrawingContext.Provider>
  );
};

// Hook to use the context
export const useDrawingContext = () => {
  const context = useContext(DrawingContext);
  if (!context) {
    throw new Error('useDrawingContext must be used within a DrawingProvider');
  }
  return context;
};