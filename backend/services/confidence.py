"""Evidence-based confidence scoring.

Confidence is computed from the retrieved evidence, never from the LLM's own
opinion of itself:

    confidence = 0.60 * relevance        calibrated semantic similarity of the best cited passage
               + 0.25 * corroboration    independent documents backing the point (1 -> .5, 2 -> .8, 3+ -> 1)
               + 0.15 * graph_alignment  share of the question's concepts the evidence covers (knowledge graph)
"""

from __future__ import annotations

WEIGHTS = {"relevance": 0.60, "corroboration": 0.25, "graph_alignment": 0.15}


def corroboration(independent_documents: int) -> float:
    if independent_documents <= 0:
        return 0.0
    return {1: 0.5, 2: 0.8}.get(independent_documents, 1.0)


def score(relevance: float, independent_documents: int, graph_alignment: float) -> tuple[float, dict[str, float]]:
    parts = {
        "relevance": max(0.0, min(1.0, relevance)),
        "corroboration": corroboration(independent_documents),
        "graph_alignment": max(0.0, min(1.0, graph_alignment)),
    }
    value = sum(WEIGHTS[name] * part for name, part in parts.items())
    return round(value, 3), {name: round(part, 3) for name, part in parts.items()}


def label(value: float) -> str:
    if value >= 0.75:
        return "High"
    if value >= 0.5:
        return "Medium"
    return "Low"


def overall(values: list[float]) -> float:
    """Answer-level confidence: rank-weighted mean of the top three recommendations."""
    top = values[:3]
    if not top:
        return 0.0
    weights = [1.0, 0.8, 0.6][: len(top)]
    return round(sum(w * v for w, v in zip(weights, top)) / sum(weights), 3)
