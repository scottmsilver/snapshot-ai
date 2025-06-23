import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { googleDriveService, ProjectData } from '@/services/googleDrive';
import { useDrawingContext } from '@/contexts/DrawingContext';
import { useImage } from '@/hooks/useImage';
import Konva from 'konva';

interface FileMenuProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  onProjectLoad?: (data: ProjectData) => void;
}

export const FileMenu: React.FC<FileMenuProps> = ({ stageRef, onProjectLoad }) => {
  const { isAuthenticated, user, getAccessToken } = useAuth();
  const { state: drawingState } = useDrawingContext();
  const { imageData } = useImage();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);

  const handleSave = async () => {
    if (!isAuthenticated || !stageRef.current || !imageData) return;

    setIsSaving(true);
    try {
      const token = getAccessToken();
      if (!token) throw new Error('No access token');

      await googleDriveService.initialize(token);

      // Create project data
      const projectData: ProjectData = {
        version: '1.0',
        image: {
          data: imageData.src,
          name: imageData.name,
          width: imageData.width,
          height: imageData.height,
        },
        shapes: drawingState.shapes,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: user?.email || 'unknown',
          version: '1.0',
        },
      };

      const result = await googleDriveService.saveProject(projectData, currentFileId || undefined);
      setCurrentFileId(result.fileId);
      
      // Show success notification (you could use a toast library here)
      console.log('Project saved successfully!');
    } catch (error) {
      console.error('Failed to save project:', error);
      alert('Failed to save project. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAs = async () => {
    // Reset current file ID to force creating a new file
    const oldFileId = currentFileId;
    setCurrentFileId(null);
    await handleSave();
    // If save failed, restore the old file ID
    if (!currentFileId && oldFileId) {
      setCurrentFileId(oldFileId);
    }
  };

  const handleOpen = () => {
    // For now, we'll just log this
    // In a real implementation, you'd open a file picker dialog
    console.log('Open from Drive - not implemented yet');
  };

  const handleShare = async () => {
    if (!currentFileId) {
      alert('Please save the project first before sharing.');
      return;
    }

    try {
      const token = getAccessToken();
      if (!token) throw new Error('No access token');

      await googleDriveService.initialize(token);
      const shareLink = await googleDriveService.createShareableLink(currentFileId);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(shareLink);
      alert('Share link copied to clipboard!');
    } catch (error) {
      console.error('Failed to create share link:', error);
      alert('Failed to create share link. Please try again.');
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          padding: '0.25rem 0.75rem',
          backgroundColor: 'transparent',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.75rem',
          color: '#666',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f5f5f5';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        📁 File
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
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
              handleSave();
              setShowDropdown(false);
            }}
            disabled={!imageData || isSaving}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: imageData && !isSaving ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem',
              color: imageData && !isSaving ? '#333' : '#999',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => {
              if (imageData && !isSaving) {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>{isSaving ? 'Saving...' : 'Save to Drive'}</span>
            <span style={{ fontSize: '0.625rem', color: '#999' }}>Ctrl+S</span>
          </button>

          <button
            onClick={() => {
              handleSaveAs();
              setShowDropdown(false);
            }}
            disabled={!imageData || isSaving}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: imageData && !isSaving ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem',
              color: imageData && !isSaving ? '#333' : '#999'
            }}
            onMouseEnter={(e) => {
              if (imageData && !isSaving) {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Save As...
          </button>

          <div style={{ height: '1px', backgroundColor: '#eee', margin: '0.25rem 0' }} />

          <button
            onClick={() => {
              handleOpen();
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
            <span>Open from Drive</span>
            <span style={{ fontSize: '0.625rem', color: '#999' }}>Ctrl+O</span>
          </button>

          <div style={{ height: '1px', backgroundColor: '#eee', margin: '0.25rem 0' }} />

          <button
            onClick={() => {
              handleShare();
              setShowDropdown(false);
            }}
            disabled={!currentFileId}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: currentFileId ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem',
              color: currentFileId ? '#333' : '#999'
            }}
            onMouseEnter={(e) => {
              if (currentFileId) {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Share...
          </button>
        </div>
      )}
    </div>
  );
};