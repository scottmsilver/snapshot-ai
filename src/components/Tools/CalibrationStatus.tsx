import React from 'react';
import type { MeasurementUnit } from '@/utils/measurementUtils';

interface CalibrationStatusProps {
  isCalibrated: boolean;
  pixelsPerUnit: number | null;
  unit: MeasurementUnit | string;
  onSetScale: () => void;
  onChangeUnit: (unit: MeasurementUnit) => void;
}

export const CalibrationStatus: React.FC<CalibrationStatusProps> = ({
  isCalibrated,
  pixelsPerUnit,
  unit,
  onSetScale,
  onChangeUnit
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.25rem 0.5rem',
      backgroundColor: isCalibrated ? '#e8f5e9' : '#fff3e0',
      borderRadius: '4px',
      fontSize: '0.875rem',
      border: `1px solid ${isCalibrated ? '#4caf50' : '#ff9800'}`
    }}>
      {isCalibrated ? (
        <>
          <span style={{ color: '#2e7d32' }}>📐</span>
          <span style={{ color: '#2e7d32' }}>
            Scale: 1 {unit} = {Math.round(pixelsPerUnit!)} px
          </span>
          <select
            value={unit}
            onChange={(e) => onChangeUnit(e.target.value as MeasurementUnit)}
            style={{
              marginLeft: '0.5rem',
              padding: '0.125rem 0.25rem',
              fontSize: '0.75rem',
              backgroundColor: 'white',
              border: '1px solid #2e7d32',
              borderRadius: '4px',
              color: '#2e7d32',
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
            onClick={onSetScale}
            style={{
              marginLeft: '0.5rem',
              padding: '0.125rem 0.5rem',
              fontSize: '0.75rem',
              backgroundColor: 'transparent',
              border: '1px solid #2e7d32',
              borderRadius: '4px',
              color: '#2e7d32',
              cursor: 'pointer'
            }}
          >
            Change Scale
          </button>
        </>
      ) : (
        <>
          <span style={{ color: '#f57c00' }}>⚠️</span>
          <span style={{ color: '#f57c00' }}>No scale set</span>
          <button
            onClick={onSetScale}
            style={{
              marginLeft: 'auto',
              padding: '0.125rem 0.5rem',
              fontSize: '0.75rem',
              backgroundColor: '#ff9800',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Set Scale
          </button>
        </>
      )}
    </div>
  );
};