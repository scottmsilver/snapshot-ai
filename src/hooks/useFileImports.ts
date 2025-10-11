import { useCallback, useState } from 'react';
import type React from 'react';
import { DrawingTool, type ImageShape, type Shape } from '@/types/drawing';
import { calculateScaledDimensions, ImageSource, isLikelyScreenshot, isPDFSourcedImage } from '@/utils/imageScaling';

interface CanvasSize {
  width: number;
  height: number;
}

interface UseFileImportsOptions {
  canvasSize: CanvasSize | null;
  setCanvasSize: React.Dispatch<React.SetStateAction<CanvasSize | null>>;
  isCanvasInitialized: boolean;
  setIsCanvasInitialized: React.Dispatch<React.SetStateAction<boolean>>;
  addShape: (shape: Shape | Omit<Shape, 'zIndex'>) => void;
  setActiveTool: (tool: DrawingTool) => void;
  selectShape: (id: string) => void;
  canvasPadding: number;
}

interface UseFileImportsResult {
  pdfFile: File | null;
  clearPdfFile: () => void;
  createImageShapeFromFile: (file: File, source?: ImageSource) => Promise<ImageShape>;
  handleImageUpload: (file: File) => Promise<void>;
  handlePDFUpload: (file: File) => void;
  handlePDFPageLoad: (image: HTMLImageElement, pageInfo: { current: number; total: number }) => Promise<void>;
  handleImageToolComplete: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
}

export function useFileImports({
  canvasSize,
  setCanvasSize,
  isCanvasInitialized,
  setIsCanvasInitialized,
  addShape,
  setActiveTool,
  selectShape,
  canvasPadding,
}: UseFileImportsOptions): UseFileImportsResult {
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const clearPdfFile = useCallback((): void => {
    setPdfFile(null);
  }, []);

  const createImageShapeFromFile = useCallback(
    async (file: File, source?: ImageSource): Promise<ImageShape> => {
      const dataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'));
        reader.onload = event => resolve((event.target?.result as string) ?? '');
        reader.readAsDataURL(file);
      });

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load image data'));
        image.src = dataURL;
      });

      let imageSource = source;
      if (!imageSource) {
        if (isPDFSourcedImage(file.name)) {
          imageSource = ImageSource.PDF;
        } else if (isLikelyScreenshot({ width: img.width, height: img.height })) {
          imageSource = ImageSource.SCREENSHOT;
        } else {
          imageSource = ImageSource.UPLOAD;
        }
      }

      const MAX_INITIAL_CANVAS_WIDTH = 1400;
      const MAX_INITIAL_CANVAS_HEIGHT = 900;
      const MIN_CANVAS_WIDTH = 800;
      const MIN_CANVAS_HEIGHT = 600;

      const effectiveCanvasSize =
        canvasSize ?? {
          width: MAX_INITIAL_CANVAS_WIDTH,
          height: MAX_INITIAL_CANVAS_HEIGHT,
        };

      const scaledDimensions = calculateScaledDimensions(
        { width: img.width, height: img.height },
        effectiveCanvasSize,
        imageSource,
        canvasPadding,
      );

      if (!isCanvasInitialized) {
        let canvasWidth = scaledDimensions.width + canvasPadding * 2;
        let canvasHeight = scaledDimensions.height + canvasPadding * 2;

        canvasWidth = Math.min(canvasWidth, MAX_INITIAL_CANVAS_WIDTH);
        canvasHeight = Math.min(canvasHeight, MAX_INITIAL_CANVAS_HEIGHT);

        canvasWidth = Math.max(canvasWidth, MIN_CANVAS_WIDTH);
        canvasHeight = Math.max(canvasHeight, MIN_CANVAS_HEIGHT);

        setCanvasSize({ width: canvasWidth, height: canvasHeight });
        setIsCanvasInitialized(true);
      }

      let imageX = canvasPadding;
      let imageY = canvasPadding;

      if (canvasSize) {
        const availableWidth = canvasSize.width - canvasPadding * 2;
        if (scaledDimensions.width < availableWidth) {
          imageX = canvasPadding + (availableWidth - scaledDimensions.width) / 2;
        }

        const availableHeight = canvasSize.height - canvasPadding * 2;
        if (scaledDimensions.height < availableHeight) {
          imageY = canvasPadding + (availableHeight - scaledDimensions.height) / 2;
        }
      }

      return {
        id: `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: DrawingTool.IMAGE,
        x: imageX,
        y: imageY,
        width: scaledDimensions.width,
        height: scaledDimensions.height,
        imageData: dataURL,
        style: {
          stroke: 'transparent',
          strokeWidth: 0,
          opacity: 1,
        },
        visible: true,
        locked: false,
        zIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    },
    [canvasSize, isCanvasInitialized, canvasPadding, setCanvasSize, setIsCanvasInitialized],
  );

  const handleImageUpload = useCallback(
    async (file: File) => {
      const imageShape = await createImageShapeFromFile(file);
      clearPdfFile();
      setActiveTool(DrawingTool.SELECT);
      addShape(imageShape);
    },
    [addShape, clearPdfFile, createImageShapeFromFile, setActiveTool],
  );

  const handlePDFUpload = useCallback((file: File) => {
    setPdfFile(file);
  }, []);

  const handlePDFPageLoad = useCallback(
    async (image: HTMLImageElement, pageInfo: { current: number; total: number }) => {
      const response = await fetch(image.src);
      const blob = await response.blob();
      const fileName = pdfFile ? `${pdfFile.name} - Page ${pageInfo.current}` : `pdf-page-${pageInfo.current}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      const imageShape = await createImageShapeFromFile(file, ImageSource.PDF);

      clearPdfFile();
      setActiveTool(DrawingTool.SELECT);
      addShape(imageShape);
    },
    [addShape, clearPdfFile, createImageShapeFromFile, pdfFile, setActiveTool],
  );

  const handleImageToolComplete = useCallback(
    async (bounds: { x: number; y: number; width: number; height: number }) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.pdf,application/pdf';
      input.onchange = async event => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) {
          return;
        }

        try {
          if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            setPdfFile(file);
            setActiveTool(DrawingTool.SELECT);
            return;
          }

          const imageShape = await createImageShapeFromFile(file);
          const imageAspectRatio = imageShape.width / imageShape.height;
          const boundsAspectRatio = bounds.width / bounds.height;

          let finalWidth: number;
          let finalHeight: number;

          if (imageAspectRatio > boundsAspectRatio) {
            finalWidth = bounds.width;
            finalHeight = bounds.width / imageAspectRatio;
          } else {
            finalHeight = bounds.height;
            finalWidth = bounds.height * imageAspectRatio;
          }

          imageShape.x = bounds.x + (bounds.width - finalWidth) / 2;
          imageShape.y = bounds.y + (bounds.height - finalHeight) / 2;
          imageShape.width = finalWidth;
          imageShape.height = finalHeight;

          addShape(imageShape);
          setActiveTool(DrawingTool.SELECT);
          selectShape(imageShape.id);
        } catch (error) {
          console.error('Failed to load file:', error);
        }
      };
      input.click();
    },
    [addShape, createImageShapeFromFile, selectShape, setActiveTool],
  );

  return {
    pdfFile,
    clearPdfFile,
    createImageShapeFromFile,
    handleImageUpload,
    handlePDFUpload,
    handlePDFPageLoad,
    handleImageToolComplete,
  };
}
