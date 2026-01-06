"""
AI model and configuration constants.

PROVIDER CONFIGURATION:
This file contains the only provider-specific configuration in the codebase.
To switch AI providers, update the model identifiers below.

These values must match the TypeScript constants in:
- src/config/aiModels.ts
- server/src/types/api.ts
"""

from typing import Final

# =============================================================================
# Model Identifiers
# =============================================================================
# Currently configured for Google Gemini. Change these values to switch providers.

AI_MODELS: Final[dict[str, str]] = {
    # Text reasoning and planning (optimized for speed)
    "PLANNING": "gemini-3-flash-preview",
    # Image generation and editing
    "IMAGE_GENERATION": "gemini-3-pro-image-preview",
    # Complex reasoning without image output
    "PRO": "gemini-3-pro-preview",
    # Quick tasks (element identification, simple checks)
    "FAST": "gemini-3-flash-preview",
}

# =============================================================================
# Thinking Budget Configuration
# =============================================================================
# Token budgets for extended reasoning (provider-specific feature)

THINKING_BUDGETS: Final[dict[str, int]] = {
    "HIGH": 8192,  # Complex planning and reasoning
    "MEDIUM": 4096,  # Quality checks and validation
    "LOW": 2048,  # Simple identification tasks
}

# =============================================================================
# Workflow Configuration
# =============================================================================

MAX_ITERATIONS: Final[int] = 3  # Default max iterations for agentic workflow
