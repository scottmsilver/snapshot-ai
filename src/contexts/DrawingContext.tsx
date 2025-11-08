import { createContext, useContext } from 'react';
import {
  DrawingTool,
  DrawingMode,
  type DrawingStyle,
  type DrawingState,
  type Shape,
  type MeasurementLineShape,
  type Point,
  type Rectangle,
  LayerOperation,
  GenerativeFillSelectionTool,
  getNextZIndex,
  reorderShapes
} from '@/types/drawing';

const cloneStyle = (style: DrawingStyle): DrawingStyle => ({
  ...style,
  dash: style.dash ? [...style.dash] : undefined,
});

const cloneShape = (shape: Shape): Shape => {
  const cloned = {
    ...shape,
    style: cloneStyle(shape.style),
  } as Shape;

  if ('points' in cloned && Array.isArray((shape as { points?: number[] }).points)) {
    cloned.points = [
      ...((shape as { points?: number[] }).points ?? []),
    ] as typeof cloned.points;
  }

  if (shape.type === DrawingTool.MEASURE) {
    const measurementShape = shape as MeasurementLineShape;
    if (measurementShape.measurement) {
      (cloned as MeasurementLineShape).measurement = { ...measurementShape.measurement };
    }
  }

  return cloned;
};

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
  COPY_SHAPES = 'COPY_SHAPES',
  PASTE_SHAPES = 'PASTE_SHAPES',
  DELETE_SHAPES = 'DELETE_SHAPES',
  UPDATE_SHAPES = 'UPDATE_SHAPES',
  START_GENERATIVE_FILL = 'START_GENERATIVE_FILL',
  SET_GENERATIVE_FILL_SELECTION_TOOL = 'SET_GENERATIVE_FILL_SELECTION_TOOL',
  UPDATE_GENERATIVE_FILL_SELECTION = 'UPDATE_GENERATIVE_FILL_SELECTION',
  COMPLETE_GENERATIVE_FILL_SELECTION = 'COMPLETE_GENERATIVE_FILL_SELECTION',
  SET_GENERATIVE_FILL_PROMPT = 'SET_GENERATIVE_FILL_PROMPT',
  START_GENERATIVE_FILL_GENERATION = 'START_GENERATIVE_FILL_GENERATION',
  COMPLETE_GENERATIVE_FILL_GENERATION = 'COMPLETE_GENERATIVE_FILL_GENERATION',
  APPLY_GENERATIVE_FILL_RESULT = 'APPLY_GENERATIVE_FILL_RESULT',
  CANCEL_GENERATIVE_FILL = 'CANCEL_GENERATIVE_FILL',
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
    }
  | { type: DrawingActionType.COPY_SHAPES; shapes: Shape[] }
  | { type: DrawingActionType.PASTE_SHAPES; offset?: Point }
  | { type: DrawingActionType.DELETE_SHAPES; ids: string[] }
  | { type: DrawingActionType.UPDATE_SHAPES; updates: Array<{ id: string; updates: Partial<Shape> }> }
  | { type: DrawingActionType.START_GENERATIVE_FILL; mode?: 'inpainting' | 'text-only' }
  | { type: DrawingActionType.SET_GENERATIVE_FILL_SELECTION_TOOL; selectionTool: GenerativeFillSelectionTool }
  | { type: DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION; points?: Point[]; rectangle?: Rectangle | null; brushWidth?: number }
  | { type: DrawingActionType.COMPLETE_GENERATIVE_FILL_SELECTION; sourceImage: string; maskImage: string }
  | { type: DrawingActionType.SET_GENERATIVE_FILL_PROMPT; prompt: string }
  | { type: DrawingActionType.START_GENERATIVE_FILL_GENERATION }
  | { type: DrawingActionType.COMPLETE_GENERATIVE_FILL_GENERATION; imageData: string; bounds: Rectangle }
  | { type: DrawingActionType.APPLY_GENERATIVE_FILL_RESULT }
  | { type: DrawingActionType.CANCEL_GENERATIVE_FILL };

// Initial state
export const initialState: DrawingState = {
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
  clipboard: [],
  generativeFillMode: null,
};

// Reducer
export const drawingReducer = (state: DrawingState, action: DrawingAction): DrawingState => {
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

    case DrawingActionType.COPY_SHAPES:
      return {
        ...state,
        clipboard: action.shapes.map(cloneShape),
      };

    case DrawingActionType.PASTE_SHAPES: {
      const offset = action.offset || { x: 20, y: 20 };
      const newShapes = state.clipboard.map(shape => {
        const newId = `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newShape = {
          ...shape,
          style: cloneStyle(shape.style),
          id: newId,
          zIndex: getNextZIndex(state.shapes) + state.clipboard.indexOf(shape),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Offset position based on shape type
        if ('x' in newShape && 'y' in newShape) {
          newShape.x += offset.x;
          newShape.y += offset.y;
        } else if ('points' in newShape && Array.isArray(newShape.points)) {
          // For shapes with points array (pen, arrow, measure)
          const offsetPoints = [...newShape.points];
          for (let i = 0; i < offsetPoints.length; i += 2) {
            offsetPoints[i] += offset.x;
            offsetPoints[i + 1] += offset.y;
          }
          newShape.points = offsetPoints;
        }

        // Special handling for callout shapes
        if (newShape.type === DrawingTool.CALLOUT && 'textX' in newShape) {
          newShape.textX += offset.x;
          newShape.textY += offset.y;
          newShape.arrowX += offset.x;
          newShape.arrowY += offset.y;
          if ('curveControl1X' in newShape && typeof newShape.curveControl1X === 'number' && typeof newShape.curveControl1Y === 'number') {
            newShape.curveControl1X += offset.x;
            newShape.curveControl1Y += offset.y;
          }
          if ('curveControl2X' in newShape && typeof newShape.curveControl2X === 'number' && typeof newShape.curveControl2Y === 'number') {
            newShape.curveControl2X += offset.x;
            newShape.curveControl2Y += offset.y;
          }
        }

        return newShape;
      });

      return {
        ...state,
        shapes: [...state.shapes, ...newShapes],
        selectedShapeIds: newShapes.map(s => s.id), // Select pasted shapes
      };
    }

    case DrawingActionType.DELETE_SHAPES: {
      const idsToDelete = new Set(action.ids);
      if (idsToDelete.size === 0) {
        return state;
      }

      const remainingShapes = state.shapes.filter(shape => !idsToDelete.has(shape.id));
      const remainingSelectedIds = state.selectedShapeIds.filter(id => !idsToDelete.has(id));
      const maxZIndex = remainingShapes.length > 0 ? Math.max(0, ...remainingShapes.map(shape => shape.zIndex)) : 0;

      const activeShape = state.activeShape && idsToDelete.has(state.activeShape.id) ? null : state.activeShape;

      return {
        ...state,
        shapes: remainingShapes,
        selectedShapeIds: remainingSelectedIds,
        activeShape,
        maxZIndex,
      };
    }

    case DrawingActionType.UPDATE_SHAPES: {
      if (action.updates.length === 0) {
        return state;
      }

      const updateMap = new Map(action.updates.map(item => [item.id, item.updates]));
      const timestamp = Date.now();

      const updatedShapes = state.shapes.map(shape => {
        const updates = updateMap.get(shape.id);
        if (!updates) {
          return shape;
        }

        return {
          ...shape,
          ...updates,
          updatedAt: 'updatedAt' in updates ? (updates as Partial<Shape> & { updatedAt?: number }).updatedAt ?? timestamp : timestamp,
        } as Shape;
      });

      const maxZIndex = updatedShapes.length > 0 ? Math.max(0, ...updatedShapes.map(shape => shape.zIndex)) : 0;

      return {
        ...state,
        shapes: updatedShapes,
        maxZIndex,
      };
    }

    case DrawingActionType.START_GENERATIVE_FILL: {
      const mode = action.mode || 'inpainting';
      return {
        ...state,
        activeTool: DrawingTool.GENERATIVE_FILL,
        generativeFillMode: {
          isActive: true,
          mode,
          selectionTool: mode === 'inpainting' ? GenerativeFillSelectionTool.BRUSH : null,
          selectionPoints: [],
          selectionRectangle: null,
          brushWidth: 20,
          showPromptDialog: mode === 'text-only', // Show dialog immediately for text-only
          promptInput: '',
          isGenerating: false,
          generatedResult: null,
          previewImages: null,
        },
      };
    }

    case DrawingActionType.SET_GENERATIVE_FILL_SELECTION_TOOL:
      if (!state.generativeFillMode) return state;
      return {
        ...state,
        generativeFillMode: {
          ...state.generativeFillMode,
          selectionTool: action.selectionTool,
          selectionPoints: [],
          selectionRectangle: null,
        },
      };

    case DrawingActionType.UPDATE_GENERATIVE_FILL_SELECTION:
      if (!state.generativeFillMode) return state;
      return {
        ...state,
        generativeFillMode: {
          ...state.generativeFillMode,
          selectionPoints: action.points !== undefined ? action.points : state.generativeFillMode.selectionPoints,
          selectionRectangle: action.rectangle !== undefined ? action.rectangle : state.generativeFillMode.selectionRectangle,
          brushWidth: action.brushWidth !== undefined ? action.brushWidth : state.generativeFillMode.brushWidth,
        },
      };

    case DrawingActionType.COMPLETE_GENERATIVE_FILL_SELECTION:
      // Selection complete, ready for prompt
      if (!state.generativeFillMode) return state;
      return {
        ...state,
        generativeFillMode: {
          ...state.generativeFillMode,
          showPromptDialog: true,
          previewImages: {
            sourceImage: action.sourceImage,
            maskImage: action.maskImage,
          },
        },
      };

    case DrawingActionType.SET_GENERATIVE_FILL_PROMPT:
      if (!state.generativeFillMode) return state;
      return {
        ...state,
        generativeFillMode: {
          ...state.generativeFillMode,
          promptInput: action.prompt,
        },
      };

    case DrawingActionType.START_GENERATIVE_FILL_GENERATION:
      if (!state.generativeFillMode) return state;
      return {
        ...state,
        generativeFillMode: {
          ...state.generativeFillMode,
          showPromptDialog: false,
          isGenerating: true,
        },
      };

    case DrawingActionType.COMPLETE_GENERATIVE_FILL_GENERATION:
      if (!state.generativeFillMode) return state;
      return {
        ...state,
        generativeFillMode: {
          ...state.generativeFillMode,
          isGenerating: false,
          generatedResult: {
            imageData: action.imageData,
            bounds: action.bounds,
          },
        },
      };

    case DrawingActionType.APPLY_GENERATIVE_FILL_RESULT:
      // Will be handled by adding result as ImageShape
      return {
        ...state,
        generativeFillMode: null,
      };

    case DrawingActionType.CANCEL_GENERATIVE_FILL:
      return {
        ...state,
        activeTool: DrawingTool.SELECT,
        generativeFillMode: null,
      };

    default:
      return state;
  }
};

// Context type
export interface DrawingContextType {
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
  updateShapes: (updates: Array<{ id: string; updates: Partial<Shape> }>) => void;
  deleteShape: (id: string) => void;
  deleteShapes: (ids: string[]) => void;
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

  // Clipboard operations
  copySelectedShapes: () => void;
  pasteShapes: (offset?: Point) => void;
}

// Create context
export const DrawingContext = createContext<DrawingContextType | undefined>(undefined);

export const useDrawingContext = (): DrawingContextType => {
  const context = useContext(DrawingContext);
  if (!context) {
    throw new Error('useDrawingContext must be used within a DrawingProvider');
  }
  return context;
};
