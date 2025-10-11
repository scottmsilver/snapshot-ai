import React, { useState, useEffect, useRef } from 'react';
import { MEASUREMENT_UNITS, type MeasurementUnit } from '@/utils/measurementUtils';

interface CalibrationDialogProps {
  isOpen: boolean;
  pixelDistance: number;
  onConfirm: (value: number, unit: MeasurementUnit) => void;
  onCancel: () => void;
}

export const CalibrationDialog: React.FC<CalibrationDialogProps> = ({
  isOpen,
  pixelDistance,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<MeasurementUnit>('cm');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      setValue('');
      setError('');
      // Focus input when dialog opens
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);
  
  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setError('Please enter a positive number');
      return;
    }
    
    onConfirm(numValue, unit);
  };
  
  if (!isOpen) return null;
  
  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onCancel}
      >
        {/* Dialog */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            minWidth: '320px',
            maxWidth: '400px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ 
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#333'
          }}>
            Set Reference Measurement
          </h3>
          
          <div style={{
            padding: '12px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            marginBottom: '16px',
            fontSize: '14px',
            color: '#666'
          }}>
            You drew: <strong>{pixelDistance.toFixed(1)} pixels</strong>
          </div>
          
          <form onSubmit={handleSubmit}>
            <label style={{
              display: 'block',
              marginBottom: '16px',
              fontSize: '14px',
              color: '#333'
            }}>
              This equals:
              <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: '8px'
              }}>
                <input
                  ref={inputRef}
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter value"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: `1px solid ${error ? '#d32f2f' : '#ddd'}`,
                    borderRadius: '4px',
                    outline: 'none',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#4a90e2'}
                  onBlur={(e) => e.target.style.borderColor = error ? '#d32f2f' : '#ddd'}
                />
                
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as MeasurementUnit)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    minWidth: '80px'
                  }}
                >
                  {Object.entries(MEASUREMENT_UNITS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              
              {error && (
                <div style={{
                  marginTop: '4px',
                  fontSize: '12px',
                  color: '#d32f2f'
                }}>
                  {error}
                </div>
              )}
            </label>
            
            <div style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: 'transparent',
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
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Cancel
              </button>
              
              <button
                type="submit"
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#4a90e2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#357abd';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#4a90e2';
                }}
              >
                Set Reference
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};