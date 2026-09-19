"""Cross-asset knowledge graph (NetworkX, migration-ready for Neo4j / RDF).

Schema (node kinds and edge relations):

    AssetClass <-IS_A- Asset <-DESCRIBES- Document -REPORTS-> Problem <-ADDRESSES- Solution
                                             |  \\-PROPOSES-> Solution -APPLIES-> Concept
                                             |-MENTIONS(w)-> Concept -BROADER-> Concept
                                             \\-INVOLVES(w)-> System -RELATES_TO-> Concept
    Concept -RELATED-> Concept   (e.g. Equipment Reliability is addressed by Predictive Maintenance)

Concept and System nodes are shared by every asset class. They are the bridges
that let a data-centre question reach an office retrofit: the two documents
never mention each other, but both link to "Cooling Efficiency" and "Chiller Plant".
"""

from __future__ import annotations

import math
import re
import threading
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

from backend.graph.taxonomy import Taxonomy

MIN_LINK_WEIGHT = 0.25  # concept weight above which a document counts as "about" a concept
MIN_SYSTEM_WEIGHT = 0.3


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def shorten(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


@dataclass(frozen=True)
class DocRecord:
    """The slice of a document the graph needs (decoupled from the ORM)."""

    id: str
    title: str
    asset_type: str
    asset_name: str
    category: str
    classification: str
    status: str
    source_type: str = "document"
    location: str | None = None
    problem: str | None = None
    solution: str | None = None
    impact: str | None = None
    concepts: dict[str, float] = field(default_factory=dict)
    systems: dict[str, float] = field(default_factory=dict)

    @classmethod
    def from_document(cls, doc: Any) -> "DocRecord":
        return cls(
            id=doc.id,
            title=doc.title,
            asset_type=doc.asset_type,
            asset_name=doc.asset_name,
            category=doc.category,
            classification=doc.classification,
            status=doc.status,
            source_type=doc.source_type,
            location=doc.location,
            problem=doc.problem,
            solution=doc.solution,
            impact=doc.impact,
            concepts=dict(doc.concepts or {}),
            systems=dict(doc.systems or {}),
        )


@dataclass
class GraphMatch:
    doc_id: str
    score: float
    shared_concepts: list[str]
    shared_systems: list[str] = field(default_factory=list)


class KnowledgeGraph:
    def __init__(self, taxonomy: Taxonomy):
        self.taxonomy = taxonomy
        self._lock = threading.RLock()
        self._docs: dict[str, DocRecord] = {}
        self._idf: dict[str, float] | None = None
        self.g = nx.DiGraph()
        self._init_taxonomy_layer()

    # ------------------------------------------------------------------ node ids
    @staticmethod
    def doc_node(doc_id: str) -> str:
        return f"doc:{doc_id}"

    @staticmethod
    def problem_node(doc_id: str) -> str:
        return f"problem:{doc_id}"

    @staticmethod
    def solution_node(doc_id: str) -> str:
        return f"solution:{doc_id}"

    @staticmethod
    def asset_node(asset_name: str) -> str:
        return f"asset:{slugify(asset_name)}"

    @staticmethod
    def class_node(asset_type: str) -> str:
        return f"class:{slugify(asset_type)}"

    @staticmethod
    def concept_node(key: str) -> str:
        return f"concept:{key}"

    @staticmethod
    def system_node(key: str) -> str:
        return f"system:{key}"

    # ------------------------------------------------------------- construction
    def _init_taxonomy_layer(self) -> None:
        for concept in self.taxonomy.concepts.values():
            self.g.add_node(
                self.concept_node(concept.key),
                kind="concept",
                key=concept.key,
                label=concept.label,
                description=concept.description,
            )
        for concept in self.taxonomy.concepts.values():
            if concept.parent:
                self.g.add_edge(
                    self.concept_node(concept.key), self.concept_node(concept.parent), relation="BROADER"
                )
            for related in concept.related:
                self.g.add_edge(self.concept_node(concept.key), self.concept_node(related), relation="RELATED")
        for system in self.taxonomy.systems.values():
            self.g.add_node(self.system_node(system.key), kind="system", key=system.key, label=system.label)
            for concept_key in system.concepts:
                self.g.add_edge(
                    self.system_node(system.key), self.concept_node(concept_key), relation="RELATES_TO"
                )

    def rebuild(self, docs: Iterable[DocRecord]) -> None:
        with self._lock:
            self.g = nx.DiGraph()
            self._docs = {}
            self._idf = None
            self._init_taxonomy_layer()
            for doc in docs:
                self._add(doc)

    def upsert(self, doc: DocRecord) -> None:
        with self._lock:
            if doc.id in self._docs:
                self._remove(doc.id)
            self._add(doc)
            self._idf = None

    def remove(self, doc_id: str) -> None:
        with self._lock:
            self._remove(doc_id)
            self._idf = None

    def _add(self, doc: DocRecord) -> None:
        g = self.g
        d_node = self.doc_node(doc.id)
        a_node = self.asset_node(doc.asset_name)
        c_node = self.class_node(doc.asset_type)
        g.add_node(c_node, kind="asset_class", label=doc.asset_type, asset_type=doc.asset_type)
        g.add_node(a_node, kind="asset", label=doc.asset_name, asset_type=doc.asset_type, location=doc.location or "")
        g.add_node(
            d_node,
            kind="document",
            label=doc.title,
            doc_id=doc.id,
            asset_type=doc.asset_type,
            classification=doc.classification,
            category=doc.category,
            status=doc.status,
            source_type=doc.source_type,
        )
        g.add_edge(a_node, c_node, relation="IS_A")
        g.add_edge(d_node, a_node, relation="DESCRIBES")

        if doc.problem:
            p_node = self.problem_node(doc.id)
            g.add_node(p_node, kind="problem", label=doc.problem, doc_id=doc.id, asset_type=doc.asset_type)
            g.add_edge(d_node, p_node, relation="REPORTS")
            for key in self.taxonomy.match_text(doc.problem, include_parents=False):
                g.add_edge(p_node, self.concept_node(key), relation="RELATES_TO")
        if doc.solution:
            s_node = self.solution_node(doc.id)
            g.add_node(
                s_node,
                kind="solution",
                label=doc.solution,
                impact=doc.impact or "",
                doc_id=doc.id,
                asset_type=doc.asset_type,
            )
            g.add_edge(d_node, s_node, relation="PROPOSES")
            if doc.problem:
                g.add_edge(s_node, self.problem_node(doc.id), relation="ADDRESSES")
            for key in self.taxonomy.match_text(doc.solution, include_parents=False):
                g.add_edge(s_node, self.concept_node(key), relation="APPLIES")

        for key, weight in doc.concepts.items():
            if key in self.taxonomy.concepts:
                g.add_edge(d_node, self.concept_node(key), relation="MENTIONS", weight=weight)
        for key, weight in doc.systems.items():
            if key in self.taxonomy.systems:
                g.add_edge(d_node, self.system_node(key), relation="INVOLVES", weight=weight)
        self._docs[doc.id] = doc

    def _remove(self, doc_id: str) -> None:
        doc = self._docs.pop(doc_id, None)
        if doc is None:
            return
        for node in (self.doc_node(doc_id), self.problem_node(doc_id), self.solution_node(doc_id)):
            if node in self.g:
                self.g.remove_node(node)
        a_node = self.asset_node(doc.asset_name)
        if a_node in self.g and not any(
            self.g.nodes[p].get("kind") == "document" for p in self.g.predecessors(a_node)
        ):
            self.g.remove_node(a_node)

    # ------------------------------------------------------------------ lookups
    def get(self, doc_id: str) -> DocRecord | None:
        return self._docs.get(doc_id)

    def documents(self) -> list[DocRecord]:
        return list(self._docs.values())

    def concept_idf(self) -> dict[str, float]:
        """Inverse document frequency of concepts, scaled to (0, 1]: rare concepts are stronger bridges."""
        with self._lock:
            if self._idf is None:
                n = len(self._docs)
                df = Counter(
                    key for doc in self._docs.values() for key, w in doc.concepts.items() if w >= MIN_LINK_WEIGHT
                )
                raw = {key: math.log((n + 1) / (df.get(key, 0) + 1)) + 1.0 for key in self.taxonomy.concepts}
                top = max(raw.values(), default=1.0)
                self._idf = {key: value / top for key, value in raw.items()}
            return self._idf

    def _contributions(self, doc: DocRecord, seeds: dict[str, float]) -> dict[str, float]:
        idf = self.concept_idf()
        return {
            key: seeds[key] * weight * idf.get(key, 1.0)
            for key, weight in doc.concepts.items()
            if key in seeds and weight >= MIN_LINK_WEIGHT
        }

    def concept_overlap(self, doc_id: str, seeds: dict[str, float]) -> float:
        """Share (0-1) of the question's IDF-weighted concepts that this document covers."""
        doc = self._docs.get(doc_id)
        if doc is None or not seeds:
            return 0.0
        idf = self.concept_idf()
        denominator = sum(w * idf.get(k, 1.0) for k, w in seeds.items()) or 1.0
        return min(1.0, sum(self._contributions(doc, seeds).values()) / denominator)

    def shared_concepts(self, doc_id: str, seeds: dict[str, float], top: int = 3) -> list[str]:
        doc = self._docs.get(doc_id)
        if doc is None:
            return []
        contributions = self._contributions(doc, seeds)
        return sorted(contributions, key=contributions.get, reverse=True)[:top]

    def shared_systems(self, doc_id: str, reference: set[str], top: int = 3) -> list[str]:
        doc = self._docs.get(doc_id)
        if doc is None:
            return []
        ranked = sorted(doc.systems.items(), key=lambda kv: kv[1], reverse=True)
        return [key for key, weight in ranked if weight >= MIN_SYSTEM_WEIGHT and key in reference][:top]

    def systems_of(self, doc_ids: Iterable[str]) -> set[str]:
        return {
            key
            for doc_id in doc_ids
            if (doc := self._docs.get(doc_id))
            for key, weight in doc.systems.items()
            if weight >= MIN_SYSTEM_WEIGHT
        }

    # ---------------------------------------------------------------- discovery
    def discover(
        self,
        seeds: dict[str, float],
        allowed_doc_ids: set[str],
        exclude_doc_ids: set[str] | None = None,
        exclude_asset_type: str | None = None,
        limit: int = 3,
        min_score: float = 0.3,
    ) -> list[GraphMatch]:
        """Documents connected to the question's concepts through the graph, best first.

        Only documents in `allowed_doc_ids` (already RBAC-filtered) are considered.
        """
        exclude_doc_ids = exclude_doc_ids or set()
        matches: list[GraphMatch] = []
        with self._lock:
            for doc_id in allowed_doc_ids - exclude_doc_ids:
                doc = self._docs.get(doc_id)
                if doc is None or (exclude_asset_type and doc.asset_type == exclude_asset_type):
                    continue
                score = self.concept_overlap(doc_id, seeds)
                if score >= min_score:
                    matches.append(GraphMatch(doc_id, round(score, 3), self.shared_concepts(doc_id, seeds)))
        matches.sort(key=lambda m: m.score, reverse=True)
        return matches[:limit]

    def _profile(self, doc: DocRecord) -> dict[str, float]:
        idf = self.concept_idf()
        profile = {f"c:{k}": w * idf.get(k, 1.0) for k, w in doc.concepts.items()}
        profile.update({f"s:{k}": 0.6 * w for k, w in doc.systems.items()})
        return profile

    @staticmethod
    def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
        dot = sum(v * b.get(k, 0.0) for k, v in a.items())
        norm = math.sqrt(sum(v * v for v in a.values())) * math.sqrt(sum(v * v for v in b.values()))
        return dot / norm if norm else 0.0

    def similar_documents(
        self, doc_id: str, allowed_doc_ids: set[str], cross_asset_only: bool = True, limit: int = 5
    ) -> list[GraphMatch]:
        """Documents with the most similar concept/system profile - "who solved something like this?"."""
        base = self._docs.get(doc_id)
        if base is None:
            return []
        idf = self.concept_idf()
        base_profile = self._profile(base)
        results: list[GraphMatch] = []
        for other_id in allowed_doc_ids:
            other = self._docs.get(other_id)
            if other is None or other_id == doc_id:
                continue
            if cross_asset_only and other.asset_type == base.asset_type:
                continue
            score = self._cosine(base_profile, self._profile(other))
            if score <= 0:
                continue
            common = [
                k for k in base.concepts
                if k in other.concepts and min(base.concepts[k], other.concepts[k]) >= MIN_LINK_WEIGHT
            ]
            common.sort(key=lambda k: base.concepts[k] * other.concepts[k] * idf.get(k, 1.0), reverse=True)
            systems = [
                k for k in base.systems
                if k in other.systems and min(base.systems[k], other.systems[k]) >= MIN_SYSTEM_WEIGHT
            ]
            results.append(GraphMatch(other_id, round(score, 3), common[:4], systems[:3]))
        results.sort(key=lambda m: m.score, reverse=True)
        return results[:limit]

    # ------------------------------------------------------------ visualisation
    def reasoning_graph(
        self, seeds: dict[str, float], context_asset_type: str | None, doc_ids: list[str], max_docs: int = 6
    ) -> dict[str, list[dict[str, Any]]]:
        """Small explanation graph: question -> concept -> solution -> asset -> asset class."""
        nodes: dict[str, dict[str, Any]] = {}
        edges: list[tuple[str, str, str]] = []

        def add(node_id: str, label: str, kind: str, asset_type: str | None = None) -> None:
            nodes.setdefault(node_id, {"id": node_id, "label": label, "kind": kind, "asset_type": asset_type})

        add("question", "Your question" + (f"\n({context_asset_type})" if context_asset_type else ""),
            "question", context_asset_type)
        with self._lock:
            for doc_id in doc_ids[:max_docs]:
                doc = self._docs.get(doc_id)
                if doc is None:
                    continue
                s_node = self.solution_node(doc.id)
                a_node = self.asset_node(doc.asset_name)
                c_node = self.class_node(doc.asset_type)
                add(s_node, shorten(doc.solution or doc.title, 60), "solution", doc.asset_type)
                add(a_node, doc.asset_name, "asset", doc.asset_type)
                add(c_node, doc.asset_type, "asset_class", doc.asset_type)
                shared = self.shared_concepts(doc.id, seeds, top=2)
                for key in shared:
                    concept = self.concept_node(key)
                    add(concept, self.taxonomy.label(key), "concept")
                    edges.append(("question", concept, "involves"))
                    edges.append((concept, s_node, "addressed by"))
                if not shared:
                    edges.append(("question", s_node, "semantic match"))
                edges.append((s_node, a_node, "proven at"))
                edges.append((a_node, c_node, "is a"))
        unique = list(dict.fromkeys(edges))
        return {
            "nodes": list(nodes.values()),
            "edges": [{"source": s, "target": t, "label": label} for s, t, label in unique],
        }

    def view(
        self, allowed_doc_ids: set[str], asset_types: set[str] | None = None, detailed: bool = False,
        max_concepts_per_doc: int = 3,
    ) -> dict[str, list[dict[str, Any]]]:
        """RBAC-filtered graph for the explorer UI (documents the user cannot read are invisible)."""
        nodes: dict[str, dict[str, Any]] = {}
        edges: list[dict[str, Any]] = []

        def add_node(node_id: str) -> None:
            if node_id not in nodes:
                data = self.g.nodes[node_id]
                nodes[node_id] = {
                    "id": node_id,
                    "label": data.get("label", node_id),
                    "kind": data.get("kind"),
                    "asset_type": data.get("asset_type"),
                    "classification": data.get("classification"),
                }

        def add_edge(source: str, target: str) -> None:
            add_node(source)
            add_node(target)
            edges.append({"source": source, "target": target, "label": self.g.edges[source, target]["relation"]})

        with self._lock:
            visible = [
                d for d in self._docs.values()
                if d.id in allowed_doc_ids and (not asset_types or d.asset_type in asset_types)
            ]
            for doc in visible:
                d_node = self.doc_node(doc.id)
                a_node = self.asset_node(doc.asset_name)
                add_edge(d_node, a_node)
                add_edge(a_node, self.class_node(doc.asset_type))
                top = sorted(doc.concepts.items(), key=lambda kv: kv[1], reverse=True)
                for key, weight in top[:max_concepts_per_doc]:
                    if weight >= 0.4 and key in self.taxonomy.concepts:
                        add_edge(d_node, self.concept_node(key))
                if detailed:
                    for node in (self.problem_node(doc.id), self.solution_node(doc.id)):
                        if node in self.g:
                            add_edge(d_node, node)
                    for key, weight in sorted(doc.systems.items(), key=lambda kv: kv[1], reverse=True)[:2]:
                        if weight >= 0.5 and key in self.taxonomy.systems:
                            add_edge(d_node, self.system_node(key))
        return {"nodes": list(nodes.values()), "edges": edges}

    def subgraph_for(self, allowed_doc_ids: set[str]) -> nx.DiGraph:
        """Copy of the graph without nodes belonging to documents outside `allowed_doc_ids`."""
        with self._lock:
            hidden = {
                node
                for doc_id in self._docs
                if doc_id not in allowed_doc_ids
                for node in (self.doc_node(doc_id), self.problem_node(doc_id), self.solution_node(doc_id))
            }
            return self.g.subgraph(n for n in self.g if n not in hidden).copy()

    def cross_asset_bridges(self, allowed_doc_ids: set[str]) -> list[dict[str, Any]]:
        """Concepts that connect documents from two or more asset classes."""
        bridges = []
        with self._lock:
            for key in self.taxonomy.concepts:
                docs = [
                    d for d in self._docs.values()
                    if d.id in allowed_doc_ids and d.concepts.get(key, 0.0) >= 0.4
                ]
                asset_types = sorted({d.asset_type for d in docs})
                if len(asset_types) >= 2:
                    bridges.append({
                        "concept": self.taxonomy.label(key),
                        "asset_types": asset_types,
                        "documents": len(docs),
                    })
        return sorted(bridges, key=lambda b: (len(b["asset_types"]), b["documents"]), reverse=True)

    def stats(self) -> dict[str, Any]:
        with self._lock:
            kinds = Counter(data.get("kind") for _, data in self.g.nodes(data=True))
            return {
                "nodes": self.g.number_of_nodes(),
                "edges": self.g.number_of_edges(),
                "by_kind": dict(kinds),
                "documents": len(self._docs),
            }
