"""
Shape description generator for AI prompts.

Converts shape metadata from the canvas into structured, exhaustive descriptions
that allow the AI to understand and potentially recreate user-drawn annotations.

Uses a simple "shape language" format:
  LINE #1: red polyline, 3 segments
    Path: (100, 200) -> (150, 300) -> (200, 250)
    Stroke: 2px
"""

from __future__ import annotations

from schemas.agentic import SHAPE_TYPES, ShapeMetadata


def _color_name(hex_color: str) -> str:
    """
    Convert hex color to a simple color name for readability.

    Common colors get names, others stay as hex.
    """
    # Normalize: lowercase, ensure # prefix
    color = hex_color.lower().strip()
    if not color.startswith("#"):
        color = f"#{color}"

    # Common color mappings
    color_names = {
        "#000000": "black",
        "#ffffff": "white",
        "#ff0000": "red",
        "#00ff00": "green",
        "#0000ff": "blue",
        "#ffff00": "yellow",
        "#ff00ff": "magenta",
        "#00ffff": "cyan",
        "#ffa500": "orange",
        "#800080": "purple",
        "#ffc0cb": "pink",
        "#808080": "gray",
        "#a52a2a": "brown",
        "#1e1e1e": "dark gray",
        "#e03131": "red",  # Excalidraw red
        "#2f9e44": "green",  # Excalidraw green
        "#1971c2": "blue",  # Excalidraw blue
        "#f08c00": "orange",  # Excalidraw orange
        "#6741d9": "purple",  # Excalidraw violet
        "#transparent": "transparent",
    }

    return color_names.get(color, color)


def _format_point(x: float, y: float) -> str:
    """Format a point as (x, y) with integer coordinates."""
    return f"({int(x)}, {int(y)})"


def _format_path(points: list, start_point=None, end_point=None) -> str:
    """
    Format a path as a series of points connected by arrows.

    Uses points array if available, otherwise falls back to start/end points.
    """
    if points and len(points) >= 2:
        path_parts = [_format_point(p.x, p.y) for p in points]
        return " -> ".join(path_parts)
    elif start_point and end_point:
        return f"{_format_point(start_point.x, start_point.y)} -> {_format_point(end_point.x, end_point.y)}"
    return "(no path)"


def describe_shape(shape: ShapeMetadata, index: int = 1) -> str:
    """
    Generate an exhaustive, structured description of a single shape.

    The description includes all coordinates and properties needed to
    understand or recreate the shape.

    Args:
        shape: The shape metadata to describe.
        index: The shape number for labeling.

    Returns:
        A multi-line structured description of the shape.
    """
    color = _color_name(shape.strokeColor)
    bg_color = _color_name(shape.backgroundColor) if shape.backgroundColor else None
    has_fill = bg_color and bg_color != "transparent"
    bbox = shape.boundingBox
    stroke_width = int(shape.strokeWidth) if shape.strokeWidth else 1

    # Calculate useful derived values
    center_x = int(bbox.x + bbox.width / 2)
    center_y = int(bbox.y + bbox.height / 2)

    lines = []

    if shape.type == "line":
        # Determine line characteristics
        characteristics = []

        # Count segments
        if shape.points and len(shape.points) > 2:
            num_segments = len(shape.points) - 1
            if shape.isClosed:
                characteristics.append("closed polygon")
                characteristics.append(f"{len(shape.points)} vertices")
            else:
                characteristics.append("polyline")
                characteristics.append(f"{num_segments} segments")
        else:
            characteristics.append("line segment")

        if shape.isCurved:
            characteristics.append("curved")

        if has_fill:
            characteristics.append(f"{bg_color}-filled")

        char_str = ", ".join(characteristics)
        lines.append(f"LINE #{index}: {color} {char_str}")

        # Path with all points
        path = _format_path(shape.points, shape.startPoint, shape.endPoint)
        if shape.isClosed:
            path += " -> [closed]"
        lines.append(f"  Path: {path}")

        # Style
        style_parts = [f"Stroke: {stroke_width}px"]
        if has_fill:
            style_parts.append(f"Fill: {bg_color}")
        lines.append(f"  {', '.join(style_parts)}")

    elif shape.type == "arrow":
        # Determine arrow characteristics
        characteristics = []

        if shape.points and len(shape.points) > 2:
            num_segments = len(shape.points) - 1
            characteristics.append(f"{num_segments}-segment")

        if shape.isCurved:
            characteristics.append("curved")

        # Arrowhead description
        if shape.hasStartArrowhead and shape.hasEndArrowhead:
            characteristics.append("double-headed")
        elif shape.hasStartArrowhead:
            characteristics.append("start-headed")
        # Default is end-headed, don't need to mention

        char_str = ", ".join(characteristics) if characteristics else "straight"
        lines.append(f"ARROW #{index}: {color} {char_str}")

        # Path with all points
        path = _format_path(shape.points, shape.startPoint, shape.endPoint)
        lines.append(f"  Path: {path}")

        # Style and arrowhead info
        arrowhead_pos = []
        if shape.hasStartArrowhead:
            arrowhead_pos.append("start")
        if shape.hasEndArrowhead or (not shape.hasStartArrowhead):
            arrowhead_pos.append("end")

        lines.append(f"  Stroke: {stroke_width}px, Arrowhead: {' & '.join(arrowhead_pos)}")

    elif shape.type == "rectangle":
        fill_str = f"{bg_color}-filled" if has_fill else "outline"
        lines.append(f"RECTANGLE #{index}: {color} {fill_str}")

        # Bounds as corner coordinates
        top_left = _format_point(bbox.x, bbox.y)
        bottom_right = _format_point(bbox.x + bbox.width, bbox.y + bbox.height)
        lines.append(f"  Bounds: {top_left} to {bottom_right}, {int(bbox.width)}x{int(bbox.height)}px")

        # Style
        style_parts = [f"Stroke: {stroke_width}px"]
        if has_fill:
            style_parts.append(f"Fill: {bg_color}")
        lines.append(f"  {', '.join(style_parts)}")

    elif shape.type == "diamond":
        fill_str = f"{bg_color}-filled" if has_fill else "outline"
        lines.append(f"DIAMOND #{index}: {color} {fill_str}")

        # Bounds
        top_left = _format_point(bbox.x, bbox.y)
        bottom_right = _format_point(bbox.x + bbox.width, bbox.y + bbox.height)
        lines.append(f"  Bounds: {top_left} to {bottom_right}, {int(bbox.width)}x{int(bbox.height)}px")

        # Style
        style_parts = [f"Stroke: {stroke_width}px"]
        if has_fill:
            style_parts.append(f"Fill: {bg_color}")
        lines.append(f"  {', '.join(style_parts)}")

    elif shape.type == "ellipse":
        # Check if it's a circle
        is_circle = abs(bbox.width - bbox.height) < 5
        shape_name = "CIRCLE" if is_circle else "ELLIPSE"
        fill_str = f"{bg_color}-filled" if has_fill else "outline"

        lines.append(f"{shape_name} #{index}: {color} {fill_str}")

        if is_circle:
            radius = int(bbox.width / 2)
            lines.append(f"  Center: {_format_point(center_x, center_y)}, Radius: {radius}px")
        else:
            lines.append(f"  Center: {_format_point(center_x, center_y)}, Size: {int(bbox.width)}x{int(bbox.height)}px")

        # Style
        style_parts = [f"Stroke: {stroke_width}px"]
        if has_fill:
            style_parts.append(f"Fill: {bg_color}")
        lines.append(f"  {', '.join(style_parts)}")

    elif shape.type == "freedraw":
        lines.append(f"FREEDRAW #{index}: {color} sketch")

        # Bounds
        top_left = _format_point(bbox.x, bbox.y)
        bottom_right = _format_point(bbox.x + bbox.width, bbox.y + bbox.height)
        point_info = f", {shape.pointCount} points" if shape.pointCount else ""
        lines.append(f"  Bounds: {top_left} to {bottom_right}{point_info}")

        lines.append(f"  Stroke: {stroke_width}px")

    elif shape.type == "text":
        text_content = shape.textContent or "(empty)"
        # Escape quotes and truncate if too long
        if len(text_content) > 50:
            text_content = text_content[:47] + "..."
        text_content = text_content.replace('"', '\\"')

        lines.append(f'TEXT #{index}: "{text_content}"')
        lines.append(f"  Position: {_format_point(bbox.x, bbox.y)}")

        size_info = f", Size: {int(shape.fontSize)}px" if shape.fontSize else ""
        lines.append(f"  Color: {color}{size_info}")

    else:
        # Fallback for unknown types
        lines.append(f"{shape.type.upper()} #{index}: {color}")
        lines.append(f"  Bounds: {_format_point(bbox.x, bbox.y)}, {int(bbox.width)}x{int(bbox.height)}px")

    return "\n".join(lines)


def build_shapes_context(shapes: list[ShapeMetadata] | None) -> str:
    """
    Build a prompt section describing all user-drawn shapes.

    Uses an exhaustive, structured format that includes all coordinates
    and properties needed to understand or recreate each shape.

    Args:
        shapes: List of shape metadata from the canvas, or None.

    Returns:
        A formatted prompt section with shape descriptions, or empty string if no shapes.
    """
    if not shapes:
        return ""

    # Group shapes by type for better organization
    descriptions = []
    for i, shape in enumerate(shapes, 1):
        descriptions.append(describe_shape(shape, i))

    return f"""
## USER-DRAWN ANNOTATIONS

The user has drawn the following shapes on the canvas. Each shape is described
with exact coordinates and properties:

{chr(10).join(descriptions)}

---
INTERPRETATION GUIDE:
- ARROW: Points to or indicates direction/movement. Follow the path from start to end.
- LINE/POLYLINE: May indicate boundaries, connections, or areas to modify.
- POLYGON (closed line): Outlines a specific region or area.
- RECTANGLE/ELLIPSE/CIRCLE: Highlights or frames an area of interest.
- TEXT: Contains explicit instructions or labels.
- FREEDRAW: Freehand marking, often circling or underlining important areas.

Use these annotations to understand exactly WHERE and WHAT the user wants edited.
"""
