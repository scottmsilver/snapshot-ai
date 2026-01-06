"""
Simple test graph to verify LangGraph setup.

This graph demonstrates:
1. State management with TypedDict
2. Multiple nodes with different functions
3. Conditional edges
4. Integration with Gemini API (optional)
"""

import os
from typing import Annotated, Literal
from typing_extensions import TypedDict

from langgraph.graph import StateGraph, END
from pydantic import BaseModel


# =============================================================================
# State Definition
# =============================================================================


class GraphState(TypedDict):
    """State passed between nodes in the graph."""

    # Input
    message: str
    use_ai: bool

    # Processing state
    processed: bool
    step_count: int

    # Output
    response: str
    steps: list[str]


# =============================================================================
# Input/Output Models (for API)
# =============================================================================


class TestGraphInput(BaseModel):
    """Input for the test graph endpoint."""

    message: str
    use_ai: bool = False


class TestGraphOutput(BaseModel):
    """Output from the test graph endpoint."""

    response: str
    steps: list[str]
    step_count: int


# =============================================================================
# Node Functions
# =============================================================================


def initialize_node(state: GraphState) -> GraphState:
    """Initialize the graph state."""
    return {
        **state,
        "processed": False,
        "step_count": 0,
        "steps": ["initialized"],
        "response": "",
    }


def process_message_node(state: GraphState) -> GraphState:
    """Process the message (simple transformation)."""
    message = state["message"]
    processed_message = f"Processed: {message.upper()}"

    return {
        **state,
        "processed": True,
        "step_count": state["step_count"] + 1,
        "steps": state["steps"] + ["processed_message"],
        "response": processed_message,
    }


async def ai_enhance_node(state: GraphState) -> GraphState:
    """Optionally enhance the response using Gemini AI."""
    from google import genai

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {
            **state,
            "step_count": state["step_count"] + 1,
            "steps": state["steps"] + ["ai_skipped_no_key"],
        }

    try:
        client = genai.Client(api_key=api_key)

        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=f"Respond briefly and playfully to this message: {state['message']}",
        )

        ai_response = response.text if response.text else state["response"]

        return {
            **state,
            "step_count": state["step_count"] + 1,
            "steps": state["steps"] + ["ai_enhanced"],
            "response": ai_response,
        }
    except Exception as e:
        return {
            **state,
            "step_count": state["step_count"] + 1,
            "steps": state["steps"] + [f"ai_error: {str(e)[:50]}"],
        }


def finalize_node(state: GraphState) -> GraphState:
    """Finalize the response."""
    return {
        **state,
        "step_count": state["step_count"] + 1,
        "steps": state["steps"] + ["finalized"],
    }


# =============================================================================
# Conditional Edge
# =============================================================================


def should_use_ai(state: GraphState) -> Literal["ai_enhance", "finalize"]:
    """Decide whether to use AI enhancement."""
    if state.get("use_ai", False):
        return "ai_enhance"
    return "finalize"


# =============================================================================
# Graph Definition
# =============================================================================


def create_test_graph() -> StateGraph:
    """Create and compile the test graph."""
    # Create the graph
    graph = StateGraph(GraphState)

    # Add nodes
    graph.add_node("initialize", initialize_node)
    graph.add_node("process_message", process_message_node)
    graph.add_node("ai_enhance", ai_enhance_node)
    graph.add_node("finalize", finalize_node)

    # Add edges
    graph.set_entry_point("initialize")
    graph.add_edge("initialize", "process_message")

    # Conditional edge: use AI or skip to finalize
    graph.add_conditional_edges(
        "process_message",
        should_use_ai,
        {
            "ai_enhance": "ai_enhance",
            "finalize": "finalize",
        },
    )

    graph.add_edge("ai_enhance", "finalize")
    graph.add_edge("finalize", END)

    return graph.compile()


# Create the compiled graph
test_graph = create_test_graph()
