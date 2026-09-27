"""OpenAI image edits for clean and annotated canvas captures."""

import base64
import os
from io import BytesIO

from openai import AsyncOpenAI
from PIL import Image, ImageOps

from schemas.config import OPENAI_IMAGE_MODEL


class MissingOpenAIKeyError(RuntimeError):
    """The selected image provider has no server credential."""


def _png_file(image_data: bytes, name: str) -> tuple[BytesIO, tuple[int, int]]:
    with Image.open(BytesIO(image_data)) as image:
        converted = image.convert("RGBA")
        size = converted.size
        output = BytesIO()
        converted.save(output, format="PNG")
    output.name = name
    output.seek(0)
    return output, size


def _openai_mask(mask_data: bytes, source_size: tuple[int, int]) -> BytesIO:
    with Image.open(BytesIO(mask_data)) as mask:
        if mask.size != source_size:
            raise ValueError("Mask and source image must have the same pixel dimensions")
        luminance = mask.convert("L")
        alpha = ImageOps.invert(luminance)
        converted = Image.new("RGBA", source_size, "white")
        converted.putalpha(alpha)
        output = BytesIO()
        converted.save(output, format="PNG")
    output.name = "mask.png"
    output.seek(0)
    return output


async def edit_openai_image(
    *,
    prompt: str,
    source_image: tuple[bytes, str],
    annotated_image: tuple[bytes, str] | None = None,
    mask_image: tuple[bytes, str] | None = None,
) -> bytes:
    """Edit the first image; additional images provide visual guidance."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise MissingOpenAIKeyError(
            "OpenAI image editing is unavailable: OPENAI_API_KEY is not configured on the server"
        )

    source, source_size = _png_file(source_image[0], "source.png")
    images = [source]
    if annotated_image:
        annotated, _ = _png_file(annotated_image[0], "annotated.png")
        images.append(annotated)
    mask = _openai_mask(mask_image[0], source_size) if mask_image else None

    client = AsyncOpenAI(api_key=api_key)
    try:
        kwargs = {
            "model": OPENAI_IMAGE_MODEL,
            "image": images,
            "prompt": prompt,
            "output_format": "png",
        }
        if mask is not None:
            kwargs["mask"] = mask
        response = await client.images.edit(**kwargs)
    finally:
        await client.close()

    if not response.data or not response.data[0].b64_json:
        raise ValueError("OpenAI returned no image data")
    return base64.b64decode(response.data[0].b64_json)
