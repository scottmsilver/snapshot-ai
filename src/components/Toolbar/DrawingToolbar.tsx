import React, { useEffect, useState, useRef } from 'react';
import { useDrawing } from '@/hooks/useDrawing';
import { useDrawingContext } from '@/contexts/DrawingContext';
import { DrawingTool, type Shape, type TextShape, type CalloutShape, type DrawingStyle } from '@/types/drawing';
import {
  SelectIcon,
  PenIcon,
  RectangleIcon,
  CircleIcon,
  ArrowIcon,
  TextIcon,
  CalloutIcon,
  StarIcon,
  MeasureIcon,
  ScreenshotIcon,
  ImageIcon,
  GenerativeFillIcon
} from '@/components/Icons/ToolIcons';
import { ColorPicker } from '@/components/ColorPicker';
import { ChevronDown } from 'lucide-react';


const tools = [
  { tool: DrawingTool.SELECT, icon: SelectIcon, label: 'Select', shortcut: 'V' },
  { tool: DrawingTool.PEN, icon: PenIcon, label: 'Pen', shortcut: 'P' },
  { tool: DrawingTool.RECTANGLE, icon: RectangleIcon, label: 'Rectangle', shortcut: 'R' },
  { tool: DrawingTool.CIRCLE, icon: CircleIcon, label: 'Circle', shortcut: 'C' },
  { tool: DrawingTool.ARROW, icon: ArrowIcon, label: 'Arrow', shortcut: 'A' },
  { tool: DrawingTool.TEXT, icon: TextIcon, label: 'Text', shortcut: 'T' },
  { tool: DrawingTool.CALLOUT, icon: CalloutIcon, label: 'Callout', shortcut: 'L' },
  { tool: DrawingTool.STAR, icon: StarIcon, label: 'Star', shortcut: 'S' },
  { tool: DrawingTool.IMAGE, icon: ImageIcon, label: 'Image/PDF', shortcut: 'I' },
  { tool: DrawingTool.SCREENSHOT, icon: ScreenshotIcon, label: 'Screenshot', shortcut: 'X' },
  { tool: DrawingTool.MEASURE, icon: MeasureIcon, label: 'Measure', shortcut: 'M' },
  { tool: DrawingTool.GENERATIVE_FILL, icon: GenerativeFillIcon, label: 'AI Fill', shortcut: 'G' }
];

interface DrawingToolbarProps {
  style?: React.CSSProperties;
  horizontal?: boolean;
  selectedShapes?: Shape[];
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({ style, horizontal = false, selectedShapes = [] }) => {
  const { activeTool, setActiveTool, currentStyle, updateStyle, handleKeyPress, updateShape } = useDrawing();
  const { state: drawingState } = useDrawingContext();
  const isCalibrated = drawingState.measurementCalibration.pixelsPerUnit !== null;
  const [showMeasureDropdown, setShowMeasureDropdown] = useState(false);
  const measureDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (measureDropdownRef.current && !measureDropdownRef.current.contains(event.target as Node)) {
        setShowMeasureDropdown(false);
      }
    };

    if (showMeasureDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMeasureDropdown]);

  // Determine if we're showing properties for selected shapes or for the active tool
  const hasSelection = selectedShapes.length > 0;
  const singleSelection = selectedShapes.length === 1;
  const selectedShape = singleSelection ? selectedShapes[0] : null;

  // Get display values - either from selected shape or current style
  const displayStroke = selectedShape ? selectedShape.style.stroke : currentStyle.stroke;
  const displayStrokeWidth = selectedShape ? selectedShape.style.strokeWidth : currentStyle.strokeWidth;
  const displayOpacity = selectedShape ? selectedShape.style.opacity : currentStyle.opacity;
  const displayFill = selectedShape ? selectedShape.style.fill : currentStyle.fill;

  // Text-specific display values
  const selectedTextShape = selectedShape && selectedShape.type === DrawingTool.TEXT ? selectedShape as TextShape : null;
  const selectedCalloutShape = selectedShape && selectedShape.type === DrawingTool.CALLOUT ? selectedShape as CalloutShape : null;
  const displayFontSize = selectedTextShape ? selectedTextShape.fontSize : selectedCalloutShape ? selectedCalloutShape.fontSize : currentStyle.strokeWidth * 8;
  const displayFontFamily = selectedTextShape ? selectedTextShape.fontFamily : selectedCalloutShape ? selectedCalloutShape.fontFamily : currentStyle.fontFamily || 'Arial';

  // Determine which properties to show
  const toolOrShapeType = selectedShape ? selectedShape.type : activeTool;
  const showFillOption = toolOrShapeType === DrawingTool.RECTANGLE || toolOrShapeType === DrawingTool.CIRCLE || toolOrShapeType === DrawingTool.STAR;
  const showStrokeWidth = toolOrShapeType !== DrawingTool.TEXT && toolOrShapeType !== DrawingTool.CALLOUT && toolOrShapeType !== DrawingTool.IMAGE;
  const showTextOptions = toolOrShapeType === DrawingTool.TEXT || toolOrShapeType === DrawingTool.CALLOUT;

  // Handle property updates for both selected shapes and default style
  const handlePropertyChange = (updates: Partial<DrawingStyle>): void => {
    // Update selected shapes
    if (hasSelection) {
      selectedShapes.forEach(shape => {
        updateShape(shape.id, {
          style: { ...shape.style, ...updates },
          updatedAt: Date.now()
        });
      });
    }
    // Always update default style for future shapes
    updateStyle(updates);
  };

  // Handle text-specific property updates
  const handleTextPropertyChange = (updates: Partial<Pick<TextShape, 'fontSize' | 'fontFamily' | 'text' | 'align'>>): void => {
    // Update selected text shapes
    if (hasSelection) {
      selectedShapes.forEach(shape => {
        if (shape.type === DrawingTool.TEXT) {
          const shapeUpdates: Partial<TextShape> = {
            ...updates,
            updatedAt: Date.now()
          };

          // If text content or font properties change, reset width to allow reflow
          if (updates.text !== undefined || updates.fontSize || updates.fontFamily) {
            shapeUpdates.width = undefined;
          }

          // Also reset width if alignment changes to ensure proper reflow
          if (updates.align !== undefined) {
            shapeUpdates.width = undefined;
          }

          updateShape(shape.id, shapeUpdates);
        } else if (shape.type === DrawingTool.CALLOUT) {
          const { text, fontSize, fontFamily } = updates;
          const shapeUpdates: Partial<CalloutShape> = {
            updatedAt: Date.now(),
            ...(text !== undefined ? { text } : {}),
            ...(fontSize !== undefined ? { fontSize } : {}),
            ...(fontFamily !== undefined ? { fontFamily } : {}),
          };

          if (text !== undefined || fontSize !== undefined || fontFamily !== undefined) {
            shapeUpdates.textWidth = undefined;
          }

          updateShape(shape.id, shapeUpdates);
        }
      });
    }
    // Update default style for future text shapes
    if (updates.fontSize) {
      updateStyle({ strokeWidth: updates.fontSize / 8 });
    }
    if (updates.fontFamily) {
      updateStyle({ fontFamily: updates.fontFamily });
    }
  };

  // Set up keyboard shortcuts
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  // Horizontal layout for main toolbar
  if (horizontal) {
    return (
      <div style={{
        display: 'flex',
        gap: '0.25rem',
        alignItems: 'center',
        ...style
      }}>
        {tools.map(({ tool, icon: Icon, label, shortcut }) => {
          const tooltipText = tool === DrawingTool.MEASURE && !isCalibrated
            ? 'Click to set scale for measurements'
            : `${label} (${shortcut})`;

          // Handle Measure tool specially - show with dropdown if calibrated
          if (tool === DrawingTool.MEASURE) {
            return (
              <div
                key={tool}
                ref={measureDropdownRef}
                style={{
                  position: 'relative',
                  display: 'flex',
                  backgroundColor: (activeTool === tool || showMeasureDropdown) ? '#e3f2fd' : 'transparent',
                  border: (activeTool === tool || showMeasureDropdown) ? '1px solid #2196f3' : '1px solid transparent',
                  borderRadius: '4px',
                  transition: 'all 0.2s',
                }}>
                <button
                  title={tooltipText}
                  onClick={() => {
                    if (!isCalibrated) {
                      // If not calibrated, switch to CALIBRATE tool
                      setActiveTool(DrawingTool.CALIBRATE);
                    } else {
                      // If calibrated, use MEASURE tool
                      setActiveTool(DrawingTool.MEASURE);
                    }
                  }}
                  style={{
                    padding: '0.375rem',
                    paddingRight: isCalibrated ? '0.1875rem' : '0.375rem',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: isCalibrated ? '4px 0 0 4px' : '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.875rem',
                    color: activeTool === tool || showMeasureDropdown ? '#1976d2' : '#666',
                    transition: 'all 0.2s',
                    width: isCalibrated ? '26px' : '32px',
                    height: '32px',
                  }}
                  onMouseEnter={() => {
                    if (activeTool !== tool && !showMeasureDropdown && measureDropdownRef.current) {
                      measureDropdownRef.current.style.backgroundColor = '#f5f5f5';
                    }
                  }}
                  onMouseLeave={() => {
                    if (measureDropdownRef.current) {
                      measureDropdownRef.current.style.backgroundColor = (activeTool === tool || showMeasureDropdown) ? '#e3f2fd' : 'transparent';
                    }
                  }}
                >
                  <Icon size={18} />
                </button>
                {isCalibrated && (
                  <>
                    <button
                      title="Measurement options"
                      onClick={() => setShowMeasureDropdown(!showMeasureDropdown)}
                      style={{
                        padding: '0.375rem 0.1875rem',
                        paddingLeft: '0.125rem',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderLeft: '1px solid #e0e0e0',
                        borderRadius: '0 4px 4px 0',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.875rem',
                        color: activeTool === tool || showMeasureDropdown ? '#1976d2' : '#666',
                        transition: 'all 0.2s',
                        width: '18px',
                        height: '32px',
                      }}
                      onMouseEnter={() => {
                        if (activeTool !== tool && !showMeasureDropdown && measureDropdownRef.current) {
                          measureDropdownRef.current.style.backgroundColor = '#f5f5f5';
                        }
                      }}
                      onMouseLeave={() => {
                        if (measureDropdownRef.current) {
                          measureDropdownRef.current.style.backgroundColor = (activeTool === tool || showMeasureDropdown) ? '#e3f2fd' : 'transparent';
                        }
                      }}
                    >
                      <ChevronDown size={12} />
                    </button>
                    {showMeasureDropdown && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          marginTop: '4px',
                          backgroundColor: 'white',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          padding: '0.25rem',
                          zIndex: 1000,
                          minWidth: '120px',
                        }}
                      >
                        <button
                          onClick={() => {
                            setActiveTool(DrawingTool.CALIBRATE);
                            setShowMeasureDropdown(false);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            backgroundColor: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            color: '#333',
                            borderRadius: '4px',
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
                    )}
                  </>
                )}
              </div>
            );
          }

          // Regular tool buttons
          return (
            <button
              key={tool}
              title={tooltipText}
              onClick={() => setActiveTool(tool)}
              style={{
                padding: '0.375rem',
                backgroundColor: activeTool === tool ? '#e3f2fd' : 'transparent',
                border: activeTool === tool ? '1px solid #2196f3' : '1px solid transparent',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.875rem',
                color: activeTool === tool ? '#1976d2' : '#666',
                transition: 'all 0.2s',
                width: '32px',
                height: '32px',
              }}
              onMouseEnter={(e) => {
                if (activeTool !== tool) {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTool !== tool) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>
    );
  }

  // Vertical layout for sidebar - now only shows style controls
  return (
    <div style={{ ...style }}>

      {/* Style Controls Section */}
      <div>
        <h3 style={{
          fontSize: '0.875rem',
          fontWeight: '600',
          color: '#333',
          marginBottom: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {hasSelection ? (singleSelection ? 'Shape Properties' : `${selectedShapes.length} Shapes Selected`) :
           activeTool === DrawingTool.SELECT ? 'Selection' :
           activeTool === DrawingTool.TEXT ? 'Text Properties' :
           activeTool === DrawingTool.CALLOUT ? 'Callout Properties' : 'Drawing Properties'}
        </h3>

        {/* Selection tool message - only show if nothing selected */}
        {activeTool === DrawingTool.SELECT && !hasSelection && (
          <div style={{
            padding: '1rem',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            fontSize: '0.75rem',
            color: '#666',
            textAlign: 'center',
            marginBottom: '1rem'
          }}>
            Click on shapes to select them or drag to select multiple
          </div>
        )}

        {/* Color Picker - Show for selected shapes or when drawing */}
        {(hasSelection || activeTool !== DrawingTool.SELECT) && (
          <div style={{ marginBottom: '1rem' }}>
            <ColorPicker
              strokeColor={displayStroke}
              fillColor={displayFill}
              onStrokeChange={(color) => handlePropertyChange({ stroke: color })}
              onFillChange={(color) => handlePropertyChange({ fill: color })}
              showFill={showFillOption}
            />
          </div>
        )}

        {/* Stroke Width - Hide for text tool */}
        {showStrokeWidth && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: '#666',
              marginBottom: '0.5rem'
            }}>
              <span>Stroke Width</span>
              <span style={{
                fontWeight: '600',
                color: '#333'
              }}>{displayStrokeWidth}px</span>
            </label>
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
              {[1, 3, 5, 10].map(width => (
                <button
                  key={width}
                  onClick={() => handlePropertyChange({ strokeWidth: width })}
                  style={{
                    flex: 1,
                    padding: '0.25rem',
                    fontSize: '0.75rem',
                    backgroundColor: displayStrokeWidth === width ? '#e3f2fd' : '#f5f5f5',
                    border: displayStrokeWidth === width ? '1px solid #2196f3' : '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: displayStrokeWidth === width ? '#1976d2' : '#666',
                    transition: 'all 0.2s'
                  }}
                >
                  {width}
                </button>
              ))}
            </div>
            <input
              type="range"
              min="1"
              max="20"
              value={displayStrokeWidth}
              onChange={(e) => handlePropertyChange({ strokeWidth: parseInt(e.target.value) })}
              style={{
                width: '100%',
                height: '4px',
                cursor: 'pointer'
              }}
            />
          </div>
        )}

        {/* Opacity */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: '#666',
            marginBottom: '0.5rem'
          }}>
            <span>Opacity</span>
            <span style={{
              fontWeight: '600',
              color: '#333'
            }}>{Math.round(displayOpacity * 100)}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={displayOpacity * 100}
            onChange={(e) => handlePropertyChange({ opacity: parseInt(e.target.value) / 100 })}
            style={{
              width: '100%',
              height: '4px',
              cursor: 'pointer'
            }}
          />
        </div>


        {/* Text Controls - Show when using text tool or when text shape is selected */}
        {showTextOptions && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#333',
              marginBottom: '0.75rem',
              marginTop: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {selectedTextShape ? 'Text Properties' : selectedCalloutShape ? 'Callout Properties' : 'Text Settings'}
            </h3>

            {/* Text Content Editor for selected text or callout */}
            {(selectedTextShape || selectedCalloutShape) && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: '#666',
                  marginBottom: '0.25rem'
                }}>
                  {selectedCalloutShape ? 'Callout Text' : 'Text Content'}
                </label>
                <textarea
                  value={selectedTextShape ? selectedTextShape.text : selectedCalloutShape?.text || ''}
                  onChange={(e) => handleTextPropertyChange({ text: e.target.value })}
                  placeholder={selectedCalloutShape ? "Enter callout text..." : "Enter text..."}
                  style={{
                    width: '100%',
                    minHeight: '60px',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontFamily: selectedTextShape ? selectedTextShape.fontFamily : selectedCalloutShape?.fontFamily || 'Arial',
                    resize: 'vertical',
                    backgroundColor: 'white'
                  }}
                />
                <div style={{
                  fontSize: '0.625rem',
                  color: '#999',
                  marginTop: '0.25rem',
                  textAlign: 'right'
                }}>
                  {(selectedTextShape ? selectedTextShape.text : selectedCalloutShape?.text || '').length} characters
                </div>
              </div>
            )}

            {/* Font Size */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.75rem',
                color: '#666',
                marginBottom: '0.25rem'
              }}>
                Font Size: {displayFontSize}px
              </label>
              <input
                type="range"
                min="8"
                max="72"
                value={displayFontSize}
                onChange={(e) => handleTextPropertyChange({ fontSize: parseInt(e.target.value) })}
                style={{
                  width: '100%',
                  height: '4px',
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* Font Family */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.75rem',
                color: '#666',
                marginBottom: '0.25rem'
              }}>
                Font Family
              </label>
              <select
                value={displayFontFamily}
                onChange={(e) => {
                  handleTextPropertyChange({ fontFamily: e.target.value });
                }}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
              >
                <option value="Arial">Arial</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Georgia">Georgia</option>
                <option value="Courier New">Courier New</option>
                <option value="Verdana">Verdana</option>
                <option value="Comic Sans MS">Comic Sans MS</option>
              </select>
            </div>

            {/* Text Alignment - only for selected text (not callouts) */}
            {selectedTextShape && !selectedCalloutShape && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: '#666',
                  marginBottom: '0.25rem'
                }}>
                  Text Alignment
                </label>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {[
                    { value: 'left', label: '←', title: 'Align Left' },
                    { value: 'center', label: '↔', title: 'Align Center' },
                    { value: 'right', label: '→', title: 'Align Right' }
                  ].map(({ value, label, title }) => (
                    <button
                      key={value}
                      onClick={() => handleTextPropertyChange({ align: value })}
                      title={title}
                      style={{
                        flex: 1,
                        padding: '0.375rem',
                        fontSize: '0.875rem',
                        backgroundColor: (selectedTextShape.align || 'left') === value ? '#e3f2fd' : '#f5f5f5',
                        border: (selectedTextShape.align || 'left') === value ? '1px solid #2196f3' : '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        color: (selectedTextShape.align || 'left') === value ? '#1976d2' : '#666',
                        transition: 'all 0.2s'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
