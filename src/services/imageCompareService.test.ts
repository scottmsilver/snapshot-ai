import { describe, it, expect } from 'vitest';
import {
  detectEditRegions,
  formatEditRegionsForPrompt,
  type EditDetectionResult,
} from './imageCompareService';

/**
 * Helper to create a solid color ImageData
 */
function createSolidImage(width: number, height: number, r: number, g: number, b: number, a = 255): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

/**
 * Helper to create a copy of an ImageData
 */
function copyImage(img: ImageData): ImageData {
  return {
    data: new Uint8ClampedArray(img.data),
    width: img.width,
    height: img.height,
    colorSpace: img.colorSpace,
  } as ImageData;
}

/**
 * Helper to set a pixel in an ImageData
 * Coordinate system: (0,0) is top-left, X increases right, Y increases down
 */
function setPixel(img: ImageData, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  const idx = (y * img.width + x) * 4;
  img.data[idx] = r;
  img.data[idx + 1] = g;
  img.data[idx + 2] = b;
  img.data[idx + 3] = a;
}

/**
 * Helper to fill a rectangle in an ImageData
 * Coordinate system: (0,0) is top-left, X increases right, Y increases down
 */
function fillRect(img: ImageData, x: number, y: number, width: number, height: number, r: number, g: number, b: number, a = 255): void {
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px >= 0 && px < img.width && py >= 0 && py < img.height) {
        setPixel(img, px, py, r, g, b, a);
      }
    }
  }
}

describe('imageCompareService', () => {
  // Use pixel-based for legacy tests that need exact pixel-level precision
  const pixelBased = { useBlockComparison: false };

  describe('detectEditRegions (pixel-based legacy)', () => {
    it('should return empty regions for identical images', () => {
      const original = createSolidImage(100, 100, 128, 128, 128);
      const edited = copyImage(original);

      const result = detectEditRegions(original, edited, pixelBased);

      expect(result.regions).toHaveLength(0);
      expect(result.totalChangedPixels).toBe(0);
      expect(result.percentChanged).toBe(0);
    });

    it('should throw error for images with different dimensions', () => {
      const original = createSolidImage(100, 100, 128, 128, 128);
      const edited = createSolidImage(200, 100, 128, 128, 128);

      expect(() => detectEditRegions(original, edited)).toThrow('Image dimensions must match');
    });

    it('should detect a single changed pixel at top-left (0, 0)', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      setPixel(edited, 0, 0, 255, 255, 255);

      const result = detectEditRegions(original, edited, { ...pixelBased, minRegionSize: 1 });

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].x).toBe(0);
      expect(result.regions[0].y).toBe(0);
      expect(result.regions[0].width).toBe(1);
      expect(result.regions[0].height).toBe(1);
      expect(result.regions[0].centerX).toBe(0);
      expect(result.regions[0].centerY).toBe(0);
      expect(result.regions[0].pixelCount).toBe(1);
    });

    it('should detect a single changed pixel at bottom-right (99, 99) in 100x100 image', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      setPixel(edited, 99, 99, 255, 255, 255);

      const result = detectEditRegions(original, edited, { ...pixelBased, minRegionSize: 1 });

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].x).toBe(99);
      expect(result.regions[0].y).toBe(99);
      expect(result.regions[0].centerX).toBe(99);
      expect(result.regions[0].centerY).toBe(99);
    });

    it('should detect a changed pixel at specific coordinates (75, 25)', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      setPixel(edited, 75, 25, 255, 255, 255);

      const result = detectEditRegions(original, edited, { ...pixelBased, minRegionSize: 1 });

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].x).toBe(75);
      expect(result.regions[0].y).toBe(25);
      expect(result.regions[0].centerX).toBe(75);
      expect(result.regions[0].centerY).toBe(25);
    });

    it('should detect a 10x10 block at top-left corner', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      fillRect(edited, 0, 0, 10, 10, 255, 255, 255);

      const result = detectEditRegions(original, edited, pixelBased);

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].x).toBe(0);
      expect(result.regions[0].y).toBe(0);
      expect(result.regions[0].width).toBe(10);
      expect(result.regions[0].height).toBe(10);
      expect(result.regions[0].centerX).toBe(5);
      expect(result.regions[0].centerY).toBe(5);
      expect(result.regions[0].pixelCount).toBe(100);
    });

    it('should detect a 10x10 block at bottom-right corner (90, 90)', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      fillRect(edited, 90, 90, 10, 10, 255, 255, 255);

      const result = detectEditRegions(original, edited, pixelBased);

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].x).toBe(90);
      expect(result.regions[0].y).toBe(90);
      expect(result.regions[0].width).toBe(10);
      expect(result.regions[0].height).toBe(10);
      expect(result.regions[0].centerX).toBe(95);
      expect(result.regions[0].centerY).toBe(95);
    });

    it('should detect a 20x30 block at position (40, 50)', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      fillRect(edited, 40, 50, 20, 30, 255, 0, 0);

      const result = detectEditRegions(original, edited, pixelBased);

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].x).toBe(40);
      expect(result.regions[0].y).toBe(50);
      expect(result.regions[0].width).toBe(20);
      expect(result.regions[0].height).toBe(30);
      expect(result.regions[0].centerX).toBe(50); // 40 + 20/2 = 50
      expect(result.regions[0].centerY).toBe(65); // 50 + 30/2 = 65
      expect(result.regions[0].pixelCount).toBe(600);
    });

    it('should detect two separate regions', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      // Region 1: top-left
      fillRect(edited, 5, 5, 10, 10, 255, 0, 0);
      // Region 2: bottom-right (well separated)
      fillRect(edited, 80, 80, 15, 15, 0, 255, 0);

      const result = detectEditRegions(original, edited, pixelBased);

      expect(result.regions).toHaveLength(2);

      // Regions are sorted by size (largest first)
      const larger = result.regions[0];
      const smaller = result.regions[1];

      expect(larger.pixelCount).toBe(225); // 15x15
      expect(larger.x).toBe(80);
      expect(larger.y).toBe(80);

      expect(smaller.pixelCount).toBe(100); // 10x10
      expect(smaller.x).toBe(5);
      expect(smaller.y).toBe(5);
    });

    it('should merge adjacent changed pixels into one region', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      // Create an L-shaped region
      fillRect(edited, 10, 10, 5, 20, 255, 255, 255); // Vertical bar
      fillRect(edited, 10, 25, 15, 5, 255, 255, 255); // Horizontal bar (overlaps)

      const result = detectEditRegions(original, edited, pixelBased);

      // Should be detected as ONE connected region
      expect(result.regions).toHaveLength(1);
    });

    it('should filter out regions smaller than minRegionSize', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      // Small region: 3x3 = 9 pixels
      fillRect(edited, 10, 10, 3, 3, 255, 255, 255);
      // Larger region: 5x5 = 25 pixels
      fillRect(edited, 80, 80, 5, 5, 255, 255, 255);

      const result = detectEditRegions(original, edited, { ...pixelBased, minRegionSize: 10 });

      // Only the larger region should be detected
      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].x).toBe(80);
      expect(result.regions[0].y).toBe(80);
    });

    it('should ignore changes below colorThreshold', () => {
      const original = createSolidImage(100, 100, 100, 100, 100);
      const edited = copyImage(original);
      // Small color change (only 10 difference, below default threshold of 30)
      fillRect(edited, 40, 40, 20, 20, 110, 110, 110);

      const result = detectEditRegions(original, edited, pixelBased);

      expect(result.regions).toHaveLength(0);
    });

    it('should detect changes above colorThreshold', () => {
      const original = createSolidImage(100, 100, 100, 100, 100);
      const edited = copyImage(original);
      // Larger color change (50 difference, above default threshold of 30)
      fillRect(edited, 40, 40, 20, 20, 150, 150, 150);

      const result = detectEditRegions(original, edited, pixelBased);

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].x).toBe(40);
      expect(result.regions[0].y).toBe(40);
    });

    it('should use custom colorThreshold', () => {
      const original = createSolidImage(100, 100, 100, 100, 100);
      const edited = copyImage(original);
      // Change of 20 in color
      fillRect(edited, 40, 40, 20, 20, 120, 120, 120);

      // With default threshold (30), should not detect
      const result1 = detectEditRegions(original, edited, pixelBased);
      expect(result1.regions).toHaveLength(0);

      // With lower threshold (10), should detect
      const result2 = detectEditRegions(original, edited, { ...pixelBased, colorThreshold: 10 });
      expect(result2.regions).toHaveLength(1);
    });

    it('should calculate correct percentChanged', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      // Change 1000 pixels (10% of 10000)
      fillRect(edited, 0, 0, 100, 10, 255, 255, 255);

      const result = detectEditRegions(original, edited, pixelBased);

      expect(result.totalChangedPixels).toBe(1000);
      expect(result.percentChanged).toBeCloseTo(10, 1);
    });

    it('should report image dimensions in result', () => {
      const original = createSolidImage(200, 150, 0, 0, 0);
      const edited = copyImage(original);

      const result = detectEditRegions(original, edited, pixelBased);

      expect(result.imageWidth).toBe(200);
      expect(result.imageHeight).toBe(150);
    });
  });

  describe('formatEditRegionsForPrompt', () => {
    it('should format empty regions', () => {
      const result: EditDetectionResult = {
        regions: [],
        totalChangedPixels: 0,
        percentChanged: 0,
        imageWidth: 100,
        imageHeight: 100,
      };

      const formatted = formatEditRegionsForPrompt(result);

      expect(formatted).toContain('No significant changes detected');
    });

    it('should format single region', () => {
      const result: EditDetectionResult = {
        regions: [{
          x: 40,
          y: 50,
          width: 20,
          height: 30,
          centerX: 50,
          centerY: 65,
          pixelCount: 600,
          avgColorDiff: 50,
          maxColorDiff: 128,
          significance: 75,
        }],
        totalChangedPixels: 600,
        percentChanged: 6,
        imageWidth: 100,
        imageHeight: 100,
      };

      const formatted = formatEditRegionsForPrompt(result);

      expect(formatted).toContain('DETECTED EDIT LOCATIONS');
      expect(formatted).toContain('(40, 50)');
      expect(formatted).toContain('(59, 79)'); // bottom-right: x + width - 1, y + height - 1
      expect(formatted).toContain('center: (50, 65)');
      expect(formatted).toContain('20x30');
      expect(formatted).toContain('600 pixels changed');
      expect(formatted).toContain('6.0%');
      expect(formatted).toContain('100x100');
    });

    it('should format multiple regions', () => {
      const result: EditDetectionResult = {
        regions: [
          { x: 0, y: 0, width: 10, height: 10, centerX: 5, centerY: 5, pixelCount: 100, avgColorDiff: 40, maxColorDiff: 100, significance: 60 },
          { x: 90, y: 90, width: 10, height: 10, centerX: 95, centerY: 95, pixelCount: 100, avgColorDiff: 45, maxColorDiff: 120, significance: 65 },
        ],
        totalChangedPixels: 200,
        percentChanged: 2,
        imageWidth: 100,
        imageHeight: 100,
      };

      const formatted = formatEditRegionsForPrompt(result);

      expect(formatted).toContain('1.');
      expect(formatted).toContain('2.');
      expect(formatted).toContain('(0, 0)');
      expect(formatted).toContain('(90, 90)');
    });
  });

  describe('block-based comparison', () => {
    /**
     * Helper to add scattered noise (simulates diffusion noise)
     * Only affects a fraction of pixels
     */
    function addScatteredNoise(
      img: ImageData,
      fraction: number,
      noiseAmount: number
    ): ImageData {
      const data = new Uint8ClampedArray(img.data);
      for (let i = 0; i < img.width * img.height; i++) {
        if (Math.random() < fraction) {
          const noise = Math.floor(Math.random() * noiseAmount * 2) - noiseAmount;
          data[i * 4] = Math.max(0, Math.min(255, data[i * 4] + noise));
          data[i * 4 + 1] = Math.max(0, Math.min(255, data[i * 4 + 1] + noise));
          data[i * 4 + 2] = Math.max(0, Math.min(255, data[i * 4 + 2] + noise));
        }
      }
      return { data, width: img.width, height: img.height, colorSpace: img.colorSpace } as ImageData;
    }

    it('should filter scattered diffusion-like noise', () => {
      const original = createSolidImage(100, 100, 128, 128, 128);
      // 10% of pixels changed by +-50 RGB - scattered, not concentrated
      const diffused = addScatteredNoise(original, 0.1, 50);

      // Block-based (default) should filter this out
      const result = detectEditRegions(original, diffused, {
        useBlockComparison: true,
        blockSize: 8,
        minBlockDensity: 0.25,
        minBlockCount: 2,
      });

      // Should have no significant regions (scattered noise filtered)
      expect(result.regions).toHaveLength(0);
    });

    it('should detect concentrated changes with block-based comparison', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      // 20x20 solid block - will fill multiple 8x8 blocks
      fillRect(edited, 40, 40, 20, 20, 255, 0, 0);

      const result = detectEditRegions(original, edited, {
        useBlockComparison: true,
        blockSize: 8,
        minBlockDensity: 0.25,
        minBlockCount: 2,
      });

      expect(result.regions.length).toBeGreaterThanOrEqual(1);
      // Region should approximately cover the changed area
      const region = result.regions[0];
      expect(region.x).toBeLessThanOrEqual(40);
      expect(region.y).toBeLessThanOrEqual(40);
    });

    it('should filter isolated single changed block with minBlockCount=2', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      // Change exactly one 8x8 block completely
      fillRect(edited, 40, 40, 8, 8, 255, 0, 0);

      const result = detectEditRegions(original, edited, {
        useBlockComparison: true,
        blockSize: 8,
        minBlockDensity: 0.25,
        minBlockCount: 2, // Require at least 2 connected blocks
      });

      // Single block should be filtered out
      expect(result.regions).toHaveLength(0);
    });

    it('should keep isolated single block with minBlockCount=1', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      // Change exactly one 8x8 block completely
      fillRect(edited, 40, 40, 8, 8, 255, 0, 0);

      const result = detectEditRegions(original, edited, {
        useBlockComparison: true,
        blockSize: 8,
        minBlockDensity: 0.25,
        minBlockCount: 1, // Allow single blocks
      });

      expect(result.regions.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect minBlockDensity threshold', () => {
      const original = createSolidImage(100, 100, 0, 0, 0);
      const edited = copyImage(original);
      // Change only 10 pixels in an 8x8 block (16% density)
      for (let i = 0; i < 10; i++) {
        setPixel(edited, 40 + (i % 4), 40 + Math.floor(i / 4), 255, 255, 255);
      }

      // With 25% density requirement, should not detect
      const result1 = detectEditRegions(original, edited, {
        useBlockComparison: true,
        blockSize: 8,
        minBlockDensity: 0.25,
        minBlockCount: 1,
      });
      expect(result1.regions).toHaveLength(0);

      // With 10% density requirement, should detect
      const result2 = detectEditRegions(original, edited, {
        useBlockComparison: true,
        blockSize: 8,
        minBlockDensity: 0.10,
        minBlockCount: 1,
      });
      expect(result2.regions.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle image dimensions not divisible by block size', () => {
      // 105x73 not divisible by 8
      const original = createSolidImage(105, 73, 128, 128, 128);
      const edited = copyImage(original);
      // Edit in the corner with edge blocks
      fillRect(edited, 95, 65, 10, 8, 255, 0, 0);

      const result = detectEditRegions(original, edited, {
        useBlockComparison: true,
        blockSize: 8,
        minBlockCount: 1,
      });

      expect(result.imageWidth).toBe(105);
      expect(result.imageHeight).toBe(73);
      expect(result.regions.length).toBeGreaterThanOrEqual(1);
    });

    it('pixel-based should detect more regions than block-based on scattered noise', () => {
      const original = createSolidImage(100, 100, 128, 128, 128);
      const noisy = addScatteredNoise(original, 0.15, 50);

      const pixelResult = detectEditRegions(original, noisy, {
        useBlockComparison: false,
        minRegionSize: 1,
      });

      const blockResult = detectEditRegions(original, noisy, {
        useBlockComparison: true,
        blockSize: 8,
        minBlockDensity: 0.25,
        minBlockCount: 2,
      });

      // Pixel-based should find many scattered regions
      // Block-based should filter most of them out
      expect(pixelResult.regions.length).toBeGreaterThan(blockResult.regions.length);
    });
  });

  describe('coordinate system verification', () => {
    it('should correctly identify X as horizontal (increases rightward)', () => {
      const original = createSolidImage(100, 50, 0, 0, 0);
      const edited = copyImage(original);
      // Change pixel at x=80 (right side), y=25 (middle vertically)
      setPixel(edited, 80, 25, 255, 255, 255);

      const result = detectEditRegions(original, edited, { ...pixelBased, minRegionSize: 1 });

      expect(result.regions[0].x).toBe(80);
      expect(result.regions[0].y).toBe(25);
    });

    it('should correctly identify Y as vertical (increases downward)', () => {
      const original = createSolidImage(50, 100, 0, 0, 0);
      const edited = copyImage(original);
      // Change pixel at x=25 (middle horizontally), y=80 (bottom area)
      setPixel(edited, 25, 80, 255, 255, 255);

      const result = detectEditRegions(original, edited, { ...pixelBased, minRegionSize: 1 });

      expect(result.regions[0].x).toBe(25);
      expect(result.regions[0].y).toBe(80);
    });

    it('should place (0,0) at top-left corner', () => {
      const original = createSolidImage(100, 100, 128, 128, 128);
      const edited = copyImage(original);
      // Fill a small rectangle at the very top-left
      fillRect(edited, 0, 0, 5, 5, 255, 0, 0);

      const result = detectEditRegions(original, edited, pixelBased);

      expect(result.regions[0].x).toBe(0);
      expect(result.regions[0].y).toBe(0);
    });
  });
});
