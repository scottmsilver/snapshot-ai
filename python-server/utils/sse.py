"""
Server-Sent Events (SSE) utilities.

Formats events to match the Express server's SSE format exactly:
- event: progress, data: AIProgressEvent (JSON)
- event: complete, data: AgenticEditResponse (JSON)
- event: error, data: { message: string, details?: string } (JSON)
"""

import json
from typing import Any

from schemas.agentic import AIProgressEvent, AgenticEditResponse


def format_sse_event(event_type: str, data: Any) -> str:
    """
    Format a single SSE event.

    SSE format:
    event: <type>
    data: <json>

    (blank line to end event)
    """
    if hasattr(data, "model_dump"):
        # Pydantic model - serialize excluding None values for smaller payloads
        json_data = data.model_dump_json(exclude_none=True)
    else:
        json_data = json.dumps(data)

    return f"event: {event_type}\ndata: {json_data}\n\n"


def format_progress_event(event: AIProgressEvent) -> str:
    """Format a progress event for SSE streaming."""
    return format_sse_event("progress", event)


def format_complete_event(response: AgenticEditResponse) -> str:
    """Format a completion event for SSE streaming."""
    return format_sse_event("complete", response)


def format_error_event(message: str, details: str | None = None) -> str:
    """Format an error event for SSE streaming."""
    error_data = {"message": message}
    if details:
        error_data["details"] = details
    return format_sse_event("error", error_data)
