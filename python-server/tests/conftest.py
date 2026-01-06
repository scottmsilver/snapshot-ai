"""Pytest configuration and fixtures."""

import json
import os
import sys
import warnings
import zipfile
from pathlib import Path
from typing import Any

import pytest
from dotenv import load_dotenv

# Configure pytest-asyncio
pytest_plugins = ["pytest_asyncio"]


def pytest_configure(config):
    """Configure pytest settings."""
    # Filter out the google genai aiohttp deprecation warning (from external library)
    warnings.filterwarnings(
        "ignore",
        message="Inheritance class AiohttpClientSession from ClientSession is discouraged",
        category=DeprecationWarning,
    )


# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Path to manipulation test cases
MANIPULATIONS_DIR = Path(__file__).parent.parent.parent / "manipulations"


@pytest.fixture
def manipulations_dir() -> Path:
    """Return path to manipulations directory."""
    return MANIPULATIONS_DIR


def load_manipulation_case(zip_path: Path) -> dict[str, Any]:
    """Load a manipulation case from a zip file.

    Returns dict with:
        - case: parsed case.json
        - source_image: base64 data URL
        - alpha_mask: base64 data URL
        - output_image: base64 data URL (if available)
        - command: text command
        - enriched_prompt: text prompt
        - reference_points: list
        - markup_shapes: list
    """
    import base64

    result = {}

    with zipfile.ZipFile(zip_path, "r") as zf:
        # Load case.json
        with zf.open("case.json") as f:
            result["case"] = json.load(f)

        # Load command.txt
        try:
            with zf.open("command.txt") as f:
                result["command"] = f.read().decode("utf-8").strip()
        except KeyError:
            result["command"] = result["case"].get("command", "")

        # Load enriched-prompt.txt
        try:
            with zf.open("enriched-prompt.txt") as f:
                result["enriched_prompt"] = f.read().decode("utf-8").strip()
        except KeyError:
            result["enriched_prompt"] = result["case"].get("enrichedPrompt", "")

        # Load reference-points.json
        try:
            with zf.open("reference-points.json") as f:
                result["reference_points"] = json.load(f)
        except KeyError:
            result["reference_points"] = result["case"].get("referencePoints", [])

        # Load markup-shapes.json
        try:
            with zf.open("markup-shapes.json") as f:
                result["markup_shapes"] = json.load(f)
        except KeyError:
            result["markup_shapes"] = result["case"].get("markupShapes", [])

        # Load images as base64 data URLs
        for img_name, key in [
            ("assets/source.png", "source_image"),
            ("assets/alpha-mask.png", "alpha_mask"),
            ("assets/output.png", "output_image"),
        ]:
            try:
                with zf.open(img_name) as f:
                    img_data = f.read()
                    b64 = base64.b64encode(img_data).decode("utf-8")
                    result[key] = f"data:image/png;base64,{b64}"
            except KeyError:
                result[key] = None

    return result


@pytest.fixture
def sample_manipulation_case(manipulations_dir: Path) -> dict[str, Any] | None:
    """Load the most recent manipulation case for testing."""
    zip_files = sorted(manipulations_dir.glob("*.zip"), reverse=True)
    if not zip_files:
        return None
    return load_manipulation_case(zip_files[0])


@pytest.fixture
def all_manipulation_cases(manipulations_dir: Path) -> list[dict[str, Any]]:
    """Load all manipulation cases for testing."""
    zip_files = sorted(manipulations_dir.glob("*.zip"))
    return [load_manipulation_case(zf) for zf in zip_files]


@pytest.fixture
def small_test_image() -> str:
    """Return a small test image as base64 data URL (1x1 red pixel)."""
    import base64

    # 1x1 red PNG
    png_data = bytes(
        [
            0x89,
            0x50,
            0x4E,
            0x47,
            0x0D,
            0x0A,
            0x1A,
            0x0A,  # PNG signature
            0x00,
            0x00,
            0x00,
            0x0D,
            0x49,
            0x48,
            0x44,
            0x52,  # IHDR chunk
            0x00,
            0x00,
            0x00,
            0x01,
            0x00,
            0x00,
            0x00,
            0x01,  # 1x1
            0x08,
            0x02,
            0x00,
            0x00,
            0x00,
            0x90,
            0x77,
            0x53,
            0xDE,
            0x00,
            0x00,
            0x00,
            0x0C,
            0x49,
            0x44,
            0x41,  # IDAT chunk
            0x54,
            0x08,
            0xD7,
            0x63,
            0xF8,
            0xCF,
            0xC0,
            0x00,
            0x00,
            0x00,
            0x03,
            0x00,
            0x01,
            0x00,
            0x05,
            0xFE,
            0xD4,
            0xEF,
            0x00,
            0x00,
            0x00,
            0x00,
            0x49,
            0x45,  # IEND chunk
            0x4E,
            0x44,
            0xAE,
            0x42,
            0x60,
            0x82,
        ]
    )
    b64 = base64.b64encode(png_data).decode("utf-8")
    return f"data:image/png;base64,{b64}"
