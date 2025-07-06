import Konva from 'konva';

export async function copyCanvasToClipboard(stage: Konva.Stage): Promise<void> {
  // Ensure stage is rendered before copying
  stage.draw();
  
  // Get the data URL from the stage
  const dataURL = stage.toDataURL({
    pixelRatio: 2, // Higher quality export
    mimeType: 'image/png'
  });

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
  // Get the data URL from the stage
  const dataURL = stage.toDataURL({
    pixelRatio: 2, // Higher quality export
  });

  // Create a temporary link element
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataURL;
  
  // Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}