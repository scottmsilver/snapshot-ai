import type { Point, Rectangle } from '@/types/drawing';

export interface MaskExport {
  // The bounding box of the selection (for reference)
  bounds: Rectangle;

  // Binary mask: white = selected, black = not selected
  // FULL SIZE - same dimensions as source canvas
  maskImageData: ImageData;

  // Source image - FULL SIZE
  sourceImageData: ImageData;
}

/**
 * Generate a binary mask from brush stroke selection
 */
export function generateBrushMask(
  sourceCanvas: HTMLCanvasElement,
  points: Point[],
  brushWidth: number
): MaskExport {
  if (points.length === 0) {
    throw new Error('No points provided for brush mask');
  }

  // Create mask canvas
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = sourceCanvas.width;
  maskCanvas.height = sourceCanvas.height;
  const maskCtx = maskCanvas.getContext('2d')!;

  // Fill black background
  maskCtx.fillStyle = 'black';
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

  // Draw brush strokes in white
  maskCtx.strokeStyle = 'white';
  maskCtx.fillStyle = 'white';
  maskCtx.lineWidth = brushWidth;
  maskCtx.lineCap = 'round';
  maskCtx.lineJoin = 'round';

  maskCtx.beginPath();
  maskCtx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    maskCtx.lineTo(points[i].x, points[i].y);
  }

  maskCtx.stroke();

  // Find bounding box of white pixels (for reference)
  const bounds = findMaskBounds(maskCanvas);

  // Return FULL SIZE images - not cropped
  const maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

  const sourceCtx = sourceCanvas.getContext('2d')!;
  const sourceImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  return { bounds, maskImageData, sourceImageData };
}

/**
 * Generate a binary mask from rectangle selection
 */
export function generateRectangleMask(
  sourceCanvas: HTMLCanvasElement,
  rectangle: Rectangle
): MaskExport {
  // Create mask canvas
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = sourceCanvas.width;
  maskCanvas.height = sourceCanvas.height;
  const maskCtx = maskCanvas.getContext('2d')!;

  // Fill black background
  maskCtx.fillStyle = 'black';
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

  // Draw rectangle in white
  maskCtx.fillStyle = 'white';
  maskCtx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);

  // Return FULL SIZE images - not cropped
  const maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

  const sourceCtx = sourceCanvas.getContext('2d')!;
  const sourceImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  return {
    bounds: rectangle,
    maskImageData,
    sourceImageData
  };
}

/**
 * Generate a binary mask from lasso (polygon) selection
 */
export function generateLassoMask(
  sourceCanvas: HTMLCanvasElement,
  points: Point[]
): MaskExport {
  if (points.length < 3) {
    throw new Error('Lasso requires at least 3 points');
  }

  // Create mask canvas
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = sourceCanvas.width;
  maskCanvas.height = sourceCanvas.height;
  const maskCtx = maskCanvas.getContext('2d')!;

  // Fill black background
  maskCtx.fillStyle = 'black';
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

  // Draw polygon in white
  maskCtx.fillStyle = 'white';
  maskCtx.beginPath();
  maskCtx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    maskCtx.lineTo(points[i].x, points[i].y);
  }

  maskCtx.closePath();
  maskCtx.fill();

  // Find bounding box of white pixels (for reference)
  const bounds = findMaskBounds(maskCanvas);

  // Return FULL SIZE images - not cropped
  const maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

  const sourceCtx = sourceCanvas.getContext('2d')!;
  const sourceImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  return { bounds, maskImageData, sourceImageData };
}

/**
 * Find the bounding box of white pixels in a mask canvas
 * Returns minimal rectangle containing all selected area
 */
export function findMaskBounds(maskCanvas: HTMLCanvasElement): Rectangle {
  const ctx = maskCanvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  const pixels = imageData.data;

  let minX = maskCanvas.width;
  let minY = maskCanvas.height;
  let maxX = 0;
  let maxY = 0;

  // Scan all pixels to find bounds of white pixels
  for (let y = 0; y < maskCanvas.height; y++) {
    for (let x = 0; x < maskCanvas.width; x++) {
      const index = (y * maskCanvas.width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];

      // Check if pixel is white (or close to it)
      if (r > 128 || g > 128 || b > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Add small padding to avoid edge issues
  const padding = 2;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(maskCanvas.width - 1, maxX + padding);
  maxY = Math.min(maskCanvas.height - 1, maxY + padding);

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

/**
 * Convert ImageData to base64 PNG
 */
export function imageDataToBase64(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Convert base64 PNG back to ImageData
 */
export function base64ToImageData(base64: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error('Failed to load image from base64'));
    img.src = base64;
  });
}
