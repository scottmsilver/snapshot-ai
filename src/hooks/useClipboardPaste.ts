import { useEffect } from 'react';
import { DrawingTool, type Shape } from '@/types/drawing';
import { ImageSource } from '@/utils/imageScaling';

interface ClipboardPasteOptions {
  isEnabled: boolean;
  shapes: Shape[];
  createImageShapeFromFile: (file: File, source?: ImageSource) => Promise<Shape>;
  setActiveTool: (tool: DrawingTool) => void;
  addShape: (shape: Shape | Omit<Shape, 'zIndex'>) => void;
  canvasPadding: number;
}

export function useClipboardPaste({
  isEnabled,
  shapes,
  createImageShapeFromFile,
  setActiveTool,
  addShape,
  canvasPadding,
}: ClipboardPasteOptions): void {
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const handlePaste = async (event: ClipboardEvent): Promise<void> => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }

      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      for (const item of items) {
        if (!item.type.startsWith('image/')) {
          continue;
        }

        event.preventDefault();
        const blob = item.getAsFile();
        if (!blob) {
          continue;
        }

        try {
          const file = new File([blob], 'pasted-image.png', { type: blob.type });
          const imageShape = await createImageShapeFromFile(file, ImageSource.PASTE);

          if (shapes.length > 0) {
            let offsetX = 50;
            let offsetY = 50;

            const recentShapes = shapes.slice(-3);
            const hasOverlap = recentShapes.some(shape =>
              'x' in shape &&
              'y' in shape &&
              Math.abs((shape as Shape & { x: number; y: number }).x - canvasPadding) < 50 &&
              Math.abs((shape as Shape & { x: number; y: number }).y - canvasPadding) < 50,
            );

            if (hasOverlap) {
              offsetX = 50 + (shapes.length % 5) * 30;
              offsetY = 50 + (shapes.length % 5) * 30;
            }

            (imageShape as Shape & { x: number; y: number }).x = canvasPadding + offsetX;
            (imageShape as Shape & { x: number; y: number }).y = canvasPadding + offsetY;
          }

          setActiveTool(DrawingTool.SELECT);
          addShape(imageShape);
        } catch (error) {
          console.error('Failed to paste image:', error);
        }

        break;
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isEnabled, shapes, createImageShapeFromFile, setActiveTool, addShape, canvasPadding]);
}
