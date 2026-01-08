"""Utility functions for the Python AI server."""

from .sse import (
    format_sse_event,
    format_progress_event,
    format_complete_event,
    format_error_event,
)

from .ai_logging import (
    create_image_thumbnail,
    get_image_metadata,
    format_image_for_log,
    log_image_inputs,
    log_contents_images,
    extract_images_from_contents,
    ImageMetadata,
    ImageLogData,
)

__all__ = [
    "format_sse_event",
    "format_progress_event",
    "format_complete_event",
    "format_error_event",
    "create_image_thumbnail",
    "get_image_metadata",
    "format_image_for_log",
    "log_image_inputs",
    "log_contents_images",
    "extract_images_from_contents",
    "ImageMetadata",
    "ImageLogData",
]
