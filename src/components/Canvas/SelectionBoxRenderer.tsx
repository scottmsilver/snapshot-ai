import React from 'react';
import { Rect } from 'react-konva';

interface SelectionBoxRendererProps {
  isDragSelecting: boolean;
  selectionBox: { x: number; y: number; width: number; height: number; visible: boolean };
}

/**
 * Renders the drag-selection rectangle overlay used when selecting multiple shapes.
 */
export const SelectionBoxRenderer: React.FC<SelectionBoxRendererProps> = ({
  isDragSelecting,
  selectionBox,
}) => {
  if (!isDragSelecting || !selectionBox.visible) {
    return null;
  }

  return (
    <Rect
      name="selectionBox"
      x={selectionBox.x}
      y={selectionBox.y}
      width={selectionBox.width}
      height={selectionBox.height}
      fill="rgba(74, 144, 226, 0.1)"
      stroke="#4a90e2"
      strokeWidth={1}
      dash={[5, 5]}
      listening={false}
    />
  );
};
