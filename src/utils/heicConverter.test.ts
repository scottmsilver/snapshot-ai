import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHeicFile, isHeicFileAsync, convertHeicToJpeg } from './heicConverter';

// Mock heic-to
vi.mock('heic-to', () => ({
  heicTo: vi.fn(),
  isHeic: vi.fn()
}));

import { heicTo, isHeic } from 'heic-to';

describe('heicConverter', () => {
  describe('isHeicFile', () => {
    it('should return true for file with image/heic MIME type', () => {
      const file = new File([''], 'photo.jpg', { type: 'image/heic' });
      expect(isHeicFile(file)).toBe(true);
    });

    it('should return true for file with image/heif MIME type', () => {
      const file = new File([''], 'photo.jpg', { type: 'image/heif' });
      expect(isHeicFile(file)).toBe(true);
    });

    it('should return true for file with IMAGE/HEIC MIME type (case insensitive)', () => {
      const file = new File([''], 'photo.jpg', { type: 'IMAGE/HEIC' });
      expect(isHeicFile(file)).toBe(true);
    });

    it('should return true for .heic extension with empty MIME type', () => {
      // iPhone files often have empty MIME type
      const file = new File([''], 'IMG_1234.HEIC', { type: '' });
      expect(isHeicFile(file)).toBe(true);
    });

    it('should return true for .heif extension with empty MIME type', () => {
      const file = new File([''], 'photo.heif', { type: '' });
      expect(isHeicFile(file)).toBe(true);
    });

    it('should return true for .HEIC extension (uppercase)', () => {
      const file = new File([''], 'IMG_1234.HEIC', { type: '' });
      expect(isHeicFile(file)).toBe(true);
    });

    it('should return false for regular JPEG file', () => {
      const file = new File([''], 'photo.jpg', { type: 'image/jpeg' });
      expect(isHeicFile(file)).toBe(false);
    });

    it('should return false for PNG file', () => {
      const file = new File([''], 'image.png', { type: 'image/png' });
      expect(isHeicFile(file)).toBe(false);
    });

    it('should return false for file with wrong MIME type and wrong extension', () => {
      const file = new File([''], 'document.pdf', { type: 'application/pdf' });
      expect(isHeicFile(file)).toBe(false);
    });

    it('should return true for HEIC file with incorrect MIME type (common iPhone issue)', () => {
      // Sometimes iPhone sets MIME type to application/octet-stream
      const file = new File([''], 'IMG_0001.heic', { type: 'application/octet-stream' });
      expect(isHeicFile(file)).toBe(true);
    });
  });

  describe('isHeicFileAsync', () => {
    const mockedIsHeic = vi.mocked(isHeic);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should use heic-to isHeic for accurate detection', async () => {
      const file = new File(['heic data'], 'photo.jpg', { type: '' });
      mockedIsHeic.mockResolvedValue(true);

      const result = await isHeicFileAsync(file);

      expect(mockedIsHeic).toHaveBeenCalledWith(file);
      expect(result).toBe(true);
    });

    it('should fall back to sync check if isHeic fails', async () => {
      const file = new File([''], 'photo.heic', { type: '' });
      mockedIsHeic.mockRejectedValue(new Error('Read failed'));

      const result = await isHeicFileAsync(file);

      expect(result).toBe(true); // Falls back to extension check
    });
  });

  describe('convertHeicToJpeg', () => {
    const mockedHeicTo = vi.mocked(heicTo);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should convert HEIC file to JPEG', async () => {
      const inputFile = new File(['heic data'], 'photo.heic', { type: 'image/heic' });
      const mockBlob = new Blob(['jpeg data'], { type: 'image/jpeg' });
      
      mockedHeicTo.mockResolvedValue(mockBlob);

      const result = await convertHeicToJpeg(inputFile);

      expect(mockedHeicTo).toHaveBeenCalledWith({
        blob: inputFile,
        type: 'image/jpeg',
        quality: 0.9
      });
      expect(result).toBeInstanceOf(File);
      expect(result.name).toBe('photo.jpg');
      expect(result.type).toBe('image/jpeg');
    });

    it('should replace .HEIC extension with .jpg (case insensitive)', async () => {
      const inputFile = new File(['heic data'], 'IMG_1234.HEIC', { type: 'image/heic' });
      const mockBlob = new Blob(['jpeg data'], { type: 'image/jpeg' });
      
      mockedHeicTo.mockResolvedValue(mockBlob);

      const result = await convertHeicToJpeg(inputFile);

      expect(result.name).toBe('IMG_1234.jpg');
    });

    it('should replace .heif extension with .jpg', async () => {
      const inputFile = new File(['heic data'], 'photo.heif', { type: 'image/heif' });
      const mockBlob = new Blob(['jpeg data'], { type: 'image/jpeg' });
      
      mockedHeicTo.mockResolvedValue(mockBlob);

      const result = await convertHeicToJpeg(inputFile);

      expect(result.name).toBe('photo.jpg');
    });

    it('should throw user-friendly error on conversion failure', async () => {
      const inputFile = new File(['bad data'], 'corrupt.heic', { type: 'image/heic' });
      
      mockedHeicTo.mockRejectedValue(new Error('libheif: Invalid input'));

      await expect(convertHeicToJpeg(inputFile)).rejects.toThrow(
        'Failed to convert HEIC image: libheif: Invalid input. Please try a different image format.'
      );
    });

    it('should handle non-Error rejection', async () => {
      const inputFile = new File(['bad data'], 'corrupt.heic', { type: 'image/heic' });
      
      mockedHeicTo.mockRejectedValue('String error');

      await expect(convertHeicToJpeg(inputFile)).rejects.toThrow(
        'Failed to convert HEIC image: Unknown error. Please try a different image format.'
      );
    });
  });
});
