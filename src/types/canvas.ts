export interface ImageData {
  src: string;
  width: number;
  height: number;
  name?: string;
  type: 'upload' | 'paste';
}

export interface CanvasSize {
  width: number;
  height: number;
}

export type FileType = 'image/jpeg' | 'image/png' | 'image/jpg';

export interface UploadError {
  message: string;
  type: 'size' | 'type' | 'load';
}