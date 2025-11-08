import React from 'react';
import { GenerativeFillSelectionTool } from '@/types/drawing';
import { Paintbrush, Square, Lasso } from 'lucide-react';

interface GenerativeFillToolbarProps {
  selectedTool: GenerativeFillSelectionTool;
  brushWidth: number;
  hasSelection: boolean;
  onSelectTool: (tool: GenerativeFillSelectionTool) => void;
  onBrushWidthChange: (width: number) => void;
  onComplete: () => void;
  onCancel: () => void;
  onSkipToConversational?: () => void;
}

export const GenerativeFillToolbar: React.FC<GenerativeFillToolbarProps> = ({
  selectedTool,
  brushWidth,
  hasSelection,
  onSelectTool,
  onBrushWidthChange,
  onComplete,
  onCancel,
  onSkipToConversational,
}) => {
  const toolButtonStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '8px 12px',
    border: isActive ? '2px solid #4a90e2' : '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: isActive ? '#e8f4ff' : 'white',
    color: isActive ? '#4a90e2' : '#666',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s',
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '12px 16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          fontSize: '13px',
          fontWeight: '600',
          color: '#333',
          marginRight: '8px',
        }}
      >
        AI Fill:
      </div>

      <div
        style={{
          display: 'flex',
          gap: '6px',
        }}
      >
        <button
          onClick={() => onSelectTool(GenerativeFillSelectionTool.BRUSH)}
          style={toolButtonStyle(selectedTool === GenerativeFillSelectionTool.BRUSH)}
          onMouseEnter={(e) => {
            if (selectedTool !== GenerativeFillSelectionTool.BRUSH) {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedTool !== GenerativeFillSelectionTool.BRUSH) {
              e.currentTarget.style.backgroundColor = 'white';
            }
          }}
        >
          <Paintbrush size={18} />
          Brush
        </button>

        <button
          onClick={() => onSelectTool(GenerativeFillSelectionTool.RECTANGLE)}
          style={toolButtonStyle(selectedTool === GenerativeFillSelectionTool.RECTANGLE)}
          onMouseEnter={(e) => {
            if (selectedTool !== GenerativeFillSelectionTool.RECTANGLE) {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedTool !== GenerativeFillSelectionTool.RECTANGLE) {
              e.currentTarget.style.backgroundColor = 'white';
            }
          }}
        >
          <Square size={18} />
          Rectangle
        </button>

        <button
          onClick={() => onSelectTool(GenerativeFillSelectionTool.LASSO)}
          style={toolButtonStyle(selectedTool === GenerativeFillSelectionTool.LASSO)}
          onMouseEnter={(e) => {
            if (selectedTool !== GenerativeFillSelectionTool.LASSO) {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedTool !== GenerativeFillSelectionTool.LASSO) {
              e.currentTarget.style.backgroundColor = 'white';
            }
          }}
        >
          <Lasso size={18} />
          Lasso
        </button>
      </div>

      {selectedTool === GenerativeFillSelectionTool.BRUSH && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingLeft: '12px',
            borderLeft: '1px solid #e5e5e5',
          }}
        >
          <label
            style={{
              fontSize: '12px',
              fontWeight: '500',
              color: '#555',
              whiteSpace: 'nowrap',
            }}
          >
            Size: {brushWidth}px
          </label>
          <input
            type="range"
            min="5"
            max="100"
            value={brushWidth}
            onChange={(e) => onBrushWidthChange(parseInt(e.target.value))}
            style={{
              width: '120px',
              height: '4px',
              cursor: 'pointer',
            }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginLeft: 'auto',
          paddingLeft: '12px',
          borderLeft: '1px solid #e5e5e5',
        }}
      >
        {onSkipToConversational && (
          <button
            onClick={onSkipToConversational}
            style={{
              padding: '6px 14px',
              border: '1px solid #9b59b6',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#9b59b6',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f3e5f7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            💬 Conversational
          </button>
        )}
        <button
          onClick={onCancel}
          style={{
            padding: '6px 14px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            backgroundColor: 'white',
            color: '#666',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f5f5f5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
          }}
        >
          Cancel
        </button>
        {hasSelection && (
          <button
            onClick={onComplete}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#4a90e2',
              color: 'white',
              fontSize: '13px',
              fontWeight: '500',
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
            Continue
          </button>
        )}
      </div>
    </div>
  );
};
