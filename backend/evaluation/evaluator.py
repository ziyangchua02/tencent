"""Evaluation harness over a golden question set (data/eval/golden_set.json).

Metrics
- hit_rate / recall / MRR     : did the expected precedent documents come back, and how high?
- cross_asset_coverage       : did answers include evidence from every asset class the case expects?
- cross_asset_transfer_rate  : share of answers that contain at least one cross-asset recommendation
- rbac_leakage               : sources the asking user may not read (must be 0) + forbidden-document hits
- abstention_accuracy        : answers when it should, refuses when the knowledge base has no evidence
- citation_coverage          : recommendations backed by >= 1 valid citation; unsupported ones removed
- groundedness               : semantic support of each recommendation by its cited passages
- latency p50 / p95
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:  # pragma: no cover
    from backend.container import Services


def _percentile(values: list[float], pct: float) -> float:
    return round(float(np.percentile(values, pct)), 1) if values else 0.0


def _mean(values: list[float]) -> float | None:
    return round(float(np.mean(values)), 3) if values else None


def _groundedness(services: "Services", answer: dict[str, Any]) -> float | None:
    recs = answer["recommendations"]
    if not recs:
        return None
    by_id = {s["source_id"]: s for s in answer["sources"]}
    claims = [f"{r['title']}. {r['detail']}" for r in recs]
    claim_vecs = services.embedder.embed_documents(claims)
    scores = []
    for rec, vec in zip(recs, claim_vecs):
        texts = [by_id[sid]["text"] for sid in rec["source_ids"] if sid in by_id]
        if not texts:
            scores.append(0.0)
            continue
        support = float(np.max(services.embedder.embed_documents(texts) @ vec))
        scores.append(services.retriever.calibrated(support))
    return float(np.mean(scores))


def run_evaluation(services: "Services", include_generation: bool = False) -> dict[str, Any]:
    cases = json.loads(services.settings.golden_set_path.read_text(encoding="utf-8"))["cases"]
    rows: list[dict[str, Any]] = []
    for case in cases:
        user = services.policy.get_user(case["user"])
        if user is None:
            raise ValueError(f"Golden case {case['id']} references unknown user {case['user']}")
        started = time.perf_counter()
        answer = services.assistant.ask(user, case["question"], asset_context=case.get("asset_context"),
                                        audit=False, generate=include_generation)
        latency_ms = (time.perf_counter() - started) * 1000

        docs = list(dict.fromkeys(s["doc_id"] for s in answer["sources"]))
        expected = case.get("expected_docs", [])
        found = [d for d in expected if d in docs]
        first_rank = next((i for i, d in enumerate(docs, start=1) if d in expected), None)
        asset_types = sorted({s["asset_type"] for s in answer["sources"]})
        expected_types = case.get("expected_asset_types", [])
        leaked = [s["doc_id"] for s in answer["sources"] if not user.can_read(s["classification"])]
        forbidden = [d for d in case.get("forbidden_docs", []) if d in docs]
        recs = answer["recommendations"]
        rows.append({
            "id": case["id"],
            "theme": case.get("theme", ""),
            "question": case["question"],
            "user": user.id,
            "role": user.role.name,
            "context": answer["context_asset_type"],
            "retrieved_docs": docs,
            "expected_docs": expected,
            "found_docs": found,
            "recall": round(len(found) / len(expected), 3) if expected else None,
            "reciprocal_rank": round(1 / first_rank, 3) if first_rank else (0.0 if expected else None),
            "asset_types": asset_types,
            "cross_asset_ok": set(expected_types) <= set(asset_types) if expected_types else None,
            "has_transfer": any(r["is_cross_asset"] for r in recs),
            "expects_transfer": len(expected_types) > 1,
            "leaked_docs": leaked,
            "forbidden_hits": forbidden,
            "withheld": answer["governance"]["withheld_count"],
            "expect_abstain": case.get("expect_abstain", False),  # None = not scored
            "abstained": answer["abstained"],
            "recommendations": len(recs),
            "cited_recommendations": sum(1 for r in recs if r["source_ids"]),
            "removed_unsupported": answer["removed_unsupported"],
            "groundedness": _groundedness(services, answer),
            "confidence": answer["confidence"],
            "mode": answer["mode"],
            "latency_ms": round(latency_ms, 1),
        })

    answerable = [r for r in rows if r["expect_abstain"] is False]
    total_recs = sum(r["recommendations"] for r in rows)
    transfer_cases = [r for r in answerable if r["expects_transfer"]]
    summary = {
        "cases": len(rows),
        "hit_rate": _mean([1.0 if r["found_docs"] else 0.0 for r in rows if r["expected_docs"]]),
        "recall": _mean([r["recall"] for r in rows if r["recall"] is not None]),
        "mrr": _mean([r["reciprocal_rank"] for r in rows if r["reciprocal_rank"] is not None]),
        "cross_asset_coverage": _mean([1.0 if r["cross_asset_ok"] else 0.0 for r in rows
                                       if r["cross_asset_ok"] is not None]),
        "cross_asset_transfer_rate": _mean([1.0 if r["has_transfer"] else 0.0 for r in transfer_cases]),
        "rbac_leakage": sum(len(r["leaked_docs"]) + len(r["forbidden_hits"]) for r in rows),
        "abstention_accuracy": _mean([1.0 if r["abstained"] == r["expect_abstain"] else 0.0 for r in rows
                                      if r["expect_abstain"] is not None]),
        "citation_coverage": round(sum(r["cited_recommendations"] for r in rows) / total_recs, 3)
        if total_recs else None,
        "unsupported_removed": sum(r["removed_unsupported"] for r in rows),
        "groundedness": _mean([r["groundedness"] for r in rows if r["groundedness"] is not None]),
        "mean_confidence": _mean([r["confidence"] for r in answerable]),
        "latency_p50_ms": _percentile([r["latency_ms"] for r in rows], 50),
        "latency_p95_ms": _percentile([r["latency_ms"] for r in rows], 95),
    }
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mode": "full (LLM generation)" if include_generation and services.llm.enabled
        else "retrieval + offline composer",
        "llm": services.llm.describe(),
        "embedder": services.embedder.describe(),
        "summary": summary,
        "cases": rows,
    }
    services.settings.eval_report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
