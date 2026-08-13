from langgraph.graph import END, START, StateGraph

from .nodes import (
    _meaningful_fields,
    assess_node,
    chat_node,
    compose_node,
    extract_node,
    looks_like_question,
)
from .state import AgentState


def _route_after_extract(state: AgentState) -> str:
    """Questions go to the assistant; complaint content is assessed and confirmed."""
    message = state.get("message")
    if message:
        if looks_like_question(message) or not _meaningful_fields(state.get("fields")):
            return "chat"
    return "assess"


def build_agent_graph():
    builder = StateGraph(AgentState)
    builder.add_node("extract", extract_node)
    builder.add_node("assess", assess_node)
    builder.add_node("compose", compose_node)
    builder.add_node("chat", chat_node)

    builder.add_edge(START, "extract")
    builder.add_conditional_edges(
        "extract", _route_after_extract, {"chat": "chat", "assess": "assess"}
    )
    builder.add_edge("assess", "compose")
    builder.add_edge("compose", END)
    builder.add_edge("chat", END)
    return builder.compile()


agent_graph = build_agent_graph()