import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Ruler, RefreshCw, AlertTriangle } from 'lucide-react';
import type { MeasurementUnit } from '@/utils/measurementUtils';

interface SettingsMenuProps {
  showGrid: boolean;
  onToggleGrid: () => void;
  canvasBackground: string;
  onChangeBackground: (color: string) => void;
  measurementCalibration: {
    pixelsPerUnit: number | null;
    unit: string;
  };
  onStartCalibration: () => void;
  onChangeUnit: (unit: MeasurementUnit) => void;
  zoomLevel: number;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  showGrid,
  onToggleGrid,
  canvasBackground,
  onChangeBackground,
  measurementCalibration,
  onStartCalibration,
  onChangeUnit,
  zoomLevel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const isCalibrated = measurementCalibration.pixelsPerUnit !== null;

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Settings"
        style={{
          padding: '0.25rem',
          backgroundColor: 'transparent',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f5f5f5';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <MoreVertical size={16} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '8px 0',
            zIndex: 1000,
            minWidth: '220px',
          }}
        >
          {/* Grid Toggle */}
          <button
            onClick={() => {
              onToggleGrid();
            }}
            style={{
              width: '100%',
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '0.75rem',
              color: '#333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
              </svg>
              <span>Show Grid</span>
            </div>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={onToggleGrid}
              style={{ cursor: 'pointer' }}
            />
          </button>

          {/* Background Color */}
          <div
            style={{
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: '#333',
            }}
          >
            <span>Background</span>
            <input
              type="color"
              value={canvasBackground}
              onChange={(e) => onChangeBackground(e.target.value)}
              title="Canvas Background Color"
              style={{
                width: '24px',
                height: '24px',
                padding: '2px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: canvasBackground,
              }}
            />
          </div>

          <div style={{ height: '1px', backgroundColor: '#eee', margin: '4px 0' }} />

          {/* Calibration */}
          {!isCalibrated ? (
            <button
              onClick={() => {
                // Reset zoom to 1 when calibrating to avoid coordinate issues
                if (zoomLevel !== 1) {
                  alert('Zoom will be reset to 100% for accurate calibration');
                }
                onStartCalibration();
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                padding: '8px 16px',
                backgroundColor: 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: '#ff9800',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fff3e0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <AlertTriangle size={14} />
              <span>Set Scale for Measurements</span>
            </button>
          ) : (
            <>
              <div
                style={{
                  padding: '8px 16px',
                  fontSize: '0.75rem',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Ruler size={14} />
                <span>{measurementCalibration.pixelsPerUnit?.toFixed(2)} px/{measurementCalibration.unit}</span>
              </div>
              
              <div
                style={{
                  padding: '4px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: '#666' }}>Unit:</span>
                <select
                  value={measurementCalibration.unit}
                  onChange={(e) => onChangeUnit(e.target.value as MeasurementUnit)}
                  style={{
                    padding: '2px 4px',
                    fontSize: '0.75rem',
                    backgroundColor: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                  <option value="m">m</option>
                  <option value="in">in</option>
                  <option value="ft">ft</option>
                </select>
                
                <button
                  onClick={() => {
                    if (zoomLevel !== 1) {
                      alert('Zoom will be reset to 100% for accurate calibration');
                    }
                    onStartCalibration();
                    setIsOpen(false);
                  }}
                  title="Recalibrate"
                  style={{
                    padding: '2px 4px',
                    backgroundColor: 'transparent',
                    border: '1px solid #ddd',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    color: '#666',
                    marginLeft: 'auto',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};