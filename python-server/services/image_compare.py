"""
Image comparison service for detecting edit regions between two images.

Coordinate system: (0,0) is top-left, X increases right, Y increases down.
This matches standard image coordinates and numpy array layout.

Ported from TypeScript imageCompareService.ts with NumPy optimizations.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import numpy as np
from numpy.typing import NDArray


@dataclass
class EditRegion:
    """A detected region where edits occurred."""

    x: int  # Top-left X coordinate
    y: int  # Top-left Y coordinate
    width: int  # Width of bounding box
    height: int  # Height of bounding box
    center_x: int  # Center X coordinate
    center_y: int  # Center Y coordinate
    pixel_count: int  # Number of changed pixels in this region
    avg_color_diff: float  # Average color difference across changed pixels
    max_color_diff: float  # Maximum color difference found in this region
    significance: int  # Perceptual significance score (0-100)


@dataclass
class EditDetectionResult:
    """Result of edit detection."""

    regions: list[EditRegion]
    total_changed_pixels: int
    percent_changed: float
    image_width: int
    image_height: int


@dataclass
class EditDetectionOptions:
    """Options for edit detection."""

    color_threshold: float = 12.0
    """How different colors must be to count as 'changed'.
    For Delta E, this is approximately 0-100. Higher values ignore subtle changes."""

    min_region_size: int = 10
    """Ignore regions smaller than this many pixels. Helps filter noise."""

    use_block_comparison: bool = True
    """Use block-based comparison (like video codecs) instead of per-pixel.
    More robust against diffusion noise."""

    block_size: int = 8
    """Size of blocks for block-based comparison."""

    min_block_density: float = 0.25
    """Minimum fraction of pixels in a block that must be changed for the
    block to be considered 'changed'. Range 0-1."""

    min_block_count: int = 2
    """Minimum number of connected changed blocks to form a region.
    Helps filter isolated noisy blocks."""


# Pre-compute sRGB to linear lookup table for performance
_SRGB_TO_LINEAR = np.array(
    [(c / 255 / 12.92) if (c / 255) <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4 for c in range(256)],
    dtype=np.float32,
)


def _lab_f(t: NDArray[np.float32]) -> NDArray[np.float32]:
    """Lab color space transfer function."""
    result = np.empty_like(t)
    mask = t > 0.008856
    result[mask] = np.cbrt(t[mask])
    result[~mask] = (7.787 * t[~mask]) + (16 / 116)
    return result


def _rgb_to_lab(rgb: NDArray[np.uint8]) -> NDArray[np.float32]:
    """
    Convert RGB image to LAB color space.

    Args:
        rgb: Image array of shape (H, W, 3) with uint8 values

    Returns:
        LAB array of shape (H, W, 3) with float32 values
    """
    # Convert sRGB to linear RGB using lookup table
    linear = _SRGB_TO_LINEAR[rgb]

    # Extract channels
    r_lin = linear[..., 0]
    g_lin = linear[..., 1]
    b_lin = linear[..., 2]

    # Convert to XYZ (D65 reference white)
    x = (r_lin * 0.4124 + g_lin * 0.3576 + b_lin * 0.1805) / 0.95047
    y = r_lin * 0.2126 + g_lin * 0.7152 + b_lin * 0.0722  # Already normalized to 1.0
    z = (r_lin * 0.0193 + g_lin * 0.1192 + b_lin * 0.9505) / 1.08883

    # Convert to Lab
    fx = _lab_f(x)
    fy = _lab_f(y)
    fz = _lab_f(z)

    L = (116 * fy) - 16
    a = 500 * (fx - fy)
    b = 200 * (fy - fz)

    return np.stack([L, a, b], axis=-1)


def compute_delta_e(img1: NDArray[np.uint8], img2: NDArray[np.uint8]) -> NDArray[np.float32]:
    """
    Compute Delta E (CIE76) color difference between two images.

    Args:
        img1: First image array of shape (H, W, 3) with uint8 RGB values
        img2: Second image array of shape (H, W, 3) with uint8 RGB values

    Returns:
        Array of shape (H, W) with Delta E values (0 = identical, ~100+ = very different)
    """
    lab1 = _rgb_to_lab(img1)
    lab2 = _rgb_to_lab(img2)

    # Euclidean distance in Lab space
    diff = lab1 - lab2
    delta_e = np.sqrt(np.sum(diff**2, axis=-1))

    return delta_e.astype(np.float32)


def _flood_fill_blocks(
    changed_mask: NDArray[np.uint8],
    visited: NDArray[np.uint8],
    blocks_x: int,
    blocks_y: int,
    start_bx: int,
    start_by: int,
) -> list[tuple[int, int]]:
    """
    Flood fill to find all connected changed blocks.
    Uses 4-connectivity (up, down, left, right).
    """
    blocks: list[tuple[int, int]] = []
    stack: list[tuple[int, int]] = [(start_bx, start_by)]

    while stack:
        bx, by = stack.pop()

        # Skip if out of bounds
        if bx < 0 or bx >= blocks_x or by < 0 or by >= blocks_y:
            continue

        idx = by * blocks_x + bx

        # Skip if not changed or already visited
        if changed_mask[idx] != 1 or visited[idx] == 1:
            continue

        # Mark as visited and add to region
        visited[idx] = 1
        blocks.append((bx, by))

        # Add neighbors (4-connectivity)
        stack.append((bx + 1, by))
        stack.append((bx - 1, by))
        stack.append((bx, by + 1))
        stack.append((bx, by - 1))

    return blocks


def _flood_fill_pixels(
    changed_mask: NDArray[np.uint8],
    visited: NDArray[np.uint8],
    width: int,
    height: int,
    start_x: int,
    start_y: int,
) -> list[tuple[int, int]]:
    """
    Flood fill to find all connected changed pixels.
    Uses 4-connectivity (up, down, left, right).
    """
    pixels: list[tuple[int, int]] = []
    stack: list[tuple[int, int]] = [(start_x, start_y)]

    while stack:
        x, y = stack.pop()

        # Skip if out of bounds
        if x < 0 or x >= width or y < 0 or y >= height:
            continue

        idx = y * width + x

        # Skip if not changed or already visited
        if changed_mask[idx] != 1 or visited[idx] == 1:
            continue

        # Mark as visited and add to region
        visited[idx] = 1
        pixels.append((x, y))

        # Add neighbors (4-connectivity)
        stack.append((x + 1, y))
        stack.append((x - 1, y))
        stack.append((x, y + 1))
        stack.append((x, y - 1))

    return pixels


def _compute_significance(area: int, avg_color_diff: float, pixel_count: int) -> int:
    """
    Calculate significance score (0-100).
    Combines: region size (area), color intensity, and pixel density.
    Weighted: 40% size, 40% intensity, 20% density.
    """
    area_normalized = min(area / 10000, 1.0)  # Normalize to ~100x100 being "full"
    intensity_normalized = avg_color_diff / 100.0  # Delta E roughly 0-100
    density_normalized = pixel_count / area if area > 0 else 0

    significance = (area_normalized * 0.4 + intensity_normalized * 0.4 + density_normalized * 0.2) * 100

    return round(min(significance, 100))


def _detect_block_based(
    delta_e: NDArray[np.float32],
    color_threshold: float,
    block_size: int,
    min_block_density: float,
    min_block_count: int,
) -> EditDetectionResult:
    """
    Block-based comparison (like video codecs).
    More robust against diffusion noise.
    """
    height, width = delta_e.shape
    total_pixels = width * height

    # Calculate block grid dimensions
    blocks_x = math.ceil(width / block_size)
    blocks_y = math.ceil(height / block_size)
    total_blocks = blocks_x * blocks_y

    # Create mask of changed pixels
    changed_pixels = delta_e > color_threshold
    total_changed_pixels = int(np.sum(changed_pixels))

    # For each block, calculate change density and stats
    block_changed_mask = np.zeros(total_blocks, dtype=np.uint8)
    block_stats: list[dict] = []

    for by in range(blocks_y):
        for bx in range(blocks_x):
            block_idx = by * blocks_x + bx

            # Calculate block bounds (handle edge blocks)
            start_x = bx * block_size
            start_y = by * block_size
            end_x = min(start_x + block_size, width)
            end_y = min(start_y + block_size, height)

            # Extract block data
            block_changed = changed_pixels[start_y:end_y, start_x:end_x]
            block_delta_e = delta_e[start_y:end_y, start_x:end_x]

            block_pixel_count = block_changed.size
            changed_in_block = int(np.sum(block_changed))

            # Calculate stats for changed pixels in this block
            if changed_in_block > 0:
                changed_diffs = block_delta_e[block_changed]
                total_color_diff = float(np.sum(changed_diffs))
                max_color_diff = float(np.max(changed_diffs))
            else:
                total_color_diff = 0.0
                max_color_diff = 0.0

            # Block is "changed" if density exceeds threshold
            density = changed_in_block / block_pixel_count
            is_changed = density >= min_block_density

            block_stats.append(
                {
                    "changed": is_changed,
                    "changed_pixel_count": changed_in_block,
                    "total_color_diff": total_color_diff,
                    "max_color_diff": max_color_diff,
                }
            )

            if is_changed:
                block_changed_mask[block_idx] = 1

    # Find connected components of changed blocks
    visited = np.zeros(total_blocks, dtype=np.uint8)
    regions: list[EditRegion] = []

    for by in range(blocks_y):
        for bx in range(blocks_x):
            block_idx = by * blocks_x + bx

            if block_changed_mask[block_idx] == 1 and visited[block_idx] == 0:
                # Found a new region - flood fill
                region_blocks = _flood_fill_blocks(block_changed_mask, visited, blocks_x, blocks_y, bx, by)

                if len(region_blocks) >= min_block_count:
                    # Convert block coordinates to pixel coordinates
                    region = _compute_region_from_blocks(
                        region_blocks,
                        block_size,
                        block_stats,
                        blocks_x,
                        width,
                        height,
                    )
                    regions.append(region)

    # Sort by significance (most significant first)
    regions.sort(key=lambda r: r.significance, reverse=True)

    return EditDetectionResult(
        regions=regions,
        total_changed_pixels=total_changed_pixels,
        percent_changed=(total_changed_pixels / total_pixels) * 100,
        image_width=width,
        image_height=height,
    )


def _compute_region_from_blocks(
    blocks: list[tuple[int, int]],
    block_size: int,
    block_stats: list[dict],
    blocks_x: int,
    image_width: int,
    image_height: int,
) -> EditRegion:
    """Compute bounding box from blocks, converting to pixel coordinates."""
    min_bx = min(b[0] for b in blocks)
    max_bx = max(b[0] for b in blocks)
    min_by = min(b[1] for b in blocks)
    max_by = max(b[1] for b in blocks)

    # Aggregate color difference stats
    total_color_diff = 0.0
    total_changed_pixels = 0
    max_color_diff = 0.0

    for bx, by in blocks:
        block_idx = by * blocks_x + bx
        stats = block_stats[block_idx]
        total_color_diff += stats["total_color_diff"]
        total_changed_pixels += stats["changed_pixel_count"]
        max_color_diff = max(max_color_diff, stats["max_color_diff"])

    # Convert to pixel coordinates
    x = min_bx * block_size
    y = min_by * block_size
    right_edge = min((max_bx + 1) * block_size, image_width)
    bottom_edge = min((max_by + 1) * block_size, image_height)
    width = right_edge - x
    height = bottom_edge - y

    avg_color_diff = total_color_diff / total_changed_pixels if total_changed_pixels > 0 else 0

    area = width * height
    significance = _compute_significance(area, avg_color_diff, total_changed_pixels)

    return EditRegion(
        x=x,
        y=y,
        width=width,
        height=height,
        center_x=round(x + width / 2),
        center_y=round(y + height / 2),
        pixel_count=total_changed_pixels,
        avg_color_diff=round(avg_color_diff, 1),
        max_color_diff=round(max_color_diff, 1),
        significance=significance,
    )


def _detect_pixel_based(
    delta_e: NDArray[np.float32],
    color_threshold: float,
    min_region_size: int,
) -> EditDetectionResult:
    """
    Original pixel-based comparison.
    More sensitive but also more susceptible to noise.
    """
    height, width = delta_e.shape
    total_pixels = width * height

    # Create mask of changed pixels
    changed_mask = (delta_e > color_threshold).astype(np.uint8).flatten()
    total_changed_pixels = int(np.sum(changed_mask))

    # Find connected components
    visited = np.zeros(total_pixels, dtype=np.uint8)
    regions: list[EditRegion] = []

    for y in range(height):
        for x in range(width):
            idx = y * width + x

            if changed_mask[idx] == 1 and visited[idx] == 0:
                # Found a new region - flood fill
                region_pixels = _flood_fill_pixels(changed_mask, visited, width, height, x, y)

                if len(region_pixels) >= min_region_size:
                    region = _compute_region_from_pixels(region_pixels, delta_e)
                    regions.append(region)

    # Sort by significance (most significant first)
    regions.sort(key=lambda r: r.significance, reverse=True)

    return EditDetectionResult(
        regions=regions,
        total_changed_pixels=total_changed_pixels,
        percent_changed=(total_changed_pixels / total_pixels) * 100,
        image_width=width,
        image_height=height,
    )


def _compute_region_from_pixels(
    pixels: list[tuple[int, int]],
    delta_e: NDArray[np.float32],
) -> EditRegion:
    """Compute bounding box and stats from pixel coordinates."""
    xs = [p[0] for p in pixels]
    ys = [p[1] for p in pixels]

    min_x = min(xs)
    max_x = max(xs)
    min_y = min(ys)
    max_y = max(ys)

    # Aggregate color difference stats
    total_color_diff = 0.0
    max_color_diff = 0.0
    for x, y in pixels:
        diff = delta_e[y, x]
        total_color_diff += diff
        max_color_diff = max(max_color_diff, diff)

    width = max_x - min_x + 1
    height = max_y - min_y + 1

    avg_color_diff = total_color_diff / len(pixels) if pixels else 0

    area = width * height
    significance = _compute_significance(area, avg_color_diff, len(pixels))

    return EditRegion(
        x=min_x,
        y=min_y,
        width=width,
        height=height,
        center_x=round((min_x + max_x) / 2),
        center_y=round((min_y + max_y) / 2),
        pixel_count=len(pixels),
        avg_color_diff=round(avg_color_diff, 1),
        max_color_diff=round(max_color_diff, 1),
        significance=significance,
    )


def detect_edit_regions(
    original: NDArray[np.uint8],
    edited: NDArray[np.uint8],
    options: EditDetectionOptions | None = None,
) -> EditDetectionResult:
    """
    Compare two images and detect regions where edits occurred.

    Args:
        original: Original image as numpy array (H, W, 3) RGB uint8
        edited: Edited image as numpy array (H, W, 3) RGB uint8
        options: Detection options

    Returns:
        EditDetectionResult with bounding boxes of changed regions

    Note:
        If images have different dimensions, the edited image is resized
        to match the original using high-quality LANCZOS resampling.
    """
    if options is None:
        options = EditDetectionOptions()

    # Resize edited image to match original if dimensions differ
    # This can happen when Gemini returns images at different resolutions
    if original.shape[:2] != edited.shape[:2]:
        from PIL import Image

        edited_pil = Image.fromarray(edited)
        # Resize to match original dimensions (width, height for PIL)
        edited_pil = edited_pil.resize(
            (original.shape[1], original.shape[0]),
            Image.Resampling.LANCZOS,
        )
        edited = np.array(edited_pil, dtype=np.uint8)

    # Ensure we have RGB images (3 channels)
    if len(original.shape) != 3 or original.shape[2] < 3:
        raise ValueError(f"Expected RGB image with shape (H, W, 3), got {original.shape}")

    # Use only RGB channels (ignore alpha if present)
    original_rgb = original[..., :3]
    edited_rgb = edited[..., :3]

    # Compute Delta E color difference
    delta_e = compute_delta_e(original_rgb, edited_rgb)

    if options.use_block_comparison:
        return _detect_block_based(
            delta_e,
            options.color_threshold,
            options.block_size,
            options.min_block_density,
            options.min_block_count,
        )
    else:
        return _detect_pixel_based(
            delta_e,
            options.color_threshold,
            options.min_region_size,
        )


def format_edit_regions_for_prompt(result: EditDetectionResult) -> str:
    """Format edit detection result as a string for inclusion in prompts."""
    if not result.regions:
        return "DETECTED EDIT LOCATIONS: No significant changes detected between images."

    region_descriptions = []
    for i, r in enumerate(result.regions, 1):
        top_left = f"({r.x}, {r.y})"
        bottom_right = f"({r.x + r.width - 1}, {r.y + r.height - 1})"
        center = f"({r.center_x}, {r.center_y})"
        size = f"{r.width}x{r.height}"
        intensity = f"avg={r.avg_color_diff}, max={r.max_color_diff}"
        region_descriptions.append(
            f"  {i}. Region from {top_left} to {bottom_right}, center: {center}, "
            f"size: {size}, {r.pixel_count} pixels changed, intensity: {intensity}, "
            f"significance: {r.significance}/100"
        )

    return f"""DETECTED EDIT LOCATIONS (sorted by significance):
{chr(10).join(region_descriptions)}

Total: {result.total_changed_pixels} pixels changed ({result.percent_changed:.1f}% of image)
Image dimensions: {result.image_width}x{result.image_height}"""
