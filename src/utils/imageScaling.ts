// Image scaling utilities for different image sources

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export enum ImageSource {
  PDF = 'pdf',
  SCREENSHOT = 'screenshot',
  PASTE = 'paste',
  UPLOAD = 'upload'
}

// Calculate scaled dimensions based on image source and canvas size
export function calculateScaledDimensions(
  originalDimensions: ImageDimensions,
  canvasSize: CanvasSize | null,
  source: ImageSource,
  canvasPadding: number = 100
): ImageDimensions {
  // If no canvas size, return original dimensions
  if (!canvasSize) {
    return originalDimensions;
  }

  const availableWidth = canvasSize.width - (canvasPadding * 2);
  const availableHeight = canvasSize.height - (canvasPadding * 2);

  switch (source) {
    case ImageSource.PDF:
      // PDF pages: Fit to canvas height for full page view
      return fitToHeight(originalDimensions, availableHeight);

    case ImageSource.SCREENSHOT:
      // Screenshots: Scale down if larger than 80% of canvas
      return scaleIfLargerThan(originalDimensions, availableWidth, availableHeight, 0.8);

    case ImageSource.PASTE:
      // Pasted images: Often screenshots, scale more aggressively
      // Assume high DPI screenshots and scale to 50% if very large
      if (originalDimensions.width > 2000 || originalDimensions.height > 1500) {
        return {
          width: originalDimensions.width * 0.5,
          height: originalDimensions.height * 0.5
        };
      }
      return scaleIfLargerThan(originalDimensions, availableWidth, availableHeight, 0.7);

    case ImageSource.UPLOAD:
      // Uploaded images: Always fit to canvas
      return fitToCanvas(originalDimensions, availableWidth, availableHeight);

    default:
      // Default: Always fit to canvas to ensure content is visible
      return fitToCanvas(originalDimensions, availableWidth, availableHeight);
  }
}

// Fit image to specific height while maintaining aspect ratio
function fitToHeight(dimensions: ImageDimensions, maxHeight: number): ImageDimensions {
  if (dimensions.height <= maxHeight) {
    return dimensions;
  }

  const scale = maxHeight / dimensions.height;
  return {
    width: Math.round(dimensions.width * scale),
    height: Math.round(dimensions.height * scale)
  };
}

// Scale down only if image is larger than threshold percentage of canvas
function scaleIfLargerThan(
  dimensions: ImageDimensions,
  maxWidth: number,
  maxHeight: number,
  threshold: number
): ImageDimensions {
  const thresholdWidth = maxWidth * threshold;
  const thresholdHeight = maxHeight * threshold;

  if (dimensions.width <= thresholdWidth && dimensions.height <= thresholdHeight) {
    return dimensions;
  }

  return fitToCanvas(dimensions, thresholdWidth, thresholdHeight);
}

// Fit image within bounds while maintaining aspect ratio
function fitToCanvas(
  dimensions: ImageDimensions,
  maxWidth: number,
  maxHeight: number
): ImageDimensions {
  // If image already fits, return original dimensions
  if (dimensions.width <= maxWidth && dimensions.height <= maxHeight) {
    return dimensions;
  }
  
  // Calculate scale to fit within bounds
  const widthScale = maxWidth / dimensions.width;
  const heightScale = maxHeight / dimensions.height;
  const scale = Math.min(widthScale, heightScale);

  return {
    width: Math.round(dimensions.width * scale),
    height: Math.round(dimensions.height * scale)
  };
}

// Detect if filename suggests PDF origin
export function isPDFSourcedImage(filename: string): boolean {
  return filename.toLowerCase().includes('pdf') || 
         filename.includes('Page ') ||
         filename.match(/page-?\d+/i) !== null;
}

// Detect if image dimensions suggest a screenshot
export function isLikelyScreenshot(dimensions: ImageDimensions): boolean {
  // Common screenshot resolutions (including retina)
  const commonWidths = [1280, 1366, 1440, 1920, 2560, 2880, 3840];
  const commonHeights = [720, 768, 800, 900, 1080, 1440, 1600, 1800, 2160];
  
  return commonWidths.includes(dimensions.width) || 
         commonHeights.includes(dimensions.height) ||
         (dimensions.width > 1920 && dimensions.height > 1080); // High DPI displays
}