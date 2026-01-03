/**
 * Image comparison service for detecting edit regions between two images.
 *
 * Coordinate system: (0,0) is top-left, X increases right, Y increases down.
 * This matches canvas coordinates and ImageData layout.
 */

/**
 * A detected region where edits occurred
 */
export interface EditRegion {
  x: number;           // Top-left X coordinate
  y: number;           // Top-left Y coordinate
  width: number;       // Width of bounding box
  height: number;      // Height of bounding box
  centerX: number;     // Center X coordinate
  centerY: number;     // Center Y coordinate
  pixelCount: number;  // Number of changed pixels in this region
}

/**
 * Result of edit detection
 */
export interface EditDetectionResult {
  regions: EditRegion[];
  totalChangedPixels: number;
  percentChanged: number;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Options for edit detection
 */
export interface EditDetectionOptions {
  /**
   * How different RGB values must be to count as "changed" (0-255).
   * Higher values ignore subtle changes. Default: 30
   */
  colorThreshold?: number;

  /**
   * Ignore regions smaller than this many pixels.
   * Helps filter noise. Default: 10
   */
  minRegionSize?: number;

  /**
   * Use block-based comparison (like video codecs) instead of per-pixel.
   * More robust against diffusion noise. Default: true
   */
  useBlockComparison?: boolean;

  /**
   * Size of blocks for block-based comparison. Default: 8
   */
  blockSize?: number;

  /**
   * Minimum fraction of pixels in a block that must be changed for the
   * block to be considered "changed". Range 0-1. Default: 0.25
   */
  minBlockDensity?: number;

  /**
   * Minimum number of connected changed blocks to form a region.
   * Helps filter isolated noisy blocks. Default: 2
   */
  minBlockCount?: number;
}

const DEFAULT_COLOR_THRESHOLD = 30;
const DEFAULT_MIN_REGION_SIZE = 10;
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_MIN_BLOCK_DENSITY = 0.25;
const DEFAULT_MIN_BLOCK_COUNT = 2;

/**
 * Compare two images and detect regions where edits occurred.
 *
 * @param original - The original image before editing
 * @param edited - The edited image after changes
 * @param options - Detection options
 * @returns EditDetectionResult with bounding boxes of changed regions
 * @throws Error if images have different dimensions
 */
export function detectEditRegions(
  original: ImageData,
  edited: ImageData,
  options: EditDetectionOptions = {}
): EditDetectionResult {
  const {
    colorThreshold = DEFAULT_COLOR_THRESHOLD,
    minRegionSize = DEFAULT_MIN_REGION_SIZE,
    useBlockComparison = true,
    blockSize = DEFAULT_BLOCK_SIZE,
    minBlockDensity = DEFAULT_MIN_BLOCK_DENSITY,
    minBlockCount = DEFAULT_MIN_BLOCK_COUNT,
  } = options;

  // Validate dimensions match
  if (original.width !== edited.width || original.height !== edited.height) {
    throw new Error(
      `Image dimensions must match. Original: ${original.width}x${original.height}, ` +
      `Edited: ${edited.width}x${edited.height}`
    );
  }

  if (useBlockComparison) {
    return detectEditRegionsBlockBased(
      original,
      edited,
      colorThreshold,
      blockSize,
      minBlockDensity,
      minBlockCount
    );
  }

  return detectEditRegionsPixelBased(
    original,
    edited,
    colorThreshold,
    minRegionSize
  );
}

/**
 * Block-based comparison (like video codecs).
 * More robust against diffusion noise.
 */
function detectEditRegionsBlockBased(
  original: ImageData,
  edited: ImageData,
  colorThreshold: number,
  blockSize: number,
  minBlockDensity: number,
  minBlockCount: number
): EditDetectionResult {
  const width = original.width;
  const height = original.height;
  const totalPixels = width * height;

  // Calculate block grid dimensions
  const blocksX = Math.ceil(width / blockSize);
  const blocksY = Math.ceil(height / blockSize);
  const totalBlocks = blocksX * blocksY;

  // Step 1: For each block, calculate change density
  const blockChangedMask = new Uint8Array(totalBlocks);
  let totalChangedPixels = 0;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // Calculate block bounds (handle edge blocks that may be smaller)
      const startX = bx * blockSize;
      const startY = by * blockSize;
      const endX = Math.min(startX + blockSize, width);
      const endY = Math.min(startY + blockSize, height);
      const blockPixelCount = (endX - startX) * (endY - startY);

      // Count changed pixels in this block
      let changedInBlock = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;

          const rDiff = Math.abs(original.data[idx] - edited.data[idx]);
          const gDiff = Math.abs(original.data[idx + 1] - edited.data[idx + 1]);
          const bDiff = Math.abs(original.data[idx + 2] - edited.data[idx + 2]);

          if (rDiff > colorThreshold || gDiff > colorThreshold || bDiff > colorThreshold) {
            changedInBlock++;
            totalChangedPixels++;
          }
        }
      }

      // Block is "changed" if density exceeds threshold
      const density = changedInBlock / blockPixelCount;
      if (density >= minBlockDensity) {
        blockChangedMask[by * blocksX + bx] = 1;
      }
    }
  }

  // Step 2: Find connected components of changed blocks
  const visited = new Uint8Array(totalBlocks);
  const regions: EditRegion[] = [];

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const blockIdx = by * blocksX + bx;

      if (blockChangedMask[blockIdx] === 1 && visited[blockIdx] === 0) {
        // Found a new region - flood fill to find all connected blocks
        const regionBlocks = floodFillBlocks(
          blockChangedMask,
          visited,
          blocksX,
          blocksY,
          bx,
          by
        );

        if (regionBlocks.length >= minBlockCount) {
          // Convert block coordinates to pixel coordinates
          const region = computeBoundingBoxFromBlocks(
            regionBlocks,
            blockSize,
            width,
            height
          );
          regions.push(region);
        }
      }
    }
  }

  // Sort regions by size (largest first)
  regions.sort((a, b) => b.pixelCount - a.pixelCount);

  return {
    regions,
    totalChangedPixels,
    percentChanged: (totalChangedPixels / totalPixels) * 100,
    imageWidth: width,
    imageHeight: height,
  };
}

/**
 * Original pixel-based comparison.
 * More sensitive but also more susceptible to noise.
 */
function detectEditRegionsPixelBased(
  original: ImageData,
  edited: ImageData,
  colorThreshold: number,
  minRegionSize: number
): EditDetectionResult {
  const width = original.width;
  const height = original.height;
  const totalPixels = width * height;

  // Step 1: Create a binary mask of changed pixels
  const changedMask = new Uint8Array(totalPixels);
  let totalChangedPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Compare RGB values (ignore alpha)
      const rDiff = Math.abs(original.data[idx] - edited.data[idx]);
      const gDiff = Math.abs(original.data[idx + 1] - edited.data[idx + 1]);
      const bDiff = Math.abs(original.data[idx + 2] - edited.data[idx + 2]);

      // Consider changed if any channel differs beyond threshold
      if (rDiff > colorThreshold || gDiff > colorThreshold || bDiff > colorThreshold) {
        changedMask[y * width + x] = 1;
        totalChangedPixels++;
      }
    }
  }

  // Step 2: Find connected components (regions) using flood fill
  const visited = new Uint8Array(totalPixels);
  const regions: EditRegion[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const maskIdx = y * width + x;

      if (changedMask[maskIdx] === 1 && visited[maskIdx] === 0) {
        // Found a new region - flood fill to find all connected pixels
        const regionPixels = floodFill(changedMask, visited, width, height, x, y);

        if (regionPixels.length >= minRegionSize) {
          const region = computeBoundingBox(regionPixels);
          regions.push(region);
        }
      }
    }
  }

  // Sort regions by size (largest first)
  regions.sort((a, b) => b.pixelCount - a.pixelCount);

  return {
    regions,
    totalChangedPixels,
    percentChanged: (totalChangedPixels / totalPixels) * 100,
    imageWidth: width,
    imageHeight: height,
  };
}

/**
 * Flood fill to find all connected changed blocks.
 * Uses 4-connectivity (up, down, left, right).
 */
function floodFillBlocks(
  changedMask: Uint8Array,
  visited: Uint8Array,
  blocksX: number,
  blocksY: number,
  startBx: number,
  startBy: number
): Array<{ bx: number; by: number }> {
  const blocks: Array<{ bx: number; by: number }> = [];
  const stack: Array<{ bx: number; by: number }> = [{ bx: startBx, by: startBy }];

  while (stack.length > 0) {
    const { bx, by } = stack.pop()!;
    const idx = by * blocksX + bx;

    // Skip if out of bounds, not changed, or already visited
    if (bx < 0 || bx >= blocksX || by < 0 || by >= blocksY) continue;
    if (changedMask[idx] !== 1 || visited[idx] === 1) continue;

    // Mark as visited and add to region
    visited[idx] = 1;
    blocks.push({ bx, by });

    // Add neighbors (4-connectivity)
    stack.push({ bx: bx + 1, by });
    stack.push({ bx: bx - 1, by });
    stack.push({ bx, by: by + 1 });
    stack.push({ bx, by: by - 1 });
  }

  return blocks;
}

/**
 * Compute bounding box from a list of blocks, converting to pixel coordinates.
 */
function computeBoundingBoxFromBlocks(
  blocks: Array<{ bx: number; by: number }>,
  blockSize: number,
  imageWidth: number,
  imageHeight: number
): EditRegion {
  let minBx = Infinity;
  let minBy = Infinity;
  let maxBx = -Infinity;
  let maxBy = -Infinity;

  for (const { bx, by } of blocks) {
    if (bx < minBx) minBx = bx;
    if (bx > maxBx) maxBx = bx;
    if (by < minBy) minBy = by;
    if (by > maxBy) maxBy = by;
  }

  // Convert to pixel coordinates
  const x = minBx * blockSize;
  const y = minBy * blockSize;
  // Handle edge blocks - don't exceed image bounds
  const rightEdge = Math.min((maxBx + 1) * blockSize, imageWidth);
  const bottomEdge = Math.min((maxBy + 1) * blockSize, imageHeight);
  const width = rightEdge - x;
  const height = bottomEdge - y;

  // Estimate pixel count based on block count (not exact but useful)
  const pixelCount = blocks.length * blockSize * blockSize;

  return {
    x,
    y,
    width,
    height,
    centerX: Math.round(x + width / 2),
    centerY: Math.round(y + height / 2),
    pixelCount,
  };
}

/**
 * Flood fill to find all connected changed pixels starting from (startX, startY).
 * Uses 4-connectivity (up, down, left, right).
 */
function floodFill(
  changedMask: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number
): Array<{ x: number; y: number }> {
  const pixels: Array<{ x: number; y: number }> = [];
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const idx = y * width + x;

    // Skip if out of bounds, not changed, or already visited
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (changedMask[idx] !== 1 || visited[idx] === 1) continue;

    // Mark as visited and add to region
    visited[idx] = 1;
    pixels.push({ x, y });

    // Add neighbors (4-connectivity)
    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }

  return pixels;
}

/**
 * Compute bounding box from a list of pixels
 */
function computeBoundingBox(pixels: Array<{ x: number; y: number }>): EditRegion {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const { x, y } of pixels) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  // Center is the midpoint between min and max (inclusive pixel coordinates)
  // For a 1x1 region at (5,5): center = (5+5)/2 = 5
  // For a 10x10 region at (0,0) to (9,9): center = (0+9)/2 = 4.5 → rounds to 5
  return {
    x: minX,
    y: minY,
    width,
    height,
    centerX: Math.round((minX + maxX) / 2),
    centerY: Math.round((minY + maxY) / 2),
    pixelCount: pixels.length,
  };
}

/**
 * Format edit detection result as a string for inclusion in prompts
 */
export function formatEditRegionsForPrompt(result: EditDetectionResult): string {
  if (result.regions.length === 0) {
    return 'DETECTED EDIT LOCATIONS: No significant changes detected between images.';
  }

  const regionDescriptions = result.regions.map((r, i) => {
    const topLeft = `(${r.x}, ${r.y})`;
    const bottomRight = `(${r.x + r.width - 1}, ${r.y + r.height - 1})`;
    const center = `(${r.centerX}, ${r.centerY})`;
    const size = `${r.width}x${r.height}`;
    return `  ${i + 1}. Region from ${topLeft} to ${bottomRight}, center: ${center}, size: ${size}, ${r.pixelCount} pixels changed`;
  });

  return `DETECTED EDIT LOCATIONS:
${regionDescriptions.join('\n')}

Total: ${result.totalChangedPixels} pixels changed (${result.percentChanged.toFixed(1)}% of image)
Image dimensions: ${result.imageWidth}x${result.imageHeight}`;
}
