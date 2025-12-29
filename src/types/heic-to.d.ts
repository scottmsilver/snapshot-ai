declare module 'heic-to' {
  export interface HeicToOptions {
    /** The HEIC/HEIF blob to convert */
    blob: Blob;
    /** Output type: 'image/jpeg', 'image/png', or 'bitmap' */
    type: 'image/jpeg' | 'image/png' | 'bitmap';
    /** Quality for JPEG/PNG output (0-1) */
    quality?: number;
    /** Options for bitmap output */
    options?: ImageBitmapOptions;
  }

  /**
   * Convert HEIC/HEIF image to JPEG, PNG, or ImageBitmap
   */
  export function heicTo(options: HeicToOptions): Promise<Blob>;

  /**
   * Check if a blob is a HEIC/HEIF image by reading its headers
   */
  export function isHeic(blob: Blob): Promise<boolean>;
}
