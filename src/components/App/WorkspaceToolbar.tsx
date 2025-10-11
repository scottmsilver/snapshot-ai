import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { DrawingToolbar } from '@/components/Toolbar';
import { PropertiesSection } from '@/components/Toolbar/PropertiesSection';
import { DrawingTool, type Shape, type DrawingStyle } from '@/types/drawing';

interface WorkspaceToolbarProps {
  isCanvasInitialized: boolean;
  selectedShapes: Shape[];
  activeTool: DrawingTool;
  currentStyle: DrawingStyle;
  updateStyle: (style: Partial<DrawingStyle>) => void;
  updateShape: (id: string, updates: Partial<Shape>) => void;
  zoomLevel: number;
  onZoomChange: (value: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const zoomOptions = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4,
];

export const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
  isCanvasInitialized,
  selectedShapes,
  activeTool,
  currentStyle,
  updateStyle,
  updateShape,
  zoomLevel,
  onZoomChange,
  onZoomIn,
  onZoomOut,
}) => {
  if (!isCanvasInitialized) {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e0e0e0',
        padding: '0.25rem 0.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '0.25rem',
          paddingRight: '0.75rem',
          borderRight: '1px solid #e0e0e0',
        }}
      >
        <DrawingToolbar horizontal selectedShapes={selectedShapes} />
      </div>

      <PropertiesSection
        activeTool={activeTool}
        currentStyle={currentStyle}
        selectedShapes={selectedShapes}
        onStyleChange={updateStyle}
        updateShape={updateShape}
      />

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          marginLeft: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '0.125rem',
            alignItems: 'center',
            paddingLeft: '0.5rem',
            borderLeft: '1px solid #e0e0e0',
          }}
        >
          <button
            onClick={onZoomOut}
            disabled={zoomLevel <= 0.1}
            title="Zoom Out"
            style={{
              padding: '0.25rem',
              backgroundColor: 'transparent',
              border: '1px solid transparent',
              borderRadius: '4px',
              cursor: zoomLevel > 0.1 ? 'pointer' : 'not-allowed',
              opacity: zoomLevel > 0.1 ? 1 : 0.3,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              width: '28px',
              height: '28px',
              justifyContent: 'center',
            }}
            onMouseEnter={event => {
              if (zoomLevel > 0.1) {
                event.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
            onMouseLeave={event => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <ZoomOut size={16} />
          </button>

          <select
            value={zoomLevel}
            onChange={event => onZoomChange(parseFloat(event.target.value))}
            title="Zoom Level"
            style={{
              padding: '0.25rem 0.375rem',
              backgroundColor: 'white',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#666',
              minWidth: '65px',
              appearance: 'none',
              backgroundImage:
                "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.125rem center',
              backgroundSize: '14px',
              paddingRight: '1.25rem',
              height: '28px',
            }}
          >
            {zoomOptions.map(option => (
              <option key={option} value={option}>
                {Math.round(option * 100)}%
              </option>
            ))}
            {!zoomOptions.includes(zoomLevel) && (
              <option value={zoomLevel}>{Math.round(zoomLevel * 100)}%</option>
            )}
          </select>

          <button
            onClick={onZoomIn}
            disabled={zoomLevel >= 4}
            title="Zoom In"
            style={{
              padding: '0.25rem',
              backgroundColor: 'transparent',
              border: '1px solid transparent',
              borderRadius: '4px',
              cursor: zoomLevel < 4 ? 'pointer' : 'not-allowed',
              opacity: zoomLevel < 4 ? 1 : 0.3,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              width: '28px',
              height: '28px',
              justifyContent: 'center',
            }}
            onMouseEnter={event => {
              if (zoomLevel < 4) {
                event.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
            onMouseLeave={event => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
