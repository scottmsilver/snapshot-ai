import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CompactColorPickerProps {
  label?: string;
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

const presetColors = [
  '#000000', '#666666', '#999999', '#cccccc', '#ffffff',
  '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff',
  '#0000ff', '#9900ff', '#ff00ff', '#ff6b6b', '#4dabf7',
];

export const CompactColorPicker: React.FC<CompactColorPickerProps> = ({ 
  label, 
  color, 
  onChange,
  disabled = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(color);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    setCustomColor(color);
  }, [color]);

  return (
    <div ref={pickerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        title={label || 'Color'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          backgroundColor: 'transparent',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          height: '28px',
        }}
      >
        <div
          style={{
            width: '16px',
            height: '16px',
            backgroundColor: color,
            border: '1px solid #ccc',
            borderRadius: '2px',
          }}
        />
        {label && (
          <span style={{ fontSize: '0.75rem', color: '#666' }}>{label}</span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              top: '100%',
              left: '0',
              marginTop: '4px',
              backgroundColor: 'white',
              border: '1px solid #ddd',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '12px',
              zIndex: 1000,
              minWidth: '200px',
            }}
          >
            {/* Preset colors */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '6px',
              marginBottom: '12px',
            }}>
              {presetColors.map((presetColor) => (
                <button
                  key={presetColor}
                  onClick={() => {
                    onChange(presetColor);
                    setIsOpen(false);
                  }}
                  style={{
                    width: '28px',
                    height: '28px',
                    backgroundColor: presetColor,
                    border: presetColor === color ? '2px solid #2196f3' : '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  title={presetColor}
                />
              ))}
            </div>

            {/* Custom color input */}
            <div style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}>
              <input
                type="color"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  onChange(e.target.value);
                }}
                style={{
                  width: '40px',
                  height: '28px',
                  padding: '2px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                value={customColor}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                    setCustomColor(value);
                    if (value.length === 7) {
                      onChange(value);
                    }
                  }
                }}
                placeholder="#000000"
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};