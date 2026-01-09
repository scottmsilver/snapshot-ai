"""
Pydantic schemas for the agentic edit workflow.

These schemas match the TypeScript interfaces in server/src/types/api.ts
to ensure API compatibility between Express and Python backends.
"""

from typing import Annotated, Literal, Optional

from pydantic import AfterValidator, BaseModel, Field

# =============================================================================
# Custom Types
# =============================================================================


def validate_data_url(v: str) -> str:
    """Validate that a string is a data URL starting with 'data:'."""
    if not v.startswith("data:"):
        raise ValueError('Must be a data URL starting with "data:"')
    return v


Base64ImageUrl = Annotated[str, AfterValidator(validate_data_url)]
"""A base64-encoded image as a data URL (e.g., 'data:image/png;base64,...')."""


# =============================================================================
# Progress Step Enum (matches TypeScript AIProgressStep)
# =============================================================================

AIProgressStep = Literal[
    "idle",
    "planning",
    "calling_api",
    "processing",
    "self_checking",
    "iterating",
    "complete",
    "error",
]


# =============================================================================
# SSE Event Schemas (matches TypeScript AIProgressEvent)
# =============================================================================


class IterationInfo(BaseModel):
    """Iteration tracking for multi-step workflows."""

    current: int
    max: int


class ErrorInfo(BaseModel):
    """Error details for failed operations."""

    message: str
    details: Optional[str] = None


class AIInputImage(BaseModel):
    """An input image sent to the AI (for full transparency logging)."""

    label: str  # e.g., "Original Image", "Edited Result", "Mask"
    dataUrl: str  # Base64 data URL


class AIProgressEvent(BaseModel):
    """
    SSE progress event for streaming operations.

    Matches the TypeScript AIProgressEvent interface exactly.
    """

    step: AIProgressStep
    message: Optional[str] = None

    # Thinking text (full or delta for streaming)
    thinkingText: Optional[str] = None
    thinkingTextDelta: Optional[str] = None

    # Full transparency fields
    prompt: Optional[str] = None
    rawOutput: Optional[str] = None
    rawOutputDelta: Optional[str] = None
    inputImages: Optional[list[AIInputImage]] = None  # All images sent to AI

    # Iteration tracking
    iteration: Optional[IterationInfo] = None

    # Error info
    error: Optional[ErrorInfo] = None

    # Generated image from this iteration (base64 data URL)
    iterationImage: Optional[Base64ImageUrl] = None

    # Force new log entry in UI
    newLogEntry: Optional[bool] = None


# =============================================================================
# Reference Point Schema
# =============================================================================


class ReferencePoint(BaseModel):
    """A labeled reference point placed on the image for spatial commands."""

    label: str = Field(..., description="Label for this point (e.g., 'A', 'B', 'C')")
    x: float = Field(..., description="X coordinate in pixels")
    y: float = Field(..., description="Y coordinate in pixels")


# =============================================================================
# Request/Response Schemas (matches TypeScript AgenticEditRequest/Response)
# =============================================================================


class AgenticEditRequest(BaseModel):
    """
    Request body for POST /api/agentic/edit endpoint.

    Matches the TypeScript AgenticEditRequest interface.
    """

    # Source image (base64 data URL)
    sourceImage: Base64ImageUrl = Field(..., description="Source image as base64 data URL")

    # Edit prompt from user
    prompt: str = Field(..., description="User's edit prompt")

    # Optional mask image for inpainting (base64 data URL)
    maskImage: Optional[Base64ImageUrl] = Field(None, description="Mask image as base64 data URL (white = edit area)")

    # Reference points for spatial commands (e.g., "Move A to B")
    referencePoints: Optional[list[ReferencePoint]] = Field(
        None, description="Reference points placed on the image for spatial commands"
    )

    # Maximum iterations for self-check loop
    maxIterations: Optional[int] = Field(3, ge=1, le=5, description="Maximum iterations (1-5, default 3)")


class AgenticEditResponse(BaseModel):
    """
    Final response for agentic edit (sent as SSE 'complete' event).

    Matches the TypeScript AgenticEditResponse interface.
    """

    # Final generated image (base64 data URL)
    imageData: Base64ImageUrl = Field(..., description="Final image as base64 data URL")

    # Number of iterations performed
    iterations: int = Field(..., description="Number of iterations performed")

    # Final prompt that produced the result
    finalPrompt: str = Field(..., description="Final prompt used for generation")


# =============================================================================
# Internal State Schema (for LangGraph)
# =============================================================================


class AgenticEditState(BaseModel):
    """
    Internal state for the LangGraph agentic edit workflow.

    This is NOT part of the API contract - it's for internal use only.
    """

    # Inputs (from request)
    source_image: Base64ImageUrl
    mask_image: Optional[Base64ImageUrl] = None
    user_prompt: str
    max_iterations: int = 3

    # Planning phase outputs
    refined_prompt: str = ""
    planning_thinking: str = ""

    # Iteration state
    current_iteration: int = 0
    current_result: Optional[Base64ImageUrl] = None  # base64 image

    # Self-check state
    satisfied: bool = False
    check_reasoning: str = ""
    revision_suggestion: str = ""

    # Tracking
    steps: list[str] = Field(default_factory=list)

    # Final output
    final_image: Optional[Base64ImageUrl] = None
    final_prompt: str = ""


# =============================================================================
# POST /api/ai/generate - Text Generation Schemas
# =============================================================================


class GenerateTextRequest(BaseModel):
    """
    Request body for POST /api/ai/generate endpoint.

    Matches the TypeScript GenerateTextRequest interface.
    """

    model: str = Field(..., min_length=1, description="The model to use")
    contents: list = Field(..., min_length=1, description="The content/prompt to send")
    tools: Optional[list] = Field(None, description="Optional tools (function declarations)")
    generationConfig: Optional[dict] = Field(None, description="Generation config")
    thinkingBudget: Optional[int] = Field(None, description="Thinking budget")
    includeThoughts: Optional[bool] = Field(True, description="Whether to include thoughts")
    logLabel: Optional[str] = Field(None, description="Label for this call in the log")


class FunctionCall(BaseModel):
    """Function call from AI response."""

    name: str
    args: dict


class GenerateTextResponse(BaseModel):
    """
    Response for POST /api/ai/generate endpoint.

    Matches the TypeScript GenerateTextResponse interface.
    """

    raw: dict = Field(..., description="The raw result from the API")
    text: str = Field(..., description="Extracted text response (non-thinking parts)")
    thinking: str = Field(..., description="Extracted thinking text")
    functionCall: Optional[FunctionCall] = Field(None, description="Function call if present")
