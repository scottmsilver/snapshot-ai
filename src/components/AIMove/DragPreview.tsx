import React from 'react';
import { useDrawingContext } from '@/contexts/DrawingContext';
import './DragPreview.css';

interface DragPreviewProps {
  zoomLevel: number;
}

export const DragPreview: React.FC<DragPreviewProps> = ({ zoomLevel }) => {
  const { state: drawingState } = useDrawingContext();
  const aiMoveState = drawingState.aiMoveState;

  // Only render during dragging phase
  if (!aiMoveState || aiMoveState.phase !== 'dragging') {
    return null;
  }

  const { segmentedBounds, originalClickPoint, currentDragPoint } = aiMoveState;

  // Need all required data to render
  if (!segmentedBounds || !originalClickPoint || !currentDragPoint) {
    return null;
  }

  // Calculate offset from original click to current drag
  const offsetX = currentDragPoint.x - originalClickPoint.x;
  const offsetY = currentDragPoint.y - originalClickPoint.y;

  // Original position (ghost/faded)
  const ghostStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${segmentedBounds.x * zoomLevel}px`,
    top: `${segmentedBounds.y * zoomLevel}px`,
    width: `${segmentedBounds.width * zoomLevel}px`,
    height: `${segmentedBounds.height * zoomLevel}px`,
    border: '2px dashed #2196f3',
    opacity: 0.5,
    pointerEvents: 'none',
    boxSizing: 'border-box',
  };

  // Preview at current position
  const previewStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${(segmentedBounds.x + offsetX) * zoomLevel}px`,
    top: `${(segmentedBounds.y + offsetY) * zoomLevel}px`,
    width: `${segmentedBounds.width * zoomLevel}px`,
    height: `${segmentedBounds.height * zoomLevel}px`,
    border: '2px solid #2196f3',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  };

  // Optional: connecting line from ghost to preview
  const lineStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${(segmentedBounds.x + segmentedBounds.width / 2) * zoomLevel}px`,
    top: `${(segmentedBounds.y + segmentedBounds.height / 2) * zoomLevel}px`,
    width: `${Math.sqrt(offsetX * offsetX + offsetY * offsetY) * zoomLevel}px`,
    height: '1px',
    backgroundColor: '#2196f3',
    opacity: 0.4,
    transformOrigin: '0 0',
    transform: `rotate(${Math.atan2(offsetY, offsetX)}rad)`,
    pointerEvents: 'none',
  };

  return (
    <div className="drag-preview-container">
      {/* Ghost at original position */}
      <div className="drag-preview-ghost" style={ghostStyle} />

      {/* Connecting line (optional visual aid) */}
      {(offsetX !== 0 || offsetY !== 0) && (
        <div className="drag-preview-line" style={lineStyle} />
      )}

      {/* Preview at current position */}
      <div className="drag-preview-active" style={previewStyle} />
    </div>
  );
};
