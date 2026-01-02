import React from 'react';
import { useDrawingContext } from '@/contexts/DrawingContext';
import type { Point } from '@/types/drawing';
import './ReferenceLabelOverlay.css';

interface ReferenceLabelOverlayProps {
  onManipulate?: () => void;
  onClear?: () => void;
  zoomLevel?: number;
  canvasContainerRef?: React.RefObject<HTMLDivElement>;
}

export const ReferenceLabelOverlay: React.FC<ReferenceLabelOverlayProps> = ({
  onManipulate,
  onClear,
  zoomLevel = 1,
  canvasContainerRef
}) => {
  const { state: drawingState } = useDrawingContext();

  // Get reference points from state (will be added by another worker)
  const referencePoints = (drawingState as any).referencePoints || [];

  if (!referencePoints || referencePoints.length === 0) {
    return null;
  }

  // Convert point index to letter label (A, B, C, ...)
  const getLabel = (index: number): string => {
    return String.fromCharCode(65 + index); // 65 = 'A'
  };

  return (
    <>
      {/* Render map-pin markers for each point */}
      {referencePoints.map((point: Point, index: number) => {
        // Convert canvas coordinates to screen coordinates
        const screenX = point.x * zoomLevel;
        const screenY = point.y * zoomLevel;

        return (
        <div
          key={index}
          className="reference-pin-marker"
          style={{
            position: 'absolute',
            left: `${screenX}px`,
            top: `${screenY}px`,
            // Position so the pin point is exactly at the click location
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            zIndex: 10000,
          }}
        >
          {/* Pin head (circle with label) */}
          <div
            className="reference-pin-head"
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: '#2196f3',
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
              border: '2px solid white',
            }}
          >
            <span
              style={{
                transform: 'rotate(45deg)',
                fontSize: '13px',
                fontWeight: '700',
                color: 'white',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
              }}
            >
              {getLabel(index)}
            </span>
          </div>
          {/* Pin shadow/dot at exact location */}
          <div
            className="reference-pin-dot"
            style={{
              position: 'absolute',
              bottom: '-3px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '6px',
              height: '6px',
              backgroundColor: '#1565c0',
              borderRadius: '50%',
              boxShadow: '0 0 4px rgba(33, 150, 243, 0.5)',
            }}
          />
        </div>
        );
      })}

      {/* Floating toolbar for actions */}
      {referencePoints.length >= 1 && (
        <div
          className="reference-toolbar"
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.45)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 10001,
          }}
        >
          <button
            onClick={onManipulate}
            className="reference-toolbar-button"
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontWeight: '500',
              backgroundColor: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1976d2';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#2196f3';
            }}
          >
            Manipulate
          </button>
          <button
            onClick={onClear}
            className="reference-toolbar-button"
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontWeight: '500',
              backgroundColor: 'white',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
};
