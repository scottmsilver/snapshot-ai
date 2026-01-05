/**
 * Image utility functions for server-side image processing
 * 
 * Handles base64 encoding/decoding and image manipulation for AI operations.
 */

/**
 * Convert a base64 data URL to a Buffer
 * 
 * @param base64DataUrl - Base64 data URL (e.g., "data:image/png;base64,...")
 * @returns Buffer containing the image data
 */
export function base64ToBuffer(base64DataUrl: string): Buffer {
  // Remove the data URL prefix if present
  const base64Data = base64DataUrl.includes(',')
    ? base64DataUrl.split(',')[1]
    : base64DataUrl;

  return Buffer.from(base64Data, 'base64');
}

/**
 * Convert a Buffer to a base64 data URL
 * 
 * @param buffer - Buffer containing image data
 * @param mimeType - MIME type (default: 'image/png')
 * @returns Base64 data URL
 */
export function bufferToBase64(buffer: Buffer, mimeType: string = 'image/png'): string {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Extract the base64 data (without data URL prefix) from a data URL
 * 
 * @param base64DataUrl - Base64 data URL (e.g., "data:image/png;base64,...")
 * @returns Base64 string without prefix
 */
export function extractBase64Data(base64DataUrl: string): string {
  if (!base64DataUrl.includes(',')) {
    return base64DataUrl;
  }
  return base64DataUrl.split(',')[1];
}

/**
 * Extract the MIME type from a base64 data URL
 * 
 * @param base64DataUrl - Base64 data URL (e.g., "data:image/png;base64,...")
 * @returns MIME type (e.g., "image/png") or default "image/png"
 */
export function extractMimeType(base64DataUrl: string): string {
  if (!base64DataUrl.includes(';')) {
    return 'image/png';
  }

  const prefix = base64DataUrl.split(';')[0];
  return prefix.replace('data:', '');
}

/**
 * Validate that a string is a valid base64 data URL
 * 
 * @param base64DataUrl - String to validate
 * @returns True if valid, false otherwise
 */
export function isValidBase64DataUrl(base64DataUrl: string): boolean {
  if (typeof base64DataUrl !== 'string') {
    return false;
  }

  // Check for data URL format
  if (!base64DataUrl.startsWith('data:')) {
    return false;
  }

  // Check for comma separator
  if (!base64DataUrl.includes(',')) {
    return false;
  }

  // Check that we have actual data after the comma
  const parts = base64DataUrl.split(',');
  if (parts.length !== 2 || parts[1].length === 0) {
    return false;
  }

  return true;
}

/**
 * Validate that a base64 data URL represents an image
 * 
 * @param base64DataUrl - String to validate
 * @returns True if valid image data URL, false otherwise
 */
export function isValidImageDataUrl(base64DataUrl: string): boolean {
  if (!isValidBase64DataUrl(base64DataUrl)) {
    return false;
  }

  const mimeType = extractMimeType(base64DataUrl);
  return mimeType.startsWith('image/');
}
