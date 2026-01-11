"""
Tests for the shape description generator.

Tests cover:
1. Color name conversion
2. Individual shape descriptions for each type
3. Full context builder
4. Edge cases (empty, missing fields)
"""

import pytest
from schemas.agentic import BoundingBox, Point2D, ShapeMetadata
from services.shape_descriptions import _color_name, build_shapes_context, describe_shape

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def basic_bbox() -> BoundingBox:
    """Basic bounding box for testing."""
    return BoundingBox(x=100, y=200, width=150, height=100)


@pytest.fixture
def square_bbox() -> BoundingBox:
    """Square bounding box for circle tests."""
    return BoundingBox(x=200, y=200, width=100, height=100)


# =============================================================================
# Color Name Tests
# =============================================================================


class TestColorName:
    """Tests for the _color_name helper function."""

    def test_common_colors(self):
        """Test that common colors get proper names."""
        assert _color_name("#ff0000") == "red"
        assert _color_name("#00ff00") == "green"
        assert _color_name("#0000ff") == "blue"
        assert _color_name("#000000") == "black"
        assert _color_name("#ffffff") == "white"

    def test_excalidraw_colors(self):
        """Test Excalidraw's default palette colors."""
        assert _color_name("#e03131") == "red"
        assert _color_name("#2f9e44") == "green"
        assert _color_name("#1971c2") == "blue"

    def test_unknown_color_returns_hex(self):
        """Test that unknown colors return the hex value."""
        assert _color_name("#abcdef") == "#abcdef"

    def test_case_insensitive(self):
        """Test that color matching is case-insensitive."""
        assert _color_name("#FF0000") == "red"
        assert _color_name("#Ff0000") == "red"

    def test_without_hash_prefix(self):
        """Test colors without # prefix."""
        assert _color_name("ff0000") == "red"


# =============================================================================
# Line Description Tests
# =============================================================================


class TestLineDescription:
    """Tests for line shape descriptions."""

    def test_line_with_endpoints(self, basic_bbox: BoundingBox):
        """Test line description with start/end points."""
        shape = ShapeMetadata(
            type="line",
            strokeColor="#ff0000",
            boundingBox=basic_bbox,
            startPoint=Point2D(x=100, y=200),
            endPoint=Point2D(x=250, y=300),
        )
        desc = describe_shape(shape)
        assert "red line" in desc
        assert "(100, 200)" in desc
        assert "(250, 300)" in desc

    def test_line_without_endpoints(self, basic_bbox: BoundingBox):
        """Test line description fallback without endpoints."""
        shape = ShapeMetadata(
            type="line",
            strokeColor="#0000ff",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "blue line" in desc
        assert "150x100px" in desc


# =============================================================================
# Arrow Description Tests
# =============================================================================


class TestArrowDescription:
    """Tests for arrow shape descriptions."""

    def test_arrow_with_endpoints(self, basic_bbox: BoundingBox):
        """Test arrow description with start/end points."""
        shape = ShapeMetadata(
            type="arrow",
            strokeColor="#00ff00",
            boundingBox=basic_bbox,
            startPoint=Point2D(x=50, y=50),
            endPoint=Point2D(x=200, y=150),
            hasEndArrowhead=True,
        )
        desc = describe_shape(shape)
        assert "green arrow" in desc
        assert "(50, 50)" in desc
        assert "(200, 150)" in desc

    def test_double_headed_arrow(self, basic_bbox: BoundingBox):
        """Test double-headed arrow description."""
        shape = ShapeMetadata(
            type="arrow",
            strokeColor="#ff0000",
            boundingBox=basic_bbox,
            startPoint=Point2D(x=100, y=100),
            endPoint=Point2D(x=300, y=100),
            hasStartArrowhead=True,
            hasEndArrowhead=True,
        )
        desc = describe_shape(shape)
        assert "double-headed arrow" in desc

    def test_reverse_arrow(self, basic_bbox: BoundingBox):
        """Test arrow with only start arrowhead (reverse direction)."""
        shape = ShapeMetadata(
            type="arrow",
            strokeColor="#ff0000",
            boundingBox=basic_bbox,
            startPoint=Point2D(x=100, y=100),
            endPoint=Point2D(x=300, y=100),
            hasStartArrowhead=True,
            hasEndArrowhead=False,
        )
        desc = describe_shape(shape)
        assert "arrow" in desc
        # Direction should be swapped (points from end to start)
        assert "(300, 100)" in desc  # This should be first (from)
        assert "(100, 100)" in desc


# =============================================================================
# Rectangle Description Tests
# =============================================================================


class TestRectangleDescription:
    """Tests for rectangle shape descriptions."""

    def test_stroke_only_rectangle(self, basic_bbox: BoundingBox):
        """Test rectangle with stroke only (no fill)."""
        shape = ShapeMetadata(
            type="rectangle",
            strokeColor="#000000",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "black rectangle" in desc
        assert "(100, 200)" in desc
        assert "150x100px" in desc

    def test_filled_rectangle(self, basic_bbox: BoundingBox):
        """Test rectangle with fill color."""
        shape = ShapeMetadata(
            type="rectangle",
            strokeColor="#000000",
            backgroundColor="#00ff00",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "green-filled" in desc
        assert "black rectangle" in desc

    def test_transparent_fill_rectangle(self, basic_bbox: BoundingBox):
        """Test rectangle with transparent fill (should not mention fill)."""
        shape = ShapeMetadata(
            type="rectangle",
            strokeColor="#ff0000",
            backgroundColor="#transparent",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "filled" not in desc


# =============================================================================
# Ellipse/Circle Description Tests
# =============================================================================


class TestEllipseDescription:
    """Tests for ellipse and circle shape descriptions."""

    def test_circle(self, square_bbox: BoundingBox):
        """Test circle description (equal width/height)."""
        shape = ShapeMetadata(
            type="ellipse",
            strokeColor="#ff0000",
            boundingBox=square_bbox,
        )
        desc = describe_shape(shape)
        assert "circle" in desc
        assert "radius 50px" in desc
        assert "(250, 250)" in desc  # Center

    def test_ellipse(self, basic_bbox: BoundingBox):
        """Test ellipse description (unequal width/height)."""
        shape = ShapeMetadata(
            type="ellipse",
            strokeColor="#0000ff",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "ellipse" in desc
        assert "150x100px" in desc

    def test_filled_circle(self, square_bbox: BoundingBox):
        """Test filled circle description."""
        shape = ShapeMetadata(
            type="ellipse",
            strokeColor="#000000",
            backgroundColor="#ffff00",
            boundingBox=square_bbox,
        )
        desc = describe_shape(shape)
        assert "yellow-filled" in desc
        assert "circle" in desc


# =============================================================================
# Diamond Description Tests
# =============================================================================


class TestDiamondDescription:
    """Tests for diamond shape descriptions."""

    def test_diamond(self, basic_bbox: BoundingBox):
        """Test diamond description."""
        shape = ShapeMetadata(
            type="diamond",
            strokeColor="#6741d9",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "diamond" in desc
        assert "(100, 200)" in desc


# =============================================================================
# Freedraw Description Tests
# =============================================================================


class TestFreedrawDescription:
    """Tests for freedraw shape descriptions."""

    def test_freedraw_with_point_count(self, basic_bbox: BoundingBox):
        """Test freedraw description with point count."""
        shape = ShapeMetadata(
            type="freedraw",
            strokeColor="#000000",
            boundingBox=basic_bbox,
            pointCount=42,
        )
        desc = describe_shape(shape)
        assert "freehand drawing" in desc
        assert "(42 points)" in desc
        # Should show center, not top-left
        assert "(175, 250)" in desc  # Center of bbox

    def test_freedraw_without_point_count(self, basic_bbox: BoundingBox):
        """Test freedraw description without point count."""
        shape = ShapeMetadata(
            type="freedraw",
            strokeColor="#ff0000",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "freehand drawing" in desc
        assert "points" not in desc


# =============================================================================
# Text Description Tests
# =============================================================================


class TestTextDescription:
    """Tests for text shape descriptions."""

    def test_text_with_content(self, basic_bbox: BoundingBox):
        """Test text description with content."""
        shape = ShapeMetadata(
            type="text",
            strokeColor="#ff0000",
            boundingBox=basic_bbox,
            textContent="Click here",
            fontSize=16,
        )
        desc = describe_shape(shape)
        assert 'Text "Click here"' in desc
        assert "(100, 200)" in desc
        assert "red" in desc
        assert "16px" in desc

    def test_long_text_preserved(self, basic_bbox: BoundingBox):
        """Test that long text is preserved without truncation."""
        long_text = "This is a very long text annotation that contains important instructions for the AI"
        shape = ShapeMetadata(
            type="text",
            strokeColor="#000000",
            boundingBox=basic_bbox,
            textContent=long_text,
        )
        desc = describe_shape(shape)
        assert long_text in desc
        assert "..." not in desc

    def test_empty_text(self, basic_bbox: BoundingBox):
        """Test text without content."""
        shape = ShapeMetadata(
            type="text",
            strokeColor="#000000",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "(empty)" in desc


# =============================================================================
# Context Builder Tests
# =============================================================================


class TestBuildShapesContext:
    """Tests for the full context builder."""

    def test_empty_shapes_returns_empty(self):
        """Test that empty list returns empty string."""
        assert build_shapes_context([]) == ""
        assert build_shapes_context(None) == ""

    def test_single_shape(self, basic_bbox: BoundingBox):
        """Test context with a single shape."""
        shapes = [
            ShapeMetadata(
                type="arrow",
                strokeColor="#ff0000",
                boundingBox=basic_bbox,
                startPoint=Point2D(x=100, y=100),
                endPoint=Point2D(x=200, y=200),
            )
        ]
        context = build_shapes_context(shapes)
        assert "USER-DRAWN ANNOTATIONS" in context
        assert "arrow" in context
        assert "IMPORTANT" in context

    def test_multiple_shapes(self, basic_bbox: BoundingBox, square_bbox: BoundingBox):
        """Test context with multiple shapes."""
        shapes = [
            ShapeMetadata(
                type="arrow",
                strokeColor="#ff0000",
                boundingBox=basic_bbox,
                startPoint=Point2D(x=100, y=100),
                endPoint=Point2D(x=200, y=200),
            ),
            ShapeMetadata(
                type="rectangle",
                strokeColor="#0000ff",
                boundingBox=basic_bbox,
            ),
            ShapeMetadata(
                type="text",
                strokeColor="#000000",
                boundingBox=basic_bbox,
                textContent="Move here",
            ),
        ]
        context = build_shapes_context(shapes)

        # All shapes should be listed
        assert "arrow" in context
        assert "rectangle" in context
        assert "Move here" in context

        # Should have bullet points
        assert context.count("- ") >= 3

    def test_context_includes_guidance(self, basic_bbox: BoundingBox):
        """Test that context includes interpretation guidance."""
        shapes = [
            ShapeMetadata(
                type="rectangle",
                strokeColor="#ff0000",
                boundingBox=basic_bbox,
            )
        ]
        context = build_shapes_context(shapes)
        assert "Arrows" in context
        assert "Rectangles" in context
        assert "direction" in context.lower() or "movement" in context.lower()
