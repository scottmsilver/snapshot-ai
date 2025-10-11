import { useCallback, useReducer } from 'react';
import { SelectionState, SelectionAction, type SelectionContext, type SelectionShapeSnapshot } from '@/types/selection';
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
  initialShapePositions: new Map<string, Point>(),
  initialShapeData: new Map<string, SelectionShapeSnapshot>(),
};

// Selection reducer
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
  | { type: typeof SelectionAction.CANCEL_DRAG };

function selectionReducer(context: SelectionContext, action: Action): SelectionContext {
  switch (action.type) {
    case SelectionAction.SET_STATE:
      return { ...context, state: action.state };

    case SelectionAction.SET_HOVERED_SHAPE:
      return { 
        ...context, 
        hoveredShapeId: action.shapeId,
        state: action.shapeId ? SelectionState.HOVER : SelectionState.IDLE
      };

    case SelectionAction.CLEAR_HOVER:
      return { 
        ...context, 
        hoveredShapeId: null,
        state: context.selectedShapeIds.length > 0 
          ? (context.selectedShapeIds.length === 1 ? SelectionState.SINGLE_SELECTED : SelectionState.MULTI_SELECTED)
          : SelectionState.IDLE
      };

    case SelectionAction.SELECT_SHAPE:
      return {
        ...context,
        selectedShapeIds: [action.shapeId],
        state: SelectionState.SINGLE_SELECTED,
      };

    case SelectionAction.SELECT_SHAPES:
      return {
        ...context,
        selectedShapeIds: action.shapeIds,
        state: action.shapeIds.length === 0 
          ? SelectionState.IDLE 
          : (action.shapeIds.length === 1 ? SelectionState.SINGLE_SELECTED : SelectionState.MULTI_SELECTED),
      };

    case SelectionAction.ADD_TO_SELECTION:
      if (context.selectedShapeIds.includes(action.shapeId)) {
        return context;
      }
      const newIds = [...context.selectedShapeIds, action.shapeId];
      return {
        ...context,
        selectedShapeIds: newIds,
        state: newIds.length === 1 ? SelectionState.SINGLE_SELECTED : SelectionState.MULTI_SELECTED,
      };

    case SelectionAction.REMOVE_FROM_SELECTION:
      const filteredIds = context.selectedShapeIds.filter(id => id !== action.shapeId);
      return {
        ...context,
        selectedShapeIds: filteredIds,
        state: filteredIds.length === 0 
          ? SelectionState.IDLE 
          : (filteredIds.length === 1 ? SelectionState.SINGLE_SELECTED : SelectionState.MULTI_SELECTED),
      };

    case SelectionAction.TOGGLE_SELECTION:
      if (context.selectedShapeIds.includes(action.shapeId)) {
        return selectionReducer(context, { type: SelectionAction.REMOVE_FROM_SELECTION, shapeId: action.shapeId });
      } else {
        return selectionReducer(context, { type: SelectionAction.ADD_TO_SELECTION, shapeId: action.shapeId });
      }

    case SelectionAction.CLEAR_SELECTION:
      return {
        ...context,
        selectedShapeIds: [],
        state: SelectionState.IDLE,
        hoveredShapeId: null,
      };

    case SelectionAction.START_DRAG_SELECT:
      return {
        ...context,
        state: SelectionState.DRAG_SELECTING,
        dragStartPoint: action.point,
        selectionBox: {
          x: action.point.x,
          y: action.point.y,
          width: 0,
          height: 0,
          visible: true,
        },
      };

    case SelectionAction.UPDATE_DRAG_SELECT:
      if (!context.dragStartPoint) return context;
      
      const minX = Math.min(context.dragStartPoint.x, action.point.x);
      const minY = Math.min(context.dragStartPoint.y, action.point.y);
      const maxX = Math.max(context.dragStartPoint.x, action.point.x);
      const maxY = Math.max(context.dragStartPoint.y, action.point.y);
      
      return {
        ...context,
        selectionBox: {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          visible: true,
        },
      };

    case SelectionAction.END_DRAG_SELECT:
      return {
        ...context,
        state: context.selectedShapeIds.length === 0 
          ? SelectionState.IDLE 
          : (context.selectedShapeIds.length === 1 ? SelectionState.SINGLE_SELECTED : SelectionState.MULTI_SELECTED),
        dragStartPoint: null,
        selectionBox: {
          ...context.selectionBox,
          visible: false,
        },
      };

    case SelectionAction.START_DRAG_SHAPE:
      return {
        ...context,
        state: SelectionState.DRAGGING_SHAPE,
        isDragging: true,
        dragStartPoint: action.point,
        draggedShapeIds: [...context.selectedShapeIds],
        initialShapePositions: action.shapePositions,
      };

    case SelectionAction.UPDATE_DRAG_SHAPE:
      // Position updates handled in component
      return context;

    case SelectionAction.END_DRAG_SHAPE:
      return {
        ...context,
        state: context.selectedShapeIds.length === 1 
          ? SelectionState.SINGLE_SELECTED 
          : SelectionState.MULTI_SELECTED,
        isDragging: false,
        dragStartPoint: null,
        draggedShapeIds: [],
        initialShapePositions: new Map<string, Point>(),
      };

    case SelectionAction.CANCEL_DRAG:
      return {
        ...context,
        state: context.selectedShapeIds.length === 0 
          ? SelectionState.IDLE 
          : (context.selectedShapeIds.length === 1 ? SelectionState.SINGLE_SELECTED : SelectionState.MULTI_SELECTED),
        isDragging: false,
        dragStartPoint: null,
        selectionBox: {
          ...context.selectionBox,
          visible: false,
        },
        draggedShapeIds: [],
        initialShapePositions: new Map<string, Point>(),
      };

    default:
      return context;
  }
}

interface UseSelectionResult {
  context: SelectionContext;
  isIdle: boolean;
  isHovering: boolean;
  isSingleSelected: boolean;
  isMultiSelected: boolean;
  isDragSelecting: boolean;
  isDraggingShape: boolean;
  handleShapeHover: (shapeId: string | null) => void;
  handleShapeClick: (shapeId: string, modifiers: { ctrlKey: boolean; shiftKey: boolean }) => void;
  handleEmptyClick: () => void;
  startDragSelection: (point: Point) => void;
  updateDragSelection: (point: Point, shapes: Shape[]) => void;
  endDragSelection: () => void;
  startDragShape: (point: Point, shapes: Shape[]) => void;
  endDragShape: () => void;
  cancelDrag: () => void;
  hoveredShapeId: string | null;
  selectedShapeIds: string[];
  selectionBox: SelectionContext['selectionBox'];
}

export function useSelection(): UseSelectionResult {
  const [context, dispatch] = useReducer(selectionReducer, initialContext);
  const { selectionBox, selectedShapeIds } = context;
  // Check if a shape intersects with selection box
  const shapeIntersectsBox = useCallback((shape: Shape, box: typeof selectionBox): boolean => {
    if (!box.visible || box.width === 0 || box.height === 0) return false;

    // Simple bounding box check for now
    // TODO: Implement proper intersection for different shape types
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
        // Approximate bounds for text
        shapeBounds = {
          x: shape.x,
          y: shape.y,
          width: 100, // TODO: Calculate actual text width
          height: shape.fontSize,
        };
        break;
      // TODO: Add other shape types
    }

    // Check if rectangles intersect
    return !(shapeBounds.x > box.x + box.width ||
             shapeBounds.x + shapeBounds.width < box.x ||
             shapeBounds.y > box.y + box.height ||
             shapeBounds.y + shapeBounds.height < box.y);
  }, []);

  // Handle shape hover
  const handleShapeHover = useCallback((shapeId: string | null): void => {
    dispatch({ type: SelectionAction.SET_HOVERED_SHAPE, shapeId });
  }, []);

  // Handle shape click
  const handleShapeClick = useCallback((shapeId: string, modifiers: { ctrlKey: boolean; shiftKey: boolean }): void => {
    if (modifiers.ctrlKey || modifiers.shiftKey) {
      dispatch({ type: SelectionAction.TOGGLE_SELECTION, shapeId });
    } else {
      dispatch({ type: SelectionAction.SELECT_SHAPE, shapeId });
    }
  }, []);

  // Handle empty space click
  const handleEmptyClick = useCallback((): void => {
    dispatch({ type: SelectionAction.CLEAR_SELECTION });
  }, []);

  // Start drag selection
  const startDragSelection = useCallback((point: Point): void => {
    dispatch({ type: SelectionAction.START_DRAG_SELECT, point });
  }, []);

  // Update drag selection
  const updateDragSelection = useCallback((point: Point, shapes: Shape[]): void => {
    dispatch({ type: SelectionAction.UPDATE_DRAG_SELECT, point });
    
    // Update selected shapes based on intersection
    if (selectionBox.visible) {
      const intersectingShapeIds = shapes
        .filter(shape => shapeIntersectsBox(shape, selectionBox))
        .map(shape => shape.id);
      
      dispatch({ type: SelectionAction.SELECT_SHAPES, shapeIds: intersectingShapeIds });
    }
  }, [selectionBox, shapeIntersectsBox]);

  // End drag selection
  const endDragSelection = useCallback((): void => {
    dispatch({ type: SelectionAction.END_DRAG_SELECT });
  }, []);

  // Start dragging shape
  const startDragShape = useCallback((point: Point, shapes: Shape[]): void => {
    const shapePositions = new Map<string, Point>();
    selectedShapeIds.forEach(id => {
      const shape = shapes.find(s => s.id === id);
      if (shape && 'x' in shape && 'y' in shape) {
        shapePositions.set(id, { x: shape.x, y: shape.y });
      }
    });
    
    dispatch({ type: SelectionAction.START_DRAG_SHAPE, point, shapePositions });
  }, [selectedShapeIds]);

  // End dragging shape
  const endDragShape = useCallback((): void => {
    dispatch({ type: SelectionAction.END_DRAG_SHAPE });
  }, []);

  // Cancel any drag operation
  const cancelDrag = useCallback((): void => {
    dispatch({ type: SelectionAction.CANCEL_DRAG });
  }, []);

  return {
    context,
    
    // State checks
    isIdle: context.state === SelectionState.IDLE,
    isHovering: context.state === SelectionState.HOVER,
    isSingleSelected: context.state === SelectionState.SINGLE_SELECTED,
    isMultiSelected: context.state === SelectionState.MULTI_SELECTED,
    isDragSelecting: context.state === SelectionState.DRAG_SELECTING,
    isDraggingShape: context.state === SelectionState.DRAGGING_SHAPE,
    
    // Actions
    handleShapeHover,
    handleShapeClick,
    handleEmptyClick,
    startDragSelection,
    updateDragSelection,
    endDragSelection,
    startDragShape,
    endDragShape,
    cancelDrag,
    
    // Direct state access
    hoveredShapeId: context.hoveredShapeId,
    selectedShapeIds,
    selectionBox,
  };
}