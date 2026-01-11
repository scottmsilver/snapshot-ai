"""Image utility functions for data URL handling."""

from __future__ import annotations

import base64
import io
import re
from typing import NamedTuple

import numpy as np
from numpy.typing import NDArray
from PIL import Image


class DataURL(NamedTuple):
    """Parsed data URL components."""

    mime_type: str
    data: bytes


def decode_data_url(data_url: str) -> bytes:
    """
    Decode a data URL to raw bytes.

    Args:
        data_url: A data URL (e.g., "data:image/png;base64,iVBOR...")
                  or raw base64 string.

    Returns:
        Decoded bytes.

    Examples:
        >>> decode_data_url("data:image/png;base64,aGVsbG8=")
        b'hello'
        >>> decode_data_url("aGVsbG8=")
        b'hello'
    """
    if "," in data_url:
        # Data URL format: data:<mime>;base64,<data>
        _, encoded = data_url.split(",", 1)
    else:
        encoded = data_url

    return base64.b64decode(encoded)


def encode_data_url(data: bytes, mime_type: str = "image/png") -> str:
    """
    Encode bytes as a data URL.

    Args:
        data: Raw bytes to encode.
        mime_type: MIME type for the data URL.

    Returns:
        Data URL string.

    Examples:
        >>> encode_data_url(b'hello', 'text/plain')
        'data:text/plain;base64,aGVsbG8='
    """
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def get_mime_type(data_url: str, default: str = "image/png") -> str:
    """
    Extract MIME type from a data URL.

    Args:
        data_url: A data URL string.
        default: Default MIME type if extraction fails.

    Returns:
        Extracted or default MIME type.

    Examples:
        >>> get_mime_type("data:image/jpeg;base64,...")
        'image/jpeg'
        >>> get_mime_type("not a data url")
        'image/png'
    """
    if not data_url.startswith("data:"):
        return default

    match = re.match(r"data:([^;,]+)", data_url)
    return match.group(1) if match else default


def parse_data_url(data_url: str) -> DataURL:
    """
    Parse a data URL into its components.

    Args:
        data_url: A data URL string.

    Returns:
        DataURL namedtuple with mime_type and data.

    Examples:
        >>> result = parse_data_url("data:image/png;base64,aGVsbG8=")
        >>> result.mime_type
        'image/png'
        >>> result.data
        b'hello'
    """
    return DataURL(
        mime_type=get_mime_type(data_url),
        data=decode_data_url(data_url),
    )


def image_bytes_to_array(data: bytes) -> NDArray[np.uint8]:
    """
    Convert image bytes to a numpy array.

    Args:
        data: Raw image bytes (PNG, JPEG, etc.)

    Returns:
        Numpy array of shape (H, W, 3) with RGB values.
        Alpha channel is discarded if present.

    Examples:
        >>> # Assuming valid PNG bytes
        >>> arr = image_bytes_to_array(png_bytes)
        >>> arr.shape
        (100, 100, 3)
    """
    img = Image.open(io.BytesIO(data))

    # Convert to RGB if necessary (handles RGBA, grayscale, palette, etc.)
    if img.mode != "RGB":
        img = img.convert("RGB")

    return np.array(img, dtype=np.uint8)
