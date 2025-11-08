import { useEffect } from 'react';
import { googleDriveService } from '@/services/googleDrive';
import type { Shape } from '@/types/drawing';

interface CanvasSize {
  width: number;
  height: number;
}

interface SharedProjectLoaderParams {
  isEnabled: boolean;
  getAccessToken?: () => string | null;
  canvasPadding: number;
  setIsLoadingSharedFile: (value: boolean) => void;
  setSharedFileError: (message: string | null) => void;
  setDocumentName: (name: string) => void;
  setShapes: (shapes: Shape[]) => void;
  setCanvasSize: (size: CanvasSize | null) => void;
  setIsCanvasInitialized: (value: boolean) => void;
  setLoadedFileId: (id: string | null) => void;
}

export function useSharedProjectLoader({
  isEnabled,
  getAccessToken,
  canvasPadding,
  setIsLoadingSharedFile,
  setSharedFileError,
  setDocumentName,
  setShapes,
  setCanvasSize,
  setIsCanvasInitialized,
  setLoadedFileId,
}: SharedProjectLoaderParams): void {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get('file');

    if (!isEnabled || !fileId || !getAccessToken) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      return;
    }

    let cancelled = false;

    setIsLoadingSharedFile(true);
    setSharedFileError(null);

    googleDriveService
      .initialize(token)
      .then(() => googleDriveService.loadProject(fileId))
      .then(({ projectData, fileName }) => {
        if (cancelled) {
          return;
        }

        if (projectData.image && projectData.image.data) {
          console.warn('This project uses the old format with background images. Please re-save it in the new format.');
          setSharedFileError('This project uses an old format. Please open it in an older version and re-save.');
          return;
        }

        let displayName = fileName;
        if (fileName.startsWith('Markup - ')) {
          displayName = fileName.substring(9);
        }
        setDocumentName(displayName);

        setShapes(projectData.shapes || []);

        if (projectData.shapes && projectData.shapes.length > 0) {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;

          projectData.shapes.forEach(shape => {
            if ('x' in shape && 'y' in shape && 'width' in shape && 'height' in shape) {
              const shapeWithDims = shape as { x: number; y: number; width: number; height: number };
              minX = Math.min(minX, shapeWithDims.x);
              minY = Math.min(minY, shapeWithDims.y);
              maxX = Math.max(maxX, shapeWithDims.x + shapeWithDims.width);
              maxY = Math.max(maxY, shapeWithDims.y + shapeWithDims.height);
            }
          });

          if (isFinite(minX)) {
            setCanvasSize({
              width: maxX + canvasPadding,
              height: maxY + canvasPadding,
            });
            setIsCanvasInitialized(true);
          }
        }

        setLoadedFileId(fileId);

        setTimeout(() => {
          if (cancelled) {
            return;
          }
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        }, 1000);
      })
      .catch(error => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load shared file:', error);
        setSharedFileError(error.message || 'Failed to load shared file');
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSharedFile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isEnabled,
    getAccessToken,
    canvasPadding,
    setIsLoadingSharedFile,
    setSharedFileError,
    setDocumentName,
    setShapes,
    setCanvasSize,
    setIsCanvasInitialized,
    setLoadedFileId,
  ]);
}
