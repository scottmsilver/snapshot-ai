import { heicTo, isHeic } from 'heic-to';

/**
 * Check if a file is HEIC/HEIF format
 * Uses heic-to's built-in detection which reads file headers,
 * plus fallback to extension check for edge cases
 */
export const isHeicFile = (file: File): boolean => {
  // Check file extension first (fast path for obvious cases)
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
    return true;
  }

  // Check MIME type 
  const heicMimeTypes = ['image/heic', 'image/heif'];
  if (heicMimeTypes.includes(file.type.toLowerCase())) {
    return true;
  }

  return false;
};

/**
 * Check if a file is HEIC/HEIF by reading its headers (async, more accurate)
 * Uses heic-to's built-in isHeic which reads the actual file bytes
 */
export const isHeicFileAsync = async (file: File): Promise<boolean> => {
  try {
    return await isHeic(file);
  } catch {
    // Fall back to extension/mime check if header reading fails
    return isHeicFile(file);
  }
};

/**
 * Convert HEIC/HEIF file to JPEG format
 * @param file - HEIC/HEIF file to convert
 * @returns Promise that resolves to JPEG File object
 * @throws Error if conversion fails
 */
export const convertHeicToJpeg = async (file: File): Promise<File> => {
  try {
    // Convert HEIC to JPEG blob using heic-to
    const jpegBlob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.9
    });

    // Create a new File object with .jpg extension
    const fileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    
    return new File([jpegBlob], fileName, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } catch (error) {
    // Wrap heic-to errors in user-friendly messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to convert HEIC image: ${errorMessage}. Please try a different image format.`);
  }
};
