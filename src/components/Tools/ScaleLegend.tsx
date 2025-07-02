import React from 'react';
import type { MeasurementUnit } from '@/utils/measurementUtils';

interface ScaleLegendProps {
  isCalibrated: boolean;
  pixelsPerUnit: number | null;
  unit: MeasurementUnit | string;
  onSetScale: () => void;
  onChangeUnit: (unit: MeasurementUnit) => void;
}

export const ScaleLegend: React.FC<ScaleLegendProps> = ({
  isCalibrated,
  pixelsPerUnit,
  unit,
  onSetScale,
  onChangeUnit
}) => {
  if (!isCalibrated || !pixelsPerUnit) {
    return (
      <div 
        onClick={onSetScale}
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '8px 12px',
          cursor: 'pointer',
          fontSize: '12px',
          color: '#666',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          pointerEvents: 'auto',
          zIndex: 10
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 1)';
          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        }}
      >
        <span style={{ color: '#ff9800' }}>⚠️</span>
        <span>Click to set scale</span>
      </div>
    );
  }

  // Calculate a nice round number for the scale bar
  const scaleBarUnits = unit === 'm' || unit === 'ft' ? 1 : 10;
  const scaleBarPixels = Math.round(pixelsPerUnit * scaleBarUnits);
  
  return (
    <div 
      style={{
        position: 'absolute',
        bottom: '12px',
        left: '12px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #ccc',
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '12px',
        color: '#333',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}
    >
      {/* Scale bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ position: 'relative', height: '20px', display: 'flex', alignItems: 'center' }}>
          {/* Left cap */}
          <div style={{
            width: '1px',
            height: '12px',
            backgroundColor: '#333'
          }} />
          
          {/* Scale bar */}
          <div style={{
            width: `${scaleBarPixels}px`,
            height: '2px',
            backgroundColor: '#333',
            margin: '0 -1px' // Overlap the caps
          }} />
          
          {/* Right cap */}
          <div style={{
            width: '1px',
            height: '12px',
            backgroundColor: '#333'
          }} />
          
          {/* Tick marks */}
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${(scaleBarPixels / 4) * i}px`,
                width: '1px',
                height: i % 2 === 0 ? '8px' : '5px',
                backgroundColor: '#666',
                top: '50%',
                transform: 'translateY(-50%)'
              }}
            />
          ))}
        </div>
        
        <span style={{ fontWeight: 500 }}>
          {scaleBarUnits} {unit}
        </span>
      </div>
      
      {/* Controls */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <select
          value={unit}
          onChange={(e) => onChangeUnit(e.target.value as MeasurementUnit)}
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '2px 4px',
            fontSize: '11px',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="m">m</option>
          <option value="in">in</option>
          <option value="ft">ft</option>
        </select>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSetScale();
          }}
          style={{
            padding: '2px 8px',
            fontSize: '11px',
            backgroundColor: 'transparent',
            border: '1px solid #666',
            borderRadius: '3px',
            color: '#666',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f5f5f5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          Recalibrate
        </button>
      </div>
    </div>
  );
};