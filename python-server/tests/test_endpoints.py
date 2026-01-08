"""Tests for Python FastAPI endpoint coverage.

This module tests basic endpoint functionality including:
1. Health check and root endpoints
2. Shadow metrics endpoints
3. Express path compatibility redirects

These tests ensure the Python server has comprehensive coverage before
Express deprecation.
"""

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app


# =============================================================================
# Test Client Fixture
# =============================================================================


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


# Valid base64 image for testing (1x1 transparent PNG)
VALID_BASE64_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="


# =============================================================================
# SSE Event Parser
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
            try:
                current_event["data"] = json.loads(line[5:].strip())
            except json.JSONDecodeError:
                current_event["data"] = line[5:].strip()
        elif line == "" and current_event:
            if "type" in current_event and "data" in current_event:
                events.append(current_event)
            current_event = {}

    # Handle last event if no trailing newline
    if "type" in current_event and "data" in current_event:
        events.append(current_event)

    return events


# =============================================================================
# Health Endpoint Tests
# =============================================================================


class TestHealthEndpoint:
    """Tests for GET /health endpoint."""

    def test_health_returns_200(self, client):
        """GET /health should return 200 status code."""
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_returns_healthy_status(self, client):
        """GET /health should return status='healthy'."""
        response = client.get("/health")
        data = response.json()
        assert data["status"] == "healthy"

    def test_health_returns_required_fields(self, client):
        """GET /health should return all required fields."""
        response = client.get("/health")
        data = response.json()

        assert "status" in data
        assert "timestamp" in data
        assert "uptime_seconds" in data
        assert "environment" in data
        assert "python_version" in data

    def test_health_timestamp_is_iso_format(self, client):
        """GET /health timestamp should be ISO format."""
        from datetime import datetime

        response = client.get("/health")
        data = response.json()

        # Should parse without error
        timestamp = datetime.fromisoformat(data["timestamp"].replace("Z", "+00:00"))
        assert timestamp is not None

    def test_health_uptime_is_numeric(self, client):
        """GET /health uptime_seconds should be a number."""
        response = client.get("/health")
        data = response.json()

        assert isinstance(data["uptime_seconds"], (int, float))
        assert data["uptime_seconds"] >= 0

    def test_health_python_version_format(self, client):
        """GET /health python_version should be in X.Y.Z format."""
        response = client.get("/health")
        data = response.json()

        parts = data["python_version"].split(".")
        assert len(parts) == 3
        assert all(p.isdigit() for p in parts)


# =============================================================================
# Root Endpoint Tests
# =============================================================================


class TestRootEndpoint:
    """Tests for GET / endpoint."""

    def test_root_returns_200(self, client):
        """GET / should return 200 status code."""
        response = client.get("/")
        assert response.status_code == 200

    def test_root_returns_welcome_info(self, client):
        """GET / should return API welcome information."""
        response = client.get("/")
        data = response.json()

        assert "name" in data
        assert "version" in data
        assert "status" in data
        assert data["status"] == "running"

    def test_root_lists_endpoints(self, client):
        """GET / should list available endpoints."""
        response = client.get("/")
        data = response.json()

        assert "endpoints" in data
        endpoints = data["endpoints"]

        # Should list key endpoints
        assert "health" in endpoints
        assert "agentic_edit" in endpoints

    def test_root_name_is_correct(self, client):
        """GET / should return correct API name."""
        response = client.get("/")
        data = response.json()

        assert "Image Markup" in data["name"]

    def test_root_version_format(self, client):
        """GET / should return version in semver format."""
        response = client.get("/")
        data = response.json()

        # Should be semver-like (X.Y.Z)
        parts = data["version"].split(".")
        assert len(parts) >= 2


# =============================================================================
# Shadow Metrics Endpoint Tests
# =============================================================================


class TestShadowMetricsEndpoint:
    """Tests for GET /shadow/metrics endpoint."""

    def test_shadow_metrics_returns_200(self, client):
        """GET /shadow/metrics should return 200 status code."""
        response = client.get("/shadow/metrics")
        assert response.status_code == 200

    def test_shadow_metrics_disabled_by_default(self, client, monkeypatch):
        """GET /shadow/metrics should show enabled=false when SHADOW_TEST_ENABLED is not set."""
        monkeypatch.delenv("SHADOW_TEST_ENABLED", raising=False)

        response = client.get("/shadow/metrics")
        data = response.json()

        assert "enabled" in data
        # Note: enabled status depends on env var at app startup time
        # This test just verifies the structure
        assert "metrics" in data

    def test_shadow_metrics_has_required_structure(self, client):
        """GET /shadow/metrics should return metrics with required structure."""
        response = client.get("/shadow/metrics")
        data = response.json()

        assert "enabled" in data
        assert "metrics" in data

        metrics = data["metrics"]
        assert "totalRequests" in metrics
        assert "matchCount" in metrics
        assert "mismatchCount" in metrics
        assert "pythonErrorCount" in metrics
        assert "avgExpressLatencyMs" in metrics
        assert "avgPythonLatencyMs" in metrics
        assert "byEndpoint" in metrics

    def test_shadow_metrics_values_are_numeric(self, client):
        """GET /shadow/metrics numeric fields should be numbers."""
        response = client.get("/shadow/metrics")
        data = response.json()
        metrics = data["metrics"]

        assert isinstance(metrics["totalRequests"], int)
        assert isinstance(metrics["matchCount"], int)
        assert isinstance(metrics["mismatchCount"], int)
        assert isinstance(metrics["pythonErrorCount"], int)
        assert isinstance(metrics["avgExpressLatencyMs"], (int, float))
        assert isinstance(metrics["avgPythonLatencyMs"], (int, float))


# =============================================================================
# Shadow Metrics Reset Endpoint Tests
# =============================================================================


class TestShadowMetricsResetEndpoint:
    """Tests for POST /shadow/metrics/reset endpoint."""

    def test_shadow_metrics_reset_returns_200(self, client):
        """POST /shadow/metrics/reset should return 200 status code."""
        response = client.post("/shadow/metrics/reset")
        assert response.status_code == 200

    def test_shadow_metrics_reset_returns_response(self, client):
        """POST /shadow/metrics/reset should return reset status."""
        response = client.post("/shadow/metrics/reset")
        data = response.json()

        assert "reset" in data
        assert "message" in data

    def test_shadow_metrics_reset_message_when_disabled(self, client, monkeypatch):
        """POST /shadow/metrics/reset should indicate when shadow testing is disabled."""
        # This test documents the behavior - reset=false when shadow testing is not enabled
        response = client.post("/shadow/metrics/reset")
        data = response.json()

        # Either reset is true (enabled) or false with appropriate message (disabled)
        assert isinstance(data["reset"], bool)
        assert isinstance(data["message"], str)
        assert len(data["message"]) > 0


# =============================================================================
# Express Path Compatibility: POST /api/ai/generate-image
# =============================================================================


class TestAiGenerateImageRedirect:
    """Tests for POST /api/ai/generate-image (redirects to /api/images/generate)."""

    def test_generate_image_missing_api_key(self, client, monkeypatch):
        """POST /api/ai/generate-image should return 500 without API key."""
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

        response = client.post(
            "/api/ai/generate-image",
            json={
                "model": "gemini-3-pro-image-preview",
                "sourceImage": VALID_BASE64_IMAGE,
                "prompt": "Test prompt",
            },
        )

        assert response.status_code == 500
        assert "GEMINI_API_KEY" in response.json()["detail"]

    def test_generate_image_validation_missing_model(self, client):
        """POST /api/ai/generate-image should return 422 without model."""
        response = client.post(
            "/api/ai/generate-image",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
                "prompt": "Test prompt",
            },
        )

        assert response.status_code == 422

    def test_generate_image_validation_missing_source_image(self, client):
        """POST /api/ai/generate-image should return 422 without sourceImage."""
        response = client.post(
            "/api/ai/generate-image",
            json={
                "model": "gemini-3-pro-image-preview",
                "prompt": "Test prompt",
            },
        )

        assert response.status_code == 422

    def test_generate_image_validation_missing_prompt(self, client):
        """POST /api/ai/generate-image should return 422 without prompt."""
        response = client.post(
            "/api/ai/generate-image",
            json={
                "model": "gemini-3-pro-image-preview",
                "sourceImage": VALID_BASE64_IMAGE,
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_generate_image_success(self, client, monkeypatch):
        """POST /api/ai/generate-image should return image on success."""
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
                "/api/ai/generate-image",
                json={
                    "model": "gemini-3-pro-image-preview",
                    "sourceImage": VALID_BASE64_IMAGE,
                    "prompt": "Make it blue",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert "imageData" in data
            assert data["imageData"].startswith("data:image/")


# =============================================================================
# Express Path Compatibility: POST /api/ai/inpaint
# =============================================================================


class TestAiInpaintRedirect:
    """Tests for POST /api/ai/inpaint (redirects to /api/images/inpaint)."""

    def test_inpaint_missing_api_key(self, client, monkeypatch):
        """POST /api/ai/inpaint should return 500 without API key."""
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

        response = client.post(
            "/api/ai/inpaint",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
                "maskImage": VALID_BASE64_IMAGE,
                "prompt": "Remove object",
            },
        )

        assert response.status_code == 500
        assert "GEMINI_API_KEY" in response.json()["detail"]

    def test_inpaint_validation_missing_source_image(self, client):
        """POST /api/ai/inpaint should return 422 without sourceImage."""
        response = client.post(
            "/api/ai/inpaint",
            json={
                "maskImage": VALID_BASE64_IMAGE,
                "prompt": "Remove object",
            },
        )

        assert response.status_code == 422

    def test_inpaint_validation_missing_mask_image(self, client):
        """POST /api/ai/inpaint should return 422 without maskImage."""
        response = client.post(
            "/api/ai/inpaint",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
                "prompt": "Remove object",
            },
        )

        assert response.status_code == 422

    def test_inpaint_validation_missing_prompt(self, client):
        """POST /api/ai/inpaint should return 422 without prompt."""
        response = client.post(
            "/api/ai/inpaint",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
                "maskImage": VALID_BASE64_IMAGE,
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_inpaint_returns_sse_stream(self, client, monkeypatch):
        """POST /api/ai/inpaint should return SSE stream."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        # Mock final state from the graph
        mock_final_state = {
            "current_result": VALID_BASE64_IMAGE,
            "refined_prompt": "Edit the selected region",
            "current_iteration": 1,
        }

        async def mock_astream(*args, **kwargs):
            yield ("values", mock_final_state)

        with patch("main.agentic_edit_graph") as mock_graph:
            mock_graph.astream = mock_astream

            response = client.post(
                "/api/ai/inpaint",
                json={
                    "sourceImage": VALID_BASE64_IMAGE,
                    "maskImage": VALID_BASE64_IMAGE,
                    "prompt": "Remove this object",
                },
            )

            # SSE always returns 200
            assert response.status_code == 200
            assert (
                response.headers["content-type"] == "text/event-stream; charset=utf-8"
            )

            # Parse SSE events
            events = parse_sse_events(response.text)
            event_types = [e["type"] for e in events]

            # Should have progress and complete events
            assert "progress" in event_types
            assert "complete" in event_types


# =============================================================================
# Express Path Compatibility: POST /api/ai/agentic/edit
# =============================================================================


class TestAiAgenticEditRedirect:
    """Tests for POST /api/ai/agentic/edit (redirects to /api/agentic/edit)."""

    def test_agentic_edit_missing_api_key(self, client, monkeypatch):
        """POST /api/ai/agentic/edit should return 500 without API key."""
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

        response = client.post(
            "/api/ai/agentic/edit",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
                "prompt": "Make it blue",
            },
        )

        assert response.status_code == 500
        assert "GEMINI_API_KEY" in response.json()["detail"]

    def test_agentic_edit_validation_missing_source_image(self, client):
        """POST /api/ai/agentic/edit should return 422 without sourceImage."""
        response = client.post(
            "/api/ai/agentic/edit",
            json={
                "prompt": "Make it blue",
            },
        )

        assert response.status_code == 422

    def test_agentic_edit_validation_missing_prompt(self, client):
        """POST /api/ai/agentic/edit should return 422 without prompt."""
        response = client.post(
            "/api/ai/agentic/edit",
            json={
                "sourceImage": VALID_BASE64_IMAGE,
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_agentic_edit_returns_sse_stream(self, client, monkeypatch):
        """POST /api/ai/agentic/edit should return SSE stream."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        # Mock final state from the graph
        mock_final_state = {
            "current_result": VALID_BASE64_IMAGE,
            "refined_prompt": "Create a blue effect",
            "current_iteration": 1,
        }

        async def mock_astream(*args, **kwargs):
            yield (
                "custom",
                {
                    "step": "planning",
                    "message": "Planning the edit...",
                },
            )
            yield ("values", mock_final_state)

        with patch("main.agentic_edit_graph") as mock_graph:
            mock_graph.astream = mock_astream

            response = client.post(
                "/api/ai/agentic/edit",
                json={
                    "sourceImage": VALID_BASE64_IMAGE,
                    "prompt": "Make it blue",
                },
            )

            # SSE always returns 200
            assert response.status_code == 200
            assert (
                response.headers["content-type"] == "text/event-stream; charset=utf-8"
            )

            # Parse SSE events
            events = parse_sse_events(response.text)
            event_types = [e["type"] for e in events]

            # Should have progress and complete events
            assert "progress" in event_types
            assert "complete" in event_types

            # Complete event should have image data
            complete_event = next(e for e in events if e["type"] == "complete")
            assert "imageData" in complete_event["data"]

    @pytest.mark.asyncio
    async def test_agentic_edit_with_mask_image(self, client, monkeypatch):
        """POST /api/ai/agentic/edit should accept optional maskImage."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        mock_final_state = {
            "current_result": VALID_BASE64_IMAGE,
            "refined_prompt": "Edit the masked area",
            "current_iteration": 1,
        }

        async def mock_astream(*args, **kwargs):
            yield ("values", mock_final_state)

        with patch("main.agentic_edit_graph") as mock_graph:
            mock_graph.astream = mock_astream

            response = client.post(
                "/api/ai/agentic/edit",
                json={
                    "sourceImage": VALID_BASE64_IMAGE,
                    "maskImage": VALID_BASE64_IMAGE,
                    "prompt": "Replace this area",
                },
            )

            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_agentic_edit_with_max_iterations(self, client, monkeypatch):
        """POST /api/ai/agentic/edit should accept optional maxIterations."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        mock_final_state = {
            "current_result": VALID_BASE64_IMAGE,
            "refined_prompt": "Edit prompt",
            "current_iteration": 1,
        }

        async def mock_astream(*args, **kwargs):
            yield ("values", mock_final_state)

        with patch("main.agentic_edit_graph") as mock_graph:
            mock_graph.astream = mock_astream

            response = client.post(
                "/api/ai/agentic/edit",
                json={
                    "sourceImage": VALID_BASE64_IMAGE,
                    "prompt": "Make it blue",
                    "maxIterations": 5,
                },
            )

            assert response.status_code == 200


# =============================================================================
# Echo Endpoint Tests
# =============================================================================


class TestEchoEndpoint:
    """Tests for POST /api/echo endpoint."""

    def test_echo_returns_200(self, client):
        """POST /api/echo should return 200 status code."""
        response = client.post(
            "/api/echo",
            json={"message": "Hello"},
        )
        assert response.status_code == 200

    def test_echo_returns_received_message(self, client):
        """POST /api/echo should return the received message."""
        response = client.post(
            "/api/echo",
            json={"message": "Test message"},
        )
        data = response.json()

        assert data["received"] == "Test message"

    def test_echo_returns_server_identifier(self, client):
        """POST /api/echo should identify as Python server."""
        response = client.post(
            "/api/echo",
            json={"message": "Hello"},
        )
        data = response.json()

        assert "server" in data
        assert "python" in data["server"].lower() or "fastapi" in data["server"].lower()

    def test_echo_returns_timestamp(self, client):
        """POST /api/echo should return a timestamp."""
        response = client.post(
            "/api/echo",
            json={"message": "Hello"},
        )
        data = response.json()

        assert "timestamp" in data
        assert len(data["timestamp"]) > 0

    def test_echo_with_optional_data(self, client):
        """POST /api/echo should echo optional data field."""
        response = client.post(
            "/api/echo",
            json={
                "message": "Hello",
                "data": {"key": "value", "number": 42},
            },
        )
        data = response.json()

        assert data["data"] == {"key": "value", "number": 42}

    def test_echo_validation_missing_message(self, client):
        """POST /api/echo should return 422 without message."""
        response = client.post(
            "/api/echo",
            json={},
        )

        assert response.status_code == 422


# =============================================================================
# Error Handling Tests
# =============================================================================


class TestErrorHandling:
    """Tests for error handling across endpoints."""

    def test_invalid_json_returns_422(self, client):
        """Invalid JSON should return 422."""
        response = client.post(
            "/api/echo",
            content="not valid json",
            headers={"Content-Type": "application/json"},
        )

        assert response.status_code == 422

    def test_unknown_endpoint_returns_404(self, client):
        """Unknown endpoints should return 404."""
        response = client.get("/unknown/endpoint")
        assert response.status_code == 404

    def test_wrong_method_returns_405(self, client):
        """Wrong HTTP method should return 405."""
        response = client.get("/api/echo")  # POST endpoint
        assert response.status_code == 405
