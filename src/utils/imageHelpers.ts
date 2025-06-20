import type { CanvasSize, ImageData } from '@/types/canvas';

interface ImageTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export const calculateImageFit = (
  imageData: ImageData,
  canvasSize: CanvasSize,
  padding: number = 20
): ImageTransform => {
  const availableWidth = canvasSize.width - padding * 2;
  const availableHeight = canvasSize.height - padding * 2;

  // Calculate scale to fit image within canvas
  const scaleX = availableWidth / imageData.width;
  const scaleY = availableHeight / imageData.height;
  const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down

  // Calculate dimensions
  const width = imageData.width * scale;
  const height = imageData.height * scale;

  // Center the image
  const x = (canvasSize.width - width) / 2;
  const y = (canvasSize.height - height) / 2;

  return {
    x,
    y,
    width,
    height,
    scale
  };
};