**Callout Interaction Spec**

- **Shape Composition**
  - `CalloutGroup` logical wrapper containing:
    - `CalloutBox`: rounded rect plus text content and padding; exposes resize handles and rotation handle when the group is selected.
    - `TailAnchor`: invisible but hit-testable perimeter point storing parametric offset along the box border; used to compute the arrow base.
    - `ArrowCurve`: cubic Bézier path from `TailAnchor` (base) to `HeadPoint`.
    - `HeadPoint`: draggable control point terminating the arrow; renders arrowhead glyph.
    - `ControlMidpoints` (optional): two Bézier handles for curvature; auto-managed unless advanced mode toggled.
  - Group keeps canonical data: box position/size/rotation, tail anchor offset, curve control offsets, head position, style attributes.

- **Selection Model**
- Default single-click on box text or arrow selects the local element only, showing a lightweight overlay (hover outline plus context buttons) and mini controls; the transformer stays hidden in this state.
- When any element is selected, a floating “Select Whole Callout” affordance appears in whichever quadrant of the callout remains on-screen; activating it (or double-clicking the box background) promotes selection to the entire group.
  - Group selection displays the Konva transformer around combined bounds, enabling move/rotate/resize; deselection hides the floating affordance.
  - Drag-select lasso captures the whole callout if the majority of the box area is enclosed; arrow-only lasso selects the arrow head/curve but still surfaces the floating affordance.
  - Modifier shortcuts: `Alt` while clicking the arrow keeps selection scoped to arrow controls; `Shift` allows multi-select with other shapes (box and arrow behave as one when the whole group is selected).

- **Callout Box Behaviour**
  - **Move**: drag on the box interior translates the entire group (box, tail anchor, curve, head) without stretching; motion snaps to grid/guides if enabled.
  - **Resize**: transformer handles adjust width/height; tail anchor reprojected to nearest point on the new perimeter; curve recomputed (auto mode) or preserves relative handle offsets (manual mode).
  - **Rotate**: rotation pivot at box center; tail anchor offset rotates with the box to maintain relative border position; head point rotates around the same pivot unless the user is actively dragging it.
  - Text reflow occurs after resize; minimum box size enforced to maintain padding.

- **Tail Anchor Rules**
  - Stored as parametric perimeter offset: track edge (top/right/bottom/left) plus normalized position along that edge.
  - Dragging the tail control point slides the anchor along the box border only; pointer constrained to the perimeter path (wraps corners smoothly).
  - During box move/resize/rotate, anchor offset updated deterministically so the arrow reattaches at the corresponding perimeter location without lag; never crosses inside the box.
  - Snap affordances: tail anchor snaps to box corners/edge midpoints when dragged within a small epsilon, providing visual feedback.

- **Arrow Head & Curve**
  - Head control point is freeform draggable; on drag end, head position fixes at drop coordinates.
  - Curve generation: default mode uses auto Bézier handles computed from tail/head positions with smoothing to avoid self-intersection; advanced mode exposes two mid control handles for manual shaping.
  - While dragging the head, the path updates live; tail anchor remains glued to the box perimeter.
  - Arrowhead glyph aligns with the tangent of the curve at the head; line stroke width inherits from callout style.

- **Group Dragging**
  - Dragging with whole selection moves box, tail anchor, curve, head in lockstep (no stretching).
  - `Alt`-drag on the box when group-selected could duplicate (optional).
  - During drag preview, Konva group offset used purely for visual feedback; underlying model updates on drag end with accumulated delta.

- **Interaction States & Feedback**
  - Hovering tail/head/control handles changes cursor and highlights the control.
  - While the tail anchor is constrained along the edge, show a ghost projection path to indicate allowed motion.
  - Floating affordance fades in/out with short delay to avoid flicker; includes tooltip “Select entire callout”.
  - Context menu (right-click) offers actions: convert to straight arrow, toggle advanced curve handles, detach arrow (optional future).

- **Constraints & Edge Cases**
  - Ensure tail anchor recomputation after resize/rotate does not invert the arrow; clamp to the box perimeter even if the text box shrinks drastically.
  - On very small boxes, hide tail handle to prevent overlap; require zoom-in or minimum size to re-enable.
  - Rotation combined with active tail drag recalculates the constraint path in rotated coordinate space to avoid jitter.
  - When the callout is duplicated, copy full state (box dimensions, rotation, tail offset, head position, control handles).
  - Undo/redo records atomic operations: tail drag, head drag, box move/resize/rotate, group selection toggles.

- **Implementation Notes**
  - Normalize all geometry in world coordinates; convert to local coordinates only for drawing convenience.
  - Store drag mode state (box/arrow/head/tail) in the React state machine to coordinate cursor feedback and transformer visibility.
  - Use memoized helpers: `perimeterOffsetToPoint`, `pointToPerimeterOffset`, `autoCurveControls`, `reprojectTailAfterTransform`.
  - Unit tests for geometry helpers; interaction tests for anchor constraint behaviour via simulated drags.

- **Future Enhancements (Optional)**
  - Allow snapping arrow head to other shapes/points.
  - Provide style presets (speech bubble, note) with different arrow curvature defaults.
  - Keyboard nudging for head/tail offsets with arrow keys while selected.
