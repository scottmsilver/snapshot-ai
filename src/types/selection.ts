// Selection state machine types

export const SelectionState = {
  IDLE: 'idle',
  HOVER: 'hover',
  SINGLE_SELECTED: 'single_selected',
  MULTI_SELECTED: 'multi_selected',
  DRAG_SELECTING: 'drag_selecting',
  DRAGGING_SHAPE: 'dragging_shape',
  TRANSFORMING: 'transforming',
  DRAGGING_CONTROL_POINT: 'dragging_control_point',
} as const;

export type SelectionState = typeof SelectionState[keyof typeof SelectionState];

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface SelectionContext {
  state: SelectionState;
  hoveredShapeId: string | null;
  selectedShapeIds: string[];
  selectionBox: SelectionBox;
  isDragging: boolean;
  dragStartPoint: { x: number; y: number } | null;
  draggedShapeIds: string[];
  initialShapePositions: Map<string, { x: number; y: number }>;
  initialShapeData: Map<string, any>; // Store full shape data for complex shapes
}

// Selection actions
export const SelectionAction = {
  // State transitions
  SET_STATE: 'SET_STATE',
  
  // Hover
  SET_HOVERED_SHAPE: 'SET_HOVERED_SHAPE',
  CLEAR_HOVER: 'CLEAR_HOVER',
  
  // Selection
  SELECT_SHAPE: 'SELECT_SHAPE',
  SELECT_SHAPES: 'SELECT_SHAPES',
  ADD_TO_SELECTION: 'ADD_TO_SELECTION',
  REMOVE_FROM_SELECTION: 'REMOVE_FROM_SELECTION',
  TOGGLE_SELECTION: 'TOGGLE_SELECTION',
  CLEAR_SELECTION: 'CLEAR_SELECTION',
  
  // Drag selection
  START_DRAG_SELECT: 'START_DRAG_SELECT',
  UPDATE_DRAG_SELECT: 'UPDATE_DRAG_SELECT',
  END_DRAG_SELECT: 'END_DRAG_SELECT',
  
  // Shape dragging
  START_DRAG_SHAPE: 'START_DRAG_SHAPE',
  UPDATE_DRAG_SHAPE: 'UPDATE_DRAG_SHAPE',
  END_DRAG_SHAPE: 'END_DRAG_SHAPE',
  CANCEL_DRAG: 'CANCEL_DRAG',
  
  // Transformer
  START_TRANSFORM: 'START_TRANSFORM',
  END_TRANSFORM: 'END_TRANSFORM',
  
  // Control points
  START_CONTROL_POINT_DRAG: 'START_CONTROL_POINT_DRAG',
  END_CONTROL_POINT_DRAG: 'END_CONTROL_POINT_DRAG',
} as const;

export type SelectionAction = typeof SelectionAction[keyof typeof SelectionAction];