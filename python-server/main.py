"""
FastAPI server for AI-powered image editing workflows.

This server provides the Python/LangGraph backend for agentic image editing,
designed to work alongside (or eventually replace) the Express backend.

Endpoints:
- GET  /health          - Health check
- GET  /                - API information
- POST /api/echo        - Echo test (proxy verification)
- POST /api/agentic/edit - Agentic edit with SSE streaming
"""

from __future__ import annotations

import logging
import os
import sys
import time
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from graphs.agentic_edit import GraphState, agentic_edit_graph
from schemas import AgenticEditRequest, AgenticEditResponse, AIProgressEvent
from schemas.agentic import IterationInfo
from utils.sse import (
    format_complete_event,
    format_error_event,
    format_progress_event,
    format_sse_event,
)

# Load environment variables
load_dotenv()

# Track server start time for uptime calculation
_start_time = time.time()


# =============================================================================
# Application Setup
# =============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown."""
    # Startup
    logger.info("Python AI Server starting...")
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    logger.info("API Key: %s", "configured" if api_key else "MISSING")
    yield
    # Shutdown
    logger.info("Python AI Server shutting down...")


app = FastAPI(
    title="Image Markup AI Server",
    description="Python/LangGraph backend for AI-powered image editing",
    version="0.4.0",
    lifespan=lifespan,
)

# CORS configuration
_allowed_origins = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3001"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health & Info Endpoints
# =============================================================================


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    timestamp: str
    uptime_seconds: float
    environment: str
    python_version: str


class RootResponse(BaseModel):
    """Root endpoint response."""

    name: str
    version: str
    status: str
    endpoints: dict[str, str]


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return server health status."""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now(timezone.utc).isoformat(),
        uptime_seconds=round(time.time() - _start_time, 2),
        environment=os.getenv("ENVIRONMENT", "development"),
        python_version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    )


@app.get("/", response_model=RootResponse)
async def root() -> RootResponse:
    """Return API information."""
    return RootResponse(
        name="Image Markup AI Server",
        version="0.4.0",
        status="running",
        endpoints={
            "health": "GET /health",
            "echo": "POST /api/echo",
            "agentic_edit": "POST /api/agentic/edit",
        },
    )


# =============================================================================
# Echo Endpoint (for proxy verification)
# =============================================================================


class EchoRequest(BaseModel):
    """Echo request body."""

    message: str
    data: dict | None = None


class EchoResponse(BaseModel):
    """Echo response body."""

    received: str
    data: dict | None
    server: str
    timestamp: str


@app.post("/api/echo", response_model=EchoResponse)
async def echo(request: EchoRequest) -> EchoResponse:
    """Echo back the request for proxy verification."""
    return EchoResponse(
        received=request.message,
        data=request.data,
        server="python-fastapi",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# =============================================================================
# Agentic Edit Endpoint
# =============================================================================


@app.post("/api/agentic/edit")
async def agentic_edit(request: AgenticEditRequest) -> StreamingResponse:
    """
    Perform agentic image editing with SSE progress streaming.

    This endpoint executes a LangGraph workflow that:
    1. Plans the edit using AI reasoning
    2. Generates the edited image
    3. Self-checks the result
    4. Iterates if needed (up to maxIterations)

    Progress is streamed via Server-Sent Events (SSE).
    """

    async def generate_events():
        """Async generator yielding SSE events."""
        try:
            # Initialize state
            state = GraphState(
                source_image=request.sourceImage,
                mask_image=request.maskImage,
                user_prompt=request.prompt,
                max_iterations=request.maxIterations or 3,
            )

            # Initial progress event - harmonized with Express
            # Express sends "Sending planning request to AI..." before calling the API
            from graphs.agentic_edit import build_planning_prompt

            planning_prompt = build_planning_prompt(
                request.prompt, bool(request.maskImage)
            )
            yield format_progress_event(
                AIProgressEvent(
                    step="planning",
                    message="Sending planning request to AI...",
                    prompt=planning_prompt,
                    iteration=IterationInfo(
                        current=0,
                        max=request.maxIterations or 3,
                    ),
                )
            )

            # Stream graph execution
            # - "custom" mode: real-time progress from get_stream_writer()
            # - "values" mode: final state after each node
            final_state = None

            async for mode, data in agentic_edit_graph.astream(
                state.model_dump(),
                stream_mode=["custom", "values"],
            ):
                if mode == "custom":
                    yield format_sse_event("progress", data)
                elif mode == "values":
                    final_state = data

            # Send completion
            if final_state:
                image = final_state.get("current_result") or final_state.get(
                    "source_image"
                )
                prompt = final_state.get("refined_prompt") or final_state.get(
                    "user_prompt", ""
                )
                iterations = final_state.get("current_iteration", 1)

                if image:
                    yield format_progress_event(
                        AIProgressEvent(
                            step="complete",
                            message="Edit completed successfully!",
                            iteration=IterationInfo(
                                current=iterations,
                                max=request.maxIterations or 3,
                            ),
                        )
                    )
                    yield format_complete_event(
                        AgenticEditResponse(
                            imageData=image,
                            iterations=iterations,
                            finalPrompt=prompt,
                        )
                    )
                else:
                    yield format_error_event(
                        "No image generated",
                        "The workflow completed but did not produce an image",
                    )
            else:
                yield format_error_event(
                    "No result from workflow",
                    "The graph did not return a final state",
                )

        except Exception as e:
            logger.exception("Agentic edit error: %s", e)
            yield format_error_event(str(e), traceback.format_exc())

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")

    logger.info("Starting server on %s:%d", host, port)
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=os.getenv("ENVIRONMENT") != "production",
    )
