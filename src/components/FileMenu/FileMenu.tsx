import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { googleDriveService, type ProjectData } from '@/services/googleDrive';
import { useDrawingContext } from '@/contexts/DrawingContext';
import { useImage } from '@/hooks/useImage';
import { useAutoSave } from '@/hooks/useAutoSave';
import { FilePicker } from './FilePicker';
import { ShareDialog } from './ShareDialog';
import Konva from 'konva';

interface FileMenuProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  imageData: any | null;
  onProjectLoad?: (data: ProjectData) => void;
  initialFileId?: string | null;
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved' | 'error', lastSaved: Date | null) => void;
  onNew?: () => void;
  onExport?: () => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  canvasBackground?: string;
  onChangeBackground?: (color: string) => void;
}

export const FileMenu: React.FC<FileMenuProps> = ({ stageRef, imageData, onProjectLoad, initialFileId, onSaveStatusChange, onNew, onExport, showGrid, onToggleGrid, canvasBackground, onChangeBackground }) => {
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
  const [currentFileId, setCurrentFileId] = useState<string | null>(initialFileId || null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [hasWritePermission, setHasWritePermission] = useState<boolean | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

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

  // Update currentFileId when initialFileId changes
  React.useEffect(() => {
    if (initialFileId) {
      setCurrentFileId(initialFileId);
    }
  }, [initialFileId]);

  // Check write permissions when we have a file ID
  React.useEffect(() => {
    if (currentFileId && isInitialized && isAuthenticated) {
      const checkPermissions = async () => {
        try {
          const token = getAccessToken();
          if (!token) return;
          
          // Get file metadata to check permissions
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${currentFileId}?fields=capabilities`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            setHasWritePermission(data.capabilities?.canEdit || false);
          } else {
            setHasWritePermission(false);
          }
        } catch (error) {
          console.error('Failed to check permissions:', error);
          setHasWritePermission(false);
        }
      };
      
      checkPermissions();
    }
  }, [currentFileId, isInitialized, isAuthenticated, getAccessToken]);

  // Auto-save hook
  const { saveStatus, lastSaved, save: autoSave } = useAutoSave({
    fileId: currentFileId,
    imageData,
    hasWritePermission,
    debounceMs: 2000, // 2 seconds
    onFileIdChange: (newFileId) => {
      setCurrentFileId(newFileId);
    }
  });

  // Report save status changes to parent
  React.useEffect(() => {
    if (onSaveStatusChange) {
      onSaveStatusChange(saveStatus, lastSaved);
    }
  }, [saveStatus, lastSaved, onSaveStatusChange]);

  // Auto-save when image is loaded and no fileId exists
  React.useEffect(() => {
    // Skip if not authenticated
    if (!isAuthenticated) {
      return;
    }
    
    const performInitialSave = async () => {
      if (!currentFileId && isAuthenticated && isInitialized && drawingState.shapes.length > 0) {
        // Use the autoSave function which will handle onFileIdChange
        await autoSave();
      }
    };
    
    performInitialSave();
  }, [currentFileId, isAuthenticated, isInitialized, autoSave, drawingState.shapes]);

  const handleSave = async () => {
    if (!isAuthenticated || !stageRef.current) return;

    // If we have a file ID but no write permission, do Save As instead
    if (currentFileId && hasWritePermission === false) {
      handleSaveAs();
      return;
    }

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
      if (currentFileId && hasWritePermission) {
        alert('Project updated successfully!');
      } else {
        alert('Project saved successfully!');
      }
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


  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
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
        File
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
          {onNew && (
            <>
              <button
                onClick={() => {
                  onNew();
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
                  color: '#333'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                New
              </button>
              
              <div style={{ height: '1px', backgroundColor: '#eee', margin: '0.25rem 0' }} />
            </>
          )}
          
          <button
            onClick={() => {
              handleSave();
              setShowDropdown(false);
            }}
            disabled={isSaving || !isInitialized}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: !isSaving && isInitialized ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem',
              color: !isSaving && isInitialized ? '#333' : '#999',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            title={
              !isInitialized ? 'Initializing Google Drive...' : 
              drawingState.shapes.length === 0 ? 'No content to save' : 
              currentFileId && hasWritePermission === false ? 'You have view-only access. A copy will be saved.' :
              currentFileId && hasWritePermission ? 'Save changes to the current file' :
              'Save as a new file to Google Drive'
            }
            onMouseEnter={(e) => {
              if (!isSaving && isInitialized) {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>
              {isSaving ? 'Saving...' : 
               currentFileId && hasWritePermission === false ? 'Save as Copy' :
               currentFileId ? 'Save' : 'Save to Drive'}
            </span>
            <span style={{ fontSize: '0.625rem', color: '#999' }}>Ctrl+S</span>
          </button>

          <button
            onClick={() => {
              handleSaveAs();
              setShowDropdown(false);
            }}
            disabled={isSaving}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: !isSaving ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem',
              color: !isSaving ? '#333' : '#999'
            }}
            onMouseEnter={(e) => {
              if (!isSaving && isInitialized) {
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


          {onExport && (
            <>
              <button
                onClick={() => {
                  onExport();
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
                <span>Export Image</span>
                <span style={{ fontSize: '0.625rem', color: '#999' }}>Ctrl+E</span>
              </button>
            </>
          )}

          <div style={{ height: '1px', backgroundColor: '#eee', margin: '0.25rem 0' }} />

          <button
            onClick={() => {
              setShowShareDialog(true);
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
          
          {(onToggleGrid || onChangeBackground) && (
            <>
              <div style={{ height: '1px', backgroundColor: '#eee', margin: '0.25rem 0' }} />
              
              <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.625rem', color: '#999', textTransform: 'uppercase' }}>
                Settings
              </div>
              
              {onToggleGrid && (
                <button
                  onClick={() => {
                    onToggleGrid();
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
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span>Show Grid</span>
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleGrid();
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                </button>
              )}
              
              {onChangeBackground && (
                <div
                  style={{
                    padding: '0.5rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: '#333',
                  }}
                >
                  <span>Background</span>
                  <input
                    type="color"
                    value={canvasBackground || '#ffffff'}
                    onChange={(e) => onChangeBackground(e.target.value)}
                    title="Canvas Background Color"
                    style={{
                      width: '24px',
                      height: '24px',
                      padding: '2px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: canvasBackground || '#ffffff',
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
    
    <FilePicker
      isOpen={showFilePicker}
      onClose={() => setShowFilePicker(false)}
      onSelect={handleFileSelect}
    />
    
    <ShareDialog
      isOpen={showShareDialog}
      fileId={currentFileId}
      onClose={() => setShowShareDialog(false)}
    />
    </>
  );
};