import React from 'react';
import { MEASUREMENT_UNITS, type MeasurementUnit } from '@/utils/measurementUtils';
import type { MeasurementCalibration } from '@/hooks/useMeasurement';

interface MeasurementPanelProps {
  calibration: MeasurementCalibration;
  isCalibrating: boolean;
  onStartCalibration: () => void;
  onClearCalibration: () => void;
  onChangeUnit: (unit: MeasurementUnit) => void;
}

export const MeasurementPanel: React.FC<MeasurementPanelProps> = ({
  calibration,
  isCalibrating,
  onStartCalibration,
  onClearCalibration,
  onChangeUnit,
}) => {
  const isCalibrated = calibration.pixelsPerUnit !== null;
  
  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '13px',
      minWidth: '200px',
    }}>
      <h4 style={{ 
        margin: '0 0 12px 0', 
        fontSize: '14px',
        fontWeight: '600',
        color: '#333',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        📏 Measurements
      </h4>
      
      {/* Calibration Status */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: '8px',
          marginBottom: '4px'
        }}>
          <span style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%',
            backgroundColor: isCalibrated ? '#4caf50' : '#ff9800',
            flexShrink: 0
          }} />
          <span style={{ 
            fontSize: '12px',
            color: '#666',
            fontWeight: '500'
          }}>
            {isCalibrated ? 'Calibrated' : 'Not Calibrated'}
          </span>
        </div>
        
        {isCalibrated && calibration.pixelsPerUnit && (
          <div style={{ 
            fontSize: '11px', 
            color: '#999',
            marginLeft: '16px'
          }}>
            Scale: 1 {calibration.unit} = {(calibration.pixelsPerUnit).toFixed(2)} px
          </div>
        )}
      </div>
      
      {/* Unit Selector */}
      {isCalibrated && (
        <div style={{ marginBottom: '12px' }}>
          <label style={{ 
            fontSize: '12px', 
            color: '#666',
            display: 'block',
            marginBottom: '4px'
          }}>
            Display Unit:
          </label>
          <select
            value={calibration.unit}
            onChange={(e) => onChangeUnit(e.target.value as MeasurementUnit)}
            style={{
              width: '100%',
              padding: '4px 8px',
              fontSize: '12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: 'white',
              cursor: 'pointer',
            }}
          >
            {Object.entries(MEASUREMENT_UNITS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}
      
      {/* Mode Toggle */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: '8px',
        marginBottom: '12px'
      }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
        }}>
          <input
            type="radio"
            name="measureMode"
            checked={isCalibrating}
            onChange={() => onStartCalibration()}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontSize: '12px' }}>
            {isCalibrated ? 'Recalibrate' : 'Calibrate'} Reference
          </span>
        </label>
        
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: isCalibrated ? 'pointer' : 'not-allowed',
          opacity: isCalibrated ? 1 : 0.5,
        }}>
          <input
            type="radio"
            name="measureMode"
            checked={!isCalibrating && isCalibrated}
            onChange={() => {}}
            disabled={!isCalibrated}
            style={{ cursor: isCalibrated ? 'pointer' : 'not-allowed' }}
          />
          <span style={{ fontSize: '12px' }}>Measure</span>
        </label>
      </div>
      
      {/* Instructions */}
      <div style={{
        padding: '8px',
        backgroundColor: '#f5f5f5',
        borderRadius: '4px',
        fontSize: '11px',
        color: '#666',
        lineHeight: '1.4',
        marginBottom: '12px'
      }}>
        {isCalibrating ? (
          <>
            <strong>Calibration Mode:</strong><br />
            Draw a line on a known distance, then enter its measurement.
          </>
        ) : isCalibrated ? (
          <>
            <strong>Measurement Mode:</strong><br />
            Draw lines to measure distances based on your calibration.
          </>
        ) : (
          <>
            <strong>Getting Started:</strong><br />
            Click "Calibrate Reference" and draw a line on something you know the size of.
          </>
        )}
      </div>
      
      {/* Clear Calibration Button */}
      {isCalibrated && (
        <button
          onClick={onClearCalibration}
          style={{
            width: '100%',
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: 'transparent',
            color: '#d32f2f',
            border: '1px solid #d32f2f',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#ffebee';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          Clear Calibration
        </button>
      )}
    </div>
  );
};