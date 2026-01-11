"""
LPIPS-based image comparison for detecting edit regions.

Uses Learned Perceptual Image Patch Similarity (LPIPS) to detect
where edits occurred between original and AI-edited images.

LPIPS is specifically designed to distinguish intentional changes
from imperceptible diffusion noise, making it ideal for AI-generated
image comparison.

Coordinate system: (0,0) is top-left, X increases right, Y increases down.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.interpolate import griddata

logger = logging.getLogger(__name__)

# Lazy import torch/lpips to avoid slow startup
_lpips_model = None


def _get_lpips_model():
    """Lazy-load the LPIPS model."""
    global _lpips_model
    if _lpips_model is None:
        import lpips

        # Use AlexNet for speed (VGG is more accurate but slower)
        _lpips_model = lpips.LPIPS(net="alex", verbose=False)
        logger.info("LPIPS model loaded (AlexNet backend)")
    return _lpips_model


@dataclass
class EditRegionPolygon:
    """A detected edit region with polygon boundary."""

    polygon: list[tuple[int, int]]  # Contour points (simplified)
    bounding_box: tuple[int, int, int, int]  # x, y, w, h
    center: tuple[int, int]  # Centroid
    area: int  # Area in pixels
    significance: float  # 0-100 based on LPIPS score


@dataclass
class LPIPSDetectionResult:
    """Result of LPIPS-based edit detection."""

    regions: list[EditRegionPolygon]
    total_changed_area: int
    percent_changed: float
    image_width: int
    image_height: int


@dataclass
class LPIPSDetectionOptions:
    """Options for LPIPS-based edit detection."""

    threshold: float = 0.1
    """LPIPS threshold (0-1). Higher = more permissive (ignore smaller differences)."""

    min_area: int = 100
    """Minimum contour area in pixels to consider as an edit region."""

    patch_size: int = 64
    """Size of patches for LPIPS computation."""

    stride: int = 32
    """Stride between patches. Smaller = more accurate but slower."""

    morphology_kernel_size: int = 5
    """Size of morphological kernel for noise removal."""


def compute_lpips_heatmap(
    original: NDArray[np.uint8],
    edited: NDArray[np.uint8],
    patch_size: int = 64,
    stride: int = 32,
) -> NDArray[np.float32]:
    """
    Compute per-patch LPIPS scores and interpolate to a full-resolution heatmap.

    Args:
        original: Original image (H, W, 3) RGB uint8
        edited: Edited image (H, W, 3) RGB uint8
        patch_size: Size of patches for LPIPS
        stride: Stride between patches

    Returns:
        Heatmap of shape (H, W) with LPIPS scores (0 = identical, higher = more different)
    """
    import torch

    H, W = original.shape[:2]

    # LPIPS (AlexNet) requires minimum patch size of 64x64 due to pooling layers
    MIN_PATCH_SIZE = 64
    if patch_size < MIN_PATCH_SIZE:
        patch_size = MIN_PATCH_SIZE
        stride = max(stride, patch_size // 2)

    # Check if image is large enough for at least one patch
    if H < MIN_PATCH_SIZE or W < MIN_PATCH_SIZE:
        logger.warning(
            "Image too small for LPIPS (%dx%d, need at least %dx%d). Returning zeros.",
            W,
            H,
            MIN_PATCH_SIZE,
            MIN_PATCH_SIZE,
        )
        return np.zeros((H, W), dtype=np.float32)

    loss_fn = _get_lpips_model()

    # Convert to torch tensors in [-1, 1] range
    # LPIPS expects (N, C, H, W) format
    orig_t = torch.from_numpy(original.copy()).permute(2, 0, 1).float() / 127.5 - 1
    edit_t = torch.from_numpy(edited.copy()).permute(2, 0, 1).float() / 127.5 - 1

    scores = []
    positions = []

    # Compute LPIPS for each patch
    for y in range(0, H - patch_size + 1, stride):
        for x in range(0, W - patch_size + 1, stride):
            p1 = orig_t[:, y : y + patch_size, x : x + patch_size].unsqueeze(0)
            p2 = edit_t[:, y : y + patch_size, x : x + patch_size].unsqueeze(0)

            with torch.no_grad():
                score = loss_fn(p1, p2).item()

            scores.append(score)
            # Store center position of patch
            positions.append((x + patch_size // 2, y + patch_size // 2))

    if not scores:
        # Image too small for patches
        return np.zeros((H, W), dtype=np.float32)

    # Interpolate sparse scores to full resolution heatmap
    positions = np.array(positions)
    scores = np.array(scores)

    # Create grid for interpolation
    grid_x, grid_y = np.meshgrid(np.arange(W), np.arange(H))

    # Choose interpolation method based on number of points
    # Cubic requires at least 4 non-collinear points
    if len(scores) == 1:
        # Single point - fill entire heatmap with that score
        heatmap = np.full((H, W), scores[0], dtype=np.float32)
    elif len(scores) < 4:
        # Too few points for cubic - use nearest neighbor
        heatmap = griddata(positions, scores, (grid_x, grid_y), method="nearest", fill_value=0.0)
    else:
        # Enough points for smooth interpolation
        heatmap = griddata(positions, scores, (grid_x, grid_y), method="cubic", fill_value=0.0)

    # Handle NaN values from interpolation
    heatmap = np.nan_to_num(heatmap, nan=0.0)

    return heatmap.astype(np.float32)


def detect_edit_regions_lpips(
    original: NDArray[np.uint8],
    edited: NDArray[np.uint8],
    options: LPIPSDetectionOptions | None = None,
) -> LPIPSDetectionResult:
    """
    Detect edit regions using LPIPS perceptual similarity.

    This approach is specifically designed for AI-generated images:
    - Uses neural network features instead of raw pixels
    - Robust to diffusion noise and minor variations
    - Detects perceptually significant changes

    Args:
        original: Original image as numpy array (H, W, 3) RGB uint8
        edited: Edited image as numpy array (H, W, 3) RGB uint8
        options: Detection options

    Returns:
        LPIPSDetectionResult with polygon regions where edits were detected

    Note:
        If images have different dimensions, the edited image is resized
        to match the original using high-quality LANCZOS resampling.
    """
    if options is None:
        options = LPIPSDetectionOptions()

    # Resize edited image to match original if dimensions differ
    if original.shape[:2] != edited.shape[:2]:
        from PIL import Image

        edited_pil = Image.fromarray(edited)
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

    H, W = original_rgb.shape[:2]

    logger.info("Computing LPIPS heatmap for %dx%d image...", W, H)

    # 1. Compute LPIPS heatmap
    heatmap = compute_lpips_heatmap(
        original_rgb,
        edited_rgb,
        patch_size=options.patch_size,
        stride=options.stride,
    )

    logger.info(
        "LPIPS heatmap stats: min=%.3f, max=%.3f, mean=%.3f",
        float(np.min(heatmap)),
        float(np.max(heatmap)),
        float(np.mean(heatmap)),
    )

    # 2. Threshold to binary mask
    binary = (heatmap > options.threshold).astype(np.uint8) * 255

    # 3. Morphological operations to clean up noise
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (options.morphology_kernel_size, options.morphology_kernel_size),
    )
    # Opening removes small noise spots
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    # Closing fills small holes
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    # 4. Find contours
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    logger.info("Found %d raw contours", len(contours))

    # 5. Convert contours to EditRegionPolygon objects
    regions: list[EditRegionPolygon] = []

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < options.min_area:
            continue

        # Simplify polygon using Douglas-Peucker algorithm
        epsilon = 0.02 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        # Get bounding box
        x, y, w, h = cv2.boundingRect(contour)

        # Calculate centroid
        M = cv2.moments(contour)
        if M["m00"] > 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
        else:
            cx = x + w // 2
            cy = y + h // 2

        # Calculate significance from LPIPS values within the contour
        mask = np.zeros(heatmap.shape, dtype=np.uint8)
        cv2.drawContours(mask, [contour], -1, 1, -1)
        region_lpips = heatmap[mask == 1]

        if len(region_lpips) > 0:
            # Scale to 0-100 (LPIPS values are typically 0-1)
            significance = float(np.mean(region_lpips)) * 100
        else:
            significance = 0.0

        # Convert contour points to list of tuples
        polygon = [(int(p[0][0]), int(p[0][1])) for p in approx]

        regions.append(
            EditRegionPolygon(
                polygon=polygon,
                bounding_box=(x, y, w, h),
                center=(cx, cy),
                area=int(area),
                significance=significance,
            )
        )

    # Sort by significance (most significant first)
    regions.sort(key=lambda r: r.significance, reverse=True)

    total_area = sum(r.area for r in regions)
    percent = (total_area / (H * W)) * 100 if H * W > 0 else 0.0

    logger.info(
        "LPIPS detection found %d significant regions (%.1f%% of image)",
        len(regions),
        percent,
    )

    return LPIPSDetectionResult(
        regions=regions,
        total_changed_area=total_area,
        percent_changed=percent,
        image_width=W,
        image_height=H,
    )


def format_edit_regions_for_prompt(result: LPIPSDetectionResult) -> str:
    """
    Format LPIPS detection result as a string for inclusion in AI prompts.

    Args:
        result: The detection result to format

    Returns:
        Human-readable description of detected edit regions
    """
    if not result.regions:
        return "DETECTED EDIT LOCATIONS: No significant changes detected between images."

    region_descriptions = []
    for i, r in enumerate(result.regions, 1):
        x, y, w, h = r.bounding_box
        region_descriptions.append(
            f"  {i}. Region centered at ({r.center[0]}, {r.center[1]}), "
            f"bounding box from ({x}, {y}) to ({x + w - 1}, {y + h - 1}), "
            f"size: {w}x{h}, area: {r.area}px, "
            f"significance: {r.significance:.1f}/100"
        )

    return f"""DETECTED EDIT LOCATIONS (by perceptual difference, sorted by significance):
{chr(10).join(region_descriptions)}

Total changed area: {result.total_changed_area}px ({result.percent_changed:.1f}% of image)
Image dimensions: {result.image_width}x{result.image_height}"""
