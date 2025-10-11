import React, { useState, useEffect, useCallback } from 'react';
import { googleDriveService, type ProjectFile } from '@/services/googleDrive';
import { useAuth } from '@/contexts/AuthContext';

interface FilePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (fileId: string) => void;
}

export const FilePicker: React.FC<FilePickerProps> = ({ isOpen, onClose, onSelect }) => {
  const { getAccessToken } = useAuth();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const token = getAccessToken();
      if (!token) throw new Error('No access token');
      
      await googleDriveService.initialize(token);
      const fileList = await googleDriveService.listProjects();
      setFiles(fileList);
    } catch (err) {
      console.error('Failed to load files:', err);
      setError('Failed to load files. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
  }, [isOpen, loadFiles]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          width: '600px',
          maxWidth: '90%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Open from Google Drive</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#666',
              padding: '0.25rem',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem'
          }}
        >
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              Loading files...
            </div>
          )}

          {error && (
            <div
              style={{
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '4px',
                padding: '0.75rem',
                color: '#721c24',
                marginBottom: '1rem'
              }}
            >
              {error}
            </div>
          )}

          {!isLoading && !error && files.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No saved markups found. Save a markup first to see it here.
            </div>
          )}

          {!isLoading && !error && files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => {
                    onSelect(file.id);
                    onClose();
                  }}
                  style={{
                    padding: '0.75rem',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backgroundColor: 'white'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                    e.currentTarget.style.borderColor = '#4285f4';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#e0e0e0';
                  }}
                >
                  <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    Modified: {new Date(file.modifiedTime).toLocaleDateString()} at{' '}
                    {new Date(file.modifiedTime).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '1rem',
            borderTop: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'white',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};