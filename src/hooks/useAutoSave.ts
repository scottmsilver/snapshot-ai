import { useEffect, useRef, useState, useCallback } from 'react';
import { googleDriveService, type ProjectData } from '@/services/googleDrive';
import { useAuth } from '@/contexts/AuthContext';
import { useDrawingContext } from '@/contexts/DrawingContext';
import type { ImageData } from '@/types/canvas';

interface UseAutoSaveOptions {
  fileId: string | null;
  imageData: ImageData | null; // No longer used but kept for compatibility
  hasWritePermission: boolean | null;
  debounceMs?: number;
  onFileIdChange?: (fileId: string) => void;
  canvasSize?: { width: number; height: number } | null;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface UseAutoSaveReturn {
  saveStatus: SaveStatus;
  lastSaved: Date | null;
  save: () => Promise<void>;
  markAsUnsaved: () => void;
}

export const useAutoSave = ({
  fileId,
  imageData,
  hasWritePermission,
  debounceMs = 2000, // 2 seconds default
  onFileIdChange
}: UseAutoSaveOptions): UseAutoSaveReturn => {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');
  
  // Get auth context - try/catch in case it's not available
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    authContext = useAuth();
  } catch (error) {
    // Auth context not available
  }
  
  const { state: drawingState } = useDrawingContext();

  // Manual save function
  const save = useCallback(async () => {
    if (!authContext?.isAuthenticated || !authContext?.getAccessToken) {
      return;
    }

    // Check if we have write permission or no fileId (new file)
    if (fileId && hasWritePermission === false) {
      // Can't auto-save to read-only files
      return;
    }

    setSaveStatus('saving');

    try {
      const token = authContext.getAccessToken();
      if (!token) throw new Error('No access token');

      await googleDriveService.initialize(token);

      // Create project data (new format without background image)
      const projectData: ProjectData = {
        version: '2.0', // Version 2.0 indicates no background image
        shapes: drawingState.shapes,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: authContext.user?.email || 'unknown',
          version: '2.0',
        },
      };

      // Save project - create new if no fileId
      const result = await googleDriveService.saveProject(projectData, fileId || undefined);
      
      setSaveStatus('saved');
      setLastSaved(new Date());
      lastSavedDataRef.current = JSON.stringify({ shapes: drawingState.shapes });
      
      // If this was a new file, notify parent of the new fileId
      if (!fileId && result.fileId && onFileIdChange) {
        onFileIdChange(result.fileId);
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
      setSaveStatus('error');
    }
  }, [authContext, drawingState.shapes, fileId, hasWritePermission, onFileIdChange]);

  // Mark as unsaved
  const markAsUnsaved = useCallback(() => {
    setSaveStatus('unsaved');
  }, []);

  // Auto-save on changes
  useEffect(() => {
    // Skip if not authenticated
    if (!authContext?.isAuthenticated) {
      return;
    }
    
    // Only auto-save if we have a fileId and permission
    if (!fileId || hasWritePermission === false || !imageData) {
      return;
    }

    const currentData = JSON.stringify({ shapes: drawingState.shapes, imageData });
    
    // Check if data has actually changed
    if (currentData === lastSavedDataRef.current) {
      return;
    }

    // Mark as unsaved immediately
    setSaveStatus('unsaved');

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(() => {
      save();
    }, debounceMs);

    // Cleanup
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [drawingState.shapes, fileId, hasWritePermission, save, debounceMs, authContext?.isAuthenticated]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved' || saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  return {
    saveStatus,
    lastSaved,
    save,
    markAsUnsaved
  };
};