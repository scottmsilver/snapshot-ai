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
# Shape Metadata Schema (for user-drawn annotations)
# =============================================================================

# Supported shape types for AI context
SHAPE_TYPES = ("line", "arrow", "rectangle", "ellipse", "freedraw", "text", "diamond")
"""Shape types that can be extracted from the canvas and sent to the AI."""

ShapeType = Literal["line", "arrow", "rectangle", "ellipse", "freedraw", "text", "diamond"]
"""Type alias for shape type literals."""


class Point2D(BaseModel):
    """A 2D point coordinate."""

    x: float
    y: float


class BoundingBox(BaseModel):
    """Bounding box for a shape."""

    x: float = Field(..., description="Top-left X coordinate")
    y: float = Field(..., description="Top-left Y coordinate")
    width: float = Field(..., description="Width in pixels")
    height: float = Field(..., description="Height in pixels")


class ShapeMetadata(BaseModel):
    """
    Metadata for a user-drawn shape/annotation on the canvas.

    Includes position, appearance, and type-specific properties.
    """

    type: ShapeType = Field(..., description="Shape type")
    strokeColor: str = Field(..., description="Stroke color (e.g., '#ff0000')")
    strokeWidth: float = Field(1, description="Stroke width in pixels")
    backgroundColor: Optional[str] = Field(None, description="Fill color if any")
    boundingBox: BoundingBox = Field(..., description="Bounding box of the shape")

    # Line/Arrow specific
    startPoint: Optional[Point2D] = Field(None, description="Start point for lines/arrows")
    endPoint: Optional[Point2D] = Field(None, description="End point for lines/arrows")
    hasStartArrowhead: Optional[bool] = Field(None, description="Whether line has start arrowhead")
    hasEndArrowhead: Optional[bool] = Field(None, description="Whether line has end arrowhead")

    # Text specific
    textContent: Optional[str] = Field(None, description="Text content for text elements")
    fontSize: Optional[float] = Field(None, description="Font size for text elements")

    # Freedraw specific
    pointCount: Optional[int] = Field(None, description="Number of points in freedraw path")


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

    # User-drawn shapes/annotations for context
    shapes: Optional[list[ShapeMetadata]] = Field(None, description="User-drawn shapes and annotations on the canvas")

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
