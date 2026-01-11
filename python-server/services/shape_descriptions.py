"""
Shape description generator for AI prompts.

Converts shape metadata from the canvas into human-readable descriptions
that help the AI understand user-drawn annotations.
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


def describe_shape(shape: ShapeMetadata) -> str:
    """
    Generate a human-readable description of a single shape.

    Args:
        shape: The shape metadata to describe.

    Returns:
        A natural language description of the shape.

    Examples:
        >>> shape = ShapeMetadata(type="arrow", strokeColor="#ff0000", ...)
        >>> describe_shape(shape)
        "A red arrow from (100, 200) to (300, 400)"
    """
    color = _color_name(shape.strokeColor)
    bg_color = _color_name(shape.backgroundColor) if shape.backgroundColor else None
    bbox = shape.boundingBox

    # Calculate center for shapes that use it
    center_x = int(bbox.x + bbox.width / 2)
    center_y = int(bbox.y + bbox.height / 2)

    if shape.type == "line":
        if shape.startPoint and shape.endPoint:
            start = f"({int(shape.startPoint.x)}, {int(shape.startPoint.y)})"
            end = f"({int(shape.endPoint.x)}, {int(shape.endPoint.y)})"
            return f"A {color} line from {start} to {end}"
        return f"A {color} line at ({int(bbox.x)}, {int(bbox.y)}), {int(bbox.width)}x{int(bbox.height)}px"

    elif shape.type == "arrow":
        if shape.startPoint and shape.endPoint:
            start = f"({int(shape.startPoint.x)}, {int(shape.startPoint.y)})"
            end = f"({int(shape.endPoint.x)}, {int(shape.endPoint.y)})"

            # Describe arrowhead placement
            if shape.hasStartArrowhead and shape.hasEndArrowhead:
                arrow_type = "double-headed arrow"
            elif shape.hasStartArrowhead:
                # Arrow points from end to start
                arrow_type = "arrow"
                start, end = end, start  # Swap for natural description
            else:
                arrow_type = "arrow"

            return f"A {color} {arrow_type} from {start} to {end}"
        return f"A {color} arrow at ({int(bbox.x)}, {int(bbox.y)}), {int(bbox.width)}x{int(bbox.height)}px"

    elif shape.type == "rectangle":
        fill_desc = f"{bg_color}-filled " if bg_color and bg_color != "transparent" else ""
        return f"A {fill_desc}{color} rectangle at ({int(bbox.x)}, {int(bbox.y)}), size {int(bbox.width)}x{int(bbox.height)}px"

    elif shape.type == "diamond":
        fill_desc = f"{bg_color}-filled " if bg_color and bg_color != "transparent" else ""
        return f"A {fill_desc}{color} diamond at ({int(bbox.x)}, {int(bbox.y)}), size {int(bbox.width)}x{int(bbox.height)}px"

    elif shape.type == "ellipse":
        fill_desc = f"{bg_color}-filled " if bg_color and bg_color != "transparent" else ""

        # Check if it's a circle (roughly equal width/height)
        if abs(bbox.width - bbox.height) < 5:
            radius = int(bbox.width / 2)
            return f"A {fill_desc}{color} circle centered at ({center_x}, {center_y}), radius {radius}px"
        else:
            return f"A {fill_desc}{color} ellipse centered at ({center_x}, {center_y}), {int(bbox.width)}x{int(bbox.height)}px"

    elif shape.type == "freedraw":
        point_info = f" ({shape.pointCount} points)" if shape.pointCount else ""
        return f"A {color} freehand drawing near ({center_x}, {center_y}), spanning {int(bbox.width)}x{int(bbox.height)}px{point_info}"

    elif shape.type == "text":
        text_content = shape.textContent or "(empty)"
        size_info = f", {int(shape.fontSize)}px" if shape.fontSize else ""
        return f'Text "{text_content}" at ({int(bbox.x)}, {int(bbox.y)}) ({color}{size_info})'

    else:
        # Fallback for unknown types
        return f"A {color} {shape.type} at ({int(bbox.x)}, {int(bbox.y)}), size {int(bbox.width)}x{int(bbox.height)}px"


def build_shapes_context(shapes: list[ShapeMetadata] | None) -> str:
    """
    Build a prompt section describing all user-drawn shapes.

    Args:
        shapes: List of shape metadata from the canvas, or None.

    Returns:
        A formatted prompt section with shape descriptions, or empty string if no shapes.

    Examples:
        >>> shapes = [arrow_shape, rect_shape, text_shape]
        >>> context = build_shapes_context(shapes)
        >>> print(context)
        ## USER-DRAWN ANNOTATIONS
        ...
    """
    if not shapes:
        return ""

    descriptions = [f"- {describe_shape(shape)}" for shape in shapes]

    return f"""
## USER-DRAWN ANNOTATIONS

The user has drawn the following shapes/annotations on the canvas to guide the edit:

{chr(10).join(descriptions)}

IMPORTANT: Interpret these visual annotations alongside the user's text command:
- **Arrows** indicate direction, movement, or point to specific elements
- **Rectangles/Circles** highlight areas to modify or focus on
- **Text annotations** contain explicit instructions or labels
- **Lines** may indicate connections, boundaries, or cut/crop lines
- **Freehand drawings** often circle or underline important areas

The annotations are visual guides - incorporate their meaning into your edit.
"""
