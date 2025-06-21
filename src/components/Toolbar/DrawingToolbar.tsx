import React, { useEffect } from 'react';
import { useDrawing } from '@/hooks/useDrawing';
import { DrawingTool } from '@/types/drawing';
import { ToolButton } from './ToolButton';
import {
  SelectIcon,
  PenIcon,
  RectangleIcon,
  CircleIcon,
  ArrowIcon,
  TextIcon
} from '@/components/Icons/ToolIcons';

const tools = [
  { tool: DrawingTool.SELECT, icon: SelectIcon, label: 'Select', shortcut: 'V' },
  { tool: DrawingTool.PEN, icon: PenIcon, label: 'Pen', shortcut: 'P' },
  { tool: DrawingTool.RECTANGLE, icon: RectangleIcon, label: 'Rectangle', shortcut: 'R' },
  { tool: DrawingTool.CIRCLE, icon: CircleIcon, label: 'Circle', shortcut: 'C' },
  { tool: DrawingTool.ARROW, icon: ArrowIcon, label: 'Arrow', shortcut: 'A' },
  { tool: DrawingTool.TEXT, icon: TextIcon, label: 'Text', shortcut: 'T' }
];

interface DrawingToolbarProps {
  style?: React.CSSProperties;
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({ style }) => {
  const { activeTool, setActiveTool, currentStyle, updateStyle, handleKeyPress } = useDrawing();

  // Set up keyboard shortcuts
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  return (
    <div style={{ ...style }}>
      {/* Drawing Tools Section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ 
          fontSize: '0.875rem', 
          fontWeight: '600',
          color: '#333',
          marginBottom: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          Drawing Tools
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px'
        }}>
          {tools.map(({ tool, icon: Icon, label, shortcut }) => (
            <ToolButton
              key={tool}
              icon={<Icon size={20} />}
              label={label}
              shortcut={shortcut}
              isActive={activeTool === tool}
              onClick={() => setActiveTool(tool)}
            />
          ))}
        </div>
      </div>

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
          Style
        </h3>
        
        {/* Color Picker */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '0.75rem', 
            color: '#666',
            marginBottom: '0.25rem'
          }}>
            Stroke Color
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="color"
              value={currentStyle.stroke}
              onChange={(e) => updateStyle({ stroke: e.target.value })}
              style={{
                width: '50px',
                height: '32px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            />
            <input
              type="text"
              value={currentStyle.stroke}
              onChange={(e) => updateStyle({ stroke: e.target.value })}
              style={{
                flex: 1,
                padding: '0.25rem 0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontFamily: 'monospace'
              }}
            />
          </div>
        </div>

        {/* Stroke Width */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '0.75rem', 
            color: '#666',
            marginBottom: '0.25rem'
          }}>
            Stroke Width: {currentStyle.strokeWidth}px
          </label>
          <input
            type="range"
            min="1"
            max="20"
            value={currentStyle.strokeWidth}
            onChange={(e) => updateStyle({ strokeWidth: parseInt(e.target.value) })}
            style={{
              width: '100%',
              height: '4px',
              cursor: 'pointer'
            }}
          />
        </div>

        {/* Opacity */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '0.75rem', 
            color: '#666',
            marginBottom: '0.25rem'
          }}>
            Opacity: {Math.round(currentStyle.opacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={currentStyle.opacity * 100}
            onChange={(e) => updateStyle({ opacity: parseInt(e.target.value) / 100 })}
            style={{
              width: '100%',
              height: '4px',
              cursor: 'pointer'
            }}
          />
        </div>

        {/* Fill Color (for shapes) - Always rendered but visibility controlled */}
        <div style={{ 
          marginBottom: '1rem',
          visibility: (activeTool === DrawingTool.RECTANGLE || 
                      activeTool === DrawingTool.CIRCLE) ? 'visible' : 'hidden',
          height: '60px' // Fixed height to prevent layout shift
        }}>
          <label style={{ 
            display: 'block', 
            fontSize: '0.75rem', 
            color: '#666',
            marginBottom: '0.25rem'
          }}>
            Fill Color
          </label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={currentStyle.fill !== undefined}
              onChange={(e) => updateStyle({ 
                fill: e.target.checked ? currentStyle.stroke : undefined 
              })}
              style={{ marginRight: '4px' }}
            />
            {currentStyle.fill !== undefined && (
              <input
                type="color"
                value={currentStyle.fill || currentStyle.stroke}
                onChange={(e) => updateStyle({ fill: e.target.value })}
                style={{
                  width: '50px',
                  height: '32px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              />
            )}
            <span style={{ fontSize: '0.75rem', color: '#666' }}>
              {currentStyle.fill !== undefined ? 'Filled' : 'No fill'}
            </span>
          </div>
        </div>

        {/* Text Controls (for text tool) - Conditionally rendered */}
        {activeTool === DrawingTool.TEXT && (
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
              Text Settings
            </h3>
            
            {/* Font Size */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.75rem', 
                color: '#666',
                marginBottom: '0.25rem'
              }}>
                Font Size: {currentStyle.strokeWidth * 8}px
              </label>
              <input
                type="range"
                min="8"
                max="72"
                value={currentStyle.strokeWidth * 8}
                onChange={(e) => updateStyle({ strokeWidth: parseInt(e.target.value) / 8 })}
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
                value={currentStyle.fontFamily || 'Arial'}
                onChange={(e) => {
                  updateStyle({ fontFamily: e.target.value });
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
          </div>
        )}
      </div>
    </div>
  );
};