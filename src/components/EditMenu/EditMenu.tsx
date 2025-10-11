import React, { useState, useRef, useEffect } from 'react';

interface EditMenuProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canCopy?: boolean;
  onCopy?: () => void;
  hasSelection?: boolean;
  onDelete?: () => void;
  onSelectAll?: () => void;
}

export const EditMenu: React.FC<EditMenuProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canCopy,
  onCopy,
  hasSelection,
  onDelete,
  onSelectAll,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          padding: '0.25rem 0.5rem',
          backgroundColor: 'transparent',
          border: '1px solid transparent',
          cursor: 'pointer',
          fontSize: '0.8125rem',
          color: '#202124',
          fontWeight: '400',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f1f3f4';
          e.currentTarget.style.borderRadius = '4px';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        Edit
      </button>

      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '0.25rem',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            minWidth: '200px',
            zIndex: 1000
          }}
        >
          <button
            onClick={() => {
              onUndo();
              setShowDropdown(false);
            }}
            disabled={!canUndo}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem',
              color: canUndo ? '#333' : '#999',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => {
              if (canUndo) {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>Undo</span>
            <span style={{ fontSize: '0.625rem', color: '#999' }}>Ctrl+Z</span>
          </button>

          <button
            onClick={() => {
              onRedo();
              setShowDropdown(false);
            }}
            disabled={!canRedo}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem',
              color: canRedo ? '#333' : '#999',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => {
              if (canRedo) {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>Redo</span>
            <span style={{ fontSize: '0.625rem', color: '#999' }}>Ctrl+Y</span>
          </button>

          <div style={{ height: '1px', backgroundColor: '#eee', margin: '0.25rem 0' }} />

          {onCopy && (
            <button
              onClick={() => {
                onCopy();
                setShowDropdown(false);
              }}
              disabled={!canCopy}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: canCopy ? 'pointer' : 'not-allowed',
                fontSize: '0.75rem',
                color: canCopy ? '#333' : '#999',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => {
                if (canCopy) {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span>Copy</span>
              <span style={{ fontSize: '0.625rem', color: '#999' }}>Ctrl+C</span>
            </button>
          )}

          {onDelete && (
            <>
              <div style={{ height: '1px', backgroundColor: '#eee', margin: '0.25rem 0' }} />
              
              <button
                onClick={() => {
                  onDelete();
                  setShowDropdown(false);
                }}
                disabled={!hasSelection}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: hasSelection ? 'pointer' : 'not-allowed',
                  fontSize: '0.75rem',
                  color: hasSelection ? '#333' : '#999',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => {
                  if (hasSelection) {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>Delete</span>
                <span style={{ fontSize: '0.625rem', color: '#999' }}>Delete</span>
              </button>
            </>
          )}

          {onSelectAll && (
            <>
              <div style={{ height: '1px', backgroundColor: '#eee', margin: '0.25rem 0' }} />
              
              <button
                onClick={() => {
                  onSelectAll();
                  setShowDropdown(false);
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
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>Select all</span>
                <span style={{ fontSize: '0.625rem', color: '#999' }}>Ctrl+A</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};