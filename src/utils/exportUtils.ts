import Konva from 'konva';

export interface CleanCanvasOptions {
  /** Whether to hide grid lines (default: true) */
  hideGrid?: boolean;
  /** Whether to hide selection UI like Transformer and selection box (default: true) */
  hideSelectionUI?: boolean;
  /** Whether to hide the canvas background rect (default: false) */
  hideBackground?: boolean;
  /** Pixel ratio for export quality (default: 1 for AI, 2 for user exports) */
  pixelRatio?: number;
}

/**
 * Checks if a node should be excluded from clean canvas export.
 * Uses explicit naming conventions rather than color detection.
 */
function shouldExcludeNode(node: Konva.Node, options: CleanCanvasOptions): boolean {
  const { hideGrid = true, hideSelectionUI = true, hideBackground = false } = options;
  
  const className = node.getClassName();
  const name = node.name() || '';
  
  // Exclude grid lines by name
  if (hideGrid && name === 'gridLine') {
    return true;
  }

  // Optionally exclude the canvas background rect by name
  if (hideBackground && name === 'canvasBackground') {
    return true;
  }
  
  // Always exclude Transformers (selection handles)
  if (hideSelectionUI && className === 'Transformer') {
    return true;
  }
  
  // Exclude selection-related UI by name
  if (hideSelectionUI) {
    if (name.includes('selection') || name.includes('overlay')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Captures a clean canvas image without visual aids (grid, selection UI, etc.)
 * 
 * This works by temporarily hiding UI nodes, capturing to an offscreen canvas,
 * then immediately restoring visibility. The hide/restore happens synchronously
 * without yielding to the browser's render loop, so no visual flash occurs.
 * 
 * @param stage - The Konva stage to capture
 * @param options - Configuration options
 * @returns Canvas element containing only the actual content
 */
export function captureCleanCanvas(stage: Konva.Stage, options: CleanCanvasOptions = {}): HTMLCanvasElement {
  const { pixelRatio = 1 } = options;
  
  // Find nodes that should be excluded by traversing the tree manually
  // (stage.find('*') doesn't work reliably with react-konva)
  const nodesToHide: { node: Konva.Node; wasVisible: boolean }[] = [];
  
  const collectNodesToHide = (container: Konva.Container): void => {
    container.getChildren().forEach((node) => {
      if (node.visible() && shouldExcludeNode(node, options)) {
        nodesToHide.push({ node, wasVisible: true });
      }
      // Recurse into containers (Layer, Group)
      if (node instanceof Konva.Container) {
        collectNodesToHide(node);
      }
    });
  };
  
  stage.getLayers().forEach((layer) => {
    collectNodesToHide(layer);
  });
  
  // Hide nodes (no redraw yet - just update the node state)
  nodesToHide.forEach(({ node }) => {
    node.visible(false);
  });
  
  // Capture to canvas - this renders the current state to an offscreen canvas
  // The browser hasn't repainted yet, so the user sees nothing
  const canvas = stage.toCanvas({ pixelRatio });
  
  // Immediately restore visibility before browser can repaint
  nodesToHide.forEach(({ node, wasVisible }) => {
    node.visible(wasVisible);
  });
  
  return canvas;
}

/**
 * Captures a clean canvas and returns it as a data URL.
 * Convenience wrapper around captureCleanCanvas.
 * 
 * @param stage - The Konva stage to capture
 * @param options - Configuration options (same as captureCleanCanvas)
 * @returns Data URL of the clean canvas image
 */
export function captureCleanCanvasAsDataURL(
  stage: Konva.Stage, 
  options: CleanCanvasOptions = {}
): string {
  const canvas = captureCleanCanvas(stage, options);
  return canvas.toDataURL('image/png');
}

/**
 * Captures a clean canvas and returns the ImageData.
 * Useful for AI operations that need raw pixel data.
 * 
 * @param stage - The Konva stage to capture
 * @param options - Configuration options (same as captureCleanCanvas)
 * @returns ImageData of the clean canvas
 */
export function captureCleanCanvasAsImageData(
  stage: Konva.Stage,
  options: CleanCanvasOptions = {}
): ImageData {
  const canvas = captureCleanCanvas(stage, options);
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function copyCanvasToClipboard(stage: Konva.Stage): Promise<void> {
  // Capture clean canvas without grid lines and selection UI
  const canvas = captureCleanCanvas(stage, { pixelRatio: 2 });
  const dataURL = canvas.toDataURL('image/png');

  // Convert data URL to blob
  const response = await fetch(dataURL);
  const blob = await response.blob();

  // Check if the browser supports the Clipboard API for images
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error('Clipboard API not supported in this browser');
  }

  // Check for secure context (HTTPS)
  if (!window.isSecureContext) {
    throw new Error('Clipboard API requires HTTPS. Try using localhost or deploy to HTTPS.');
  }

  try {
    // Create a ClipboardItem with the image blob
    const clipboardItem = new window.ClipboardItem({
      'image/png': blob
    });

    // Write to clipboard
    await navigator.clipboard.write([clipboardItem]);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    // Provide more specific error messages
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Clipboard access denied. Please grant permission or try again.');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Image copying not supported in this browser. Try Chrome, Edge, or Safari.');
      }
    }
    throw error;
  }
}

export function downloadCanvasAsImage(stage: Konva.Stage, filename: string = 'canvas-export.png'): void {
  // Capture clean canvas without grid lines and selection UI
  const canvas = captureCleanCanvas(stage, { pixelRatio: 2 });
  const dataURL = canvas.toDataURL('image/png');

  // Create a temporary link element
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataURL;
  
  // Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Captures a clean canvas and downloads it as a PDF file.
 * The canvas image is centered on an A4 page with margins and scaled to fit.
 * 
 * @param stage - The Konva stage to capture
 * @param filename - The filename for the PDF download (default: 'canvas-export.pdf')
 */
export async function downloadCanvasAsPdf(stage: Konva.Stage, filename: string = 'canvas-export.pdf'): Promise<void> {
  try {
    // Dynamically import jsPDF to avoid bundling it unnecessarily
    const { jsPDF } = await import('jspdf');
    
    // Capture canvas with high quality (pixelRatio: 2)
    const canvas = captureCleanCanvas(stage, { pixelRatio: 2 });
    const dataURL = canvas.toDataURL('image/png');

    // Create PDF with A4 page size
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Get page dimensions
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Define margins (10mm on each side)
    const margin = 10;
    const maxWidth = pageWidth - (2 * margin);
    const maxHeight = pageHeight - (2 * margin);

    // Calculate scaled dimensions to fit within margins while maintaining aspect ratio
    const canvasAspectRatio = canvas.width / canvas.height;
    const maxAspectRatio = maxWidth / maxHeight;

    let imgWidth: number;
    let imgHeight: number;

    if (canvasAspectRatio > maxAspectRatio) {
      // Canvas is wider - fit to width
      imgWidth = maxWidth;
      imgHeight = maxWidth / canvasAspectRatio;
    } else {
      // Canvas is taller - fit to height
      imgHeight = maxHeight;
      imgWidth = maxHeight * canvasAspectRatio;
    }

    // Center the image on the page
    const x = (pageWidth - imgWidth) / 2;
    const y = (pageHeight - imgHeight) / 2;

    // Add image to PDF
    pdf.addImage(dataURL, 'PNG', x, y, imgWidth, imgHeight);

    // Trigger download
    pdf.save(filename);
  } catch (error) {
    console.error('Failed to load jsPDF:', error);
    throw new Error('PDF export requires jsPDF library to be installed');
  }
}
