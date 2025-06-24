import { useState, useCallback } from 'react';
import type { ImageData } from '@/types/canvas';

interface UseImageReturn {
  imageData: ImageData | null;
  isLoading: boolean;
  error: string | null;
  loadImage: (file: File) => Promise<void>;
  loadImageFromData: (dataUrl: string, name: string) => Promise<void>;
  clearImage: () => void;
}

export const useImage = (): UseImageReturn => {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadImage = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      // Convert file to data URL
      const reader = new FileReader();
      
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => {
          const result = e.target?.result;
          if (typeof result === 'string') {
            resolve(result);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      // Load image to get dimensions
      const img = new Image();
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
      });

      // Set image data
      setImageData({
        src: dataUrl,
        width: img.width,
        height: img.height,
        name: file.name,
        type: 'upload'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearImage = useCallback(() => {
    setImageData(null);
    setError(null);
  }, []);

  const loadImageFromData = useCallback(async (dataUrl: string, name: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Load image to get dimensions
      const img = new Image();
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
      });

      // Set image data
      setImageData({
        src: dataUrl,
        width: img.width,
        height: img.height,
        name: name,
        type: 'upload'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    imageData,
    isLoading,
    error,
    loadImage,
    loadImageFromData,
    clearImage
  };
};