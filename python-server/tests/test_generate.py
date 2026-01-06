"""Tests for POST /api/ai/generate endpoint."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock

# Import app after setting up mocks
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app
from schemas import GenerateTextRequest, GenerateTextResponse


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


class TestGenerateEndpoint:
    """Tests for POST /api/ai/generate."""

    def test_missing_api_key(self, client, monkeypatch):
        """Should return 500 if API key is not configured."""
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

        response = client.post(
            "/api/ai/generate",
            json={
                "model": "gemini-3-flash-preview",
                "contents": [{"parts": [{"text": "Hello"}]}],
            },
        )

        assert response.status_code == 500
        assert "GEMINI_API_KEY" in response.json()["detail"]

    def test_validation_missing_model(self, client):
        """Should return 422 if model is missing."""
        response = client.post(
            "/api/ai/generate",
            json={
                "contents": [{"parts": [{"text": "Hello"}]}],
            },
        )

        assert response.status_code == 422

    def test_validation_missing_contents(self, client):
        """Should return 422 if contents is missing."""
        response = client.post(
            "/api/ai/generate",
            json={
                "model": "gemini-3-flash-preview",
            },
        )

        assert response.status_code == 422

    def test_validation_empty_contents(self, client):
        """Should return 422 if contents is empty."""
        response = client.post(
            "/api/ai/generate",
            json={
                "model": "gemini-3-flash-preview",
                "contents": [],
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_successful_generation(self, client, monkeypatch):
        """Should return generated text on success."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        # Create mock response
        mock_part = MagicMock()
        mock_part.thought = False
        mock_part.text = "Hello, I'm Gemini!"
        mock_part.function_call = None

        mock_content = MagicMock()
        mock_content.parts = [mock_part]

        mock_candidate = MagicMock()
        mock_candidate.content = mock_content

        mock_response = MagicMock()
        mock_response.candidates = [mock_candidate]

        # Patch the genai client and types (imported inside the function)
        with (
            patch("google.genai.Client") as mock_client_class,
            patch("google.genai.types") as mock_types,
        ):
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            # Make generate_content async
            mock_client.aio.models.generate_content = AsyncMock(
                return_value=mock_response
            )

            response = client.post(
                "/api/ai/generate",
                json={
                    "model": "gemini-3-flash-preview",
                    "contents": [{"parts": [{"text": "Hello"}]}],
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert data["text"] == "Hello, I'm Gemini!"
            assert data["thinking"] == ""
            # functionCall is excluded when None (to match Express behavior)
            assert "functionCall" not in data

    @pytest.mark.asyncio
    async def test_generation_with_thinking(self, client, monkeypatch):
        """Should return thinking text when available."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        # Create mock response with thinking
        mock_thinking_part = MagicMock()
        mock_thinking_part.thought = True
        mock_thinking_part.text = "Let me think about this..."

        mock_text_part = MagicMock()
        mock_text_part.thought = False
        mock_text_part.text = "The answer is 42."
        mock_text_part.function_call = None

        mock_content = MagicMock()
        mock_content.parts = [mock_thinking_part, mock_text_part]

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
            mock_client.aio.models.generate_content = AsyncMock(
                return_value=mock_response
            )

            response = client.post(
                "/api/ai/generate",
                json={
                    "model": "gemini-3-flash-preview",
                    "contents": [{"parts": [{"text": "What is the answer?"}]}],
                    "includeThoughts": True,
                    "thinkingBudget": 4096,
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert data["text"] == "The answer is 42."
            assert data["thinking"] == "Let me think about this..."

    @pytest.mark.asyncio
    async def test_generation_with_function_call(self, client, monkeypatch):
        """Should return function call when present."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        # Create mock response with function call
        mock_fc = MagicMock()
        mock_fc.name = "get_weather"
        mock_fc.args = {"location": "San Francisco"}

        mock_part = MagicMock()
        mock_part.thought = False
        mock_part.text = None
        mock_part.function_call = mock_fc

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
            mock_client.aio.models.generate_content = AsyncMock(
                return_value=mock_response
            )

            response = client.post(
                "/api/ai/generate",
                json={
                    "model": "gemini-3-flash-preview",
                    "contents": [{"parts": [{"text": "What's the weather?"}]}],
                    "tools": [
                        {
                            "function_declarations": [
                                {
                                    "name": "get_weather",
                                    "description": "Get weather for a location",
                                }
                            ]
                        }
                    ],
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert data["functionCall"] is not None
            assert data["functionCall"]["name"] == "get_weather"
            assert data["functionCall"]["args"]["location"] == "San Francisco"

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
            mock_client.aio.models.generate_content = AsyncMock(
                side_effect=Exception("API rate limit exceeded")
            )

            response = client.post(
                "/api/ai/generate",
                json={
                    "model": "gemini-3-flash-preview",
                    "contents": [{"parts": [{"text": "Hello"}]}],
                },
            )

            assert response.status_code == 500
            assert "API rate limit exceeded" in response.json()["detail"]


class TestRequestSchema:
    """Tests for GenerateTextRequest schema validation."""

    def test_valid_minimal_request(self):
        """Should accept minimal valid request."""
        req = GenerateTextRequest(
            model="gemini-3-flash-preview",
            contents=[{"parts": [{"text": "Hello"}]}],
        )
        assert req.model == "gemini-3-flash-preview"
        assert req.includeThoughts is True  # default

    def test_valid_full_request(self):
        """Should accept full request with all optional fields."""
        req = GenerateTextRequest(
            model="gemini-3-flash-preview",
            contents=[{"parts": [{"text": "Hello"}]}],
            tools=[{"function_declarations": []}],
            generationConfig={"temperature": 0.7},
            thinkingBudget=8192,
            includeThoughts=False,
            logLabel="test-call",
        )
        assert req.thinkingBudget == 8192
        assert req.includeThoughts is False
        assert req.logLabel == "test-call"
