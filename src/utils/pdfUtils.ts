import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Use locally served worker from public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.js';

console.log('PDF.js initialized with local worker');

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
  console.log('Loading PDF document:', file.name, file.size);
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    console.log('ArrayBuffer created, size:', arrayBuffer.byteLength);
    
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      verbosity: 1 // Enable some logging
    });
    
    // Add progress tracking
    loadingTask.onProgress = function(progress) {
      console.log('PDF loading progress:', Math.round(progress.loaded / progress.total * 100) + '%');
    };
    
    console.log('Loading task created, waiting for promise...');
    const pdf = await loadingTask.promise;
    console.log('PDF loaded successfully, pages:', pdf.numPages);
    
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
  scale: number = 2 // Higher scale for better quality
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  
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
  quality: number = 0.9
): Promise<string> {
  const canvas = await renderPDFPage(pdf, pageNumber, scale);
  
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
  scale: number = 2
): Promise<HTMLImageElement> {
  const dataUrl = await pdfPageToImage(pdf, pageNumber, scale);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}