import { useEffect } from 'react';

interface KeyboardShortcutOptions {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  selectedShapeIds: string[];
  copySelectedShapes: () => void;
  pasteShapes: () => void;
  deleteSelected: () => void;
  handleCopyCanvas: () => void;
  handleDownloadImage: () => void;
  setZoomLevel: (updater: (level: number) => number) => void;
  zoomLevel: number;
}

export function useKeyboardShortcuts({
  canUndo,
  canRedo,
  undo,
  redo,
  selectedShapeIds,
  copySelectedShapes,
  pasteShapes,
  deleteSelected,
  handleCopyCanvas,
  handleDownloadImage,
  setZoomLevel,
  zoomLevel,
}: KeyboardShortcutOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isInputTarget = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      const isMeta = event.ctrlKey || event.metaKey;

      if (isMeta && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (canUndo) {
          undo();
        }
        return;
      }

      if (isMeta && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        if (canRedo) {
          redo();
        }
        return;
      }

      if (isMeta && event.key === 'c' && !event.shiftKey) {
        if (!isInputTarget) {
          event.preventDefault();
          if (selectedShapeIds.length > 0) {
            copySelectedShapes();
          } else {
            handleCopyCanvas();
          }
        }
        return;
      }

      if (isMeta && event.key === 'v' && !event.shiftKey) {
        if (!isInputTarget) {
          event.preventDefault();
          pasteShapes();
        }
        return;
      }

      if (isMeta && event.key === 'x' && !event.shiftKey) {
        if (!isInputTarget) {
          event.preventDefault();
          if (selectedShapeIds.length > 0) {
            copySelectedShapes();
            deleteSelected();
          }
        }
        return;
      }

      if (isMeta && event.key === 's') {
        event.preventDefault();
        handleDownloadImage();
        return;
      }

      if (isMeta && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        setZoomLevel(prev => Math.min(4, prev + 0.25));
        return;
      }

      if (isMeta && event.key === '-') {
        event.preventDefault();
        setZoomLevel(prev => Math.max(0.1, prev - 0.25));
        return;
      }

      if (isMeta && event.key === '0') {
        event.preventDefault();
        setZoomLevel(() => 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    canUndo,
    canRedo,
    undo,
    redo,
    selectedShapeIds,
    copySelectedShapes,
    pasteShapes,
    deleteSelected,
    handleCopyCanvas,
    handleDownloadImage,
    setZoomLevel,
    zoomLevel,
  ]);
}
