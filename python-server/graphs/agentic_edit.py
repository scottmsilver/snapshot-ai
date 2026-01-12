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

import asyncio
import logging
import re
from typing import Any, Literal

import numpy as np
from google.genai import types
from langgraph.config import get_stream_writer
from langgraph.graph import END, StateGraph
from pydantic import BaseModel

from schemas import AI_MODELS, MAX_ITERATIONS, THINKING_BUDGETS
from schemas.agentic import AIProgressEvent, ErrorInfo, IterationInfo, ReferencePoint, ShapeMetadata
from services.gemini_client import get_gemini_client
from services.image_compare_lpips import (
    LPIPSDetectionOptions,
    detect_edit_regions_lpips,
    format_edit_regions_for_prompt,
)
from services.image_utils import encode_data_url, image_bytes_to_array, parse_data_url
from services.shape_descriptions import build_shapes_context

logger = logging.getLogger(__name__)


# =============================================================================
# State Definition
# =============================================================================


class GraphState(BaseModel):
    """
    State passed between nodes in the agentic edit graph.

    Attributes:
        source_image: Clean input image as base64 data URL (no annotations).
        annotated_image: Optional image with user's annotations visible (for AI reference).
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
    source_image: str  # Clean original image (no annotations)
    annotated_image: str | None = None  # Image with user annotations visible
    mask_image: str | None = None
    user_prompt: str
    reference_points: list[ReferencePoint] = []
    shapes: list[ShapeMetadata] = []
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
## USER-IDENTIFIED LOCATIONS

The user has placed labeled pins on the image to identify specific locations:

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
    user_prompt: str,
    has_mask: bool,
    has_annotated_image: bool = False,
    reference_points: list[ReferencePoint] | None = None,
    shapes: list[ShapeMetadata] | None = None,
) -> str:
    """Build the system prompt for the planning phase."""
    # Build annotated image context if provided
    if has_annotated_image:
        annotated_context = """## TWO IMAGES PROVIDED

You are receiving TWO images:
1. **CLEAN IMAGE** - The original image WITHOUT any annotations. This is the image that will be edited.
2. **ANNOTATED IMAGE** - The same image WITH the user's visual markings (arrows, circles, rectangles, text, etc.) drawn on it. This shows you EXACTLY what the user wants.

IMPORTANT:
- Use the ANNOTATED IMAGE to understand the user's intent - see where arrows point, what areas are circled, where text labels are placed
- The actual edits will be applied to the CLEAN IMAGE
- The annotations will NOT appear in the final result - they are just guidance for you

"""
    else:
        annotated_context = ""

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

    # Build shapes context if provided
    shapes_context = build_shapes_context(shapes or [])

    return f"""You are an expert image editing assistant working on a SCREENSHOT MODIFICATION task.

USER'S REQUEST: "{user_prompt}"

{annotated_context}{mask_context}
{ref_points_context}
{shapes_context}
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
{f"- Consider the user's annotations (shapes, arrows, text) as visual guidance for what they want" if shapes else ""}

You have one powerful tool: gemini_image_painter, which uses Gemini 3 Pro to edit images.

Call gemini_image_painter with a detailed prompt that achieves the goal while ensuring visual coherence.
{f"Remember: Do NOT use letter labels (A, B, C) in the prompt - describe the actual visual elements at those coordinates instead." if reference_points else ""}

You MUST call the gemini_image_painter tool."""


def build_evaluation_prompt(
    user_prompt: str,
    edit_prompt: str,
    has_mask: bool = False,
    edit_regions_text: str | None = None,
    reference_points: list[ReferencePoint] | None = None,
    shapes: list[ShapeMetadata] | None = None,
) -> str:
    """Build the prompt for self-check evaluation."""
    mask_context = (
        "You will also see a MASK IMAGE showing which area the user selected for editing (white = selected area)."
        if has_mask
        else "The user wanted to edit the entire image (no specific area selected)."
    )

    # Build reference points context for evaluator
    ref_points_context = build_reference_points_context(reference_points or [])

    # Build shapes context for evaluator
    shapes_context = build_shapes_context(shapes or [])

    mask_quality_point = (
        "- Was the edit applied to the correct area (as shown by the white region in the mask)?" if has_mask else ""
    )

    # Build the automatically detected changes section
    if edit_regions_text:
        detected_changes_section = f"""## Automatically Detected Changes

The following regions were detected as changed by comparing the original and result images pixel-by-pixel:

{edit_regions_text}

Use this information to verify the edit was applied to the CORRECT location.

"""
    else:
        detected_changes_section = ""

    return f"""You are reviewing an image edit to determine if it successfully accomplished the user's goal.

ORIGINAL USER REQUEST: "{user_prompt}"

EDIT THAT WAS ATTEMPTED: "{edit_prompt}"

{mask_context}
{ref_points_context}
{shapes_context}
{detected_changes_section}## Evaluation Criteria

### 1. Location Accuracy
Think carefully: WHERE did the user want changes to happen?
- Compare the DETECTED EDIT LOCATIONS above with where the edit SHOULD have been applied
- If the edit prompt contains COORDINATES (e.g., "at (150, 200)", "move to (300, 400)"), verify the detected regions are at or near those pixel locations
- If the user referenced specific elements (e.g., "the button", "the header", "the red car"), verify the detected changes are in the region of THAT element
- If a mask was provided, verify the detected changes are within the masked area

### 2. Unintended Substantial Changes (CRITICAL)
CAREFULLY examine the detected edit regions. Are there SUBSTANTIAL changes OUTSIDE the intended edit area?
- If the user wanted to edit region X, but regions Y and Z also changed significantly, that's a PROBLEM
- Look for large changes on the edges of the image, far from the target area, or in unrelated parts
- Focus on substantial changes - major artifacts, missing elements, structural distortions, large color shifts
- Ignore minor pixel-level noise or subtle compression artifacts - only flag changes that are visually noticeable

**If there are substantial unintended changes outside the target area (high significance score, large region, or visually obvious), the edit should be marked as UNSATISFACTORY and revised with a prompt that explicitly instructs the model to preserve unchanged areas.**

### 3. Cardinality Check
Think carefully: Did the user's request imply ADDING, REMOVING, or REPLACING elements?
- **REPLACE/MODIFY**: "Change X to Y", "Make X look like Y", "Update the color" → The COUNT of elements should stay the SAME
- **ADD**: "Add a button", "Put text here", "Insert an icon" → There should be MORE elements than before
- **REMOVE/DELETE**: "Remove the logo", "Delete the text", "Clear this area" → There should be FEWER elements than before

Does the result match the expected cardinality? If the user said "remove" but the element is still there (or replaced with something else), that's wrong.

### 4. Visual Quality
{mask_quality_point}
- Does the edited area look NATURAL and FIT SEAMLESSLY into the image?
- Is the edit clearly visible and significant enough?
- Does it match the style, lighting, and aesthetic of the surroundings?

## Your Response

Think through each criterion carefully, then provide your evaluation as a JSON object in a code fence.

If the edit is SATISFACTORY:
```json
{{
  "satisfied": true,
  "reasoning": "Explain why the edit meets all criteria: location accuracy, no substantial unintended changes, cardinality, and visual quality."
}}
```

If the edit NEEDS REVISION:
```json
{{
  "satisfied": false,
  "reasoning": "Explain what is wrong - which criteria failed and why. Be specific about any substantial unintended changes detected.",
  "revised_prompt": "A better, more specific prompt that addresses the issues. If there were unintended changes, add explicit instructions like 'DO NOT modify any other part of the image' or 'Preserve all areas outside of [target region]'."
}}
```

Be thoughtful - only flag substantial unintended changes that are visually noticeable, not minor noise.

IMPORTANT: You MUST output exactly one JSON code block with your evaluation."""


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
    if state.shapes:
        logger.info("Planning: %d shapes/annotations provided", len(state.shapes))
    if state.annotated_image:
        logger.info("Planning: Annotated image provided for visual reference")

    prompt = build_planning_prompt(
        state.user_prompt,
        bool(state.mask_image),
        has_annotated_image=bool(state.annotated_image),
        reference_points=state.reference_points,
        shapes=state.shapes,
    )
    iteration_info = IterationInfo(current=0, max=state.max_iterations)

    # Decode images with labels for transparency logging
    # When annotated image is provided, send BOTH images so AI can see the annotations
    source = parse_data_url(state.source_image)
    images = [(source.data, source.mime_type, "Clean Image (to be edited)")]

    if state.annotated_image:
        annotated = parse_data_url(state.annotated_image)
        images.append((annotated.data, annotated.mime_type, "Annotated Image (user's visual guidance)"))

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
    annotated = parse_data_url(state.annotated_image) if state.annotated_image else None
    mask = parse_data_url(state.mask_image) if state.mask_image else None

    # Build the generation prompt - add context about two images if annotated image is provided
    if annotated:
        generation_prompt = f"""You are receiving TWO images:
1. FIRST IMAGE (Clean): The original image WITHOUT any annotations - edit THIS image
2. SECOND IMAGE (Annotated): The same image WITH the user's visual markings (lines, arrows, circles, etc.) showing WHERE they want changes

IMPORTANT:
- Apply your edits to the FIRST (clean) image
- Use the SECOND (annotated) image to understand exactly WHERE the user wants changes
- The annotations show the user's intent - follow the lines, arrows, and markings
- DO NOT include any of the annotations in your output - they are just guidance

EDIT INSTRUCTION:
{state.refined_prompt}"""
    else:
        generation_prompt = state.refined_prompt

    try:
        client = get_gemini_client()

        # This call automatically emits progress
        # Send both clean and annotated images so the model can see user's visual guidance
        result = await client.generate_image(
            prompt=generation_prompt,
            source_image=(source.data, source.mime_type),
            annotated_image=(annotated.data, annotated.mime_type) if annotated else None,
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
        source = parse_data_url(state.source_image)
        result = parse_data_url(state.current_result)

        # Detect edit regions by comparing original and result images using LPIPS
        # LPIPS (Learned Perceptual Image Patch Similarity) is robust to diffusion noise
        edit_regions_text = None
        try:
            logger.info("Self-check: Starting LPIPS image comparison...")
            source_array = image_bytes_to_array(source.data)
            result_array = image_bytes_to_array(result.data)
            logger.info(
                "Self-check: Image arrays created - source: %s, result: %s",
                source_array.shape,
                result_array.shape,
            )

            # Use LPIPS-based detection (handles diffusion noise better than Delta E)
            # Run in thread pool to avoid blocking health checks during computation
            lpips_options = LPIPSDetectionOptions(
                threshold=0.1,  # LPIPS threshold (0-1)
                min_area=100,  # Minimum contour area
                patch_size=64,  # Patch size for LPIPS
                stride=32,  # Stride between patches
            )
            edit_result = await asyncio.to_thread(
                detect_edit_regions_lpips,
                source_array,
                result_array,
                lpips_options,
            )

            logger.info(
                "Self-check: LPIPS detection found %d regions, %d total pixels changed (%.1f%%)",
                len(edit_result.regions),
                edit_result.total_changed_area,
                edit_result.percent_changed,
            )

            # Log detected regions for debugging
            for i, r in enumerate(edit_result.regions[:5]):  # Show first 5
                x, y, w, h = r.bounding_box
                logger.info(
                    "Self-check: Region %d: center=(%d,%d) bbox=(%d,%d,%d,%d) area=%d significance=%.1f",
                    i + 1,
                    r.center[0],
                    r.center[1],
                    x,
                    y,
                    w,
                    h,
                    r.area,
                    r.significance,
                )

            if edit_result.regions:
                edit_regions_text = format_edit_regions_for_prompt(edit_result)
            else:
                logger.info("Self-check: No significant edit regions detected by LPIPS")

        except Exception as e:
            logger.exception("Self-check: Failed to detect edit regions: %s", e)
            # Continue without edit regions - the AI can still evaluate visually

        prompt = build_evaluation_prompt(
            state.user_prompt,
            state.refined_prompt,
            has_mask=bool(state.mask_image),
            edit_regions_text=edit_regions_text,
            reference_points=state.reference_points,
            shapes=state.shapes,
        )

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
