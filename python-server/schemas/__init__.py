"""Schemas and configuration for the Python AI server."""

from .config import AI_MODELS, THINKING_BUDGETS, MAX_ITERATIONS
from .agentic import (
    AIProgressStep,
    AIProgressEvent,
    IterationInfo,
    ErrorInfo,
    AgenticEditRequest,
    AgenticEditResponse,
    AgenticEditState,
    Base64ImageUrl,
    validate_data_url,
    GenerateTextRequest,
    GenerateTextResponse,
    FunctionCall,
)
from .images import (
    GenerateImageRequest,
    GenerateImageResponse,
    InpaintRequest,
    InpaintResponse,
)

__all__ = [
    # Config
    "AI_MODELS",
    "THINKING_BUDGETS",
    "MAX_ITERATIONS",
    # Custom Types
    "Base64ImageUrl",
    "validate_data_url",
    # Agentic Types
    "AIProgressStep",
    "AIProgressEvent",
    "IterationInfo",
    "ErrorInfo",
    "AgenticEditRequest",
    "AgenticEditResponse",
    "AgenticEditState",
    # Text Generation Types
    "GenerateTextRequest",
    "GenerateTextResponse",
    "FunctionCall",
    # Image Generation Types
    "GenerateImageRequest",
    "GenerateImageResponse",
    "InpaintRequest",
    "InpaintResponse",
]
