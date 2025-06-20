# Selection State Machine

## States

1. **IDLE** - No selection, no hover
2. **HOVER** - Hovering over a shape
3. **SINGLE_SELECTED** - One shape selected
4. **MULTI_SELECTED** - Multiple shapes selected  
5. **DRAG_SELECTING** - Drawing selection rectangle
6. **DRAGGING_SHAPE** - Moving selected shape(s)

## State Transitions

```
IDLE
  → on hover shape: HOVER
  → on click shape: SINGLE_SELECTED
  → on drag empty: DRAG_SELECTING

HOVER
  → on leave shape: IDLE/SINGLE_SELECTED/MULTI_SELECTED (based on selection)
  → on click shape: SINGLE_SELECTED
  → on ctrl+click: MULTI_SELECTED

SINGLE_SELECTED
  → on click empty: IDLE
  → on click shape: SINGLE_SELECTED (new shape)
  → on ctrl+click: MULTI_SELECTED
  → on drag shape: DRAGGING_SHAPE
  
MULTI_SELECTED
  → on click empty: IDLE
  → on click shape: SINGLE_SELECTED
  → on ctrl+click selected: MULTI_SELECTED (remove from selection)
  → on drag shape: DRAGGING_SHAPE

DRAG_SELECTING
  → on mouse move: update selection box
  → on mouse up: IDLE/SINGLE_SELECTED/MULTI_SELECTED (based on selection)
  → on escape: IDLE

DRAGGING_SHAPE
  → on mouse move: update positions
  → on mouse up: SINGLE_SELECTED/MULTI_SELECTED (based on selection)
  → on escape: cancel drag
```

## Modifiers

- **Ctrl/Cmd + Click**: Toggle selection (add/remove from selection)
- **Shift + Click**: Range selection (select all between)
- **Delete/Backspace**: Delete selected shapes
- **Escape**: Cancel current operation

## Visual Feedback

- **Hover**: Cursor change, subtle highlight
- **Selected**: Blue border with resize handles
- **Multi-selected**: All selected shapes show blue border
- **Drag selection**: Dashed rectangle
- **Dragging**: Ghost preview of original position