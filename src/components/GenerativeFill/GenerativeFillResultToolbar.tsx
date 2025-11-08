import React from 'react';
import { Check, X, RotateCw } from 'lucide-react';

interface GenerativeFillResultToolbarProps {
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
}

export const GenerativeFillResultToolbar: React.FC<GenerativeFillResultToolbarProps> = ({
  onAccept,
  onReject,
  onRegenerate,
}) => {
  const buttonStyle = (bgColor: string, hoverColor: string): React.CSSProperties => ({
    padding: '12px 24px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: bgColor,
    color: 'white',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
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
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 900,
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          fontSize: '14px',
          fontWeight: '600',
          color: '#333',
          marginRight: '8px',
        }}
      >
        Generation Complete
      </div>

      <button
        onClick={onReject}
        style={buttonStyle('#dc3545', '#c82333')}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#c82333';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#dc3545';
        }}
      >
        <X size={18} />
        Reject
      </button>

      <button
        onClick={onRegenerate}
        style={buttonStyle('#6c757d', '#5a6268')}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#5a6268';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#6c757d';
        }}
      >
        <RotateCw size={18} />
        Regenerate
      </button>

      <button
        onClick={onAccept}
        style={buttonStyle('#28a745', '#218838')}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#218838';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#28a745';
        }}
      >
        <Check size={18} />
        Accept
      </button>
    </div>
  );
};
