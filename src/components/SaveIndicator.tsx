import React, { useEffect, useState } from 'react';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface SaveIndicatorProps {
  status: SaveStatus;
}

export const SaveIndicator: React.FC<SaveIndicatorProps> = ({ status }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (status === 'saved') {
      // Show the indicator
      setIsVisible(true);
      setFadeOut(false);

      // Start fade out after 0.5 seconds
      const fadeTimer = setTimeout(() => {
        setFadeOut(true);
      }, 500);

      // Hide completely after fade out
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, 1000);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    } else if (status === 'saving' || status === 'error') {
      setIsVisible(true);
      setFadeOut(false);
    }
  }, [status]);

  if (!isVisible && status !== 'saving' && status !== 'error') {
    return null;
  }

  const getMessage = (): string => {
    switch (status) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved';
      case 'error':
        return 'Save failed';
      default:
        return '';
    }
  };

  const getColor = (): string => {
    switch (status) {
      case 'saving':
        return '#999';
      case 'saved':
        return '#888';
      case 'error':
        return '#d32f2f';
      default:
        return '#999';
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        right: '-60px',
        transform: 'translateY(-50%)',
        padding: '0.125rem 0.375rem',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '3px',
        fontSize: '0.625rem',
        color: getColor(),
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        opacity: fadeOut ? 0 : 0.7,
        transition: 'opacity 0.3s ease-out',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {status === 'saving' && (
        <div
          style={{
            width: '10px',
            height: '10px',
            border: '1.5px solid #f0f0f0',
            borderTop: '1.5px solid #999',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      )}
      {status === 'saved' && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      )}
      {status === 'error' && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      )}
      <span style={{ opacity: 0.8 }}>{getMessage()}</span>
    </div>
  );
};