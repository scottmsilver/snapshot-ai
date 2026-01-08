"""Tests for POST /api/images/generate and /api/images/inpaint endpoints."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app
from schemas import GenerateImageRequest, GenerateImageResponse
from schemas import InpaintRequest, InpaintResponse


# Test fixtures
VALID_BASE64_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


class TestGenerateImageEndpoint:
    """Tests for POST /api/images/generate."""

    def test_missing_api_key(self, client, monkeypatch):
        """Should return 500 if API key is not configured."""
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

        response = client.post(
            "/api/images/generate",
            json={
                "model": "gemini-3-pro-image-preview",
                "sourceImage": VALID_BASE64_IMAGE,
                "prompt": "Make the sky blue",
            },
        )

        assert response.status_code == 500
        assert "GEMINI_API_KEY" in response.json()["detail"]

    def test_validation_missing_model(self, client):
        """Should return 422 if model is missing."""
        response = client.post(
            "/api/images/generate",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
                "prompt": "Make the sky blue",
            },
        )

        assert response.status_code == 422

    def test_validation_missing_source_image(self, client):
        """Should return 422 if sourceImage is missing."""
        response = client.post(
            "/api/images/generate",
            json={
                "model": "gemini-3-pro-image-preview",
                "prompt": "Make the sky blue",
            },
        )

        assert response.status_code == 422

    def test_validation_missing_prompt(self, client):
        """Should return 422 if prompt is missing."""
        response = client.post(
            "/api/images/generate",
            json={
                "model": "gemini-3-pro-image-preview",
                "sourceImage": VALID_BASE64_IMAGE,
            },
        )

        assert response.status_code == 422

    def test_validation_invalid_source_image_not_data_url(self, client):
        """Should return 422 if sourceImage is not a data URL."""
        response = client.post(
            "/api/images/generate",
            json={
                "model": "gemini-3-pro-image-preview",
                "sourceImage": "not-a-data-url",
                "prompt": "Make the sky blue",
            },
        )

        assert response.status_code == 422

    def test_validation_empty_prompt(self, client):
        """Should return 422 if prompt is empty."""
        response = client.post(
            "/api/images/generate",
            json={
                "model": "gemini-3-pro-image-preview",
                "sourceImage": VALID_BASE64_IMAGE,
                "prompt": "",
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_successful_image_generation(self, client, monkeypatch):
        """Should return generated image on success."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        # Create mock response with inline_data
        mock_inline_data = MagicMock()
        mock_inline_data.mime_type = "image/png"
        mock_inline_data.data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

        mock_part = MagicMock()
        mock_part.inline_data = mock_inline_data

        mock_content = MagicMock()
        mock_content.parts = [mock_part]

        mock_candidate = MagicMock()
        mock_candidate.content = mock_content

        mock_response = MagicMock()
        mock_response.candidates = [mock_candidate]

        # Patch the genai client
        with (
            patch("google.genai.Client") as mock_client_class,
            patch("google.genai.types") as mock_types,
        ):
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            # Mock GenerateContentConfig
            mock_types.GenerateContentConfig.return_value = MagicMock()

            # Make generate_content async
            mock_client.aio.models.generate_content = AsyncMock(
                return_value=mock_response
            )

            response = client.post(
                "/api/images/generate",
                json={
                    "model": "gemini-3-pro-image-preview",
                    "sourceImage": VALID_BASE64_IMAGE,
                    "prompt": "Make the sky blue",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert "imageData" in data
            assert data["imageData"].startswith("data:image/png;base64,")
            assert "raw" in data

    @pytest.mark.asyncio
    async def test_no_image_returned(self, client, monkeypatch):
        """Should return 500 if no image is returned from API."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        # Create mock response with no image data
        mock_part = MagicMock()
        mock_part.inline_data = None  # No image data

        mock_content = MagicMock()
        mock_content.parts = [mock_part]

        mock_candidate = MagicMock()
        mock_candidate.content = mock_content

        mock_response = MagicMock()
        mock_response.candidates = [mock_candidate]

        with (
            patch("google.genai.Client") as mock_client_class,
            patch("google.genai.types") as mock_types,
        ):
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            mock_types.GenerateContentConfig.return_value = MagicMock()
            mock_client.aio.models.generate_content = AsyncMock(
                return_value=mock_response
            )

            response = client.post(
                "/api/images/generate",
                json={
                    "model": "gemini-3-pro-image-preview",
                    "sourceImage": VALID_BASE64_IMAGE,
                    "prompt": "Make the sky blue",
                },
            )

            assert response.status_code == 500
            assert "No image data returned" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_api_error_handling(self, client, monkeypatch):
        """Should return 500 on API errors."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        with (
            patch("google.genai.Client") as mock_client_class,
            patch("google.genai.types") as mock_types,
        ):
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            mock_types.GenerateContentConfig.return_value = MagicMock()
            mock_client.aio.models.generate_content = AsyncMock(
                side_effect=Exception("API rate limit exceeded")
            )

            response = client.post(
                "/api/images/generate",
                json={
                    "model": "gemini-3-pro-image-preview",
                    "sourceImage": VALID_BASE64_IMAGE,
                    "prompt": "Make the sky blue",
                },
            )

            assert response.status_code == 500
            assert "API rate limit exceeded" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_empty_candidates(self, client, monkeypatch):
        """Should return 500 if candidates is empty."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        mock_response = MagicMock()
        mock_response.candidates = []

        with (
            patch("google.genai.Client") as mock_client_class,
            patch("google.genai.types") as mock_types,
        ):
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            mock_types.GenerateContentConfig.return_value = MagicMock()
            mock_client.aio.models.generate_content = AsyncMock(
                return_value=mock_response
            )

            response = client.post(
                "/api/images/generate",
                json={
                    "model": "gemini-3-pro-image-preview",
                    "sourceImage": VALID_BASE64_IMAGE,
                    "prompt": "Make the sky blue",
                },
            )

            assert response.status_code == 500
            assert "No image data returned" in response.json()["detail"]


class TestRequestSchema:
    """Tests for GenerateImageRequest schema validation."""

    def test_valid_minimal_request(self):
        """Should accept minimal valid request."""
        req = GenerateImageRequest(
            model="gemini-3-pro-image-preview",
            sourceImage=VALID_BASE64_IMAGE,
            prompt="Make the sky blue",
        )
        assert req.model == "gemini-3-pro-image-preview"
        assert req.sourceImage == VALID_BASE64_IMAGE
        assert req.prompt == "Make the sky blue"
        assert req.maskImage is None
        assert req.isImageGeneration is None
        assert req.logLabel is None

    def test_valid_full_request(self):
        """Should accept full request with all optional fields."""
        req = GenerateImageRequest(
            model="gemini-3-pro-image-preview",
            sourceImage=VALID_BASE64_IMAGE,
            prompt="Make the sky blue",
            maskImage=VALID_BASE64_IMAGE,
            isImageGeneration=True,
            logLabel="test-call",
        )
        assert req.maskImage == VALID_BASE64_IMAGE
        assert req.isImageGeneration is True
        assert req.logLabel == "test-call"

    def test_invalid_source_image(self):
        """Should reject invalid source image."""
        with pytest.raises(ValueError):
            GenerateImageRequest(
                model="gemini-3-pro-image-preview",
                sourceImage="not-a-data-url",
                prompt="Make the sky blue",
            )

    def test_invalid_mask_image(self):
        """Should reject invalid mask image."""
        with pytest.raises(ValueError):
            GenerateImageRequest(
                model="gemini-3-pro-image-preview",
                sourceImage=VALID_BASE64_IMAGE,
                prompt="Make the sky blue",
                maskImage="not-a-data-url",
            )


class TestResponseSchema:
    """Tests for GenerateImageResponse schema."""

    def test_valid_response(self):
        """Should accept valid response."""
        resp = GenerateImageResponse(
            raw={"candidates": []},
            imageData=VALID_BASE64_IMAGE,
        )
        assert resp.raw == {"candidates": []}
        assert resp.imageData == VALID_BASE64_IMAGE


class TestHelperFunctions:
    """Tests for helper functions used by the endpoint."""

    def test_extract_base64_data(self):
        """Should extract base64 data from data URL."""
        from main import extract_base64_data

        data_url = "data:image/png;base64,ABC123=="
        result = extract_base64_data(data_url)
        assert result == "ABC123=="

    def test_extract_base64_data_no_prefix(self):
        """Should return input if no comma present."""
        from main import extract_base64_data

        data = "ABC123=="
        result = extract_base64_data(data)
        assert result == "ABC123=="

    def test_extract_mime_type(self):
        """Should extract MIME type from data URL."""
        from main import extract_mime_type

        data_url = "data:image/png;base64,ABC123=="
        result = extract_mime_type(data_url)
        assert result == "image/png"

    def test_extract_mime_type_jpeg(self):
        """Should extract JPEG MIME type."""
        from main import extract_mime_type

        data_url = "data:image/jpeg;base64,ABC123=="
        result = extract_mime_type(data_url)
        assert result == "image/jpeg"

    def test_extract_mime_type_no_semicolon(self):
        """Should return default if no semicolon present."""
        from main import extract_mime_type

        data = "ABC123=="
        result = extract_mime_type(data)
        assert result == "image/png"

    def test_extract_image_from_response_success(self):
        """Should extract image from valid response."""
        from main import extract_image_from_response

        mock_inline_data = MagicMock()
        mock_inline_data.mime_type = "image/png"
        mock_inline_data.data = "ABC123=="

        mock_part = MagicMock()
        mock_part.inline_data = mock_inline_data

        mock_content = MagicMock()
        mock_content.parts = [mock_part]

        mock_candidate = MagicMock()
        mock_candidate.content = mock_content

        mock_response = MagicMock()
        mock_response.candidates = [mock_candidate]

        result = extract_image_from_response(mock_response)
        assert result == "data:image/png;base64,ABC123=="

    def test_extract_image_from_response_no_candidates(self):
        """Should return None if no candidates."""
        from main import extract_image_from_response

        mock_response = MagicMock()
        mock_response.candidates = []

        result = extract_image_from_response(mock_response)
        assert result is None

    def test_extract_image_from_response_no_content(self):
        """Should return None if no content."""
        from main import extract_image_from_response

        mock_candidate = MagicMock()
        mock_candidate.content = None

        mock_response = MagicMock()
        mock_response.candidates = [mock_candidate]

        result = extract_image_from_response(mock_response)
        assert result is None

    def test_extract_image_from_response_no_parts(self):
        """Should return None if no parts."""
        from main import extract_image_from_response

        mock_content = MagicMock()
        mock_content.parts = None

        mock_candidate = MagicMock()
        mock_candidate.content = mock_content

        mock_response = MagicMock()
        mock_response.candidates = [mock_candidate]

        result = extract_image_from_response(mock_response)
        assert result is None

    def test_extract_image_from_response_no_inline_data(self):
        """Should return None if no inline_data."""
        from main import extract_image_from_response

        mock_part = MagicMock()
        mock_part.inline_data = None

        mock_content = MagicMock()
        mock_content.parts = [mock_part]

        mock_candidate = MagicMock()
        mock_candidate.content = mock_content

        mock_response = MagicMock()
        mock_response.candidates = [mock_candidate]

        result = extract_image_from_response(mock_response)
        assert result is None


# =============================================================================
# Tests for POST /api/images/inpaint - Agentic inpainting with SSE streaming
# =============================================================================


def parse_sse_events(response_text: str) -> list[dict]:
    """
    Parse SSE response text into a list of events.

    Each SSE event has format:
    event: <type>
    data: <json>

    (blank line separates events)
    """
    import json

    events = []
    current_event = {}

    for line in response_text.split("\n"):
        line = line.strip()
        if line.startswith("event:"):
            current_event["type"] = line[6:].strip()
        elif line.startswith("data:"):
            current_event["data"] = json.loads(line[5:].strip())
        elif line == "" and current_event:
            if "type" in current_event and "data" in current_event:
                events.append(current_event)
            current_event = {}

    # Handle last event if no trailing newline
    if "type" in current_event and "data" in current_event:
        events.append(current_event)

    return events


class TestInpaintEndpoint:
    """Tests for POST /api/images/inpaint (now uses SSE streaming)."""

    def test_validation_missing_source_image(self, client):
        """Should return 422 if sourceImage is missing."""
        response = client.post(
            "/api/images/inpaint",
            json={
                "maskImage": VALID_BASE64_IMAGE,
                "prompt": "Remove this object",
            },
        )

        assert response.status_code == 422

    def test_validation_missing_mask_image(self, client):
        """Should return 422 if maskImage is missing."""
        response = client.post(
            "/api/images/inpaint",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
                "prompt": "Remove this object",
            },
        )

        assert response.status_code == 422

    def test_validation_missing_prompt(self, client):
        """Should return 422 if prompt is missing."""
        response = client.post(
            "/api/images/inpaint",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
                "maskImage": VALID_BASE64_IMAGE,
            },
        )

        assert response.status_code == 422

    def test_validation_invalid_source_image_not_data_url(self, client):
        """Should return 422 if sourceImage is not a data URL."""
        response = client.post(
            "/api/images/inpaint",
            json={
                "sourceImage": "not-a-data-url",
                "maskImage": VALID_BASE64_IMAGE,
                "prompt": "Remove this object",
            },
        )

        assert response.status_code == 422

    def test_validation_invalid_mask_image_not_data_url(self, client):
        """Should return 422 if maskImage is not a data URL."""
        response = client.post(
            "/api/images/inpaint",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
                "maskImage": "not-a-data-url",
                "prompt": "Remove this object",
            },
        )

        assert response.status_code == 422

    def test_validation_empty_prompt(self, client):
        """Should return 422 if prompt is empty."""
        response = client.post(
            "/api/images/inpaint",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
                "maskImage": VALID_BASE64_IMAGE,
                "prompt": "",
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_successful_inpaint_sse(self, client, monkeypatch):
        """Should return SSE stream with progress and complete events."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        # Mock final state from the graph
        mock_final_state = {
            "current_result": VALID_BASE64_IMAGE,
            "refined_prompt": "Edit the selected region: Make it blue",
            "current_iteration": 2,
        }

        # Create async generator that yields mock data
        async def mock_astream(*args, **kwargs):
            # Yield a progress event
            yield (
                "custom",
                {
                    "step": "planning",
                    "message": "Planning the edit...",
                },
            )
            # Yield the final state
            yield ("values", mock_final_state)

        with patch("main.agentic_edit_graph") as mock_graph:
            mock_graph.astream = mock_astream

            response = client.post(
                "/api/images/inpaint",
                json={
                    "sourceImage": VALID_BASE64_IMAGE,
                    "maskImage": VALID_BASE64_IMAGE,
                    "prompt": "Make it blue",
                },
            )

            # SSE always returns 200, errors are in the stream
            assert response.status_code == 200
            assert (
                response.headers["content-type"] == "text/event-stream; charset=utf-8"
            )

            # Parse SSE events
            events = parse_sse_events(response.text)

            # Should have progress events and a complete event
            event_types = [e["type"] for e in events]
            assert "progress" in event_types
            assert "complete" in event_types

            # Find the complete event
            complete_event = next(e for e in events if e["type"] == "complete")
            assert "imageData" in complete_event["data"]
            assert complete_event["data"]["imageData"].startswith("data:image/")
            assert "iterations" in complete_event["data"]
            assert complete_event["data"]["iterations"] == 2

    @pytest.mark.asyncio
    async def test_inpaint_error_yields_sse_error(self, client, monkeypatch):
        """Should return SSE error event when graph throws an error."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        async def mock_astream_error(*args, **kwargs):
            raise Exception("API rate limit exceeded")
            yield  # Make this a generator

        with patch("main.agentic_edit_graph") as mock_graph:
            mock_graph.astream = mock_astream_error

            response = client.post(
                "/api/images/inpaint",
                json={
                    "sourceImage": VALID_BASE64_IMAGE,
                    "maskImage": VALID_BASE64_IMAGE,
                    "prompt": "Edit this",
                },
            )

            # SSE always returns 200, errors are in the stream
            assert response.status_code == 200

            # Parse SSE events
            events = parse_sse_events(response.text)

            # Should have an error event
            error_event = next((e for e in events if e["type"] == "error"), None)
            assert error_event is not None
            assert "API rate limit exceeded" in error_event["data"]["message"]

    @pytest.mark.asyncio
    async def test_inpaint_no_image_yields_sse_error(self, client, monkeypatch):
        """Should return SSE error event when no image is generated."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        # Mock final state with no image
        mock_final_state = {
            "current_result": None,
            "refined_prompt": "Edit the selected region",
            "current_iteration": 1,
        }

        async def mock_astream(*args, **kwargs):
            yield ("values", mock_final_state)

        with patch("main.agentic_edit_graph") as mock_graph:
            mock_graph.astream = mock_astream

            response = client.post(
                "/api/images/inpaint",
                json={
                    "sourceImage": VALID_BASE64_IMAGE,
                    "maskImage": VALID_BASE64_IMAGE,
                    "prompt": "Edit this",
                },
            )

            # SSE always returns 200, errors are in the stream
            assert response.status_code == 200

            # Parse SSE events
            events = parse_sse_events(response.text)

            # Should have an error event about no image
            error_event = next((e for e in events if e["type"] == "error"), None)
            assert error_event is not None
            assert "No image generated" in error_event["data"]["message"]

    @pytest.mark.asyncio
    async def test_inpaint_missing_api_key_yields_sse_error(self, client, monkeypatch):
        """Should return SSE error event when API key is not configured."""
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

        # The graph will throw when TransparentGeminiClient is instantiated
        async def mock_astream_error(*args, **kwargs):
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY must be set")
            yield  # Make this a generator

        with patch("main.agentic_edit_graph") as mock_graph:
            mock_graph.astream = mock_astream_error

            response = client.post(
                "/api/images/inpaint",
                json={
                    "sourceImage": VALID_BASE64_IMAGE,
                    "maskImage": VALID_BASE64_IMAGE,
                    "prompt": "Remove this object",
                },
            )

            # SSE always returns 200, errors are in the stream
            assert response.status_code == 200

            # Parse SSE events
            events = parse_sse_events(response.text)

            # Should have an error event about API key
            error_event = next((e for e in events if e["type"] == "error"), None)
            assert error_event is not None
            assert "GEMINI_API_KEY" in error_event["data"]["message"]


class TestInpaintRequestSchema:
    """Tests for InpaintRequest schema validation."""

    def test_valid_minimal_request(self):
        """Should accept minimal valid request."""
        req = InpaintRequest(
            sourceImage=VALID_BASE64_IMAGE,
            maskImage=VALID_BASE64_IMAGE,
            prompt="Remove this object",
        )
        assert req.sourceImage == VALID_BASE64_IMAGE
        assert req.maskImage == VALID_BASE64_IMAGE
        assert req.prompt == "Remove this object"
        assert req.thinkingBudget is None

    def test_valid_request_with_thinking_budget(self):
        """Should accept request with thinkingBudget."""
        req = InpaintRequest(
            sourceImage=VALID_BASE64_IMAGE,
            maskImage=VALID_BASE64_IMAGE,
            prompt="Remove this object",
            thinkingBudget=4096,
        )
        assert req.thinkingBudget == 4096

    def test_invalid_source_image(self):
        """Should reject invalid source image."""
        with pytest.raises(ValueError):
            InpaintRequest(
                sourceImage="not-a-data-url",
                maskImage=VALID_BASE64_IMAGE,
                prompt="Remove this object",
            )

    def test_invalid_mask_image(self):
        """Should reject invalid mask image."""
        with pytest.raises(ValueError):
            InpaintRequest(
                sourceImage=VALID_BASE64_IMAGE,
                maskImage="not-a-data-url",
                prompt="Remove this object",
            )


# Note: TestInpaintResponseSchema removed - endpoint now returns SSE, not JSON
# The InpaintResponse schema is no longer used for the endpoint response.
# Mask usage is now tested in test_agentic_edit.py as part of the graph tests.
