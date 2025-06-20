import { SelectionState, SelectionAction } from '@/types/selection';

// State machine configuration
export interface StateTransition {
  action: SelectionAction;
  target: SelectionState;
  condition?: (context: any) => boolean;
  effect?: (context: any, event: any) => void;
}

export interface StateConfig {
  onEnter?: (context: any) => void;
  onExit?: (context: any) => void;
  transitions: StateTransition[];
}

// Define the selection state machine
export const selectionStateMachine: Record<SelectionState, StateConfig> = {
  [SelectionState.IDLE]: {
    transitions: [
      {
        action: SelectionAction.SET_HOVERED_SHAPE,
        target: SelectionState.HOVER,
        condition: (context) => context.hoveredShapeId !== null,
      },
      {
        action: SelectionAction.SELECT_SHAPE,
        target: SelectionState.SINGLE_SELECTED,
      },
      {
        action: SelectionAction.START_DRAG_SELECT,
        target: SelectionState.DRAG_SELECTING,
      },
    ],
  },

  [SelectionState.HOVER]: {
    transitions: [
      {
        action: SelectionAction.CLEAR_HOVER,
        target: SelectionState.IDLE,
        condition: (context) => context.selectedShapeIds.length === 0,
      },
      {
        action: SelectionAction.CLEAR_HOVER,
        target: SelectionState.SINGLE_SELECTED,
        condition: (context) => context.selectedShapeIds.length === 1,
      },
      {
        action: SelectionAction.CLEAR_HOVER,
        target: SelectionState.MULTI_SELECTED,
        condition: (context) => context.selectedShapeIds.length > 1,
      },
      {
        action: SelectionAction.SELECT_SHAPE,
        target: SelectionState.SINGLE_SELECTED,
      },
      {
        action: SelectionAction.TOGGLE_SELECTION,
        target: SelectionState.MULTI_SELECTED,
        condition: (context) => context.selectedShapeIds.length > 0,
      },
    ],
  },

  [SelectionState.SINGLE_SELECTED]: {
    transitions: [
      {
        action: SelectionAction.CLEAR_SELECTION,
        target: SelectionState.IDLE,
      },
      {
        action: SelectionAction.SELECT_SHAPE,
        target: SelectionState.SINGLE_SELECTED,
      },
      {
        action: SelectionAction.ADD_TO_SELECTION,
        target: SelectionState.MULTI_SELECTED,
      },
      {
        action: SelectionAction.TOGGLE_SELECTION,
        target: SelectionState.MULTI_SELECTED,
      },
      {
        action: SelectionAction.START_DRAG_SHAPE,
        target: SelectionState.DRAGGING_SHAPE,
      },
      {
        action: SelectionAction.START_TRANSFORM,
        target: SelectionState.TRANSFORMING,
      },
      {
        action: SelectionAction.SET_HOVERED_SHAPE,
        target: SelectionState.SINGLE_SELECTED, // Stay in same state
        condition: (context) => context.hoveredShapeId !== null,
      },
    ],
  },

  [SelectionState.MULTI_SELECTED]: {
    transitions: [
      {
        action: SelectionAction.CLEAR_SELECTION,
        target: SelectionState.IDLE,
      },
      {
        action: SelectionAction.SELECT_SHAPE,
        target: SelectionState.SINGLE_SELECTED,
      },
      {
        action: SelectionAction.REMOVE_FROM_SELECTION,
        target: SelectionState.SINGLE_SELECTED,
        condition: (context) => context.selectedShapeIds.length === 1,
      },
      {
        action: SelectionAction.REMOVE_FROM_SELECTION,
        target: SelectionState.MULTI_SELECTED,
        condition: (context) => context.selectedShapeIds.length > 1,
      },
      {
        action: SelectionAction.START_DRAG_SHAPE,
        target: SelectionState.DRAGGING_SHAPE,
      },
      {
        action: SelectionAction.START_TRANSFORM,
        target: SelectionState.TRANSFORMING,
      },
    ],
  },

  [SelectionState.DRAG_SELECTING]: {
    onEnter: (context) => {
      context.selectionBox.visible = true;
    },
    onExit: (context) => {
      context.selectionBox.visible = false;
    },
    transitions: [
      {
        action: SelectionAction.UPDATE_DRAG_SELECT,
        target: SelectionState.DRAG_SELECTING, // Stay in same state
      },
      {
        action: SelectionAction.END_DRAG_SELECT,
        target: SelectionState.IDLE,
        condition: (context) => context.selectedShapeIds.length === 0,
      },
      {
        action: SelectionAction.END_DRAG_SELECT,
        target: SelectionState.SINGLE_SELECTED,
        condition: (context) => context.selectedShapeIds.length === 1,
      },
      {
        action: SelectionAction.END_DRAG_SELECT,
        target: SelectionState.MULTI_SELECTED,
        condition: (context) => context.selectedShapeIds.length > 1,
      },
      {
        action: SelectionAction.CANCEL_DRAG,
        target: SelectionState.IDLE,
      },
    ],
  },

  [SelectionState.DRAGGING_SHAPE]: {
    onEnter: (context) => {
      context.isDragging = true;
    },
    onExit: (context) => {
      context.isDragging = false;
      context.dragStartPoint = null;
      context.initialShapePositions.clear();
    },
    transitions: [
      {
        action: SelectionAction.UPDATE_DRAG_SHAPE,
        target: SelectionState.DRAGGING_SHAPE, // Stay in same state
      },
      {
        action: SelectionAction.END_DRAG_SHAPE,
        target: SelectionState.SINGLE_SELECTED,
        condition: (context) => context.selectedShapeIds.length === 1,
      },
      {
        action: SelectionAction.END_DRAG_SHAPE,
        target: SelectionState.MULTI_SELECTED,
        condition: (context) => context.selectedShapeIds.length > 1,
      },
      {
        action: SelectionAction.CANCEL_DRAG,
        target: SelectionState.SINGLE_SELECTED,
        condition: (context) => context.selectedShapeIds.length === 1,
      },
      {
        action: SelectionAction.CANCEL_DRAG,
        target: SelectionState.MULTI_SELECTED,
        condition: (context) => context.selectedShapeIds.length > 1,
      },
    ],
  },

  [SelectionState.TRANSFORMING]: {
    transitions: [
      {
        action: SelectionAction.END_TRANSFORM,
        target: SelectionState.SINGLE_SELECTED,
        condition: (context) => context.selectedShapeIds.length === 1,
      },
      {
        action: SelectionAction.END_TRANSFORM,
        target: SelectionState.MULTI_SELECTED,
        condition: (context) => context.selectedShapeIds.length > 1,
      },
      {
        action: SelectionAction.CANCEL_DRAG,
        target: SelectionState.SINGLE_SELECTED,
        condition: (context) => context.selectedShapeIds.length === 1,
      },
      {
        action: SelectionAction.CANCEL_DRAG,
        target: SelectionState.MULTI_SELECTED,
        condition: (context) => context.selectedShapeIds.length > 1,
      },
    ],
  },

  [SelectionState.DRAGGING_CONTROL_POINT]: {
    onEnter: (context) => {
      context.isDragging = true;
    },
    onExit: (context) => {
      context.isDragging = false;
    },
    transitions: [
      {
        action: SelectionAction.END_CONTROL_POINT_DRAG,
        target: SelectionState.SINGLE_SELECTED,
        condition: (context) => context.selectedShapeIds.length === 1,
      },
      {
        action: SelectionAction.END_CONTROL_POINT_DRAG,
        target: SelectionState.MULTI_SELECTED,
        condition: (context) => context.selectedShapeIds.length > 1,
      },
      {
        action: SelectionAction.CANCEL_DRAG,
        target: SelectionState.SINGLE_SELECTED,
        condition: (context) => context.selectedShapeIds.length === 1,
      },
    ],
  },
};

// Helper function to get next state from current state and action
export function getNextState(
  currentState: SelectionState,
  action: SelectionAction,
  context: any
): SelectionState | null {
  const stateConfig = selectionStateMachine[currentState];
  if (!stateConfig) return null;

  // Find matching transition
  for (const transition of stateConfig.transitions) {
    if (transition.action === action) {
      // Check condition if exists
      if (!transition.condition || transition.condition(context)) {
        return transition.target;
      }
    }
  }

  return null; // No valid transition
}