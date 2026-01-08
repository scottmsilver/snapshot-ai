"""
Transparent Gemini Client - automatic progress streaming for all AI calls.

This client wraps the Google Gemini API and AUTOMATICALLY emits progress events
for every call. This ensures full transparency is unavoidable - callers cannot
skip emitting the prompt, thinking, and raw output.

Design Principles:
- Transparency is mandatory, not optional
- Every AI call emits: prompt (start), thinking deltas (streaming), raw output (end)
- Callers must provide step and iteration info - no way to skip
- The only way to call Gemini is through this client
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from google import genai
from google.genai import types
from langgraph.config import get_stream_writer

from schemas import AI_MODELS, THINKING_BUDGETS
from schemas.agentic import AIInputImage, AIProgressEvent, AIProgressStep, IterationInfo
from services.image_utils import encode_data_url

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

logger = logging.getLogger(__name__)


# =============================================================================
# Result Types
# =============================================================================


@dataclass
class GeminiResult:
    """Result from a Gemini text/thinking call."""

    text: str
    thinking: str
    function_call: dict[str, Any] | None = None


@dataclass
class GeminiImageResult:
    """Result from a Gemini image generation call."""

    image_bytes: bytes | None
    text: str = ""


# =============================================================================
# Transparent Gemini Client
# =============================================================================


class TransparentGeminiClient:
    """
    A Gemini client that automatically emits progress events.

    Every call through this client will emit:
    1. The prompt being sent (at start)
    2. Thinking deltas as they stream
    3. The raw output when complete

    This is the ONLY way to call Gemini in this codebase.
    """

    def __init__(self, api_key: str | None = None):
        """Initialize the client with an API key."""
        self._api_key = (
            api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        )
        if not self._api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY must be set")
        self._client = genai.Client(api_key=self._api_key)

    def _emit(self, event: AIProgressEvent) -> None:
        """Emit a progress event via LangGraph streaming."""
        try:
            writer = get_stream_writer()
            writer(event.model_dump(exclude_none=True))
        except RuntimeError:
            # Not in streaming context - fine, events are best-effort
            pass

    async def generate_with_thinking(
        self,
        *,
        prompt: str,
        images: list[tuple[bytes, str, str]] | None = None,
        step: AIProgressStep,
        iteration: IterationInfo,
        model: str = AI_MODELS["PLANNING"],
        thinking_budget: int = THINKING_BUDGETS["HIGH"],
        tools: list[types.Tool] | None = None,
        new_log_entry: bool = False,
    ) -> GeminiResult:
        """
        Generate text with thinking, streaming progress automatically.

        Args:
            prompt: The text prompt to send
            images: Optional list of (bytes, mime_type, label) tuples
            step: Current workflow step (for progress events)
            iteration: Current iteration info (for progress events)
            model: Model to use (defaults to PLANNING model)
            thinking_budget: Token budget for thinking
            tools: Optional function calling tools
            new_log_entry: Whether this starts a new log entry in UI

        Returns:
            GeminiResult with text, thinking, and optional function_call
        """
        # Build content parts
        parts: list[types.Part] = [types.Part.from_text(text=prompt)]
        input_images: list[AIInputImage] = []
        if images:
            for img_bytes, mime_type, label in images:
                parts.append(types.Part.from_bytes(data=img_bytes, mime_type=mime_type))
                # Convert to data URL for logging
                data_url = encode_data_url(img_bytes, mime_type)
                input_images.append(AIInputImage(label=label, dataUrl=data_url))

        # Emit: PROMPT SENT with all input images
        self._emit(
            AIProgressEvent(
                step=step,
                message="Sending request to AI...",
                prompt=prompt,
                inputImages=input_images if input_images else None,
                iteration=iteration,
                newLogEntry=new_log_entry or None,  # Only include if True
            )
        )

        # Build config
        config = types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_budget=thinking_budget,
                include_thoughts=True,
            ),
        )
        if tools:
            config.tools = tools

        # Stream the response
        accumulated_thinking = ""
        accumulated_text = ""
        function_call = None
        prev_thinking_len = 0

        try:
            stream = await self._client.aio.models.generate_content_stream(
                model=model,
                contents=types.Content(role="user", parts=parts),
                config=config,
            )
            async for chunk in stream:
                if not chunk.candidates:
                    continue
                content = chunk.candidates[0].content
                if not content:
                    continue

                for part in content.parts or []:
                    if (
                        hasattr(part, "thought")
                        and part.thought
                        and hasattr(part, "text")
                    ):
                        accumulated_thinking += part.text or ""
                    elif hasattr(part, "function_call") and part.function_call:
                        fc = part.function_call
                        function_call = {
                            "name": fc.name,
                            "args": dict(fc.args) if fc.args else {},
                        }
                    elif hasattr(part, "text") and part.text:
                        accumulated_text += part.text

                # Emit: THINKING DELTA
                if len(accumulated_thinking) > prev_thinking_len:
                    delta = accumulated_thinking[prev_thinking_len:]
                    prev_thinking_len = len(accumulated_thinking)
                    self._emit(
                        AIProgressEvent(
                            step=step,
                            message=f"AI is thinking... ({len(accumulated_thinking)} chars)",
                            thinkingTextDelta=delta,
                            iteration=iteration,
                        )
                    )

            # Emit: RAW OUTPUT
            output_text = accumulated_text
            if function_call:
                output_text = (
                    f"Function call: {function_call['name']}({function_call['args']})"
                )

            self._emit(
                AIProgressEvent(
                    step=step,
                    message="AI response received",
                    rawOutput=output_text,
                    thinkingText=accumulated_thinking,
                    iteration=iteration,
                )
            )

            return GeminiResult(
                text=accumulated_text,
                thinking=accumulated_thinking,
                function_call=function_call,
            )

        except Exception as e:
            logger.error("Gemini call failed: %s", e)
            self._emit(
                AIProgressEvent(
                    step="error",
                    message=f"AI call failed: {e}",
                    iteration=iteration,
                )
            )
            raise

    async def generate_image(
        self,
        *,
        prompt: str,
        source_image: tuple[bytes, str],
        mask_image: tuple[bytes, str] | None = None,
        step: AIProgressStep,
        iteration: IterationInfo,
        model: str = AI_MODELS["IMAGE_GENERATION"],
    ) -> GeminiImageResult:
        """
        Generate/edit an image, emitting progress automatically.

        Args:
            prompt: The edit prompt
            source_image: (bytes, mime_type) of source image
            mask_image: Optional (bytes, mime_type) of mask
            step: Current workflow step (for progress events)
            iteration: Current iteration info (for progress events)
            model: Model to use (defaults to IMAGE_GENERATION model)

        Returns:
            GeminiImageResult with image_bytes (or None if failed)
        """
        source_data, source_mime = source_image

        # Build input images for logging
        input_images: list[AIInputImage] = [
            AIInputImage(
                label="Source Image",
                dataUrl=encode_data_url(source_data, source_mime),
            )
        ]

        # Build parts
        parts: list[types.Part] = [
            types.Part.from_bytes(data=source_data, mime_type=source_mime),
        ]
        if mask_image:
            mask_data, mask_mime = mask_image
            parts.append(types.Part.from_bytes(data=mask_data, mime_type=mask_mime))
            input_images.append(
                AIInputImage(
                    label="Mask",
                    dataUrl=encode_data_url(mask_data, mask_mime),
                )
            )
        parts.append(types.Part.from_text(text=prompt))

        # Emit: PROMPT SENT with all input images
        self._emit(
            AIProgressEvent(
                step=step,
                message=f"Generating image (attempt {iteration.current}/{iteration.max})...",
                prompt=prompt,
                inputImages=input_images,
                iteration=iteration,
            )
        )

        try:
            response = await self._client.aio.models.generate_content(
                model=model,
                contents=types.Content(role="user", parts=parts),
                config=types.GenerateContentConfig(
                    response_modalities=["image", "text"]
                ),
            )

            image_bytes = None
            text = ""

            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts or []:
                    if hasattr(part, "inline_data") and part.inline_data:
                        image_bytes = part.inline_data.data
                    elif hasattr(part, "text") and part.text:
                        text += part.text

            if image_bytes:
                self._emit(
                    AIProgressEvent(
                        step=step,
                        message=f"Image generated successfully",
                        rawOutput=text or "Image generated",
                        iteration=iteration,
                    )
                )
            else:
                self._emit(
                    AIProgressEvent(
                        step="error",
                        message="No image in response",
                        rawOutput=text or "No image returned",
                        iteration=iteration,
                    )
                )

            return GeminiImageResult(image_bytes=image_bytes, text=text)

        except Exception as e:
            logger.error("Image generation failed: %s", e)
            self._emit(
                AIProgressEvent(
                    step="error",
                    message=f"Image generation failed: {e}",
                    iteration=iteration,
                )
            )
            raise

    async def evaluate(
        self,
        *,
        prompt: str,
        original_image: tuple[bytes, str],
        edited_image: tuple[bytes, str],
        step: AIProgressStep,
        iteration: IterationInfo,
        model: str = AI_MODELS["PLANNING"],
        thinking_budget: int = THINKING_BUDGETS["MEDIUM"],
    ) -> dict[str, Any]:
        """
        Evaluate an edit result, streaming thinking automatically.

        This is a specialized method for self-check evaluation that:
        1. Shows both original and edited images
        2. Parses the JSON response
        3. Returns structured evaluation result

        Args:
            prompt: The evaluation prompt
            original_image: (bytes, mime_type) of original
            edited_image: (bytes, mime_type) of edited result
            step: Current workflow step
            iteration: Current iteration info
            model: Model to use
            thinking_budget: Token budget for thinking

        Returns:
            Dict with "satisfied", "reasoning", "revised_prompt", "thinking"
        """
        orig_data, orig_mime = original_image
        edit_data, edit_mime = edited_image

        # Build input images for logging - these are the ACTUAL images sent to AI
        input_images: list[AIInputImage] = [
            AIInputImage(
                label="Original Image (BEFORE)",
                dataUrl=encode_data_url(orig_data, orig_mime),
            ),
            AIInputImage(
                label="Edited Image (AFTER)",
                dataUrl=encode_data_url(edit_data, edit_mime),
            ),
        ]

        # Emit: PROMPT SENT with actual images
        self._emit(
            AIProgressEvent(
                step=step,
                message="AI is evaluating the result...",
                prompt=prompt,  # Show the evaluation criteria
                inputImages=input_images,  # Include both images!
                iteration=iteration,
            )
        )

        parts: list[types.Part] = [
            types.Part.from_text(text="ORIGINAL IMAGE:"),
            types.Part.from_bytes(data=orig_data, mime_type=orig_mime),
            types.Part.from_text(text="EDITED IMAGE:"),
            types.Part.from_bytes(data=edit_data, mime_type=edit_mime),
            types.Part.from_text(text=prompt),
        ]

        # Stream with thinking
        accumulated_thinking = ""
        accumulated_text = ""
        prev_thinking_len = 0

        try:
            stream = await self._client.aio.models.generate_content_stream(
                model=model,
                contents=types.Content(role="user", parts=parts),
                config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(
                        thinking_budget=thinking_budget,
                        include_thoughts=True,
                    ),
                ),
            )
            async for chunk in stream:
                if not chunk.candidates:
                    continue
                content = chunk.candidates[0].content
                if not content:
                    continue

                for part in content.parts or []:
                    if (
                        hasattr(part, "thought")
                        and part.thought
                        and hasattr(part, "text")
                    ):
                        accumulated_thinking += part.text or ""
                    elif hasattr(part, "text") and part.text:
                        accumulated_text += part.text

                # Emit: THINKING DELTA
                if len(accumulated_thinking) > prev_thinking_len:
                    delta = accumulated_thinking[prev_thinking_len:]
                    prev_thinking_len = len(accumulated_thinking)
                    self._emit(
                        AIProgressEvent(
                            step=step,
                            message=f"AI is thinking... ({len(accumulated_thinking)} chars)",
                            thinkingTextDelta=delta,
                            iteration=iteration,
                        )
                    )

            # Emit: RAW OUTPUT
            self._emit(
                AIProgressEvent(
                    step=step,
                    message="AI evaluation received",
                    rawOutput=accumulated_text,
                    thinkingText=accumulated_thinking,
                    iteration=iteration,
                )
            )

            # Parse result
            result = {
                "satisfied": True,
                "reasoning": "",
                "revised_prompt": "",
                "thinking": accumulated_thinking,
            }

            # Try to extract JSON from response
            import json

            full_text = accumulated_thinking + accumulated_text
            json_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", full_text)
            if json_match:
                try:
                    parsed = json.loads(json_match.group(1).strip())
                    result["satisfied"] = parsed.get("satisfied", True)
                    result["reasoning"] = parsed.get("reasoning", "")
                    result["revised_prompt"] = parsed.get("revised_prompt", "")
                except json.JSONDecodeError:
                    pass

            return result

        except Exception as e:
            logger.error("Evaluation failed: %s", e)
            self._emit(
                AIProgressEvent(
                    step="error",
                    message=f"Evaluation failed: {e}",
                    iteration=iteration,
                )
            )
            # Return "satisfied" on error to avoid blocking
            return {
                "satisfied": True,
                "reasoning": f"Evaluation failed: {e}",
                "revised_prompt": "",
                "thinking": "",
            }


# =============================================================================
# Module-level singleton
# =============================================================================

_client: TransparentGeminiClient | None = None


def get_gemini_client() -> TransparentGeminiClient:
    """Get the singleton Gemini client instance."""
    global _client
    if _client is None:
        _client = TransparentGeminiClient()
    return _client
