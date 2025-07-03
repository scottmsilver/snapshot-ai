import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import { CompactColorPicker } from './CompactColorPicker';
import { DrawingTool, type Shape, type TextShape, type CalloutShape } from '@/types/drawing';

interface PropertiesSectionProps {
  activeTool: DrawingTool;
  currentStyle: any;
  selectedShapes: Shape[];
  onStyleChange: (updates: any) => void;
  onTextPropertyChange?: (updates: any) => void;
  updateShape?: (id: string, updates: any) => void;
}

// Compact stroke width selector
const StrokeWidthSelector: React.FC<{
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        title="Stroke Width"
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
          fontSize: '0.75rem',
          color: '#666',
        }}
      >
        <div style={{
          width: '16px',
          height: value,
          maxHeight: '16px',
          backgroundColor: '#666',
          borderRadius: '1px',
        }} />
        <span>{value}px</span>
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
              padding: '8px',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              minWidth: '120px',
            }}
          >
            {[1, 2, 3, 5, 8, 10, 15, 20].map(width => (
              <button
                key={width}
                onClick={() => {
                  onChange(width);
                  setIsOpen(false);
                }}
                style={{
                  padding: '4px 8px',
                  backgroundColor: value === width ? '#e3f2fd' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                onMouseEnter={(e) => {
                  if (value !== width) {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (value !== width) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div style={{
                  width: '20px',
                  height: width,
                  maxHeight: '20px',
                  backgroundColor: '#666',
                  borderRadius: '1px',
                }} />
                <span>{width}px</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Compact opacity slider
const OpacitySlider: React.FC<{
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      opacity: disabled ? 0.5 : 1,
    }}>
      <span style={{ fontSize: '0.75rem', color: '#666', minWidth: '50px' }}>
        Opacity
      </span>
      <input
        type="range"
        min="0"
        max="100"
        value={value * 100}
        onChange={(e) => onChange(parseInt(e.target.value) / 100)}
        disabled={disabled}
        style={{
          width: '80px',
          height: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      />
      <span style={{ fontSize: '0.75rem', color: '#666', minWidth: '35px' }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
};

export const PropertiesSection: React.FC<PropertiesSectionProps> = ({
  activeTool,
  currentStyle,
  selectedShapes,
  onStyleChange,
  onTextPropertyChange,
  updateShape,
}) => {
  const [showOverflow, setShowOverflow] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Determine what properties to show
  const hasSelection = selectedShapes.length > 0;
  const singleSelection = selectedShapes.length === 1;
  const selectedShape = singleSelection ? selectedShapes[0] : null;
  
  const displayStroke = selectedShape ? selectedShape.style.stroke : currentStyle.stroke;
  const displayStrokeWidth = selectedShape ? selectedShape.style.strokeWidth : currentStyle.strokeWidth;
  const displayOpacity = selectedShape ? selectedShape.style.opacity : currentStyle.opacity;
  const displayFill = selectedShape ? selectedShape.style.fill : currentStyle.fill;
  
  const toolOrShapeType = selectedShape ? selectedShape.type : activeTool;
  const showFillOption = toolOrShapeType === DrawingTool.RECTANGLE || 
                        toolOrShapeType === DrawingTool.CIRCLE || 
                        toolOrShapeType === DrawingTool.STAR;
  const showStrokeWidth = toolOrShapeType !== DrawingTool.TEXT;
  const showTextOptions = toolOrShapeType === DrawingTool.TEXT || toolOrShapeType === DrawingTool.CALLOUT;

  // Handle property updates
  const handlePropertyChange = (updates: any) => {
    if (hasSelection && updateShape) {
      selectedShapes.forEach(shape => {
        updateShape(shape.id, { 
          style: { ...shape.style, ...updates },
          updatedAt: Date.now()
        });
      });
    }
    onStyleChange(updates);
  };

  // Calculate available space
  useEffect(() => {
    const calculateSpace = () => {
      if (containerRef.current) {
        setAvailableWidth(containerRef.current.offsetWidth);
      }
    };

    calculateSpace();
    window.addEventListener('resize', calculateSpace);
    return () => window.removeEventListener('resize', calculateSpace);
  }, []);

  // Close overflow menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(event.target as Node)) {
        setShowOverflow(false);
      }
    };

    if (showOverflow) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showOverflow]);

  // Don't show properties for SELECT tool with no selection
  if (activeTool === DrawingTool.SELECT && !hasSelection) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        fontSize: '0.75rem',
        color: '#999',
      }}>
        Click on shapes to select
      </div>
    );
  }

  // Minimum width needed for each control
  const CONTROL_WIDTHS = {
    stroke: 100,
    strokeWidth: 100,
    opacity: 180,
    fill: 100,
    textSize: 150,
  };

  // Determine which controls can fit
  const controls = [];
  let usedWidth = 0;
  const overflowControls = [];

  // Always try to show stroke color first
  if (usedWidth + CONTROL_WIDTHS.stroke <= availableWidth || availableWidth === 0) {
    controls.push('stroke');
    usedWidth += CONTROL_WIDTHS.stroke;
  } else {
    overflowControls.push('stroke');
  }

  // Add stroke width if it fits and is applicable
  if (showStrokeWidth) {
    if (usedWidth + CONTROL_WIDTHS.strokeWidth <= availableWidth || availableWidth === 0) {
      controls.push('strokeWidth');
      usedWidth += CONTROL_WIDTHS.strokeWidth;
    } else {
      overflowControls.push('strokeWidth');
    }
  }

  // Add fill if applicable
  if (showFillOption) {
    if (usedWidth + CONTROL_WIDTHS.fill <= availableWidth || availableWidth === 0) {
      controls.push('fill');
      usedWidth += CONTROL_WIDTHS.fill;
    } else {
      overflowControls.push('fill');
    }
  }

  // Add opacity if it fits
  if (usedWidth + CONTROL_WIDTHS.opacity <= availableWidth || availableWidth === 0) {
    controls.push('opacity');
    usedWidth += CONTROL_WIDTHS.opacity;
  } else {
    overflowControls.push('opacity');
  }

  return (
    <div 
      ref={containerRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '0 16px',
        flex: 1,
        minWidth: 0,
        position: 'relative',
      }}
    >
      {/* Visible controls */}
      {controls.includes('stroke') && (
        <CompactColorPicker
          label="Stroke"
          color={displayStroke}
          onChange={(color) => handlePropertyChange({ stroke: color })}
        />
      )}
      
      {controls.includes('strokeWidth') && (
        <StrokeWidthSelector
          value={displayStrokeWidth}
          onChange={(value) => handlePropertyChange({ strokeWidth: value })}
        />
      )}
      
      {controls.includes('fill') && (
        <CompactColorPicker
          label="Fill"
          color={displayFill || 'transparent'}
          onChange={(color) => handlePropertyChange({ fill: color })}
        />
      )}
      
      {controls.includes('opacity') && (
        <OpacitySlider
          value={displayOpacity}
          onChange={(value) => handlePropertyChange({ opacity: value })}
        />
      )}

      {/* Overflow menu button */}
      {overflowControls.length > 0 && (
        <div ref={overflowRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowOverflow(!showOverflow)}
            title="More options"
            style={{
              padding: '4px',
              backgroundColor: 'transparent',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              height: '28px',
            }}
          >
            <MoreHorizontal size={16} />
          </button>

          <AnimatePresence>
            {showOverflow && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  marginTop: '4px',
                  backgroundColor: 'white',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  padding: '12px',
                  zIndex: 1000,
                  minWidth: '250px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {overflowControls.map(control => {
                  switch (control) {
                    case 'stroke':
                      return (
                        <div key="stroke" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#666', minWidth: '60px' }}>Stroke</span>
                          <CompactColorPicker
                            color={displayStroke}
                            onChange={(color) => handlePropertyChange({ stroke: color })}
                          />
                        </div>
                      );
                    case 'strokeWidth':
                      return (
                        <div key="strokeWidth" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#666', minWidth: '60px' }}>Width</span>
                          <StrokeWidthSelector
                            value={displayStrokeWidth}
                            onChange={(value) => handlePropertyChange({ strokeWidth: value })}
                          />
                        </div>
                      );
                    case 'fill':
                      return (
                        <div key="fill" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#666', minWidth: '60px' }}>Fill</span>
                          <CompactColorPicker
                            color={displayFill || 'transparent'}
                            onChange={(color) => handlePropertyChange({ fill: color })}
                          />
                        </div>
                      );
                    case 'opacity':
                      return (
                        <OpacitySlider
                          key="opacity"
                          value={displayOpacity}
                          onChange={(value) => handlePropertyChange({ opacity: value })}
                        />
                      );
                    default:
                      return null;
                  }
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};