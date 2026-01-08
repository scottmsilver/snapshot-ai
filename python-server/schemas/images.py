"""
Pydantic schemas for image generation and inpainting endpoints.

These schemas match the TypeScript interfaces in server/src/types/api.ts
to ensure API compatibility between Express and Python backends.
"""

from typing import Optional

from pydantic import BaseModel, Field

from .agentic import Base64ImageUrl


# =============================================================================
# POST /api/images/generate - Image generation/editing
# =============================================================================


class GenerateImageRequest(BaseModel):
    """
    Request body for POST /api/images/generate endpoint.

    Matches the TypeScript GenerateImageRequest interface and Zod schema.
    """

    model: str = Field(..., min_length=1, description="The model to use")
    sourceImage: Base64ImageUrl = Field(
        ..., description="Source image as base64 data URL"
    )
    prompt: str = Field(..., min_length=1, description="Edit prompt")
    maskImage: Optional[Base64ImageUrl] = Field(
        None, description="Optional mask image as base64 data URL"
    )
    isImageGeneration: Optional[bool] = Field(
        None, description="Whether this is an image generation call"
    )
    logLabel: Optional[str] = Field(None, description="Label for this call in the log")


class GenerateImageResponse(BaseModel):
    """
    Response for POST /api/images/generate endpoint.

    Matches the TypeScript GenerateImageResponse interface.
    """

    raw: dict = Field(..., description="The raw result from the API")
    imageData: str = Field(..., description="Generated image as base64 data URL")


# =============================================================================
# POST /api/images/inpaint - Two-step inpainting
# =============================================================================


class InpaintRequest(BaseModel):
    """
    Request body for POST /api/images/inpaint endpoint.

    Matches the TypeScript InpaintRequest interface and Zod schema.
    """

    sourceImage: Base64ImageUrl = Field(
        ..., description="Source image as base64 data URL"
    )
    maskImage: Base64ImageUrl = Field(..., description="Mask image as base64 data URL")
    prompt: str = Field(..., min_length=1, description="Edit prompt")
    thinkingBudget: Optional[int] = Field(
        None, description="Thinking budget for planning"
    )


class InpaintResponse(BaseModel):
    """
    Response for POST /api/images/inpaint endpoint.

    Matches the TypeScript InpaintResponse interface.
    """

    imageData: str = Field(..., description="Generated image as base64 data URL")
    refinedPrompt: str = Field(
        ..., description="AI's refined prompt used for generation"
    )
    thinking: str = Field(..., description="AI's thinking during planning")
