"""
Tests for the agentic edit LangGraph workflow.

Tests cover:
1. Image utility functions
2. Prompt builders
3. Individual graph nodes (with mocking)
4. Conditional routing logic
5. Full graph execution (integration)
"""

import asyncio
import os
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from graphs.agentic_edit import (
    GraphState,
    agentic_edit_graph,
    build_evaluation_prompt,
    build_planning_prompt,
    planning_node,
    generate_node,
    self_check_node,
    should_continue,
)
from schemas.agentic import AIProgressEvent, IterationInfo
from services.image_utils import decode_data_url, encode_data_url, get_mime_type


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def small_test_image() -> str:
    """Return a small test image as base64 data URL (1x1 red pixel PNG)."""
    # Minimal valid 1x1 red PNG
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
    return encode_data_url(png_data, "image/png")


@pytest.fixture
def basic_state(small_test_image: str) -> GraphState:
    """Create a basic GraphState for testing."""
    return GraphState(
        source_image=small_test_image,
        user_prompt="Add a red button",
        max_iterations=3,
    )


@pytest.fixture
def state_with_mask(small_test_image: str) -> GraphState:
    """Create a GraphState with mask for testing."""
    return GraphState(
        source_image=small_test_image,
        mask_image=small_test_image,  # Same image as mask
        user_prompt="Replace the selected area with blue",
        max_iterations=3,
    )


# =============================================================================
# Image Utility Tests
# =============================================================================


class TestImageUtils:
    """Tests for image utility functions."""

    def test_decode_data_url_with_prefix(self, small_test_image: str):
        """Test decoding base64 from data URL."""
        result = decode_data_url(small_test_image)
        assert isinstance(result, bytes)
        assert len(result) > 0
        # Should be valid PNG header
        assert result[:8] == b"\x89PNG\r\n\x1a\n"

    def test_decode_data_url_without_prefix(self):
        """Test decoding raw base64 string."""
        import base64

        raw_b64 = base64.b64encode(b"test data").decode()
        result = decode_data_url(raw_b64)
        assert result == b"test data"

    def test_get_mime_type_png(self, small_test_image: str):
        """Test extracting MIME type from PNG data URL."""
        mime = get_mime_type(small_test_image)
        assert mime == "image/png"

    def test_get_mime_type_jpeg(self):
        """Test extracting MIME type from JPEG data URL."""
        jpeg_url = "data:image/jpeg;base64,/9j/4AAQ..."
        mime = get_mime_type(jpeg_url)
        assert mime == "image/jpeg"

    def test_get_mime_type_default(self):
        """Test default MIME type for non-data URL."""
        result = get_mime_type("not a data url")
        assert result == "image/png"

    def test_encode_data_url(self):
        """Test encoding bytes to data URL."""
        result = encode_data_url(b"hello", "text/plain")
        assert result == "data:text/plain;base64,aGVsbG8="


# =============================================================================
# Prompt Builder Tests
# =============================================================================


class TestPromptBuilders:
    """Tests for prompt builder functions."""

    def test_build_planning_prompt_without_mask(self):
        """Test planning prompt without mask context."""
        prompt = build_planning_prompt("Add a button", has_mask=False)
        assert "Add a button" in prompt
        assert "entire image" in prompt
        assert "gemini_image_painter" in prompt

    def test_build_planning_prompt_with_mask(self):
        """Test planning prompt with mask context."""
        prompt = build_planning_prompt("Replace this area", has_mask=True)
        assert "Replace this area" in prompt
        assert "masked" in prompt.lower() or "selected" in prompt.lower()

    def test_build_evaluation_prompt(self):
        """Test evaluation prompt generation."""
        prompt = build_evaluation_prompt(
            user_prompt="Add a red button",
            edit_prompt="Create a vibrant red button with rounded corners",
        )
        assert "Add a red button" in prompt
        assert "vibrant red button" in prompt
        assert "satisfied" in prompt
        assert "JSON" in prompt


# =============================================================================
# Conditional Edge Tests
# =============================================================================


class TestShouldContinue:
    """Tests for the should_continue conditional edge function."""

    def test_returns_end_when_satisfied(self, basic_state: GraphState):
        """Should return 'end' when satisfied is True."""
        basic_state.satisfied = True
        assert should_continue(basic_state) == "end"

    def test_returns_end_at_max_iterations(self, basic_state: GraphState):
        """Should return 'end' when max iterations reached."""
        basic_state.current_iteration = 3
        basic_state.max_iterations = 3
        assert should_continue(basic_state) == "end"

    def test_returns_end_when_generation_failed(self, basic_state: GraphState):
        """Should return 'end' when generation failed (no result after iteration)."""
        basic_state.current_iteration = 1
        basic_state.current_result = None
        assert should_continue(basic_state) == "end"

    def test_returns_generate_when_should_retry(self, basic_state: GraphState):
        """Should return 'generate' when retry is needed."""
        basic_state.satisfied = False
        basic_state.current_iteration = 1
        basic_state.current_result = "data:image/png;base64,abc"
        basic_state.max_iterations = 3
        assert should_continue(basic_state) == "generate"


# =============================================================================
# Node Tests with Mocking
# =============================================================================


class TestPlanningNode:
    """Tests for the planning node."""

    @pytest.mark.asyncio
    async def test_planning_returns_refined_prompt(self, basic_state: GraphState):
        """Test that planning node returns a refined prompt."""

        async def mock_stream():
            # Simulate streaming chunks
            mock_chunk = {
                "function_call": MagicMock(
                    args={"prompt": "Create a vibrant red rectangular button"}
                )
            }
            yield mock_chunk
            yield {"done": True}

        with patch("graphs.agentic_edit._call_planning_model_streaming") as mock_call:
            mock_call.return_value = mock_stream()

            result = await planning_node(basic_state)

            assert "refined_prompt" in result
            assert result["refined_prompt"] == "Create a vibrant red rectangular button"
            assert "planning_complete" in result["steps"]

    @pytest.mark.asyncio
    async def test_planning_falls_back_on_error(self, basic_state: GraphState):
        """Test that planning falls back to user prompt on error."""

        async def mock_error_stream():
            raise Exception("API Error")
            yield  # Never reached, but needed for async generator

        with patch("graphs.agentic_edit._call_planning_model_streaming") as mock_call:
            mock_call.return_value = mock_error_stream()

            result = await planning_node(basic_state)

            assert result["refined_prompt"] == basic_state.user_prompt
            assert "planning_failed" in result["steps"]


class TestGenerateNode:
    """Tests for the image generation node."""

    @pytest.mark.asyncio
    async def test_generate_returns_image(self, basic_state: GraphState):
        """Test that generate node returns an image."""
        basic_state.refined_prompt = "Create a red button"

        with patch("graphs.agentic_edit._generate_image") as mock_gen:
            mock_gen.return_value = b"fake image data"

            result = await generate_node(basic_state)

            assert "current_result" in result
            assert result["current_result"].startswith("data:image/png;base64,")
            assert result["current_iteration"] == 1

    @pytest.mark.asyncio
    async def test_generate_handles_error(self, basic_state: GraphState):
        """Test that generate node handles errors gracefully."""
        basic_state.refined_prompt = "Create a red button"

        with patch("graphs.agentic_edit._generate_image") as mock_gen:
            mock_gen.side_effect = Exception("Generation failed")

            result = await generate_node(basic_state)

            assert result.get("current_result") is None
            assert "failed" in result["steps"][0]


class TestSelfCheckNode:
    """Tests for the self-check node."""

    @pytest.mark.asyncio
    async def test_self_check_returns_satisfied(self, basic_state: GraphState):
        """Test self-check returns satisfied when edit is good."""
        basic_state.current_iteration = 1
        basic_state.current_result = basic_state.source_image
        basic_state.refined_prompt = "Add a button"

        with patch("graphs.agentic_edit._evaluate_result") as mock_eval:
            mock_eval.return_value = {
                "satisfied": True,
                "reasoning": "Edit looks good",
                "revised_prompt": "",
            }

            result = await self_check_node(basic_state)

            assert result["satisfied"] is True
            assert "looks good" in result["check_reasoning"]

    @pytest.mark.asyncio
    async def test_self_check_returns_revision(self, basic_state: GraphState):
        """Test self-check returns revision suggestion when not satisfied."""
        basic_state.current_iteration = 1
        basic_state.current_result = basic_state.source_image
        basic_state.refined_prompt = "Add a button"

        with patch("graphs.agentic_edit._evaluate_result") as mock_eval:
            mock_eval.return_value = {
                "satisfied": False,
                "reasoning": "Button too small",
                "revised_prompt": "Add a larger button",
            }

            result = await self_check_node(basic_state)

            assert result["satisfied"] is False
            assert "too small" in result["check_reasoning"]
            assert result["refined_prompt"] == "Add a larger button"

    @pytest.mark.asyncio
    async def test_self_check_skips_at_max_iterations(self, basic_state: GraphState):
        """Test self-check is skipped at max iterations."""
        basic_state.current_iteration = 3
        basic_state.max_iterations = 3
        basic_state.current_result = basic_state.source_image

        result = await self_check_node(basic_state)

        assert result["satisfied"] is True
        assert "Max iterations" in result["check_reasoning"]


# =============================================================================
# Integration Tests
# =============================================================================


class TestGraphIntegration:
    """Integration tests for the full graph."""

    @pytest.mark.asyncio
    @pytest.mark.skipif(
        not os.getenv("GEMINI_API_KEY"),
        reason="GEMINI_API_KEY not set - skipping live API test",
    )
    async def test_full_graph_execution_live(self, sample_manipulation_case):
        """
        Test full graph execution with live API using real image data.

        This test is skipped unless GEMINI_API_KEY is set.
        """
        if sample_manipulation_case is None:
            pytest.skip("No manipulation cases available")

        state = GraphState(
            source_image=sample_manipulation_case["source_image"],
            user_prompt="Make a small change to the image",
            max_iterations=1,
        )

        result = await agentic_edit_graph.ainvoke(state.model_dump())

        assert result.get("current_result") is not None
        assert result["current_result"].startswith("data:image")
        assert result["current_iteration"] >= 1

    def test_graph_structure(self):
        """Test that the graph has the correct structure."""
        graph_nodes = list(agentic_edit_graph.nodes.keys())
        assert "planning" in graph_nodes or "__start__" in graph_nodes
        assert hasattr(agentic_edit_graph, "ainvoke")


# =============================================================================
# Manipulation Case Tests
# =============================================================================


class TestWithManipulationCases:
    """Tests using real manipulation test cases."""

    @pytest.mark.asyncio
    async def test_load_manipulation_case(self, sample_manipulation_case):
        """Test that manipulation cases load correctly."""
        if sample_manipulation_case is None:
            pytest.skip("No manipulation cases available")

        assert "source_image" in sample_manipulation_case
        assert (
            "command" in sample_manipulation_case
            or "enriched_prompt" in sample_manipulation_case
        )
        assert sample_manipulation_case["source_image"].startswith("data:image")

    @pytest.mark.asyncio
    @pytest.mark.skipif(
        not os.getenv("GEMINI_API_KEY"),
        reason="GEMINI_API_KEY not set - skipping live API test",
    )
    async def test_manipulation_case_with_graph(self, sample_manipulation_case):
        """Test graph execution with a real manipulation case."""
        if sample_manipulation_case is None:
            pytest.skip("No manipulation cases available")

        state = GraphState(
            source_image=sample_manipulation_case["source_image"],
            user_prompt=sample_manipulation_case.get("enriched_prompt")
            or sample_manipulation_case.get("command", ""),
            max_iterations=2,
        )

        try:
            result = await asyncio.wait_for(
                agentic_edit_graph.ainvoke(state.model_dump()),
                timeout=120.0,
            )
            assert result is not None
        except asyncio.TimeoutError:
            pytest.fail("Graph execution timed out after 120 seconds")
