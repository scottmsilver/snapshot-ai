import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Use locally served worker from public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.js';

export interface PDFPageInfo {
  pageNumber: number;
  width: number;
  height: number;
}

export interface PDFDocumentInfo {
  numPages: number;
  pages: PDFPageInfo[];
}

/**
 * Load a PDF document from a file
 */
export async function loadPDFDocument(file: File): Promise<PDFDocumentProxy> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      verbosity: 1 // Enable some logging
    });
    
    // Add progress tracking
    loadingTask.onProgress = function(progress: { loaded: number; total: number }) {
      void progress;
      // Progress tracking available here
    };
    
    const pdf = await loadingTask.promise;
    
    return pdf;
  } catch (error) {
    console.error('Error in loadPDFDocument:', error);
    throw error;
  }
}

/**
 * Get information about all pages in a PDF
 */
export async function getPDFInfo(pdf: PDFDocumentProxy): Promise<PDFDocumentInfo> {
  const pages: PDFPageInfo[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    
    pages.push({
      pageNumber: i,
      width: viewport.width,
      height: viewport.height
    });
  }
  
  return {
    numPages: pdf.numPages,
    pages
  };
}

/**
 * Render a PDF page to a canvas element
 */
export async function renderPDFPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number = 2, // Higher scale for better quality
  rotation: number = 0 // Rotation in degrees (0, 90, 180, 270)
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  
  // Apply rotation to viewport
  // Combine any existing page rotation with user-specified rotation
  const baseRotation = page.rotate || 0;
  const totalRotation = (baseRotation + rotation) % 360;
  
  const viewport = page.getViewport({ scale, rotation: totalRotation });
  
  // Create canvas
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  // Render PDF page into canvas context
  const renderContext = {
    canvasContext: context,
    viewport: viewport
  };
  
  await page.render(renderContext).promise;
  
  return canvas;
}

/**
 * Convert a PDF page to an image data URL
 */
export async function pdfPageToImage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number = 2,
  format: 'png' | 'jpeg' = 'png',
  quality: number = 0.9,
  rotation: number = 0
): Promise<string> {
  const canvas = await renderPDFPage(pdf, pageNumber, scale, rotation);
  
  if (format === 'jpeg') {
    return canvas.toDataURL('image/jpeg', quality);
  }
  
  return canvas.toDataURL('image/png');
}

/**
 * Convert a PDF page to an Image element
 */
export async function pdfPageToImageElement(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number = 2,
  rotation: number = 0
): Promise<HTMLImageElement> {
  const dataUrl = await pdfPageToImage(pdf, pageNumber, scale, 'png', 0.9, rotation);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}