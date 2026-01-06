"""
LangGraph workflow for agentic image editing.

This workflow implements an iterative image editing process:
1. Planning - AI refines the user's prompt with extended reasoning
2. Generation - Generate/edit the image based on the refined prompt
3. Self-check - AI evaluates if the result meets the goal
4. Loop - Retry with revised prompt if not satisfied (up to max iterations)

Design Principles:
- Use LangChain abstractions where possible for provider flexibility
- Use native SDK only where LangChain lacks support (image generation)
- Keep Gemini-specific code isolated and well-documented
- Follow Python idioms and best practices
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import TYPE_CHECKING, Any, Literal

from langgraph.config import get_stream_writer

logger = logging.getLogger(__name__)
from langgraph.graph import END, StateGraph
from pydantic import BaseModel

from schemas import AI_MODELS, MAX_ITERATIONS, THINKING_BUDGETS
from schemas.agentic import AIProgressEvent, ErrorInfo, IterationInfo
from services.image_utils import encode_data_url, parse_data_url

if TYPE_CHECKING:
    from collections.abc import AsyncIterator


# =============================================================================
# State Definition
# =============================================================================


class GraphState(BaseModel):
    """
    State passed between nodes in the agentic edit graph.

    Attributes:
        source_image: Input image as base64 data URL.
        mask_image: Optional mask for targeted edits.
        user_prompt: User's edit request.
        max_iterations: Maximum retry attempts.
        refined_prompt: AI-improved version of user prompt.
        current_iteration: Current attempt number (0-indexed internally).
        current_result: Generated image from latest iteration.
        satisfied: Whether self-check approved the result.
        check_reasoning: Explanation from self-check.
        steps: Audit trail of completed steps.
    """

    # Inputs
    source_image: str
    mask_image: str | None = None
    user_prompt: str
    max_iterations: int = MAX_ITERATIONS

    # Planning outputs
    refined_prompt: str = ""

    # Iteration state
    current_iteration: int = 0
    current_result: str | None = None

    # Self-check outputs
    satisfied: bool = False
    check_reasoning: str = ""

    # Tracking
    steps: list[str] = []

    model_config = {"arbitrary_types_allowed": True}


# =============================================================================
# Progress Reporting
# =============================================================================


def emit_progress(state: GraphState, event: AIProgressEvent) -> None:
    """
    Emit a progress event via LangGraph's streaming infrastructure.

    Events are sent through get_stream_writer() when running in streaming mode
    (astream with stream_mode="custom"). Falls back silently if not streaming.

    Args:
        state: Current graph state (unused but kept for API consistency).
        event: Progress event to emit.
    """
    try:
        writer = get_stream_writer()
        writer(event.model_dump(exclude_none=True))
    except RuntimeError:
        # Not in streaming context - this is fine, events are optional
        pass


# =============================================================================
# Prompt Templates
# =============================================================================


def build_planning_prompt(user_prompt: str, has_mask: bool) -> str:
    """
    Build the system prompt for the planning phase.

    The planning phase uses extended reasoning to transform the user's
    simple request into a detailed, actionable edit description.

    Note: This prompt is harmonized with the Express implementation
    to ensure consistent behavior during migration.
    """
    mask_context = (
        "The user has selected a specific area of the image (shown as a white mask). Your edits should focus on this masked region."
        if has_mask
        else "The user wants to edit the entire image."
    )

    return f"""You are an expert image editing assistant working on a SCREENSHOT MODIFICATION task.

USER'S REQUEST: "{user_prompt}"

{mask_context}

Your goal is to create an edit that:
1. Accomplishes exactly what the user wants
2. FITS NATURALLY into the existing image - the modification should look like it belongs there
3. Matches the style, lighting, perspective, and aesthetic of the original screenshot
4. Unless the user explicitly asks for something that stands out, edits should be SEAMLESS and COHERENT

Think deeply about:
- What is the user really trying to achieve?
- What visual details would make this edit look natural and integrated?
- How should lighting, shadows, and style match the surroundings?
- What would make someone looking at the final image NOT notice it was edited?

You have one powerful tool: gemini_image_painter, which uses Gemini 3 Pro to edit images.

Call gemini_image_painter with a detailed prompt that achieves the goal while ensuring visual coherence.

You MUST call the gemini_image_painter tool."""


def build_evaluation_prompt(user_prompt: str, edit_prompt: str) -> str:
    """Build the prompt for self-check evaluation."""
    return f"""Evaluate whether this image edit meets the user's request.

**User's request:** "{user_prompt}"
**Edit prompt used:** "{edit_prompt}"

You will see the original image (BEFORE) and edited result (AFTER).

Evaluate:
1. Does the edit match the user's request?
2. Is the edit visible and significant enough?
3. Does it look natural and coherent?
4. Are there quality issues or artifacts?

Respond with JSON in this exact format:

```json
{{
  "satisfied": true or false,
  "reasoning": "explanation",
  "revised_prompt": "improved prompt if not satisfied"
}}
```"""


# =============================================================================
# Provider-Specific Code (Isolated)
# =============================================================================
# This section contains Gemini-specific code. If switching providers,
# only this section needs modification.


def _get_genai_client():
    """Get the Google GenAI client. Gemini-specific."""
    from google import genai

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY must be set")
    return genai.Client(api_key=api_key)


async def _call_planning_model_streaming(
    prompt: str,
    image_data: bytes,
    image_mime: str,
    mask_data: bytes | None = None,
    mask_mime: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """
    Call the planning model with streaming for real-time thinking updates.

    Gemini-specific implementation using native SDK for:
    - Streaming responses (thinking deltas)
    - Function calling (structured output)
    - Extended thinking budget

    Yields:
        Dicts with keys: "thinking_delta", "function_call", "text", "done"
    """
    from google.genai import types

    client = _get_genai_client()

    # Build content parts
    parts = [
        types.Part.from_text(text=prompt),
        types.Part.from_bytes(data=image_data, mime_type=image_mime),
    ]
    if mask_data and mask_mime:
        parts.append(types.Part.from_text(text="Mask (white = selected area):"))
        parts.append(types.Part.from_bytes(data=mask_data, mime_type=mask_mime))

    # Tool for structured output
    # Note: Tool name harmonized with Express implementation
    tool = types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="gemini_image_painter",
                description="Edits the image. Provide a detailed prompt describing what to create/modify, including style and coherence details.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "prompt": types.Schema(
                            type=types.Type.STRING,
                            description="Detailed description of the edit, including how it should fit naturally into the image.",
                        ),
                    },
                    required=["prompt"],
                ),
            )
        ]
    )

    stream = await client.aio.models.generate_content_stream(
        model=AI_MODELS["PLANNING"],
        contents=types.Content(role="user", parts=parts),
        config=types.GenerateContentConfig(
            tools=[tool],
            thinking_config=types.ThinkingConfig(
                thinking_budget=THINKING_BUDGETS["HIGH"],
                include_thoughts=True,
            ),
        ),
    )

    async for chunk in stream:
        if not chunk.candidates:
            continue

        for part in chunk.candidates[0].content.parts:
            if hasattr(part, "thought") and part.thought and part.text:
                yield {"thinking_delta": part.text}
            elif hasattr(part, "function_call") and part.function_call:
                yield {"function_call": part.function_call}
            elif hasattr(part, "text") and part.text:
                yield {"text": part.text}

    yield {"done": True}


async def _generate_image(
    prompt: str,
    source_data: bytes,
    source_mime: str,
    mask_data: bytes | None = None,
    mask_mime: str | None = None,
) -> bytes | None:
    """
    Generate/edit an image using the image generation model.

    Gemini-specific implementation - image generation is not yet
    well-abstracted in LangChain for multimodal editing.

    Returns:
        Generated image bytes, or None if generation failed.
    """
    from google.genai import types

    client = _get_genai_client()

    parts = [
        types.Part.from_bytes(data=source_data, mime_type=source_mime),
        types.Part.from_text(text=prompt),
    ]
    if mask_data and mask_mime:
        parts.insert(1, types.Part.from_bytes(data=mask_data, mime_type=mask_mime))

    response = await client.aio.models.generate_content(
        model=AI_MODELS["IMAGE_GENERATION"],
        contents=types.Content(role="user", parts=parts),
        config=types.GenerateContentConfig(response_modalities=["image", "text"]),
    )

    if response.candidates:
        for part in response.candidates[0].content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                return part.inline_data.data

    return None


async def _evaluate_result(
    prompt: str,
    source_data: bytes,
    source_mime: str,
    result_data: bytes,
    result_mime: str,
) -> dict[str, Any]:
    """
    Evaluate an edit result against the original request.

    Returns:
        Dict with "satisfied", "reasoning", and optionally "revised_prompt".
    """
    from google.genai import types

    client = _get_genai_client()

    parts = [
        types.Part.from_text(text="ORIGINAL IMAGE:"),
        types.Part.from_bytes(data=source_data, mime_type=source_mime),
        types.Part.from_text(text="EDITED IMAGE:"),
        types.Part.from_bytes(data=result_data, mime_type=result_mime),
        types.Part.from_text(text=prompt),
    ]

    response = await client.aio.models.generate_content(
        model=AI_MODELS["PLANNING"],
        contents=types.Content(role="user", parts=parts),
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_budget=THINKING_BUDGETS["MEDIUM"],
                include_thoughts=True,
            ),
        ),
    )

    # Parse response
    result = {"satisfied": True, "reasoning": "", "revised_prompt": ""}

    if response.candidates:
        full_text = "".join(
            part.text
            for part in response.candidates[0].content.parts
            if hasattr(part, "text") and part.text
        )

        # Try to extract JSON from markdown code fence
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


# =============================================================================
# Graph Nodes
# =============================================================================


async def planning_node(state: GraphState) -> dict[str, Any]:
    """
    Planning phase: AI refines the user's prompt with extended reasoning.

    Streams thinking updates in real-time for UI feedback.
    """
    logger.info("Planning: Starting...")

    prompt = build_planning_prompt(state.user_prompt, bool(state.mask_image))
    iteration_info = IterationInfo(current=0, max=state.max_iterations)

    # Emit initial progress
    emit_progress(
        state,
        AIProgressEvent(
            step="planning",
            message="Sending request to AI...",
            prompt=prompt,
            iteration=iteration_info,
            newLogEntry=True,
        ),
    )

    # Decode images
    source = parse_data_url(state.source_image)
    source_data, source_mime = source.data, source.mime_type
    if state.mask_image:
        mask = parse_data_url(state.mask_image)
        mask_data, mask_mime = mask.data, mask.mime_type
    else:
        mask_data, mask_mime = None, None

    try:
        thinking_text = ""
        refined_prompt = state.user_prompt
        response_text = ""

        async for chunk in _call_planning_model_streaming(
            prompt, source_data, source_mime, mask_data, mask_mime
        ):
            if "thinking_delta" in chunk:
                thinking_text += chunk["thinking_delta"]
                emit_progress(
                    state,
                    AIProgressEvent(
                        step="planning",
                        message=f"AI is thinking... ({len(thinking_text)} chars)",
                        thinkingTextDelta=chunk["thinking_delta"],
                        iteration=iteration_info,
                    ),
                )
            elif "function_call" in chunk:
                fc = chunk["function_call"]
                if fc.args and "prompt" in fc.args:
                    refined_prompt = fc.args["prompt"]
            elif "text" in chunk:
                response_text += chunk["text"]

        # Fallback: try to extract from text if no function call
        if refined_prompt == state.user_prompt and response_text:
            match = re.search(
                r'gemini_image_painter\s*\(\s*prompt\s*=\s*"([^"]+)"', response_text
            )
            if match:
                refined_prompt = match.group(1)

        logger.info("Planning: Refined prompt: %s...", refined_prompt[:80])

        emit_progress(
            state,
            AIProgressEvent(
                step="planning",
                message="AI response received",
                rawOutput=response_text or refined_prompt,
                iteration=iteration_info,
            ),
        )
        emit_progress(
            state,
            AIProgressEvent(
                step="processing",
                message="AI planned the edit",
                rawOutput=refined_prompt,
                iteration=iteration_info,
            ),
        )

        return {
            "refined_prompt": refined_prompt,
            "steps": state.steps + ["planning_complete"],
        }

    except Exception as e:
        logger.error("Planning: Error - %s", e)
        emit_progress(
            state,
            AIProgressEvent(
                step="error",
                message=f"Planning failed: {e}",
                error=ErrorInfo(message=str(e)),
            ),
        )
        return {
            "refined_prompt": state.user_prompt,
            "steps": state.steps + ["planning_failed"],
        }


async def generate_node(state: GraphState) -> dict[str, Any]:
    """Generate/edit the image based on the refined prompt."""
    iteration = state.current_iteration + 1
    logger.info("Generate: Iteration %d/%d...", iteration, state.max_iterations)

    iteration_info = IterationInfo(current=iteration, max=state.max_iterations)

    emit_progress(
        state,
        AIProgressEvent(
            step="calling_api",
            message=f"Generating image (attempt {iteration}/{state.max_iterations})...",
            iteration=iteration_info,
        ),
    )

    source = parse_data_url(state.source_image)
    source_data, source_mime = source.data, source.mime_type
    if state.mask_image:
        mask = parse_data_url(state.mask_image)
        mask_data, mask_mime = mask.data, mask.mime_type
    else:
        mask_data, mask_mime = None, None

    try:
        image_bytes = await _generate_image(
            state.refined_prompt, source_data, source_mime, mask_data, mask_mime
        )

        if image_bytes:
            result_url = encode_data_url(image_bytes, "image/png")
            logger.info("Generate: Success")

            emit_progress(
                state,
                AIProgressEvent(
                    step="processing",
                    message=f"Image generated (attempt {iteration}/{state.max_iterations})",
                    iteration=iteration_info,
                    iterationImage=result_url,
                ),
            )

            return {
                "current_result": result_url,
                "current_iteration": iteration,
                "steps": state.steps + [f"generate_{iteration}"],
            }
        else:
            raise ValueError("No image in response")

    except Exception as e:
        logger.error("Generate: Error - %s", e)
        emit_progress(
            state,
            AIProgressEvent(
                step="error",
                message=f"Generation failed: {e}",
                error=ErrorInfo(message=str(e)),
                iteration=iteration_info,
            ),
        )
        return {
            "current_iteration": iteration,
            "steps": state.steps + [f"generate_{iteration}_failed"],
        }


async def self_check_node(state: GraphState) -> dict[str, Any]:
    """Evaluate if the generated image meets the user's request."""
    iteration = state.current_iteration
    logger.info("Self-check: Evaluating iteration %d...", iteration)

    iteration_info = IterationInfo(current=iteration, max=state.max_iterations)

    # Skip on last iteration
    if iteration >= state.max_iterations:
        logger.info("Self-check: Max iterations reached")
        emit_progress(
            state,
            AIProgressEvent(
                step="processing",
                message="Max iterations reached, using final result",
                iteration=iteration_info,
            ),
        )
        return {
            "satisfied": True,
            "check_reasoning": "Max iterations reached",
            "steps": state.steps + ["max_iterations"],
        }

    if not state.current_result:
        return {
            "satisfied": False,
            "check_reasoning": "No image generated",
            "steps": state.steps + ["no_result"],
        }

    emit_progress(
        state,
        AIProgressEvent(
            step="self_checking",
            message="AI is evaluating the result...",
            iteration=iteration_info,
        ),
    )

    try:
        prompt = build_evaluation_prompt(state.user_prompt, state.refined_prompt)
        source = parse_data_url(state.source_image)
        result = parse_data_url(state.current_result)

        evaluation = await _evaluate_result(
            prompt, source.data, source.mime_type, result.data, result.mime_type
        )

        satisfied = evaluation["satisfied"]
        reasoning = evaluation["reasoning"]
        revised = evaluation.get("revised_prompt", "")

        logger.info("Self-check: satisfied=%s", satisfied)

        if satisfied:
            emit_progress(
                state,
                AIProgressEvent(
                    step="processing",
                    message=f"AI approved: {reasoning}",
                    iteration=iteration_info,
                ),
            )
        else:
            emit_progress(
                state,
                AIProgressEvent(
                    step="iterating",
                    message=f"AI requested revision: {reasoning}",
                    rawOutput=revised,
                    iteration=iteration_info,
                ),
            )

        return {
            "satisfied": satisfied,
            "check_reasoning": reasoning,
            "refined_prompt": revised
            if revised and not satisfied
            else state.refined_prompt,
            "steps": state.steps
            + [f"check_{iteration}_{'ok' if satisfied else 'revise'}"],
        }

    except Exception as e:
        logger.error("Self-check: Error - %s", e)
        # Accept on error to avoid blocking
        return {
            "satisfied": True,
            "check_reasoning": f"Check failed: {e}",
            "steps": state.steps + [f"check_{iteration}_error"],
        }


# =============================================================================
# Conditional Routing
# =============================================================================


def should_continue(state: GraphState) -> Literal["generate", "end"]:
    """Determine whether to continue iterating or finish."""
    if state.satisfied:
        return "end"
    if state.current_iteration >= state.max_iterations:
        return "end"
    if not state.current_result and state.current_iteration > 0:
        return "end"  # Generation failed
    return "generate"


# =============================================================================
# Graph Construction
# =============================================================================


def create_agentic_edit_graph():
    """Create and compile the agentic edit workflow graph."""
    graph = StateGraph(GraphState)

    # Add nodes
    graph.add_node("planning", planning_node)
    graph.add_node("generate", generate_node)
    graph.add_node("self_check", self_check_node)

    # Define flow
    graph.set_entry_point("planning")
    graph.add_edge("planning", "generate")
    graph.add_edge("generate", "self_check")
    graph.add_conditional_edges(
        "self_check",
        should_continue,
        {"generate": "generate", "end": END},
    )

    return graph.compile()


# Module-level compiled graph instance
agentic_edit_graph = create_agentic_edit_graph()
