"""RBAC-aware, cross-asset retrieval: semantic search + knowledge-graph discovery.

Pipeline for one question:
 1. Pre-filter  - ids of chunks the user may read (approved, permitted classification, asset filter).
 2. Semantic    - FAISS search restricted to those ids.
 3. Diversify   - keep the best documents *per asset class* so evidence from other asset
                  classes is not crowded out by the user's own asset class.
 4. Graph       - seed concepts from the question (+ top hits), then discover documents in
                  other asset classes linked through shared concepts: relevance beyond keywords.
 5. Transparency- count relevant documents hidden by RBAC (reported as a number, never content).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from backend.config import Settings
from backend.db import Chunk, Document
from backend.graph.knowledge_graph import KnowledgeGraph
from backend.graph.taxonomy import Taxonomy
from backend.retrieval.embeddings import Embedder
from backend.retrieval.vector_store import VectorStore
from backend.security.rbac import User

GRAPH_BOOST = 0.08  # weight of concept overlap when ranking semantic hits
GRAPH_MIN_SCORE = 0.35  # minimum concept coverage for a graph-only discovery
RELATIVE_MARGIN = 0.15  # semantic hits must score within this of the best hit (combined score)
SECOND_DOC_MARGIN = 0.10  # a 2nd document from one asset class must be close to that class's best
SECOND_CHUNK_MARGIN = 0.06  # a document's 2nd chunk must score within this of its best


@dataclass
class Evidence:
    chunk_id: int
    doc_id: str
    page: int
    text: str
    similarity: float
    title: str
    filename: str | None
    asset_type: str
    asset_name: str
    category: str
    classification: str
    source_type: str
    doc_date: str | None
    retrieval: str = "semantic"  # semantic | graph
    graph_score: float = 0.0
    shared_concepts: list[str] = field(default_factory=list)  # concept keys
    shared_systems: list[str] = field(default_factory=list)  # system keys


@dataclass
class RetrievalResult:
    evidence: list[Evidence]
    question_concepts: dict[str, float]
    seeds: dict[str, float]
    withheld: list[dict[str, str]]
    best_similarity: float
    candidates: int
    query_systems: set[str] = field(default_factory=set)


class Retriever:
    def __init__(self, settings: Settings, session_factory: sessionmaker, embedder: Embedder,
                 store: VectorStore, graph: KnowledgeGraph, taxonomy: Taxonomy):
        self.settings = settings
        self.session_factory = session_factory
        self.embedder = embedder
        self.store = store
        self.graph = graph
        self.taxonomy = taxonomy

    # ---------------------------------------------------------------- helpers
    def calibrated(self, similarity: float) -> float:
        """Map a raw cosine score onto 0-1 using the embedder's calibration."""
        span = max(self.embedder.sim_ceiling - self.embedder.sim_floor, 1e-6)
        return float(np.clip((similarity - self.embedder.sim_floor) / span, 0.0, 1.0))

    @staticmethod
    def _approved_chunks(classifications: Iterable[str] | None, asset_types: Iterable[str] | None):
        stmt = select(Chunk.id).join(Document).where(Document.status == "approved")
        if classifications is not None:
            stmt = stmt.where(Document.classification.in_(list(classifications)))
        if asset_types:
            stmt = stmt.where(Document.asset_type.in_(list(asset_types)))
        return stmt

    def allowed_chunk_ids(self, session: Session, classifications: Iterable[str] | None,
                          asset_types: Iterable[str] | None = None) -> list[int]:
        return list(session.scalars(self._approved_chunks(classifications, asset_types)))

    @staticmethod
    def allowed_doc_ids(session: Session, classifications: Iterable[str] | None,
                        asset_types: Iterable[str] | None = None) -> set[str]:
        stmt = select(Document.id).where(Document.status == "approved")
        if classifications is not None:
            stmt = stmt.where(Document.classification.in_(list(classifications)))
        if asset_types:
            stmt = stmt.where(Document.asset_type.in_(list(asset_types)))
        return set(session.scalars(stmt))

    @staticmethod
    def _load_chunks(session: Session, chunk_ids: Iterable[int]) -> dict[int, tuple[Chunk, Document]]:
        ids = list(chunk_ids)
        if not ids:
            return {}
        rows = session.execute(select(Chunk, Document).join(Document).where(Chunk.id.in_(ids))).all()
        return {chunk.id: (chunk, doc) for chunk, doc in rows}

    @staticmethod
    def _evidence(chunk: Chunk, doc: Document, similarity: float, retrieval: str = "semantic") -> Evidence:
        return Evidence(
            chunk_id=chunk.id, doc_id=doc.id, page=chunk.page, text=chunk.text, similarity=round(similarity, 4),
            title=doc.title, filename=doc.filename, asset_type=doc.asset_type, asset_name=doc.asset_name,
            category=doc.category, classification=doc.classification, source_type=doc.source_type,
            doc_date=doc.doc_date, retrieval=retrieval,
        )

    def _seeds(self, question_concepts: dict[str, float], ranked_docs: list[tuple[str, float]]) -> dict[str, float]:
        """Question concepts, their related concepts (graph), and feedback from the two best semantic hits."""
        seeds = self.taxonomy.expand_related(question_concepts)
        for doc_id, similarity in ranked_docs[:2]:
            doc = self.graph.get(doc_id)
            if doc is None:
                continue
            relevance = self.calibrated(similarity)
            for key, weight in doc.concepts.items():
                if weight >= 0.5:
                    seeds[key] = max(seeds.get(key, 0.0), round(0.5 * weight * relevance, 3))
        return seeds

    # -------------------------------------------------------------- retrieval
    def retrieve(self, question: str, user: User, context_asset_type: str | None,
                 asset_filter: list[str] | None = None, cross_asset: bool = True) -> RetrievalResult:
        settings = self.settings
        query_vector = self.embedder.embed_query(question)
        asset_types = list(asset_filter) if asset_filter else None
        if not cross_asset and context_asset_type:
            asset_types = [context_asset_type]
        question_concepts = self.taxonomy.match_text(question)
        query_systems = self.taxonomy.match_systems(question)

        with self.session_factory() as session:
            # 1-2. RBAC pre-filter + semantic search
            allowed_ids = self.allowed_chunk_ids(session, user.role.classifications, asset_types)
            hits = self.store.search(query_vector, settings.candidate_pool, allowed_ids=allowed_ids)
            rows = self._load_chunks(session, [cid for cid, _ in hits])

            # 3. per-document and per-asset-class diversification
            by_doc: dict[str, list[tuple[int, float]]] = {}
            for chunk_id, score in hits:
                if chunk_id in rows:
                    by_doc.setdefault(rows[chunk_id][1].id, []).append((chunk_id, score))
            doc_best = {doc_id: max(s for _, s in items) for doc_id, items in by_doc.items()}
            ranked_docs = sorted(doc_best.items(), key=lambda kv: kv[1], reverse=True)
            best_similarity = ranked_docs[0][1] if ranked_docs else 0.0
            seeds = self._seeds(question_concepts, ranked_docs)

            combined = {doc_id: sim + GRAPH_BOOST * self.graph.concept_overlap(doc_id, seeds)
                        for doc_id, sim in ranked_docs}
            cutoff = max(combined.values(), default=0.0) - RELATIVE_MARGIN
            per_type: dict[str, list[str]] = {}
            for doc_id, similarity in ranked_docs:
                if similarity < self.embedder.min_relevance or combined[doc_id] < cutoff:
                    continue
                asset_type = rows[by_doc[doc_id][0][0]][1].asset_type
                per_type.setdefault(asset_type, []).append(doc_id)
            order = sorted(per_type, key=lambda t: (t != context_asset_type, -max(combined[d] for d in per_type[t])))
            selected_docs: list[str] = []
            for asset_type in order:
                ranked = sorted(per_type[asset_type], key=combined.get, reverse=True)
                best_in_type = combined[ranked[0]]
                selected_docs.extend(d for d in ranked[: settings.docs_per_asset_type]
                                     if combined[d] >= best_in_type - SECOND_DOC_MARGIN)

            evidence: list[Evidence] = []
            for doc_id in selected_docs:
                items = sorted(by_doc[doc_id], key=lambda kv: kv[1], reverse=True)
                for rank, (chunk_id, score) in enumerate(items[: settings.chunks_per_doc]):
                    if rank > 0 and score < max(self.embedder.min_relevance, doc_best[doc_id] - SECOND_CHUNK_MARGIN):
                        break
                    chunk, doc = rows[chunk_id]
                    evidence.append(self._evidence(chunk, doc, score))
            evidence = evidence[: settings.max_sources]
            selected = {e.doc_id for e in evidence}

            # 4. knowledge-graph discovery of related documents in other asset classes
            if seeds and settings.graph_max_discoveries > 0:
                allowed_docs = self.allowed_doc_ids(session, user.role.classifications, asset_types)
                discoveries = self.graph.discover(
                    seeds, allowed_docs, exclude_doc_ids=selected,
                    exclude_asset_type=context_asset_type if cross_asset else None,
                    limit=settings.graph_max_discoveries, min_score=GRAPH_MIN_SCORE,
                )
                for match in discoveries:
                    doc_chunk_ids = list(session.scalars(select(Chunk.id).where(Chunk.doc_id == match.doc_id)))
                    best = self.store.search(query_vector, 1, allowed_ids=doc_chunk_ids)
                    # graph evidence still needs some semantic grounding in the question
                    if not best or best[0][1] < (self.embedder.sim_floor + self.embedder.min_relevance) / 2:
                        continue
                    chunk_id, score = best[0]
                    chunk, doc = self._load_chunks(session, [chunk_id])[chunk_id]
                    item = self._evidence(chunk, doc, score, retrieval="graph")
                    item.graph_score = match.score
                    evidence.append(item)

            # graph explanations for every piece of evidence
            context_docs = {e.doc_id for e in evidence if e.asset_type == context_asset_type}
            for item in evidence:
                item.shared_concepts = self.graph.shared_concepts(item.doc_id, seeds)
                if not item.graph_score:
                    item.graph_score = round(self.graph.concept_overlap(item.doc_id, seeds), 3)
                reference = query_systems | (
                    self.graph.systems_of(context_docs) if item.asset_type != context_asset_type else set()
                )
                item.shared_systems = self.graph.shared_systems(item.doc_id, reference)

            # 5. relevant documents withheld by RBAC (for transparency + audit)
            withheld = self._withheld(session, query_vector, user, asset_types)

        return RetrievalResult(
            evidence=evidence,
            question_concepts=question_concepts,
            seeds=seeds,
            withheld=withheld,
            best_similarity=round(best_similarity, 4),
            candidates=len(hits),
            query_systems=query_systems,
        )

    def _withheld(self, session: Session, query_vector: np.ndarray, user: User,
                  asset_types: list[str] | None) -> list[dict[str, str]]:
        all_ids = self.allowed_chunk_ids(session, None, asset_types)
        hits = self.store.search(query_vector, 20, allowed_ids=all_ids)
        rows = self._load_chunks(session, [cid for cid, _ in hits])
        withheld: dict[str, str] = {}
        for chunk_id, score in hits:
            if score < self.embedder.min_relevance or chunk_id not in rows:
                continue
            doc = rows[chunk_id][1]
            if not user.can_read(doc.classification):
                withheld.setdefault(doc.id, doc.classification)
        return [{"doc_id": d, "classification": c} for d, c in withheld.items()]

    def describe(self) -> dict[str, Any]:
        return {
            "min_relevance": self.embedder.min_relevance,
            "sim_floor": self.embedder.sim_floor,
            "sim_ceiling": self.embedder.sim_ceiling,
        }
