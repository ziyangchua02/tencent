"""Knowledge Bridge assistant: retrieve -> graph -> generate -> verify -> score -> audit.

The assistant is deliberately *not* a free-form chatbot. Every answer is a set of
recommendations, each tied to cited sources (document, page, asset), labelled
with where it came from (same asset class or transferred from another), and
scored by an evidence-based confidence. Recommendations the model cannot back
with a valid citation are removed before the user sees them.
"""

from __future__ import annotations

import re
import time
from collections import Counter
from typing import Any

import numpy as np

from backend.config import ASSET_TYPES, Settings
from backend.graph.knowledge_graph import KnowledgeGraph, shorten
from backend.graph.taxonomy import Taxonomy
from backend.llm.client import LLMClient, LLMError
from backend.llm.prompts import SYSTEM_PROMPT, adaptation_hint, build_user_prompt
from backend.retrieval.retriever import RetrievalResult, Retriever
from backend.security.rbac import User
from backend.services import confidence
from backend.services.audit import AuditTrail

_ASSET_PATTERNS: dict[str, re.Pattern[str]] = {
    "Data Centre": re.compile(
        r"\b(data[\s-]?cent(?:re|er)s?|data halls?|colocation|hyperscale|dcs?|pue|racks?|crahs?|it load)\b", re.I),
    "Senior Living": re.compile(
        r"\b(senior[\s-]living|residents?|elderly|aged[\s-]care|nursing|assisted[\s-]living|retirement)\b", re.I),
    "Office": re.compile(r"\b(office|offices|office towers?|tenants?|grade[\s-]a)\b", re.I),
}

_STOP = frozenset(
    "about after also and are because been being both but can could does for from have how into its more most "
    "our out over should such than that the their them then there these they this those through under what when "
    "where which while will with would your you we us was were has had not".split()
)
_LESSONS_HEADING = re.compile(r"(?:\d+\.\s*)?lessons? learn(?:ed|t)\s*", re.I)
_NO_ADAPTATION = re.compile(r"\bno (specific )?(adaptation|changes?)\b|\bnot applicable\b|^n/?a$", re.I)
_RULE_CUES = re.compile(r"\b(never|must|always|avoid|do not|don't)\b", re.I)


def detect_asset_type(text: str) -> str | None:
    """Asset class mentioned in the question, if exactly one is."""
    found = [asset for asset, pattern in _ASSET_PATTERNS.items() if pattern.search(text)]
    return found[0] if len(found) == 1 else None


def _terms(text: str) -> set[str]:
    return {w[:6] for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 3 and w not in _STOP}


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", text) if len(s.strip()) > 25]


def _is_prose(sentence: str) -> bool:
    """False for flattened table rows ("KPI FY2023 FY2024 Breakdowns 58 31 ...") and redacted contact lines."""
    tokens = sentence.split()
    numeric = sum(1 for t in tokens if re.fullmatch(r"[-+(]?[\d.,:%/]+[)%]?", t))
    return "[REDACTED-" not in sentence and numeric <= 0.25 * len(tokens)


def best_sentences(text: str, question: str, n: int = 2, patterns: list[re.Pattern[str]] | None = None) -> str:
    """The n sentences of a passage that best match the question.

    Score = shared words + vocabulary of the question's concepts (e.g. "chillers" for cooling efficiency)
    + a small bonus for figures. Ties go to the earlier sentence.
    """
    sentences = [x for x in _sentences(text) if _is_prose(x)] or _sentences(text)
    if not sentences:
        return shorten(text, 300)
    q = _terms(question)
    scored = []
    for i, sentence in enumerate(sentences):
        score = len(q & _terms(sentence)) + (0.5 if re.search(r"\d", sentence) else 0.0)
        score += sum(1 for pattern in patterns or [] if pattern.search(sentence))
        scored.append((-score, i))
    keep = sorted(i for _, i in sorted(scored)[:n])
    return " ".join(sentences[i] for i in keep)


class KnowledgeAssistant:
    def __init__(self, settings: Settings, retriever: Retriever, graph: KnowledgeGraph, taxonomy: Taxonomy,
                 llm: LLMClient, audit: AuditTrail):
        self.settings = settings
        self.retriever = retriever
        self.graph = graph
        self.taxonomy = taxonomy
        self.llm = llm
        self.audit = audit

    # ----------------------------------------------------------------- context
    @staticmethod
    def resolve_context(question: str, explicit: str | None, user: User) -> tuple[str | None, str]:
        if explicit in ASSET_TYPES:
            return explicit, "selected by user"
        detected = detect_asset_type(question)
        if detected:
            return detected, "detected from question"
        if user.home_asset_type:
            return user.home_asset_type, "user profile"
        return None, "not specified"

    # ------------------------------------------------------------------ sources
    def _question_patterns(self, seeds: dict[str, float]) -> list[re.Pattern[str]]:
        strongest = [k for k, w in sorted(seeds.items(), key=lambda kv: -kv[1]) if w >= 0.5][:4]
        return self.taxonomy.patterns_for(strongest)

    def _source_cards(self, retrieval: RetrievalResult, context: str | None, question: str) -> list[dict[str, Any]]:
        patterns = self._question_patterns(retrieval.seeds)
        cards = []
        for index, item in enumerate(retrieval.evidence, start=1):
            cards.append({
                "source_id": f"S{index}",
                "chunk_id": item.chunk_id,
                "doc_id": item.doc_id,
                "title": item.title,
                "filename": item.filename or "Expert lesson (captured in-app)",
                "page": item.page,
                "asset_name": item.asset_name,
                "asset_type": item.asset_type,
                "category": item.category,
                "classification": item.classification,
                "source_type": item.source_type,
                "doc_date": item.doc_date,
                "text": item.text,
                "snippet": best_sentences(item.text, question, n=2, patterns=patterns),
                "similarity": item.similarity,
                "relevance": round(self.retriever.calibrated(item.similarity), 3),
                "graph_score": item.graph_score,
                "retrieval": item.retrieval,
                "shared_concepts": [self.taxonomy.label(k) for k in item.shared_concepts],
                "shared_systems": [self.taxonomy.system_label(k) for k in item.shared_systems],
                "is_cross_asset": bool(context) and item.asset_type != context,
            })
        return cards

    # ---------------------------------------------------------- recommendations
    @staticmethod
    def _template_rationale(source: dict[str, Any], context: str) -> str:
        article = "an" if source["asset_type"][0].lower() in "aeiou" else "a"
        concepts = [c.lower() for c in source["shared_concepts"][:2]]
        systems = source["shared_systems"][:2]
        because = " and ".join(concepts) if concepts else "a comparable operational problem"
        text = (f"Although this solution originated from {article} {source['asset_type'].lower()} asset "
                f"({source['asset_name']}), it is relevant to your {context.lower()} context because both involve "
                f"{because}")
        if systems:
            text += f" and the same kind of equipment ({', '.join(source['shared_systems'][:2])})"
        return text + "."

    def _finalise(self, title: str, detail: str, source_ids: list[str], by_id: dict[str, dict[str, Any]],
                  context: str | None, rationale: str = "", adaptation: str = "") -> dict[str, Any]:
        cited = [by_id[sid] for sid in source_ids]
        origin = Counter(s["asset_type"] for s in cited).most_common(1)[0][0]
        primary = next(s for s in cited if s["asset_type"] == origin)
        is_cross = bool(context) and origin != context
        if is_cross:
            rationale = rationale.strip() or self._template_rationale(primary, context or "")
            if len(adaptation.strip()) < 40 or _NO_ADAPTATION.search(adaptation):
                adaptation = adaptation_hint(origin, context)  # never let a transfer go without adaptation guidance
        else:
            rationale = ""
        value, breakdown = confidence.score(
            relevance=max(s["relevance"] for s in cited),
            independent_documents=len({s["doc_id"] for s in cited}),
            graph_alignment=max(s["graph_score"] for s in cited),
        )
        return {
            "title": title.strip(),
            "detail": detail.strip(),
            "source_ids": source_ids,
            "origin_asset_type": origin,
            "origin_asset": primary["asset_name"],
            "is_cross_asset": is_cross,
            "transfer_rationale": rationale,
            "adaptation_notes": adaptation.strip(),
            "confidence": value,
            "confidence_label": confidence.label(value),
            "confidence_breakdown": breakdown,
            "citations": [
                {k: s[k] for k in ("source_id", "title", "filename", "page", "asset_name", "asset_type", "doc_id")}
                for s in cited
            ],
        }

    @staticmethod
    def _source_ids(value: Any, valid: dict[str, Any]) -> list[str]:
        ids = [f"S{n}" for n in re.findall(r"S\s*(\d+)", str(value), flags=re.I)]
        return [sid for sid in dict.fromkeys(ids) if sid in valid]

    def _from_llm(self, payload: dict[str, Any], sources: list[dict[str, Any]], context: str | None
                  ) -> tuple[list[dict[str, Any]], int]:
        by_id = {s["source_id"]: s for s in sources}
        recommendations, removed = [], 0
        for raw in payload.get("recommendations") or []:
            if not isinstance(raw, dict):
                removed += 1
                continue
            ids = self._source_ids(raw.get("source_ids"), by_id)
            title = str(raw.get("title") or "").strip()
            if not ids or not title:  # unsupported claim -> never shown to the user
                removed += 1
                continue
            recommendations.append(self._finalise(
                title, str(raw.get("detail") or ""), ids, by_id, context,
                str(raw.get("transfer_rationale") or ""), str(raw.get("adaptation_notes") or ""),
            ))
        return recommendations, removed

    def _extractive(self, question: str, sources: list[dict[str, Any]], context: str | None,
                    patterns: list[re.Pattern[str]] | None = None) -> tuple[str, list[dict[str, Any]]]:
        """Offline composer: one recommendation per source document, built from curated metadata + evidence."""
        by_id = {s["source_id"]: s for s in sources}
        per_doc: dict[str, list[dict[str, Any]]] = {}
        for source in sources:
            per_doc.setdefault(source["doc_id"], []).append(source)
        candidates = []
        for doc_id, cards in list(per_doc.items())[:6]:
            record = self.graph.get(doc_id)
            title = (record.solution if record and record.solution else cards[0]["title"])
            evidence = best_sentences(" ".join(c["text"] for c in cards), question, n=2, patterns=patterns)
            impact = f"Reported impact: {record.impact.rstrip('.')}. " if record and record.impact else ""
            candidates.append(self._finalise(
                shorten(title, 160), f"{impact}Evidence: {evidence}", [c["source_id"] for c in cards], by_id, context
            ))
        # best recommendation per asset class first (cross-asset diversity), then fill by confidence
        candidates.sort(key=lambda r: r["confidence"], reverse=True)
        recommendations, seen_types = [], set()
        for rec in candidates:
            if rec["origin_asset_type"] not in seen_types:
                recommendations.append(rec)
                seen_types.add(rec["origin_asset_type"])
        recommendations += [r for r in candidates if r not in recommendations]
        recommendations = sorted(recommendations[:4], key=lambda r: r["confidence"], reverse=True)
        asset_types = sorted({s["asset_type"] for s in sources})
        top = recommendations[0]
        summary = (f"Found {len(per_doc)} relevant precedent(s) across {len(asset_types)} asset class(es) "
                   f"({', '.join(asset_types)}). Strongest evidence: {top['title'].rstrip('.')} "
                   f"at {top['origin_asset']}.")
        transferred = [r for r in recommendations if r["is_cross_asset"]]
        if transferred and context:
            summary += (f" {len(transferred)} recommendation(s) transfer from other asset classes to your "
                        f"{context.lower()} context.")
        return summary, recommendations

    @staticmethod
    def _lessons(sources: list[dict[str, Any]], question: str, limit: int = 3) -> list[str]:
        """Lessons from 'Lessons learned' sections and captured expert rules, most relevant first."""
        q = _terms(question)
        candidates: list[tuple[float, str, str]] = []
        for source in sources:
            text = source["text"]
            heading = _LESSONS_HEADING.search(text)
            if heading:
                sentences, bonus = _sentences(text[heading.end():])[:6], 1.0
            elif source["source_type"] == "expert_lesson":
                sentences = [x for x in _sentences(text) if not x.lower().startswith(("expert lesson", "contributor"))]
                bonus = 0.5
            else:
                sentences = [x for x in _sentences(text) if _RULE_CUES.search(x)]
                bonus = 0.0
            for sentence in sentences:
                sentence = re.sub(r"^\d+\.\s*", "", sentence).strip()
                candidates.append((bonus + len(q & _terms(sentence)), sentence, source["source_id"]))
        lessons, seen, per_source = [], set(), Counter()
        for _, sentence, sid in sorted(candidates, key=lambda c: c[0], reverse=True):
            if sentence in seen or per_source[sid] >= 2:
                continue
            seen.add(sentence)
            per_source[sid] += 1
            lessons.append(f"{sentence} ({sid})")
            if len(lessons) >= limit:
                break
        return lessons

    @staticmethod
    def _bridges(sources: list[dict[str, Any]], context: str | None) -> list[dict[str, Any]]:
        if not context:
            return []
        bridges: dict[str, dict[str, Any]] = {}
        for source in sources:
            if source["asset_type"] == context:
                continue
            bridge = bridges.setdefault(source["asset_type"], {
                "from_asset_type": source["asset_type"], "to_asset_type": context,
                "concepts": [], "systems": [], "source_ids": [],
            })
            bridge["source_ids"].append(source["source_id"])
            for key in ("concepts", "systems"):
                for value in source[f"shared_{key}"]:
                    if value not in bridge[key]:
                        bridge[key].append(value)
        return list(bridges.values())

    # --------------------------------------------------------------------- ask
    def ask(self, user: User, question: str, asset_context: str | None = None,
            asset_filter: list[str] | None = None, cross_asset: bool = True, *,
            audit: bool = True, generate: bool = True) -> dict[str, Any]:
        started = time.perf_counter()
        question = " ".join(question.split())
        context, context_source = self.resolve_context(question, asset_context, user)
        retrieval = self.retriever.retrieve(question, user, context, asset_filter, cross_asset)
        sources = self._source_cards(retrieval, context, question)
        question_concepts = [self.taxonomy.label(k) for k, w in
                             sorted(retrieval.question_concepts.items(), key=lambda kv: -kv[1])]

        summary, recommendations, lessons, gaps = "", [], [], ""
        removed, mode, fallback_reason = 0, "extractive", ""
        abstained = not any(s["retrieval"] == "semantic" for s in sources)

        if abstained:
            summary = ("I could not find evidence in the knowledge you are permitted to access that answers this "
                       "question, so I will not guess.")
            gaps = "Logged as a knowledge gap for the Knowledge Steward. Consider capturing an expert lesson."
            if retrieval.withheld:
                gaps += (f" {len(retrieval.withheld)} potentially relevant document(s) exist at other access "
                         f"levels; request access through your manager if needed.")
            sources = []
        else:
            if generate and self.llm.enabled:
                try:
                    payload = self.llm.generate_json(SYSTEM_PROMPT, build_user_prompt(
                        question, user.title, user.role.name, context, question_concepts, sources))
                    recommendations, removed = self._from_llm(payload, sources, context)
                    if recommendations:
                        mode = "llm"
                        summary = str(payload.get("summary") or "").strip()
                        lessons = [str(x) for x in payload.get("lessons_learned") or [] if str(x).strip()][:4]
                        gaps = str(payload.get("gaps") or "").strip()
                    else:
                        fallback_reason = "LLM output had no citation-backed recommendations"
                except LLMError as exc:
                    fallback_reason = str(exc)
            if not recommendations:
                summary, recommendations = self._extractive(question, sources, context,
                                                            self._question_patterns(retrieval.seeds))
                lessons = self._lessons(sources, question)
                gaps = gaps or ("Answer composed from retrieved evidence without an LLM. Validate with the asset's "
                                "engineering team before implementation.")

        if retrieval.withheld and not abstained:
            classes = ", ".join(sorted({w["classification"] for w in retrieval.withheld}))
            gaps = (gaps + " " if gaps else "") + (
                f"{len(retrieval.withheld)} relevant document(s) classified {classes} were withheld under your "
                f"role's access policy; request access if you need them.")

        overall = confidence.overall([r["confidence"] for r in recommendations])
        cited_docs = list(dict.fromkeys(c["doc_id"] for r in recommendations for c in r["citations"]))
        reasoning = self.graph.reasoning_graph(retrieval.seeds, context, cited_docs or
                                               list(dict.fromkeys(s["doc_id"] for s in sources)))
        latency_ms = int((time.perf_counter() - started) * 1000)
        withheld_classes = Counter(w["classification"] for w in retrieval.withheld)

        response: dict[str, Any] = {
            "answer_id": None,
            "question": question,
            "context_asset_type": context,
            "context_source": context_source,
            "summary": summary,
            "recommendations": recommendations,
            "lessons_learned": lessons,
            "gaps": gaps,
            "sources": sources,
            "bridges": self._bridges(sources, context),
            "reasoning_graph": reasoning,
            "query_concepts": question_concepts,
            "confidence": overall,
            "confidence_label": confidence.label(overall) if not abstained else "None",
            "abstained": abstained,
            "mode": mode,
            "model": self.llm.model if mode == "llm" else "offline-extractive-composer",
            "fallback_reason": fallback_reason,
            "removed_unsupported": removed,
            "latency_ms": latency_ms,
            "governance": {
                "user_id": user.id,
                "user_name": user.name,
                "role": user.role.name,
                "permitted_classifications": user.readable_classifications,
                "withheld_count": len(retrieval.withheld),
                "withheld_classifications": dict(withheld_classes),
                "audit_id": None,
                "audit_hash": None,
            },
        }
        if audit:
            event = self.audit.record(user.id, user.role.name, "QUERY", question, {
                "context_asset_type": context, "context_source": context_source,
                "asset_filter": asset_filter, "cross_asset": cross_asset,
                "mode": mode, "model": response["model"],
                "retrieved": [{"source_id": s["source_id"], "doc_id": s["doc_id"], "page": s["page"],
                               "chunk_id": s["chunk_id"], "similarity": s["similarity"],
                               "retrieval": s["retrieval"]} for s in sources],
                "withheld": retrieval.withheld,
                "recommendations": [r["title"] for r in recommendations],
                "confidence": overall, "abstained": abstained,
                "removed_unsupported": removed, "latency_ms": latency_ms,
            })
            response["answer_id"] = event.id
            response["governance"]["audit_id"] = event.id
            response["governance"]["audit_hash"] = event.record_hash[:16]
        return response

    # ------------------------------------------------------ similar solutions
    def similar_solutions(self, doc_id: str, allowed_doc_ids: set[str], doc_vectors: dict[str, np.ndarray],
                          cross_asset_only: bool = True, limit: int = 5) -> list[dict[str, Any]]:
        """Graph profile similarity blended with semantic (document-centroid) similarity."""
        matches = self.graph.similar_documents(doc_id, allowed_doc_ids, cross_asset_only, limit=limit * 2)
        base_vector = doc_vectors.get(doc_id)
        results = []
        for match in matches:
            record = self.graph.get(match.doc_id)
            other_vector = doc_vectors.get(match.doc_id)
            semantic = float(base_vector @ other_vector) if base_vector is not None and other_vector is not None \
                else 0.0
            results.append({
                "doc_id": match.doc_id,
                "title": record.title,
                "asset_type": record.asset_type,
                "asset_name": record.asset_name,
                "classification": record.classification,
                "problem": record.problem,
                "solution": record.solution,
                "impact": record.impact,
                "graph_similarity": match.score,
                "semantic_similarity": round(semantic, 3),
                "score": round(0.5 * match.score + 0.5 * self.retriever.calibrated(semantic), 3),
                "shared_concepts": [self.taxonomy.label(k) for k in match.shared_concepts],
                "shared_systems": [self.taxonomy.system_label(k) for k in match.shared_systems],
            })
        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:limit]
