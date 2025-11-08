import type { Rectangle } from '@/types/drawing';
import { imageDataToBase64 } from './maskRendering';

/**
 * Composites the AI-generated result back into the original canvas
 * at the exact location of the selection bounds
 */
export function compositeInpaintResult(
  originalCanvas: HTMLCanvasElement,
  generatedImageData: ImageData,
  bounds: Rectangle
): void {
  const ctx = originalCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Place generated image at exact bounds location
  // This replaces the pixels in that region
  ctx.putImageData(generatedImageData, bounds.x, bounds.y);
}

/**
 * Convert ImageData to a base64 string for storage in ImageShape
 */
export function createImageShapeData(
  imageData: ImageData
): string {
  return imageDataToBase64(imageData);
}

/**
 * Extracts a region from a canvas as ImageData
 */
export function extractCanvasRegion(
  canvas: HTMLCanvasElement,
  bounds: Rectangle
): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  return ctx.getImageData(
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height
  );
}
