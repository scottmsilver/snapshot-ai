import React from 'react';
import { useCoordinateHighlightOptional } from '@/contexts/CoordinateHighlightContext';

interface CoordinateMarkerProps {
  zoomLevel: number;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Renders a crosshair marker at the currently highlighted coordinate
 * This overlays on the canvas to show where a coordinate mentioned in the AI console is
 */
export const CoordinateMarker: React.FC<CoordinateMarkerProps> = ({
  zoomLevel,
  canvasWidth,
  canvasHeight,
}) => {
  const coordContext = useCoordinateHighlightOptional();
  const highlightedCoord = coordContext?.highlightedCoord;

  if (!highlightedCoord) {
    return null;
  }

  const { x, y } = highlightedCoord;
  const screenX = x * zoomLevel;
  const screenY = y * zoomLevel;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth * zoomLevel,
        height: canvasHeight * zoomLevel,
        pointerEvents: 'none',
        zIndex: 10000,
        overflow: 'visible',
      }}
    >
      {/* Vertical line */}
      <div
        style={{
          position: 'absolute',
          left: screenX,
          top: 0,
          width: '1px',
          height: '100%',
          backgroundColor: 'rgba(255, 0, 0, 0.6)',
        }}
      />
      {/* Horizontal line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: screenY,
          width: '100%',
          height: '1px',
          backgroundColor: 'rgba(255, 0, 0, 0.6)',
        }}
      />
      {/* Center circle */}
      <div
        style={{
          position: 'absolute',
          left: screenX - 12,
          top: screenY - 12,
          width: '24px',
          height: '24px',
          border: '3px solid #FF0000',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 0, 0, 0.2)',
        }}
      />
      {/* Inner dot */}
      <div
        style={{
          position: 'absolute',
          left: screenX - 3,
          top: screenY - 3,
          width: '6px',
          height: '6px',
          backgroundColor: '#FF0000',
          borderRadius: '50%',
        }}
      />
      {/* Coordinate label */}
      <div
        style={{
          position: 'absolute',
          left: screenX + 16,
          top: screenY - 24,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        ({x}, {y})
      </div>
    </div>
  );
};
