import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, PaintBucket } from 'lucide-react';

interface ColorPickerProps {
  strokeColor: string;
  fillColor?: string;
  onStrokeChange: (color: string) => void;
  onFillChange: (color: string | undefined) => void;
  showFill?: boolean;
}

const presetColors = [
  'transparent', // No fill option
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF',
  '#00FFFF', '#808080', '#C0C0C0', '#800000', '#008000', '#000080', '#808000',
  '#800080', '#008080', '#FFA500', '#A52A2A', '#8B4513', '#2F4F4F', '#006400',
  '#4B0082', '#FF1493', '#1E90FF', '#FFD700', '#ADFF2F', '#FF69B4', '#DDA0DD',
  '#B0E0E6', '#FA8072', '#98FB98'
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  strokeColor,
  fillColor,
  onStrokeChange,
  onFillChange,
  showFill = true
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [activeType, setActiveType] = useState<'stroke' | 'fill'>('stroke');
  const [localStroke, setLocalStroke] = useState(strokeColor);
  const [localFill, setLocalFill] = useState(fillColor);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalStroke(strokeColor);
  }, [strokeColor]);

  useEffect(() => {
    setLocalFill(fillColor);
  }, [fillColor]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPicker]);

  const handleColorSelect = (color: string): void => {
    if (color === 'transparent') {
      if (activeType === 'fill') {
        setLocalFill(undefined);
        onFillChange(undefined);
      }
      // Don't allow transparent for stroke
      return;
    }

    if (activeType === 'stroke') {
      setLocalStroke(color);
      onStrokeChange(color);
    } else {
      setLocalFill(color);
      onFillChange(color);
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={pickerRef}>
      {/* Color Swatches */}
      <div style={{ 
        display: 'flex', 
        gap: '8px',
        alignItems: 'center'
      }}>
        {/* Stroke Color */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setActiveType('stroke');
            setShowPicker(true);
          }}
          style={{
            cursor: 'pointer',
            position: 'relative'
          }}
        >
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: localStroke,
            borderRadius: '50%',
            border: '2px solid white',
            boxShadow: activeType === 'stroke' && showPicker ? 
              '0 0 0 2px #4a90e2, 0 2px 4px rgba(0,0,0,0.2)' : 
              '0 2px 4px rgba(0,0,0,0.2)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <Pencil 
              size={14} 
              style={{
                position: 'absolute',
                bottom: '2px',
                right: '2px',
                color: localStroke === '#FFFFFF' || localStroke === '#FFFF00' ? '#333' : '#fff',
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))'
              }} 
            />
          </div>
        </motion.div>

        {/* Fill Color */}
        {showFill && (
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setActiveType('fill');
              setShowPicker(true);
            }}
            style={{
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              backgroundColor: localFill || 'transparent',
              borderRadius: '50%',
              border: '2px solid white',
              boxShadow: activeType === 'fill' && showPicker ? 
                '0 0 0 2px #4a90e2, 0 2px 4px rgba(0,0,0,0.2)' : 
                '0 2px 4px rgba(0,0,0,0.2)',
              backgroundImage: localFill === undefined ? 
                'linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)' : 
                undefined,
              backgroundSize: '6px 6px',
              backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {localFill === undefined && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-45deg)',
                  width: '28px',
                  height: '1px',
                  backgroundColor: '#ff0000'
                }} />
              )}
              <PaintBucket 
                size={14} 
                style={{
                  position: 'absolute',
                  bottom: '2px',
                  right: '2px',
                  color: localFill === '#FFFFFF' || localFill === '#FFFF00' || localFill === undefined ? '#333' : '#fff',
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
                  transform: 'rotate(-15deg)'
                }} 
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* Color Picker Popup */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              top: '42px',
              left: '0',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '12px',
              zIndex: 1000,
              minWidth: '200px'
            }}
          >
            <div style={{ marginBottom: '8px' }}>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#666',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {activeType === 'stroke' ? <Pencil size={12} /> : <PaintBucket size={12} style={{ transform: 'rotate(-15deg)' }} />}
                {activeType === 'stroke' ? 'Stroke' : 'Fill'}
              </div>

              {/* Preset colors grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: '4px',
                marginBottom: '8px'
              }}>
                {presetColors.map((color, index) => (
                  <motion.button
                    key={`${color}-${index}`}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleColorSelect(color)}
                    disabled={activeType === 'stroke' && color === 'transparent'}
                    style={{
                      width: '22px',
                      height: '22px',
                      backgroundColor: color === 'transparent' ? 'transparent' : color,
                      border: color === (activeType === 'stroke' ? localStroke : (localFill || 'transparent')) ? 
                        '2px solid #4a90e2' : 
                        '1px solid #ddd',
                      borderRadius: '50%',
                      cursor: activeType === 'stroke' && color === 'transparent' ? 'not-allowed' : 'pointer',
                      padding: 0,
                      opacity: activeType === 'stroke' && color === 'transparent' ? 0.3 : 1,
                      backgroundImage: color === 'transparent' ? 
                        'linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)' : 
                        undefined,
                      backgroundSize: '6px 6px',
                      backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {color === 'transparent' && (
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-45deg)',
                        width: '16px',
                        height: '1px',
                        backgroundColor: '#ff0000'
                      }} />
                    )}
                  </motion.button>
                ))}
              </div>

              {/* Advanced color picker */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                paddingTop: '8px',
                borderTop: '1px solid #eee'
              }}>
                <input
                  type="color"
                  value={activeType === 'stroke' ? localStroke : (localFill || '#000000')}
                  onChange={(e) => handleColorSelect(e.target.value)}
                  style={{
                    width: '32px',
                    height: '32px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    padding: 0
                  }}
                />
                <span style={{
                  fontSize: '0.75rem',
                  color: '#666'
                }}>
                  More colors...
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};