import { useState, useCallback, useMemo } from 'react';
import type Konva from 'konva';
import type { Shape } from '@/types/drawing';

const CANVAS_PADDING = 100;

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface CanvasSize {
  width: number;
  height: number;
}

interface UseProjectControllerParams {
  clearSelection: () => void;
  setShapes: (shapes: Shape[]) => void;
  clearPdfFile: () => void;
  setDocumentName: (name: string) => void;
  setCanvasSize: (size: CanvasSize | null) => void;
  setIsCanvasInitialized: (value: boolean) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  documentName: string;
  handleDownloadImage: () => void;
  handleDownloadPdf: () => void;
  showGrid: boolean;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  canvasBackground: string;
  setCanvasBackground: (value: string) => void;
}

interface UseProjectControllerReturn {
  loadedFileId: string | null;
  setLoadedFileId: (id: string | null) => void;
  saveStatus: SaveStatus;
  setSaveStatus: (status: SaveStatus) => void;
  handleProjectLoad: (projectData: { shapes?: Shape[] }, fileName: string) => void;
  handleNewProject: () => void;
  fileMenuProps: {
    stageRef: React.RefObject<Konva.Stage | null>;
    imageData: null;
    initialFileId: string | null;
    documentName: string;
    onSaveStatusChange: (status: SaveStatus) => void;
    onProjectLoad: (projectData: { shapes?: Shape[] }, fileName: string) => void;
    onNew: () => void;
    onExport: () => void;
    onExportPdf: () => void;
    showGrid: boolean;
    onToggleGrid: () => void;
    canvasBackground: string;
    onChangeBackground: (value: string) => void;
  };
}

export function useProjectController({
  clearSelection,
  setShapes,
  clearPdfFile,
  setDocumentName,
  setCanvasSize,
  setIsCanvasInitialized,
  stageRef,
  documentName,
  handleDownloadImage,
  handleDownloadPdf,
  showGrid,
  setShowGrid,
  canvasBackground,
  setCanvasBackground,
}: UseProjectControllerParams): UseProjectControllerReturn {
  const [loadedFileId, setLoadedFileId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  const handleProjectLoad = useCallback(
    (projectData: { shapes?: Shape[] }, fileName: string) => {
      clearSelection();
      setShapes(projectData.shapes || []);
      setLoadedFileId(null);
      setSaveStatus('saved');
      setCanvasSize(null);
      setIsCanvasInitialized(false);
      clearPdfFile();
      let displayName = fileName;
      if (fileName.startsWith('Markup - ')) {
        displayName = fileName.substring(9);
      }
      setDocumentName(displayName);

      if (projectData.shapes && projectData.shapes.length > 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        projectData.shapes.forEach(shape => {
          if ('x' in shape && 'y' in shape && 'width' in shape && 'height' in shape) {
            const positionedShape = shape as Shape & { x: number; y: number; width: number; height: number };
            minX = Math.min(minX, positionedShape.x);
            minY = Math.min(minY, positionedShape.y);
            maxX = Math.max(maxX, positionedShape.x + positionedShape.width);
            maxY = Math.max(maxY, positionedShape.y + positionedShape.height);
          }
        });

        if (isFinite(minX)) {
          setCanvasSize({
            width: Math.min(maxX + CANVAS_PADDING, 1400),
            height: Math.min(maxY + CANVAS_PADDING, 900),
          });
          setIsCanvasInitialized(true);
        }
      }
    },
    [clearSelection, clearPdfFile, setShapes, setDocumentName, setCanvasSize, setIsCanvasInitialized],
  );

  const handleNewProject = useCallback(() => {
    clearSelection();
    setShapes([]);
    setLoadedFileId(null);
    setSaveStatus('saved');
    setCanvasSize(null);
    setIsCanvasInitialized(false);
    clearPdfFile();
    setDocumentName('Untitled');
  }, [clearSelection, clearPdfFile, setShapes, setDocumentName, setCanvasSize, setIsCanvasInitialized]);

  const fileMenuProps = useMemo(
    () => ({
      stageRef,
      imageData: null,
      initialFileId: loadedFileId,
      documentName,
      onSaveStatusChange: setSaveStatus,
      onProjectLoad: handleProjectLoad,
      onNew: handleNewProject,
      onExport: handleDownloadImage,
      onExportPdf: handleDownloadPdf,
      showGrid,
      onToggleGrid: () => setShowGrid(prev => !prev),
      canvasBackground,
      onChangeBackground: setCanvasBackground,
    }),
    [
      stageRef,
      loadedFileId,
      documentName,
      handleProjectLoad,
      handleNewProject,
      handleDownloadImage,
      handleDownloadPdf,
      showGrid,
      setShowGrid,
      canvasBackground,
      setCanvasBackground,
    ],
  );

  return {
    loadedFileId,
    setLoadedFileId,
    saveStatus,
    setSaveStatus,
    handleProjectLoad,
    handleNewProject,
    fileMenuProps,
  };
}
