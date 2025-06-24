import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { googleDriveService, type ProjectData } from '@/services/googleDrive';
import { useDrawingContext } from '@/contexts/DrawingContext';
import { useImage } from '@/hooks/useImage';
import { FilePicker } from './FilePicker';
import Konva from 'konva';

interface FileMenuProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  imageData: any | null;
  onProjectLoad?: (data: ProjectData) => void;
}

export const FileMenu: React.FC<FileMenuProps> = ({ stageRef, imageData, onProjectLoad }) => {
  // Try to use auth context, but handle case where it's not available
  let authContext;
  try {
    authContext = useAuth();
  } catch (error) {
    return null;
  }
  
  const { isAuthenticated, user, getAccessToken } = authContext;
  const { state: drawingState, setShapes } = useDrawingContext();
  const { loadImageFromData } = useImage();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);

  // Initialize Google Drive API when authenticated
  React.useEffect(() => {
    if (isAuthenticated && !isInitialized) {
      const token = getAccessToken();
      if (token) {
        googleDriveService.initialize(token)
          .then(() => {
            setIsInitialized(true);
          })
          .catch((error) => {
            console.error('Failed to initialize Google Drive API:', error);
          });
      }
    }
  }, [isAuthenticated, getAccessToken, isInitialized]);

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
      
      // Show success notification
      alert('Project saved successfully!');
    } catch (error: any) {
      console.error('Failed to save project:', error);
      if (error.body) {
        console.error('Error details:', error.body);
      }
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
    setShowFilePicker(true);
  };

  const handleFileSelect = async (fileId: string) => {
    try {
      const token = getAccessToken();
      if (!token) throw new Error('No access token');

      const projectData = await googleDriveService.loadProject(fileId);
      
      // Load the image
      if (projectData.image && projectData.image.data) {
        await loadImageFromData(projectData.image.data, projectData.image.name);
      }
      
      // Load the shapes
      if (projectData.shapes) {
        setShapes(projectData.shapes);
      }
      
      // Update current file ID
      setCurrentFileId(fileId);
      
      // Call the optional callback
      if (onProjectLoad) {
        onProjectLoad(projectData);
      }
      
      alert('Project loaded successfully!');
    } catch (error) {
      console.error('Failed to load project:', error);
      alert('Failed to load project. Please try again.');
    }
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
    <>
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
            disabled={!imageData || isSaving || !isInitialized}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: imageData && !isSaving && isInitialized ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem',
              color: imageData && !isSaving && isInitialized ? '#333' : '#999',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            title={!isInitialized ? 'Initializing Google Drive...' : !imageData ? 'No image loaded' : ''}
            onMouseEnter={(e) => {
              if (imageData && !isSaving && isInitialized) {
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
              if (imageData && !isSaving && isInitialized) {
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
    
    <FilePicker
      isOpen={showFilePicker}
      onClose={() => setShowFilePicker(false)}
      onSelect={handleFileSelect}
    />
    </>
  );
};