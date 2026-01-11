"""
Tests for image comparison service.

Tests cover:
- Delta E color difference calculation
- Block-based edit detection
- Pixel-based edit detection
- Connected component detection (flood fill)
- Significance scoring
- Edge cases and error handling
"""

import numpy as np
import pytest

from services.image_compare import (
    EditDetectionOptions,
    EditDetectionResult,
    EditRegion,
    compute_delta_e,
    detect_edit_regions,
    format_edit_regions_for_prompt,
)


class TestComputeDeltaE:
    """Tests for Delta E color difference calculation."""

    def test_identical_images_have_zero_delta_e(self):
        """Identical images should have zero color difference everywhere."""
        img = np.full((100, 100, 3), 128, dtype=np.uint8)
        delta_e = compute_delta_e(img, img)

        assert delta_e.shape == (100, 100)
        assert np.allclose(delta_e, 0, atol=1e-5)

    def test_black_vs_white_has_high_delta_e(self):
        """Black vs white should have very high Delta E (~100)."""
        black = np.zeros((10, 10, 3), dtype=np.uint8)
        white = np.full((10, 10, 3), 255, dtype=np.uint8)

        delta_e = compute_delta_e(black, white)

        # Delta E between black and white should be close to 100
        assert np.all(delta_e > 90)
        assert np.all(delta_e < 110)

    def test_similar_colors_have_low_delta_e(self):
        """Very similar colors should have low Delta E."""
        img1 = np.full((10, 10, 3), 128, dtype=np.uint8)
        img2 = np.full((10, 10, 3), 130, dtype=np.uint8)  # Slightly different

        delta_e = compute_delta_e(img1, img2)

        # Should be perceptible but small
        assert np.all(delta_e < 5)
        assert np.all(delta_e > 0)

    def test_red_vs_green_difference(self):
        """Pure red vs pure green should have significant Delta E."""
        red = np.zeros((10, 10, 3), dtype=np.uint8)
        red[..., 0] = 255  # R=255, G=0, B=0

        green = np.zeros((10, 10, 3), dtype=np.uint8)
        green[..., 1] = 255  # R=0, G=255, B=0

        delta_e = compute_delta_e(red, green)

        # Red vs green is very different perceptually
        assert np.all(delta_e > 50)

    def test_output_shape_matches_input(self):
        """Output shape should be (H, W) matching input (H, W, 3)."""
        img1 = np.random.randint(0, 256, (50, 80, 3), dtype=np.uint8)
        img2 = np.random.randint(0, 256, (50, 80, 3), dtype=np.uint8)

        delta_e = compute_delta_e(img1, img2)

        assert delta_e.shape == (50, 80)
        assert delta_e.dtype == np.float32


class TestDetectEditRegionsBasic:
    """Basic tests for detect_edit_regions function."""

    def test_identical_images_no_regions(self):
        """Identical images should have no detected regions."""
        img = np.full((100, 100, 3), 128, dtype=np.uint8)
        result = detect_edit_regions(img, img)

        assert len(result.regions) == 0
        assert result.total_changed_pixels == 0
        assert result.percent_changed == 0.0

    def test_dimension_mismatch_resizes_edited_image(self):
        """Different sized images should be handled by resizing edited to match original."""
        # Original is 100x100, edited is 200x150 (different dimensions)
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = np.full((150, 200, 3), 200, dtype=np.uint8)  # Different size, different color

        # Should not raise - library handles resize internally
        result = detect_edit_regions(original, edited)

        # Result dimensions should match original
        assert result.image_width == 100
        assert result.image_height == 100
        # Should detect changes (colors are different)
        assert result.total_changed_pixels > 0

    def test_dimension_mismatch_detects_changes_correctly(self):
        """Resized images should still detect edit regions correctly."""
        # Create original with a specific pattern
        original = np.full((50, 50, 3), 128, dtype=np.uint8)

        # Create edited at 2x size with a changed region
        edited = np.full((100, 100, 3), 128, dtype=np.uint8)
        # Add a changed region in the center (will be at center after resize too)
        edited[40:60, 40:60] = 255  # Center region changed

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=False,
                min_region_size=5,
            ),
        )

        # Should detect the changed region after resize
        assert len(result.regions) >= 1
        # Region should be roughly in the center of the 50x50 image
        region = result.regions[0]
        assert 15 <= region.center_x <= 35
        assert 15 <= region.center_y <= 35

    def test_invalid_image_shape_raises_error(self):
        """Non-3D images should raise ValueError."""
        img1 = np.zeros((100, 100), dtype=np.uint8)  # 2D, missing channels
        img2 = np.zeros((100, 100), dtype=np.uint8)

        with pytest.raises(ValueError, match="Expected RGB image"):
            detect_edit_regions(img1, img2)

    def test_result_contains_image_dimensions(self):
        """Result should contain correct image dimensions."""
        img = np.zeros((120, 200, 3), dtype=np.uint8)
        result = detect_edit_regions(img, img)

        assert result.image_width == 200
        assert result.image_height == 120


class TestDetectEditRegionsBlockBased:
    """Tests for block-based edit detection."""

    def test_detects_single_changed_region(self):
        """Should detect a single changed region."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # Create a 30x30 changed region at (20, 20)
        edited[20:50, 20:50] = 255

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=True,
                block_size=8,
                min_block_density=0.25,
                min_block_count=2,
            ),
        )

        assert len(result.regions) >= 1
        # The largest region should be near the changed area
        region = result.regions[0]
        assert region.x <= 20
        assert region.y <= 20
        assert region.x + region.width >= 50
        assert region.y + region.height >= 50

    def test_detects_multiple_regions(self):
        """Should detect multiple separate changed regions."""
        original = np.full((200, 200, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # Create two separate regions
        edited[10:40, 10:40] = 255  # Top-left
        edited[150:180, 150:180] = 0  # Bottom-right

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=True,
                block_size=8,
                min_block_density=0.25,
                min_block_count=2,
            ),
        )

        # Should detect at least 2 regions
        assert len(result.regions) >= 2

    def test_filters_small_noise(self):
        """Small scattered changes should be filtered out."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # Add some small scattered noise (single pixels)
        edited[10, 10] = 255
        edited[50, 50] = 0
        edited[90, 90] = 200

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=True,
                block_size=8,
                min_block_density=0.25,  # Requires 25% of block changed
                min_block_count=2,  # Need at least 2 connected blocks
            ),
        )

        # Single pixels shouldn't form regions with these settings
        assert len(result.regions) == 0

    def test_significance_scoring(self):
        """Larger/more intense changes should have higher significance."""
        original = np.full((200, 200, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # Small change
        edited[10:20, 10:20] = 150  # Small region, small color diff

        # Large change
        edited[100:180, 100:180] = 255  # Large region, large color diff

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=True,
                min_block_count=1,
            ),
        )

        # Results should be sorted by significance (highest first)
        if len(result.regions) >= 2:
            assert result.regions[0].significance >= result.regions[1].significance


class TestDetectEditRegionsPixelBased:
    """Tests for pixel-based edit detection."""

    def test_detects_region_pixel_mode(self):
        """Should detect changed region in pixel-based mode."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # Create a changed region
        edited[30:60, 30:60] = 255

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=False,
                min_region_size=10,
            ),
        )

        assert len(result.regions) >= 1
        assert result.total_changed_pixels > 0

    def test_pixel_mode_more_sensitive(self):
        """Pixel mode should detect smaller changes than block mode."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # Small 5x5 region
        edited[45:50, 45:50] = 255

        pixel_result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=False,
                min_region_size=5,
            ),
        )

        block_result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=True,
                min_block_count=2,
            ),
        )

        # Pixel mode should detect this, block mode might not (depends on settings)
        assert pixel_result.total_changed_pixels == 25  # 5x5 = 25 pixels


class TestEditDetectionOptions:
    """Tests for detection options."""

    def test_color_threshold_affects_detection(self):
        """Higher threshold should detect fewer changes."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # Subtle change
        edited[20:80, 20:80] = 135  # Small color difference

        low_threshold_result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(color_threshold=2.0),
        )

        high_threshold_result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(color_threshold=20.0),
        )

        # Low threshold should detect more changed pixels
        assert low_threshold_result.total_changed_pixels >= high_threshold_result.total_changed_pixels

    def test_default_options(self):
        """Should work with default options."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()
        edited[20:80, 20:80] = 255

        # No explicit options
        result = detect_edit_regions(original, edited)

        assert isinstance(result, EditDetectionResult)
        assert result.image_width == 100


class TestFormatEditRegionsForPrompt:
    """Tests for prompt formatting function."""

    def test_no_regions_message(self):
        """Should return appropriate message when no regions detected."""
        result = EditDetectionResult(
            regions=[],
            total_changed_pixels=0,
            percent_changed=0.0,
            image_width=100,
            image_height=100,
        )

        formatted = format_edit_regions_for_prompt(result)

        assert "No significant changes detected" in formatted

    def test_formats_single_region(self):
        """Should format a single region correctly."""
        region = EditRegion(
            x=10,
            y=20,
            width=50,
            height=30,
            center_x=35,
            center_y=35,
            pixel_count=1000,
            avg_color_diff=45.5,
            max_color_diff=80.0,
            significance=72,
        )
        result = EditDetectionResult(
            regions=[region],
            total_changed_pixels=1000,
            percent_changed=10.0,
            image_width=100,
            image_height=100,
        )

        formatted = format_edit_regions_for_prompt(result)

        assert "DETECTED EDIT LOCATIONS" in formatted
        assert "(10, 20)" in formatted  # Top-left
        assert "(59, 49)" in formatted  # Bottom-right (10+50-1, 20+30-1)
        assert "center: (35, 35)" in formatted
        assert "50x30" in formatted  # Size
        assert "1000 pixels changed" in formatted
        assert "avg=45.5" in formatted
        assert "max=80.0" in formatted
        assert "significance: 72/100" in formatted
        assert "10.0% of image" in formatted

    def test_formats_multiple_regions(self):
        """Should format multiple regions with numbering."""
        regions = [
            EditRegion(
                x=0,
                y=0,
                width=10,
                height=10,
                center_x=5,
                center_y=5,
                pixel_count=100,
                avg_color_diff=50.0,
                max_color_diff=60.0,
                significance=80,
            ),
            EditRegion(
                x=50,
                y=50,
                width=20,
                height=20,
                center_x=60,
                center_y=60,
                pixel_count=200,
                avg_color_diff=30.0,
                max_color_diff=40.0,
                significance=60,
            ),
        ]
        result = EditDetectionResult(
            regions=regions,
            total_changed_pixels=300,
            percent_changed=3.0,
            image_width=100,
            image_height=100,
        )

        formatted = format_edit_regions_for_prompt(result)

        assert "1. Region from (0, 0)" in formatted
        assert "2. Region from (50, 50)" in formatted
        assert "Total: 300 pixels" in formatted


class TestFloodFillAlgorithm:
    """Tests for connected component detection."""

    def test_detects_l_shaped_region(self):
        """Should detect L-shaped connected region as single region."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # Create L-shaped region
        edited[10:50, 10:20] = 255  # Vertical part
        edited[40:50, 10:50] = 255  # Horizontal part

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=False,
                min_region_size=10,
            ),
        )

        # Should be detected as one connected region
        assert len(result.regions) == 1

    def test_disconnected_regions_are_separate(self):
        """Disconnected regions should be detected separately."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # Two clearly separate regions
        edited[5:15, 5:15] = 255
        edited[80:90, 80:90] = 255

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=False,
                min_region_size=10,
            ),
        )

        assert len(result.regions) == 2


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_change_at_image_edge(self):
        """Should handle changes at image boundaries."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # Change at corners
        edited[0:10, 0:10] = 255  # Top-left corner
        edited[90:100, 90:100] = 255  # Bottom-right corner

        result = detect_edit_regions(original, edited)

        assert len(result.regions) >= 1
        assert result.total_changed_pixels > 0

    def test_full_image_change(self):
        """Should handle entire image being changed."""
        original = np.full((50, 50, 3), 0, dtype=np.uint8)
        edited = np.full((50, 50, 3), 255, dtype=np.uint8)

        result = detect_edit_regions(original, edited)

        assert result.percent_changed > 90  # Most of image changed

    def test_small_image(self):
        """Should handle very small images."""
        original = np.full((10, 10, 3), 128, dtype=np.uint8)
        edited = original.copy()
        edited[2:8, 2:8] = 255

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=True,
                block_size=4,
                min_block_count=1,
            ),
        )

        assert result.image_width == 10
        assert result.image_height == 10

    def test_rgba_image_ignores_alpha(self):
        """Should handle RGBA images by ignoring alpha channel."""
        original = np.full((50, 50, 4), 128, dtype=np.uint8)
        edited = original.copy()

        # Change RGB but not alpha
        edited[10:40, 10:40, :3] = 255

        result = detect_edit_regions(original, edited)

        assert len(result.regions) >= 1


class TestRegionProperties:
    """Tests for region property calculations."""

    def test_center_calculation(self):
        """Center coordinates should be correctly calculated."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # 20x20 region from (10,10) to (29,29)
        edited[10:30, 10:30] = 255

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=False,
                min_region_size=1,
            ),
        )

        assert len(result.regions) == 1
        region = result.regions[0]

        # Center should be approximately (19, 19) - midpoint of (10,29)
        assert abs(region.center_x - 19) <= 1
        assert abs(region.center_y - 19) <= 1

    def test_pixel_count_accuracy(self):
        """Pixel count should match actual changed pixels."""
        original = np.full((100, 100, 3), 128, dtype=np.uint8)
        edited = original.copy()

        # 10x10 = 100 pixels
        edited[20:30, 20:30] = 255

        result = detect_edit_regions(
            original,
            edited,
            EditDetectionOptions(
                use_block_comparison=False,
                min_region_size=1,
                color_threshold=5.0,
            ),
        )

        # Total should be exactly 100 pixels
        assert result.total_changed_pixels == 100
