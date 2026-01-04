import React from 'react';
import { useCoordinateHighlightOptional, type HighlightedPoint, type HighlightedRegion } from '@/contexts/CoordinateHighlightContext';

interface CoordinateMarkerProps {
  zoomLevel: number;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Renders a crosshair marker for points or a rectangle for regions
 * This overlays on the canvas to show where a coordinate/region mentioned in the AI console is
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

  // Render region (bounding box)
  if (highlightedCoord.type === 'region') {
    return (
      <RegionMarker
        region={highlightedCoord}
        zoomLevel={zoomLevel}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
      />
    );
  }

  // Render point (crosshair)
  return (
    <PointMarker
      point={highlightedCoord}
      zoomLevel={zoomLevel}
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
    />
  );
};

/**
 * Renders a crosshair marker at a point coordinate
 */
const PointMarker: React.FC<{
  point: HighlightedPoint;
  zoomLevel: number;
  canvasWidth: number;
  canvasHeight: number;
}> = ({ point, zoomLevel, canvasWidth, canvasHeight }) => {
  const { x, y } = point;
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

/**
 * Renders a rectangle marker for a region (bounding box)
 */
const RegionMarker: React.FC<{
  region: HighlightedRegion;
  zoomLevel: number;
  canvasWidth: number;
  canvasHeight: number;
}> = ({ region, zoomLevel, canvasWidth, canvasHeight }) => {
  const { x1, y1, x2, y2 } = region;

  // Convert to screen coordinates
  const screenX1 = x1 * zoomLevel;
  const screenY1 = y1 * zoomLevel;
  const screenX2 = x2 * zoomLevel;
  const screenY2 = y2 * zoomLevel;

  const width = screenX2 - screenX1;
  const height = screenY2 - screenY1;

  // Center of the region for label placement
  const centerX = (screenX1 + screenX2) / 2;

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
      {/* Region rectangle */}
      <div
        style={{
          position: 'absolute',
          left: screenX1,
          top: screenY1,
          width: width,
          height: height,
          border: '3px solid #FF0000',
          backgroundColor: 'rgba(255, 0, 0, 0.15)',
          boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.5)',
        }}
      />
      {/* Corner markers */}
      {[[screenX1, screenY1], [screenX2, screenY1], [screenX1, screenY2], [screenX2, screenY2]].map(([cx, cy], i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: cx - 5,
            top: cy - 5,
            width: '10px',
            height: '10px',
            backgroundColor: '#FF0000',
            border: '2px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      ))}
      {/* Region label */}
      <div
        style={{
          position: 'absolute',
          left: centerX,
          top: screenY1 - 32,
          transform: 'translateX(-50%)',
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
        ({x1}, {y1}) → ({x2}, {y2})
      </div>
      {/* Size label at bottom */}
      <div
        style={{
          position: 'absolute',
          left: centerX,
          top: screenY2 + 8,
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '2px 6px',
          borderRadius: '3px',
          fontSize: '10px',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
        }}
      >
        {x2 - x1 + 1}×{y2 - y1 + 1}px
      </div>
    </div>
  );
};
