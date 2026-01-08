"""AI logging utilities for image input visibility.

Provides functions to create thumbnails and extract metadata from images
for logging purposes when AI endpoints receive image inputs.
"""

import base64
import io
import logging
from typing import TypedDict

from PIL import Image

logger = logging.getLogger(__name__)


class ImageMetadata(TypedDict):
    """Metadata extracted from an image."""

    width: int
    height: int
    sizeBytes: int
    mimeType: str


class ImageLogData(TypedDict):
    """Data for logging an image input."""

    thumbnail: str
    width: int
    height: int
    sizeBytes: int
    mimeType: str


def extract_base64_data(data_url: str) -> str:
    """Extract the base64 data (without data URL prefix) from a data URL."""
    if "," not in data_url:
        return data_url
    return data_url.split(",")[1]


def extract_mime_type(data_url: str) -> str:
    """Extract the MIME type from a base64 data URL."""
    if ";" not in data_url:
        return "image/png"
    prefix = data_url.split(";")[0]
    return prefix.replace("data:", "")


def create_image_thumbnail(base64_data: str, max_size: int = 128) -> str:
    """
    Create a thumbnail from base64 image data.

    Args:
        base64_data: Base64-encoded image data (without data URL prefix).
        max_size: Maximum dimension (width or height) of the thumbnail.

    Returns:
        Base64-encoded thumbnail as a data URL.
    """
    try:
        # Decode base64 to bytes
        image_bytes = base64.b64decode(base64_data)

        # Open image with PIL
        with Image.open(io.BytesIO(image_bytes)) as img:
            # Convert to RGB if necessary (handles RGBA, palette, etc.)
            if img.mode in ("RGBA", "LA", "P"):
                # Create white background for transparent images
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(
                    img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None
                )
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            # Calculate thumbnail size maintaining aspect ratio
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            # Save to bytes as PNG
            buffer = io.BytesIO()
            img.save(buffer, format="PNG", optimize=True)
            buffer.seek(0)

            # Encode as base64 data URL
            thumbnail_b64 = base64.b64encode(buffer.read()).decode("ascii")
            return f"data:image/png;base64,{thumbnail_b64}"

    except Exception as e:
        logger.warning("Failed to create thumbnail: %s", e)
        return ""


def get_image_metadata(base64_data: str, mime_type: str = "image/png") -> ImageMetadata:
    """
    Extract metadata from base64 image data.

    Args:
        base64_data: Base64-encoded image data (without data URL prefix).
        mime_type: MIME type of the image.

    Returns:
        Dictionary with width, height, sizeBytes, and mimeType.
    """
    try:
        # Decode base64 to bytes
        image_bytes = base64.b64decode(base64_data)
        size_bytes = len(image_bytes)

        # Open image with PIL to get dimensions
        with Image.open(io.BytesIO(image_bytes)) as img:
            width, height = img.size

        return ImageMetadata(
            width=width,
            height=height,
            sizeBytes=size_bytes,
            mimeType=mime_type,
        )

    except Exception as e:
        logger.warning("Failed to get image metadata: %s", e)
        # Return defaults on error
        return ImageMetadata(
            width=0,
            height=0,
            sizeBytes=len(base64.b64decode(base64_data)) if base64_data else 0,
            mimeType=mime_type,
        )


def format_image_for_log(data_url: str, max_thumbnail_size: int = 128) -> ImageLogData:
    """
    Format an image for logging with thumbnail and metadata.

    Args:
        data_url: Full data URL (data:image/png;base64,...) or raw base64.
        max_thumbnail_size: Maximum dimension for the thumbnail.

    Returns:
        Dictionary with thumbnail, width, height, sizeBytes, and mimeType.
    """
    # Extract base64 data and mime type
    base64_data = extract_base64_data(data_url)
    mime_type = extract_mime_type(data_url)

    # Get metadata
    metadata = get_image_metadata(base64_data, mime_type)

    # Create thumbnail
    thumbnail = create_image_thumbnail(base64_data, max_thumbnail_size)

    return ImageLogData(
        thumbnail=thumbnail,
        width=metadata["width"],
        height=metadata["height"],
        sizeBytes=metadata["sizeBytes"],
        mimeType=metadata["mimeType"],
    )


def log_image_inputs(
    logger_instance: logging.Logger,
    source_image: str | None = None,
    mask_image: str | None = None,
) -> None:
    """
    Log image inputs with metadata only (no base64 data).

    Convenience function to log source and/or mask images.
    Only logs dimensions and size - NOT thumbnails or full image data.

    Args:
        logger_instance: Logger to use for output.
        source_image: Source image data URL (optional).
        mask_image: Mask image data URL (optional).
    """
    image_inputs: dict[str, ImageMetadata] = {}

    if source_image:
        base64_data = extract_base64_data(source_image)
        mime_type = extract_mime_type(source_image)
        image_inputs["sourceImage"] = get_image_metadata(base64_data, mime_type)

    if mask_image:
        base64_data = extract_base64_data(mask_image)
        mime_type = extract_mime_type(mask_image)
        image_inputs["maskImage"] = get_image_metadata(base64_data, mime_type)

    if image_inputs:
        logger_instance.info("Image inputs: %s", image_inputs)


def extract_images_from_contents(contents: list) -> list[tuple[str, str]]:
    """
    Extract images from Gemini API contents structure.

    The contents can be a list of dicts with 'parts' containing 'inline_data'.

    Args:
        contents: List of content objects (dicts or objects with parts).

    Returns:
        List of (mime_type, base64_data) tuples for each image found.
    """
    images: list[tuple[str, str]] = []

    for content in contents:
        parts = None
        if isinstance(content, dict):
            parts = content.get("parts", [])
        elif hasattr(content, "parts"):
            parts = content.parts or []

        if not parts:
            continue

        for part in parts:
            inline_data = None
            if isinstance(part, dict):
                inline_data = part.get("inline_data")
            elif hasattr(part, "inline_data"):
                inline_data = part.inline_data

            if inline_data:
                if isinstance(inline_data, dict):
                    mime_type = inline_data.get("mime_type", "image/png")
                    data = inline_data.get("data", "")
                else:
                    mime_type = getattr(inline_data, "mime_type", "image/png")
                    data = getattr(inline_data, "data", "")

                if data:
                    images.append((mime_type, data))

    return images


def log_contents_images(
    logger_instance: logging.Logger,
    contents: list,
) -> None:
    """
    Log images found in Gemini API contents structure.

    Only logs metadata (dimensions, size) - NOT thumbnails or full image data.

    Args:
        logger_instance: Logger to use for output.
        contents: List of content objects from API request.
    """
    images = extract_images_from_contents(contents)

    if not images:
        return

    image_inputs: dict[str, ImageMetadata] = {}

    for i, (mime_type, base64_data) in enumerate(images):
        image_inputs[f"image_{i}"] = get_image_metadata(base64_data, mime_type)

    if image_inputs:
        logger_instance.info("Image inputs in contents: %s", image_inputs)
