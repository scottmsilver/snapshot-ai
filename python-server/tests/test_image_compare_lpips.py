"""Tests for LPIPS-based image comparison."""

import numpy as np
import pytest

from services.image_compare_lpips import (
    EditRegionPolygon,
    LPIPSDetectionOptions,
    LPIPSDetectionResult,
    detect_edit_regions_lpips,
    format_edit_regions_for_prompt,
)

# =============================================================================
# Test Fixtures
# =============================================================================


def create_test_image(width: int, height: int, color: tuple[int, int, int]) -> np.ndarray:
    """Create a solid color test image."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:, :] = color
    return img


def create_image_with_region(
    width: int,
    height: int,
    bg_color: tuple[int, int, int],
    region_color: tuple[int, int, int],
    region_x: int,
    region_y: int,
    region_w: int,
    region_h: int,
) -> np.ndarray:
    """Create an image with a colored region."""
    img = create_test_image(width, height, bg_color)
    img[region_y : region_y + region_h, region_x : region_x + region_w] = region_color
    return img


# =============================================================================
# Basic Detection Tests
# =============================================================================


class TestLPIPSDetection:
    """Tests for LPIPS-based edit detection."""

    def test_identical_images_no_regions(self):
        """Identical images should produce no detected regions."""
        img = create_test_image(256, 256, (128, 128, 128))
        result = detect_edit_regions_lpips(img, img.copy())

        assert len(result.regions) == 0
        assert result.total_changed_area == 0
        assert result.percent_changed == 0.0

    def test_completely_different_images(self):
        """Completely different images should produce detected regions."""
        img1 = create_test_image(256, 256, (0, 0, 0))
        img2 = create_test_image(256, 256, (255, 255, 255))

        result = detect_edit_regions_lpips(img1, img2)

        # Should detect change across most of the image
        assert len(result.regions) > 0
        assert result.percent_changed > 50.0

    def test_localized_edit_detection(self):
        """Should detect a localized edit region."""
        # Create original image (gray background)
        original = create_test_image(256, 256, (128, 128, 128))

        # Create edited image with a red square in the center
        edited = original.copy()
        edited[100:156, 100:156] = (255, 0, 0)  # 56x56 red square

        result = detect_edit_regions_lpips(
            original,
            edited,
            LPIPSDetectionOptions(threshold=0.05, min_area=50),
        )

        # Should detect the red square region
        assert len(result.regions) >= 1

        # The main region should be near the center
        main_region = result.regions[0]
        cx, cy = main_region.center
        assert 80 < cx < 180  # Near horizontal center
        assert 80 < cy < 180  # Near vertical center

    def test_multiple_edit_regions(self):
        """Should detect multiple separate edit regions."""
        original = create_test_image(256, 256, (128, 128, 128))

        edited = original.copy()
        # Add two separate colored regions
        edited[20:60, 20:60] = (255, 0, 0)  # Red in top-left
        edited[180:220, 180:220] = (0, 0, 255)  # Blue in bottom-right

        result = detect_edit_regions_lpips(
            original,
            edited,
            LPIPSDetectionOptions(threshold=0.05, min_area=50),
        )

        # Should detect both regions
        assert len(result.regions) >= 2


# =============================================================================
# Options Tests
# =============================================================================


class TestLPIPSDetectionOptions:
    """Tests for detection options."""

    def test_higher_threshold_fewer_regions(self):
        """Higher threshold should detect fewer/no regions for subtle changes."""
        original = create_test_image(256, 256, (128, 128, 128))

        # Create a subtle change
        edited = original.copy()
        edited[100:150, 100:150] = (135, 135, 135)  # Slightly brighter

        # Low threshold should detect
        result_low = detect_edit_regions_lpips(original, edited, LPIPSDetectionOptions(threshold=0.01))

        # High threshold should not detect (or detect less)
        result_high = detect_edit_regions_lpips(original, edited, LPIPSDetectionOptions(threshold=0.5))

        assert len(result_low.regions) >= len(result_high.regions)

    def test_min_area_filters_small_regions(self):
        """min_area should filter out small detected regions."""
        original = create_test_image(256, 256, (128, 128, 128))
        edited = original.copy()
        edited[100:110, 100:110] = (255, 0, 0)  # Small 10x10 red square

        # Small min_area should detect
        result_small = detect_edit_regions_lpips(original, edited, LPIPSDetectionOptions(min_area=10, threshold=0.05))

        # Large min_area should not detect
        result_large = detect_edit_regions_lpips(
            original, edited, LPIPSDetectionOptions(min_area=10000, threshold=0.05)
        )

        assert len(result_small.regions) >= len(result_large.regions)


# =============================================================================
# Dimension Handling Tests
# =============================================================================


class TestDimensionHandling:
    """Tests for handling different image dimensions."""

    def test_different_dimensions_resizes(self):
        """Should handle images with different dimensions by resizing."""
        original = create_test_image(256, 256, (128, 128, 128))
        edited = create_test_image(512, 512, (128, 128, 128))  # Different size

        # Should not raise an error
        result = detect_edit_regions_lpips(original, edited)

        # Result dimensions should match original
        assert result.image_width == 256
        assert result.image_height == 256


# =============================================================================
# Format Tests
# =============================================================================


class TestFormatEditRegions:
    """Tests for formatting detection results."""

    def test_format_no_regions(self):
        """Should format empty results correctly."""
        result = LPIPSDetectionResult(
            regions=[],
            total_changed_area=0,
            percent_changed=0.0,
            image_width=256,
            image_height=256,
        )

        formatted = format_edit_regions_for_prompt(result)
        assert "No significant changes detected" in formatted

    def test_format_with_regions(self):
        """Should format results with regions correctly."""
        result = LPIPSDetectionResult(
            regions=[
                EditRegionPolygon(
                    polygon=[(100, 100), (150, 100), (150, 150), (100, 150)],
                    bounding_box=(100, 100, 50, 50),
                    center=(125, 125),
                    area=2500,
                    significance=75.5,
                ),
            ],
            total_changed_area=2500,
            percent_changed=3.8,
            image_width=256,
            image_height=256,
        )

        formatted = format_edit_regions_for_prompt(result)

        assert "DETECTED EDIT LOCATIONS" in formatted
        assert "(125, 125)" in formatted  # Center
        assert "2500" in formatted  # Area
        assert "75.5" in formatted  # Significance
        assert "3.8%" in formatted  # Percent

    def test_format_multiple_regions(self):
        """Should format multiple regions with numbering."""
        result = LPIPSDetectionResult(
            regions=[
                EditRegionPolygon(
                    polygon=[(10, 10), (50, 10), (50, 50), (10, 50)],
                    bounding_box=(10, 10, 40, 40),
                    center=(30, 30),
                    area=1600,
                    significance=80.0,
                ),
                EditRegionPolygon(
                    polygon=[(200, 200), (240, 200), (240, 240), (200, 240)],
                    bounding_box=(200, 200, 40, 40),
                    center=(220, 220),
                    area=1600,
                    significance=60.0,
                ),
            ],
            total_changed_area=3200,
            percent_changed=4.9,
            image_width=256,
            image_height=256,
        )

        formatted = format_edit_regions_for_prompt(result)

        assert "1." in formatted  # First region
        assert "2." in formatted  # Second region


# =============================================================================
# Data Class Tests
# =============================================================================


class TestDataClasses:
    """Tests for data class structures."""

    def test_edit_region_polygon_fields(self):
        """EditRegionPolygon should have all required fields."""
        region = EditRegionPolygon(
            polygon=[(0, 0), (10, 0), (10, 10), (0, 10)],
            bounding_box=(0, 0, 10, 10),
            center=(5, 5),
            area=100,
            significance=50.0,
        )

        assert region.polygon == [(0, 0), (10, 0), (10, 10), (0, 10)]
        assert region.bounding_box == (0, 0, 10, 10)
        assert region.center == (5, 5)
        assert region.area == 100
        assert region.significance == 50.0

    def test_lpips_detection_result_fields(self):
        """LPIPSDetectionResult should have all required fields."""
        result = LPIPSDetectionResult(
            regions=[],
            total_changed_area=0,
            percent_changed=0.0,
            image_width=256,
            image_height=256,
        )

        assert result.regions == []
        assert result.total_changed_area == 0
        assert result.percent_changed == 0.0
        assert result.image_width == 256
        assert result.image_height == 256


# =============================================================================
# Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_very_small_image(self):
        """Should handle very small images gracefully (returning no regions)."""
        # Images smaller than 64x64 can't be processed by LPIPS
        original = create_test_image(32, 32, (128, 128, 128))
        edited = create_test_image(32, 32, (255, 255, 255))

        # Should not raise an error, but returns empty result
        result = detect_edit_regions_lpips(original, edited)

        assert result.image_width == 32
        assert result.image_height == 32
        # No regions because image is too small for LPIPS
        assert len(result.regions) == 0

    def test_minimum_size_image(self):
        """Should handle images at minimum LPIPS size (64x64)."""
        original = create_test_image(64, 64, (128, 128, 128))
        edited = create_test_image(64, 64, (255, 255, 255))

        # Should work at exactly 64x64
        result = detect_edit_regions_lpips(original, edited)

        assert result.image_width == 64
        assert result.image_height == 64

    def test_rgba_image_uses_rgb_only(self):
        """Should handle RGBA images by using only RGB channels."""
        original = np.zeros((256, 256, 4), dtype=np.uint8)
        original[:, :, :3] = (128, 128, 128)
        original[:, :, 3] = 255  # Alpha

        edited = np.zeros((256, 256, 4), dtype=np.uint8)
        edited[:, :, :3] = (255, 0, 0)
        edited[:, :, 3] = 128  # Different alpha

        # Should not raise an error and should detect color change
        result = detect_edit_regions_lpips(original, edited)

        # Should detect the color change (ignoring alpha difference)
        assert len(result.regions) > 0
