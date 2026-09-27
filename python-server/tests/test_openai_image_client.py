"""OpenAI image edits preserve input ordering and mask meaning."""

import base64
from io import BytesIO
from types import SimpleNamespace

import pytest
from PIL import Image

from services.openai_image_client import MissingOpenAIKeyError, edit_openai_image


def image_bytes(mode: str, size: tuple[int, int], color, format: str = "PNG") -> bytes:
    image = Image.new(mode, size, color)
    output = BytesIO()
    image.save(output, format=format)
    return output.getvalue()


class FakeImages:
    def __init__(self, output: bytes):
        self.output = output
        self.arguments = None

    async def edit(self, **kwargs):
        self.arguments = kwargs
        return SimpleNamespace(
            data=[SimpleNamespace(b64_json=base64.b64encode(self.output).decode())]
        )


class FakeClient:
    def __init__(self, images: FakeImages):
        self.images = images

    async def close(self):
        pass


@pytest.mark.asyncio
async def test_sends_clean_png_first_and_annotation_second(monkeypatch):
    from services import openai_image_client

    fake = FakeImages(image_bytes("RGB", (3, 2), "blue"))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(
        openai_image_client,
        "AsyncOpenAI",
        lambda **kwargs: FakeClient(fake),
    )
    source = image_bytes("RGB", (3, 2), "red", format="JPEG")
    annotated = image_bytes("RGB", (3, 2), "green")

    result = await edit_openai_image(
        prompt="Move the red shape",
        source_image=(source, "image/jpeg"),
        annotated_image=(annotated, "image/png"),
    )

    assert result == fake.output
    assert fake.arguments["model"] == "gpt-image-2.5-sunburst"
    assert fake.arguments["output_format"] == "png"
    assert fake.arguments["prompt"] == "Move the red shape"
    images = fake.arguments["image"]
    assert len(images) == 2
    assert Image.open(images[0]).format == "PNG"
    assert Image.open(images[0]).size == (3, 2)
    assert Image.open(images[1]).format == "PNG"


@pytest.mark.asyncio
async def test_white_mask_becomes_transparent_and_black_stays_opaque(monkeypatch):
    from services import openai_image_client

    fake = FakeImages(image_bytes("RGB", (3, 1), "blue"))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(
        openai_image_client,
        "AsyncOpenAI",
        lambda **kwargs: FakeClient(fake),
    )
    mask = Image.new("RGB", (3, 1))
    mask.putdata([(255, 255, 255), (128, 128, 128), (0, 0, 0)])
    output = BytesIO()
    mask.save(output, format="PNG")

    await edit_openai_image(
        prompt="Edit only the white area",
        source_image=(image_bytes("RGB", (3, 1), "red"), "image/png"),
        mask_image=(output.getvalue(), "image/png"),
    )

    converted_mask = Image.open(fake.arguments["mask"])
    assert converted_mask.format == "PNG"
    assert list(converted_mask.getchannel("A").getdata()) == [0, 127, 255]


@pytest.mark.asyncio
async def test_rejects_mask_with_different_size(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    with pytest.raises(ValueError, match="same pixel dimensions"):
        await edit_openai_image(
            prompt="Edit this",
            source_image=(image_bytes("RGB", (2, 2), "red"), "image/png"),
            mask_image=(image_bytes("RGB", (1, 1), "white"), "image/png"),
        )


@pytest.mark.asyncio
async def test_missing_key_has_clear_configuration_error(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(MissingOpenAIKeyError, match="OPENAI_API_KEY"):
        await edit_openai_image(
            prompt="Edit this",
            source_image=(image_bytes("RGB", (1, 1), "red"), "image/png"),
        )
