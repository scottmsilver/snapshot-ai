"""
LangGraph workflow for agentic image editing.

This workflow implements an iterative image editing process:
1. Planning - AI refines the user's prompt with extended reasoning
2. Generation - Generate/edit the image based on the refined prompt
3. Self-check - AI evaluates if the result meets the goal
4. Loop - Retry with revised prompt if not satisfied (up to max iterations)

Design Principles:
- Use TransparentGeminiClient for ALL AI calls (automatic progress streaming)
- Transparency is mandatory - callers cannot skip emitting events
- Keep workflow logic clean and focused
"""

from __future__ import annotations

import logging
import re
from typing import Any, Literal

from google.genai import types
from langgraph.config import get_stream_writer
from langgraph.graph import END, StateGraph
from pydantic import BaseModel
from schemas import AI_MODELS, MAX_ITERATIONS, THINKING_BUDGETS
from schemas.agentic import AIProgressEvent, ErrorInfo, IterationInfo, ReferencePoint
from services.gemini_client import get_gemini_client
from services.image_utils import encode_data_url, parse_data_url

logger = logging.getLogger(__name__)


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
        reference_points: Labeled points for spatial commands (e.g., "Move A to B").
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
    reference_points: list[ReferencePoint] = []
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
# Progress Reporting (for non-AI events only)
# =============================================================================


def emit_progress(event: AIProgressEvent) -> None:
    """
    Emit a non-AI progress event (e.g., workflow transitions).

    For AI calls, use TransparentGeminiClient which handles progress automatically.
    """
    try:
        writer = get_stream_writer()
        writer(event.model_dump(exclude_none=True))
    except RuntimeError:
        pass


# =============================================================================
# Prompt Templates
# =============================================================================


def build_reference_points_context(reference_points: list[ReferencePoint]) -> str:
    """Build context string describing reference points placed on the image."""
    if not reference_points:
        return ""

    points_desc = []
    for point in reference_points:
        points_desc.append(f"- **Point {point.label}** at pixel coordinates ({int(point.x)}, {int(point.y)})")

    return f"""
## REFERENCE POINTS

The user has placed labeled reference markers on the image to indicate specific locations:

{chr(10).join(points_desc)}

IMPORTANT: When the user's command references these labels (e.g., "Move A to B", "Make A look like B", "Put C next to A"):
- Identify what visual element is at each labeled coordinate
- Translate the letter references into descriptions of the actual elements
- Include the pixel coordinates in your editing prompt so the edit is applied to the correct location
- The final editing prompt should NOT use letters like "A" or "B" - describe the actual elements instead

Example translations:
- "Move A to B" where A is at a button and B is at a sidebar → "Move the blue Submit button at (150, 200) to the sidebar area at (50, 300)"
- "Make A look like B" where A is a heading and B is styled text → "Style the heading at (100, 50) to match the font and color of the styled text at (200, 150)"
"""


def build_planning_prompt(
    user_prompt: str, has_mask: bool, reference_points: list[ReferencePoint] | None = None
) -> str:
    """Build the system prompt for the planning phase."""
    if has_mask:
        mask_context = """The user has selected a specific area of the image using a mask (white = edit area, black = preserve).
This is an INPAINTING task - you must fill/modify ONLY the masked region.

CRITICAL INPAINTING GUIDELINES:

1. ANALYZE THE MASKED AREA AND SURROUNDINGS:
   - Study what content exists in and around the masked region
   - Identify the visual context: What objects, textures, colors surround the mask?
   - Note any patterns, gradients, or repeating elements that extend into the mask area
   - Consider what was likely there before (if removing) or what would naturally fit (if adding)

2. SEAMLESS EDGE BLENDING:
   - The boundary between edited and original pixels must be INVISIBLE
   - Match the exact color temperature, saturation, and brightness at mask edges
   - Continue any textures, patterns, or gradients smoothly across the boundary
   - Pay special attention to anti-aliasing and soft transitions at mask borders
   - Avoid hard edges, color shifts, or visible seams where the mask meets original content

3. MATCH LIGHTING, PERSPECTIVE, AND STYLE:
   - Analyze the light source direction and intensity in the surrounding image
   - Apply consistent shadows and highlights that match the scene's lighting
   - Maintain the exact perspective and vanishing points of the original image
   - Match the visual style: Is it a screenshot? Photo? UI element? Illustration?
   - Preserve the image's noise/grain level, compression artifacts, and overall quality

4. VISUAL COHERENCE AT MASK BOUNDARIES:
   - The new content must look like it was always part of the original image
   - Any added objects must interact naturally with adjacent elements (shadows, reflections)
   - Removed content must be filled with contextually appropriate background
   - Ensure depth-of-field and focus match the surrounding region"""
    else:
        mask_context = "The user wants to edit the entire image."

    # Build reference points context if provided
    ref_points_context = build_reference_points_context(reference_points or [])

    return f"""You are an expert image editing assistant working on a SCREENSHOT MODIFICATION task.

USER'S REQUEST: "{user_prompt}"

{mask_context}
{ref_points_context}
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
{f"- Look at the reference points and identify what elements are at those coordinates" if reference_points else ""}

You have one powerful tool: gemini_image_painter, which uses Gemini 3 Pro to edit images.

Call gemini_image_painter with a detailed prompt that achieves the goal while ensuring visual coherence.
{f"Remember: Do NOT use letter labels (A, B, C) in the prompt - describe the actual visual elements at those coordinates instead." if reference_points else ""}

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
# Tool Definition for Planning
# =============================================================================


def get_planning_tool() -> types.Tool:
    """Get the tool definition for the planning phase."""
    return types.Tool(
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


# =============================================================================
# Graph Nodes
# =============================================================================


async def planning_node(state: GraphState) -> dict[str, Any]:
    """
    Planning phase: AI refines the user's prompt with extended reasoning.

    Uses TransparentGeminiClient which automatically streams:
    - The prompt being sent
    - Thinking deltas as they arrive
    - The final response
    """
    logger.info("Planning: Starting...")
    if state.reference_points:
        logger.info("Planning: %d reference points provided", len(state.reference_points))

    prompt = build_planning_prompt(state.user_prompt, bool(state.mask_image), state.reference_points)
    iteration_info = IterationInfo(current=0, max=state.max_iterations)

    # Decode images with labels for transparency logging
    source = parse_data_url(state.source_image)
    images = [(source.data, source.mime_type, "Source Image")]
    if state.mask_image:
        mask = parse_data_url(state.mask_image)
        images.append((mask.data, mask.mime_type, "Mask (white = edit area)"))

    try:
        client = get_gemini_client()

        # This call automatically emits: prompt, input images, thinking deltas, raw output
        result = await client.generate_with_thinking(
            prompt=prompt,
            images=images,
            step="planning",
            iteration=iteration_info,
            model=AI_MODELS["PLANNING"],
            thinking_budget=THINKING_BUDGETS["HIGH"],
            tools=[get_planning_tool()],
            new_log_entry=True,
        )

        # Extract refined prompt from function call or text
        refined_prompt = state.user_prompt
        if result.function_call and result.function_call.get("args", {}).get("prompt"):
            refined_prompt = result.function_call["args"]["prompt"]
        elif result.text:
            # Fallback: try to extract from text
            match = re.search(r'gemini_image_painter\s*\(\s*prompt\s*=\s*"([^"]+)"', result.text)
            if match:
                refined_prompt = match.group(1)

        logger.info("Planning: Refined prompt: %s...", refined_prompt[:80])

        # Emit transition to processing
        emit_progress(
            AIProgressEvent(
                step="processing",
                message="AI planned the edit",
                rawOutput=refined_prompt,
                iteration=iteration_info,
            )
        )

        return {
            "refined_prompt": refined_prompt,
            "steps": state.steps + ["planning_complete"],
        }

    except Exception as e:
        logger.error("Planning: Error - %s", e)
        emit_progress(
            AIProgressEvent(
                step="error",
                message=f"Planning failed: {e}",
                error=ErrorInfo(message=str(e)),
            )
        )
        return {
            "refined_prompt": state.user_prompt,
            "steps": state.steps + ["planning_failed"],
        }


async def generate_node(state: GraphState) -> dict[str, Any]:
    """
    Generate/edit the image based on the refined prompt.

    Uses TransparentGeminiClient which automatically streams progress.
    """
    iteration = state.current_iteration + 1
    logger.info("Generate: Iteration %d/%d...", iteration, state.max_iterations)

    iteration_info = IterationInfo(current=iteration, max=state.max_iterations)

    # Decode images
    source = parse_data_url(state.source_image)
    mask = parse_data_url(state.mask_image) if state.mask_image else None

    try:
        client = get_gemini_client()

        # This call automatically emits progress
        result = await client.generate_image(
            prompt=state.refined_prompt,
            source_image=(source.data, source.mime_type),
            mask_image=(mask.data, mask.mime_type) if mask else None,
            step="calling_api",
            iteration=iteration_info,
        )

        if result.image_bytes:
            result_url = encode_data_url(result.image_bytes, "image/png")
            logger.info("Generate: Success")

            emit_progress(
                AIProgressEvent(
                    step="processing",
                    message=f"Image generated (attempt {iteration}/{state.max_iterations})",
                    iteration=iteration_info,
                    iterationImage=result_url,
                )
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
            AIProgressEvent(
                step="error",
                message=f"Generation failed: {e}",
                error=ErrorInfo(message=str(e)),
                iteration=iteration_info,
            )
        )
        return {
            "current_iteration": iteration,
            "steps": state.steps + [f"generate_{iteration}_failed"],
        }


async def self_check_node(state: GraphState) -> dict[str, Any]:
    """
    Evaluate if the generated image meets the user's request.

    Uses TransparentGeminiClient which automatically streams:
    - The evaluation prompt
    - Thinking deltas as the AI reasons
    - The final evaluation response
    """
    iteration = state.current_iteration
    logger.info("Self-check: Evaluating iteration %d...", iteration)

    iteration_info = IterationInfo(current=iteration, max=state.max_iterations)

    # Skip on last iteration
    if iteration >= state.max_iterations:
        logger.info("Self-check: Max iterations reached")
        emit_progress(
            AIProgressEvent(
                step="processing",
                message="Max iterations reached, using final result",
                iteration=iteration_info,
            )
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

    try:
        prompt = build_evaluation_prompt(state.user_prompt, state.refined_prompt)
        source = parse_data_url(state.source_image)
        result = parse_data_url(state.current_result)

        client = get_gemini_client()

        # This call automatically emits: prompt, thinking deltas, raw output
        evaluation = await client.evaluate(
            prompt=prompt,
            original_image=(source.data, source.mime_type),
            edited_image=(result.data, result.mime_type),
            step="self_checking",
            iteration=iteration_info,
            thinking_budget=THINKING_BUDGETS["MEDIUM"],
        )

        satisfied = evaluation["satisfied"]
        reasoning = evaluation["reasoning"]
        revised = evaluation.get("revised_prompt", "")

        logger.info("Self-check: satisfied=%s", satisfied)

        if satisfied:
            emit_progress(
                AIProgressEvent(
                    step="self_checking",
                    message=f"AI approved: {reasoning}",
                    iteration=iteration_info,
                )
            )
        else:
            emit_progress(
                AIProgressEvent(
                    step="iterating",
                    message=f"AI requested revision: {reasoning}",
                    iteration=iteration_info,
                )
            )

        return {
            "satisfied": satisfied,
            "check_reasoning": reasoning,
            "refined_prompt": revised if revised and not satisfied else state.refined_prompt,
            "steps": state.steps + [f"check_{iteration}_{'ok' if satisfied else 'revise'}"],
        }

    except Exception as e:
        logger.error("Self-check: Error - %s", e)
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
