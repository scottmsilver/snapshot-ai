"""
Tests for the shape description generator.

Tests cover:
1. Color name conversion
2. Individual shape descriptions for each type
3. Full context builder
4. Edge cases (empty, missing fields)
5. New polyline/polygon features
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

    def test_simple_line_with_endpoints(self, basic_bbox: BoundingBox):
        """Test simple line description with start/end points."""
        shape = ShapeMetadata(
            type="line",
            strokeColor="#ff0000",
            boundingBox=basic_bbox,
            startPoint=Point2D(x=100, y=200),
            endPoint=Point2D(x=250, y=300),
        )
        desc = describe_shape(shape)
        assert "LINE #1" in desc
        assert "red" in desc
        assert "(100, 200)" in desc
        assert "(250, 300)" in desc
        assert "Path:" in desc

    def test_polyline_with_multiple_points(self, basic_bbox: BoundingBox):
        """Test polyline with multiple points."""
        shape = ShapeMetadata(
            type="line",
            strokeColor="#0000ff",
            boundingBox=basic_bbox,
            startPoint=Point2D(x=100, y=200),
            endPoint=Point2D(x=300, y=400),
            points=[
                Point2D(x=100, y=200),
                Point2D(x=150, y=250),
                Point2D(x=200, y=300),
                Point2D(x=300, y=400),
            ],
        )
        desc = describe_shape(shape)
        assert "polyline" in desc
        assert "3 segments" in desc
        # All points should be in the path
        assert "(100, 200)" in desc
        assert "(150, 250)" in desc
        assert "(200, 300)" in desc
        assert "(300, 400)" in desc

    def test_closed_polygon(self, basic_bbox: BoundingBox):
        """Test closed polygon description."""
        shape = ShapeMetadata(
            type="line",
            strokeColor="#00ff00",
            boundingBox=basic_bbox,
            startPoint=Point2D(x=100, y=100),
            endPoint=Point2D(x=100, y=100),
            points=[
                Point2D(x=100, y=100),
                Point2D(x=200, y=100),
                Point2D(x=200, y=200),
                Point2D(x=100, y=200),
            ],
            isClosed=True,
        )
        desc = describe_shape(shape)
        assert "closed polygon" in desc
        assert "4 vertices" in desc
        assert "[closed]" in desc

    def test_curved_line(self, basic_bbox: BoundingBox):
        """Test curved line description."""
        shape = ShapeMetadata(
            type="line",
            strokeColor="#ff0000",
            boundingBox=basic_bbox,
            startPoint=Point2D(x=100, y=200),
            endPoint=Point2D(x=250, y=300),
            isCurved=True,
        )
        desc = describe_shape(shape)
        assert "curved" in desc

    def test_curved_closed_polygon(self, basic_bbox: BoundingBox):
        """Test curved closed polygon (like a smooth shape)."""
        shape = ShapeMetadata(
            type="line",
            strokeColor="#ff0000",
            boundingBox=basic_bbox,
            points=[
                Point2D(x=100, y=100),
                Point2D(x=200, y=50),
                Point2D(x=300, y=100),
                Point2D(x=200, y=150),
            ],
            isClosed=True,
            isCurved=True,
        )
        desc = describe_shape(shape)
        assert "closed polygon" in desc
        assert "curved" in desc
        assert "[closed]" in desc


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
        assert "ARROW #1" in desc
        assert "green" in desc
        assert "(50, 50)" in desc
        assert "(200, 150)" in desc
        assert "Arrowhead:" in desc

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
        assert "double-headed" in desc
        assert "start & end" in desc

    def test_curved_multi_segment_arrow(self, basic_bbox: BoundingBox):
        """Test curved multi-segment arrow."""
        shape = ShapeMetadata(
            type="arrow",
            strokeColor="#0000ff",
            boundingBox=basic_bbox,
            startPoint=Point2D(x=100, y=100),
            endPoint=Point2D(x=300, y=300),
            points=[
                Point2D(x=100, y=100),
                Point2D(x=150, y=200),
                Point2D(x=250, y=250),
                Point2D(x=300, y=300),
            ],
            isCurved=True,
            hasEndArrowhead=True,
        )
        desc = describe_shape(shape)
        assert "3-segment" in desc
        assert "curved" in desc
        # All points should be in the path
        assert "(100, 100)" in desc
        assert "(150, 200)" in desc
        assert "(250, 250)" in desc
        assert "(300, 300)" in desc


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
        assert "RECTANGLE #1" in desc
        assert "black" in desc
        assert "outline" in desc
        assert "(100, 200)" in desc
        assert "(250, 300)" in desc  # Bottom-right
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
        assert "Fill: green" in desc

    def test_transparent_fill_rectangle(self, basic_bbox: BoundingBox):
        """Test rectangle with transparent fill (should show outline)."""
        shape = ShapeMetadata(
            type="rectangle",
            strokeColor="#ff0000",
            backgroundColor="#transparent",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "outline" in desc


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
        assert "CIRCLE #1" in desc
        assert "Radius: 50px" in desc
        assert "(250, 250)" in desc  # Center

    def test_ellipse(self, basic_bbox: BoundingBox):
        """Test ellipse description (unequal width/height)."""
        shape = ShapeMetadata(
            type="ellipse",
            strokeColor="#0000ff",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "ELLIPSE #1" in desc
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
        assert "CIRCLE" in desc
        assert "Fill: yellow" in desc


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
        assert "DIAMOND #1" in desc
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
        assert "FREEDRAW #1" in desc
        assert "sketch" in desc
        assert "42 points" in desc

    def test_freedraw_without_point_count(self, basic_bbox: BoundingBox):
        """Test freedraw description without point count."""
        shape = ShapeMetadata(
            type="freedraw",
            strokeColor="#ff0000",
            boundingBox=basic_bbox,
        )
        desc = describe_shape(shape)
        assert "FREEDRAW #1" in desc
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
        assert 'TEXT #1: "Click here"' in desc
        assert "(100, 200)" in desc
        assert "red" in desc
        assert "16px" in desc

    def test_long_text_truncated(self, basic_bbox: BoundingBox):
        """Test that very long text is truncated."""
        long_text = "This is a very long text annotation that contains important instructions for the AI and should be truncated"
        shape = ShapeMetadata(
            type="text",
            strokeColor="#000000",
            boundingBox=basic_bbox,
            textContent=long_text,
        )
        desc = describe_shape(shape)
        assert "..." in desc
        assert len(desc) < len(long_text) + 100  # Reasonable length

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
        assert "ARROW" in context
        assert "INTERPRETATION GUIDE" in context

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

        # All shapes should be listed with numbering
        assert "ARROW #1" in context
        assert "RECTANGLE #2" in context
        assert "TEXT #3" in context
        assert "Move here" in context

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
        assert "ARROW:" in context
        assert "POLYGON" in context
        assert "direction" in context.lower() or "movement" in context.lower()

    def test_shapes_numbered_sequentially(self, basic_bbox: BoundingBox):
        """Test that shapes are numbered 1, 2, 3, etc."""
        shapes = [
            ShapeMetadata(
                type="line",
                strokeColor="#ff0000",
                boundingBox=basic_bbox,
                startPoint=Point2D(x=0, y=0),
                endPoint=Point2D(x=100, y=100),
            ),
            ShapeMetadata(
                type="line",
                strokeColor="#00ff00",
                boundingBox=basic_bbox,
                startPoint=Point2D(x=0, y=0),
                endPoint=Point2D(x=100, y=100),
            ),
            ShapeMetadata(
                type="line",
                strokeColor="#0000ff",
                boundingBox=basic_bbox,
                startPoint=Point2D(x=0, y=0),
                endPoint=Point2D(x=100, y=100),
            ),
        ]
        context = build_shapes_context(shapes)
        assert "LINE #1:" in context
        assert "LINE #2:" in context
        assert "LINE #3:" in context
