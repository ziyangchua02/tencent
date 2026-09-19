"""Pydantic request/response models: the public contract of the API."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, Field

from backend.config import ASSET_TYPES


def _optional_asset_type(value: str | None) -> str | None:
    if value in (None, "", "Auto"):
        return None
    return _asset_type(value)


def _asset_type(value: str) -> str:
    if value not in ASSET_TYPES:
        raise ValueError(f"must be one of {', '.join(ASSET_TYPES)}")
    return value


def _asset_types(values: list[str] | None) -> list[str] | None:
    return [_asset_type(v) for v in values] if values else None


AssetType = Annotated[str, AfterValidator(_asset_type)]
OptionalAssetType = Annotated[str | None, AfterValidator(_optional_asset_type)]
AssetTypeList = Annotated[list[str] | None, AfterValidator(_asset_types)]


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    asset_context: OptionalAssetType = Field(
        default=None, description="Asset class the user is working on; omit to auto-detect")
    asset_filter: AssetTypeList = Field(default=None, description="Restrict search to these asset classes")
    cross_asset: bool = Field(default=True, description="Allow evidence and graph discovery from other asset classes")


class Citation(BaseModel):
    source_id: str
    doc_id: str
    title: str
    filename: str
    page: int
    asset_name: str
    asset_type: str


class Recommendation(BaseModel):
    title: str
    detail: str
    source_ids: list[str]
    origin_asset_type: str
    origin_asset: str
    is_cross_asset: bool
    transfer_rationale: str
    adaptation_notes: str
    confidence: float
    confidence_label: str
    confidence_breakdown: dict[str, float]
    citations: list[Citation]


class SourceCard(BaseModel):
    source_id: str
    chunk_id: int
    doc_id: str
    title: str
    filename: str
    page: int
    asset_name: str
    asset_type: str
    category: str
    classification: str
    source_type: str
    doc_date: str | None
    text: str
    snippet: str
    similarity: float
    relevance: float
    graph_score: float
    retrieval: str
    shared_concepts: list[str]
    shared_systems: list[str]
    is_cross_asset: bool


class Bridge(BaseModel):
    from_asset_type: str
    to_asset_type: str | None
    concepts: list[str]
    systems: list[str]
    source_ids: list[str]


class GraphNode(BaseModel):
    id: str
    label: str
    kind: str | None
    asset_type: str | None = None
    classification: str | None = None


class GraphEdge(BaseModel):
    source: str
    target: str
    label: str


class GraphPayload(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class Governance(BaseModel):
    user_id: str
    user_name: str
    role: str
    permitted_classifications: list[str]
    withheld_count: int
    withheld_classifications: dict[str, int]
    audit_id: int | None
    audit_hash: str | None


class AskResponse(BaseModel):
    answer_id: int | None
    question: str
    context_asset_type: str | None
    context_source: str
    summary: str
    recommendations: list[Recommendation]
    lessons_learned: list[str]
    gaps: str
    sources: list[SourceCard]
    bridges: list[Bridge]
    reasoning_graph: GraphPayload
    query_concepts: list[str]
    confidence: float
    confidence_label: str
    abstained: bool
    mode: str
    model: str
    fallback_reason: str
    removed_unsupported: int
    latency_ms: int
    governance: Governance


class LessonRequest(BaseModel):
    """Structured expert debrief: turns tacit know-how into governed, citable knowledge."""

    title: str = Field(min_length=5, max_length=200)
    asset_type: AssetType
    asset_name: str = Field(min_length=2, max_length=200)
    category: str = Field(min_length=2, max_length=120)
    classification: str = "Operational"
    problem: str = Field(min_length=10, max_length=2000)
    context: str = Field(default="", max_length=4000)
    solution: str = Field(min_length=10, max_length=4000)
    impact: str = Field(default="", max_length=2000)
    lessons: str = Field(default="", max_length=4000, description="Tips, pitfalls, rules of thumb")
    location: str = ""


class ReviewDecision(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = Field(default=None, max_length=1000)


class FeedbackRequest(BaseModel):
    answer_id: int
    rating: Literal[1, -1]
    comment: str | None = Field(default=None, max_length=1000)


class IngestResponse(BaseModel):
    doc_id: str
    title: str
    status: str
    pages: int
    chunks: int
    concepts: dict[str, float]
    systems: dict[str, float]
    pii_redactions: dict[str, int]
    message: str = ""


class GenericResponse(BaseModel):
    ok: bool = True
    detail: Any = None
