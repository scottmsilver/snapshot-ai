import { useCallback, useReducer } from 'react';
import { SelectionState, SelectionAction, type SelectionContext } from '@/types/selection';
import { selectionStateMachine, getNextState } from '@/config/selectionStateMachine';
import type { Shape, Point } from '@/types/drawing';

// Initial selection context
const initialContext: SelectionContext = {
  state: SelectionState.IDLE,
  hoveredShapeId: null,
  selectedShapeIds: [],
  selectionBox: {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    visible: false,
  },
  isDragging: false,
  dragStartPoint: null,
  draggedShapeIds: [],
  initialShapePositions: new Map(),
};

// Action types
type Action =
  | { type: typeof SelectionAction.SET_STATE; state: SelectionState }
  | { type: typeof SelectionAction.SET_HOVERED_SHAPE; shapeId: string | null }
  | { type: typeof SelectionAction.CLEAR_HOVER }
  | { type: typeof SelectionAction.SELECT_SHAPE; shapeId: string }
  | { type: typeof SelectionAction.SELECT_SHAPES; shapeIds: string[] }
  | { type: typeof SelectionAction.ADD_TO_SELECTION; shapeId: string }
  | { type: typeof SelectionAction.REMOVE_FROM_SELECTION; shapeId: string }
  | { type: typeof SelectionAction.TOGGLE_SELECTION; shapeId: string }
  | { type: typeof SelectionAction.CLEAR_SELECTION }
  | { type: typeof SelectionAction.START_DRAG_SELECT; point: Point }
  | { type: typeof SelectionAction.UPDATE_DRAG_SELECT; point: Point }
  | { type: typeof SelectionAction.END_DRAG_SELECT }
  | { type: typeof SelectionAction.START_DRAG_SHAPE; point: Point; shapePositions: Map<string, Point> }
  | { type: typeof SelectionAction.UPDATE_DRAG_SHAPE; point: Point }
  | { type: typeof SelectionAction.END_DRAG_SHAPE }
  | { type: typeof SelectionAction.CANCEL_DRAG }
  | { type: typeof SelectionAction.START_TRANSFORM }
  | { type: typeof SelectionAction.END_TRANSFORM };

// Reducer that uses the state machine configuration
function selectionReducer(context: SelectionContext, action: Action): SelectionContext {
  let newContext = { ...context };

  // First, apply the action's effects on the context
  switch (action.type) {
    case SelectionAction.SET_HOVERED_SHAPE:
      newContext.hoveredShapeId = action.shapeId;
      break;

    case SelectionAction.CLEAR_HOVER:
      newContext.hoveredShapeId = null;
      break;

    case SelectionAction.SELECT_SHAPE:
      newContext.selectedShapeIds = [action.shapeId];
      break;

    case SelectionAction.SELECT_SHAPES:
      newContext.selectedShapeIds = action.shapeIds;
      break;

    case SelectionAction.ADD_TO_SELECTION:
      if (!newContext.selectedShapeIds.includes(action.shapeId)) {
        newContext.selectedShapeIds = [...newContext.selectedShapeIds, action.shapeId];
      }
      break;

    case SelectionAction.REMOVE_FROM_SELECTION:
      newContext.selectedShapeIds = newContext.selectedShapeIds.filter(id => id !== action.shapeId);
      break;

    case SelectionAction.TOGGLE_SELECTION:
      if (newContext.selectedShapeIds.includes(action.shapeId)) {
        newContext.selectedShapeIds = newContext.selectedShapeIds.filter(id => id !== action.shapeId);
      } else {
        newContext.selectedShapeIds = [...newContext.selectedShapeIds, action.shapeId];
      }
      break;

    case SelectionAction.CLEAR_SELECTION:
      newContext.selectedShapeIds = [];
      newContext.hoveredShapeId = null;
      break;

    case SelectionAction.START_DRAG_SELECT:
      newContext.dragStartPoint = action.point;
      newContext.selectionBox = {
        x: action.point.x,
        y: action.point.y,
        width: 0,
        height: 0,
        visible: true,
      };
      break;

    case SelectionAction.UPDATE_DRAG_SELECT:
      if (newContext.dragStartPoint) {
        const minX = Math.min(newContext.dragStartPoint.x, action.point.x);
        const minY = Math.min(newContext.dragStartPoint.y, action.point.y);
        const maxX = Math.max(newContext.dragStartPoint.x, action.point.x);
        const maxY = Math.max(newContext.dragStartPoint.y, action.point.y);
        
        newContext.selectionBox = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          visible: true,
        };
      }
      break;

    case SelectionAction.END_DRAG_SELECT:
      newContext.dragStartPoint = null;
      break;

    case SelectionAction.START_DRAG_SHAPE:
      newContext.dragStartPoint = action.point;
      newContext.draggedShapeIds = [...newContext.selectedShapeIds];
      newContext.initialShapePositions = action.shapePositions;
      break;

    case SelectionAction.UPDATE_DRAG_SHAPE:
      // Position updates handled in component
      break;

    case SelectionAction.END_DRAG_SHAPE:
      newContext.dragStartPoint = null;
      newContext.draggedShapeIds = [];
      newContext.initialShapePositions = new Map();
      break;

    case SelectionAction.CANCEL_DRAG:
      newContext.dragStartPoint = null;
      newContext.selectionBox.visible = false;
      newContext.draggedShapeIds = [];
      newContext.initialShapePositions = new Map();
      break;
      
    case SelectionAction.START_TRANSFORM:
      // Transformer is active
      break;
      
    case SelectionAction.END_TRANSFORM:
      // Transformer operation completed
      break;
  }

  // Then, determine state transition based on state machine
  const nextState = getNextState(context.state, action.type, newContext);
  
  if (nextState && nextState !== context.state) {
    // Handle onExit of current state
    const currentStateConfig = selectionStateMachine[context.state];
    if (currentStateConfig?.onExit) {
      currentStateConfig.onExit(newContext);
    }

    // Update state
    newContext.state = nextState;

    // Handle onEnter of new state
    const nextStateConfig = selectionStateMachine[nextState];
    if (nextStateConfig?.onEnter) {
      nextStateConfig.onEnter(newContext);
    }
  }

  return newContext;
}

export function useSelectionMachine() {
  const [context, dispatch] = useReducer(selectionReducer, initialContext);

  // Check if a shape intersects with selection box
  const shapeIntersectsBox = useCallback((shape: Shape, box: typeof context.selectionBox) => {
    if (!box.visible || box.width === 0 || box.height === 0) return false;

    // Simple bounding box check
    let shapeBounds = { x: 0, y: 0, width: 0, height: 0 };

    switch (shape.type) {
      case 'rectangle':
        shapeBounds = {
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        };
        break;
      case 'circle':
        shapeBounds = {
          x: shape.x - shape.radiusX,
          y: shape.y - shape.radiusY,
          width: shape.radiusX * 2,
          height: shape.radiusY * 2,
        };
        break;
      case 'text':
        shapeBounds = {
          x: shape.x,
          y: shape.y,
          width: 100, // TODO: Calculate actual text width
          height: shape.fontSize,
        };
        break;
      case 'pen':
      case 'arrow':
        // For lines, find bounding box from points
        if ('points' in shape && shape.points.length >= 2) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (let i = 0; i < shape.points.length; i += 2) {
            minX = Math.min(minX, shape.points[i]);
            maxX = Math.max(maxX, shape.points[i]);
            minY = Math.min(minY, shape.points[i + 1]);
            maxY = Math.max(maxY, shape.points[i + 1]);
          }
          shapeBounds = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };
        }
        break;
    }

    // Check if rectangles intersect
    return !(shapeBounds.x > box.x + box.width ||
             shapeBounds.x + shapeBounds.width < box.x ||
             shapeBounds.y > box.y + box.height ||
             shapeBounds.y + shapeBounds.height < box.y);
  }, []);

  // Action creators
  const handleShapeHover = useCallback((shapeId: string | null) => {
    if (shapeId !== context.hoveredShapeId) {
      if (shapeId) {
        dispatch({ type: SelectionAction.SET_HOVERED_SHAPE, shapeId });
      } else {
        dispatch({ type: SelectionAction.CLEAR_HOVER });
      }
    }
  }, [context.hoveredShapeId]);

  const handleShapeClick = useCallback((shapeId: string, modifiers: { ctrlKey: boolean; shiftKey: boolean }) => {
    if (modifiers.ctrlKey || modifiers.shiftKey) {
      dispatch({ type: SelectionAction.TOGGLE_SELECTION, shapeId });
    } else {
      dispatch({ type: SelectionAction.SELECT_SHAPE, shapeId });
    }
  }, []);

  const handleEmptyClick = useCallback(() => {
    dispatch({ type: SelectionAction.CLEAR_SELECTION });
  }, []);

  const startDragSelection = useCallback((point: Point) => {
    dispatch({ type: SelectionAction.START_DRAG_SELECT, point });
  }, []);

  const updateDragSelection = useCallback((point: Point, shapes: Shape[]) => {
    dispatch({ type: SelectionAction.UPDATE_DRAG_SELECT, point });
    
    // Update selected shapes based on intersection
    if (context.selectionBox.visible) {
      const intersectingShapeIds = shapes
        .filter(shape => shapeIntersectsBox(shape, context.selectionBox))
        .map(shape => shape.id);
      
      dispatch({ type: SelectionAction.SELECT_SHAPES, shapeIds: intersectingShapeIds });
    }
  }, [context.selectionBox, shapeIntersectsBox]);

  const endDragSelection = useCallback(() => {
    dispatch({ type: SelectionAction.END_DRAG_SELECT });
  }, []);

  const startDragShape = useCallback((point: Point, shapes: Shape[]) => {
    const shapePositions = new Map<string, Point>();
    context.selectedShapeIds.forEach(id => {
      const shape = shapes.find(s => s.id === id);
      if (shape && 'x' in shape && 'y' in shape) {
        shapePositions.set(id, { x: shape.x, y: shape.y });
      }
    });
    
    dispatch({ type: SelectionAction.START_DRAG_SHAPE, point, shapePositions });
  }, [context.selectedShapeIds]);

  const updateDragShape = useCallback((point: Point) => {
    dispatch({ type: SelectionAction.UPDATE_DRAG_SHAPE, point });
  }, []);

  const endDragShape = useCallback(() => {
    dispatch({ type: SelectionAction.END_DRAG_SHAPE });
  }, []);

  const cancelDrag = useCallback(() => {
    dispatch({ type: SelectionAction.CANCEL_DRAG });
  }, []);

  // Direct selection actions
  const selectShapes = useCallback((shapeIds: string[]) => {
    dispatch({ type: SelectionAction.SELECT_SHAPES, shapeIds });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: SelectionAction.CLEAR_SELECTION });
  }, []);

  const startTransform = useCallback(() => {
    dispatch({ type: SelectionAction.START_TRANSFORM });
  }, []);

  const endTransform = useCallback(() => {
    dispatch({ type: SelectionAction.END_TRANSFORM });
  }, []);

  return {
    // Context
    context,
    
    // State checks
    isIdle: context.state === SelectionState.IDLE,
    isHovering: context.state === SelectionState.HOVER,
    isSingleSelected: context.state === SelectionState.SINGLE_SELECTED,
    isMultiSelected: context.state === SelectionState.MULTI_SELECTED,
    isDragSelecting: context.state === SelectionState.DRAG_SELECTING,
    isDraggingShape: context.state === SelectionState.DRAGGING_SHAPE,
    isTransforming: context.state === SelectionState.TRANSFORMING,
    
    // Actions
    handleShapeHover,
    handleShapeClick,
    handleEmptyClick,
    startDragSelection,
    updateDragSelection,
    endDragSelection,
    startDragShape,
    updateDragShape,
    endDragShape,
    cancelDrag,
    selectShapes,
    clearSelection,
    startTransform,
    endTransform,
    
    // Direct state access
    hoveredShapeId: context.hoveredShapeId,
    selectedShapeIds: context.selectedShapeIds,
    selectionBox: context.selectionBox,
  };
}