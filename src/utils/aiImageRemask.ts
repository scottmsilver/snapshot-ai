export interface SmartRemaskOptions {
  /** Max channel difference to treat a pixel as "new" outside the original mask. */
  diffThreshold?: number;
  /** Dilate the opaque mask so edges and slight outpaints are preserved. */
  dilationRadius?: number;
  /** Alpha threshold for treating a pixel as opaque in the original mask. */
  alphaThreshold?: number;
}

const DEFAULT_DIFF_THRESHOLD = 12;
const DEFAULT_DILATION_RADIUS = 2;
const DEFAULT_ALPHA_THRESHOLD = 8;

function buildDilatedMask(
  alphaData: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold: number,
  dilationRadius: number
): Uint8Array {
  const totalPixels = width * height;
  const baseMask = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i += 1) {
    const alpha = alphaData[i * 4 + 3];
    if (alpha > alphaThreshold) {
      baseMask[i] = 1;
    }
  }

  if (dilationRadius <= 0) {
    return baseMask;
  }

  const dilated = new Uint8Array(totalPixels);
  const radius = Math.floor(dilationRadius);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (baseMask[idx] === 0) continue;

      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          dilated[ny * width + nx] = 1;
        }
      }
    }
  }

  return dilated;
}

function maxChannelDiff(a: Uint8ClampedArray, b: Uint8ClampedArray, idx: number): number {
  const dr = Math.abs(a[idx] - b[idx]);
  const dg = Math.abs(a[idx + 1] - b[idx + 1]);
  const db = Math.abs(a[idx + 2] - b[idx + 2]);
  return Math.max(dr, dg, db);
}

export function applySmartTransparencyMask(
  result: ImageData,
  original: ImageData,
  alphaMask: ImageData,
  options: SmartRemaskOptions = {}
): ImageData {
  if (
    result.width !== original.width ||
    result.height !== original.height ||
    result.width !== alphaMask.width ||
    result.height !== alphaMask.height
  ) {
    return result;
  }

  const {
    diffThreshold = DEFAULT_DIFF_THRESHOLD,
    dilationRadius = DEFAULT_DILATION_RADIUS,
    alphaThreshold = DEFAULT_ALPHA_THRESHOLD,
  } = options;

  const mask = buildDilatedMask(alphaMask.data, result.width, result.height, alphaThreshold, dilationRadius);
  const output = new ImageData(new Uint8ClampedArray(result.data), result.width, result.height);
  const totalPixels = result.width * result.height;

  for (let i = 0; i < totalPixels; i += 1) {
    if (mask[i] === 1) continue;

    const idx = i * 4;
    const diff = maxChannelDiff(original.data, output.data, idx);

    if (diff > diffThreshold) {
      continue;
    }

    output.data[idx] = 0;
    output.data[idx + 1] = 0;
    output.data[idx + 2] = 0;
    output.data[idx + 3] = 0;
  }

  return output;
}
