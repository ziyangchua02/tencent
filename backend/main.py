"""FastAPI application - Keppel Knowledge Bridge AI.

Run:  uvicorn backend.main:app --reload
Docs: http://localhost:8000/docs

Authentication is simulated with an `X-User-Id` header (pick a demo user in the
UI). In production this dependency validates an SSO/OIDC token instead; every
route already goes through it, so nothing else changes.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy import func, select

from backend import __version__
from backend.config import ASSET_TYPES, get_settings
from backend.container import Services, build_services
from backend.db import Chunk, Document, Feedback, Page
from backend.evaluation.evaluator import run_evaluation
from backend.graph.export import to_graphml, to_turtle
from backend.ingestion.pdf_loader import PDFExtractionError
from backend.ingestion.pipeline import DocumentMetadata, DuplicateDocumentError, IngestionError, file_path_for
from backend.schemas import (AskRequest, AskResponse, FeedbackRequest, GenericResponse, IngestResponse,
                             LessonRequest, ReviewDecision)
from backend.security.rbac import User

log = logging.getLogger("kbridge")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    app.state.services = build_services(get_settings())
    yield
    app.state.services.engine.dispose()


app = FastAPI(
    title="Keppel Knowledge Bridge AI",
    version=__version__,
    description="Governed cross-asset knowledge intelligence: RAG + knowledge graph + RBAC + audit.",
    lifespan=lifespan,
)


# ----------------------------------------------------------------- dependencies
def get_services(request: Request) -> Services:
    return request.app.state.services


def current_user(services: Services = Depends(get_services),
                 x_user_id: str | None = Header(default=None)) -> User:
    user = services.policy.get_user(x_user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown or missing X-User-Id header (simulated SSO)")
    return user


def require(permission: str) -> Callable[..., User]:
    def dependency(request: Request, user: User = Depends(current_user),
                   services: Services = Depends(get_services)) -> User:
        if not user.can(permission):
            services.audit.record(user.id, user.role.name, "ACCESS_DENIED",
                                  details={"permission": permission, "path": request.url.path})
            raise HTTPException(status_code=403,
                                detail=f"Role '{user.role.name}' does not have the '{permission}' permission")
        return user

    return dependency


def readable_doc_ids(services: Services, user: User) -> set[str]:
    with services.session_factory() as session:
        return services.retriever.allowed_doc_ids(session, user.role.classifications)


def load_readable_document(services: Services, user: User, doc_id: str, action: str) -> Document:
    """Fetch a document the user may read. Unreadable documents look non-existent (404) and are audited."""
    with services.session_factory() as session:
        doc = session.get(Document, doc_id)
    visible = doc is not None and user.can_read(doc.classification) and (
        doc.status == "approved" or doc.submitted_by == user.id or user.can("approve"))
    if not visible:
        if doc is not None:
            services.audit.record(user.id, user.role.name, "ACCESS_DENIED",
                                  details={"doc_id": doc_id, "action": action})
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def document_summary(services: Services, doc: Document) -> dict[str, Any]:
    data = doc.to_dict()
    data["concept_labels"] = [services.taxonomy.label(k) for k, w in
                              sorted((doc.concepts or {}).items(), key=lambda kv: -kv[1]) if w >= 0.4]
    data["system_labels"] = [services.taxonomy.system_label(k) for k, w in
                             sorted((doc.systems or {}).items(), key=lambda kv: -kv[1]) if w >= 0.4]
    return data


# ------------------------------------------------------------------ system info
@app.get("/health", tags=["system"])
def health(services: Services = Depends(get_services)) -> dict[str, Any]:
    with services.session_factory() as session:
        by_status = dict(session.execute(select(Document.status, func.count()).group_by(Document.status)).all())
        chunks = session.scalar(select(func.count()).select_from(Chunk)) or 0
    return {
        "status": "ok",
        "version": __version__,
        "llm": services.llm.describe(),
        "embedder": services.embedder.describe(),
        "retrieval": services.retriever.describe(),
        "vector_store": {"backend": "FAISS (IndexFlatIP, cosine)", "vectors": services.store.count},
        "graph": services.graph.stats(),
        "documents": by_status,
        "chunks": chunks,
        "pii_redaction": services.settings.pii_redaction,
    }


@app.get("/users", tags=["identity"])
def list_users(services: Services = Depends(get_services)) -> list[dict[str, Any]]:
    """Demo identities for the simulated sign-in."""
    return [u.to_dict() for u in services.policy.users.values()]


@app.get("/me", tags=["identity"])
def me(user: User = Depends(current_user)) -> dict[str, Any]:
    return user.to_dict()


@app.get("/meta", tags=["system"])
def meta(services: Services = Depends(get_services), _: User = Depends(current_user)) -> dict[str, Any]:
    with services.session_factory() as session:
        categories = sorted(set(session.scalars(select(Document.category))))
    return {
        "asset_types": list(ASSET_TYPES),
        "classifications": services.policy.classifications,
        "categories": categories,
        "concepts": [{"key": c.key, "label": c.label, "description": c.description, "parent": c.parent}
                     for c in services.taxonomy.concepts.values()],
        "rbac_matrix": services.policy.matrix(),
    }


# ------------------------------------------------------------------- assistant
@app.post("/ask", response_model=AskResponse, tags=["assistant"])
def ask(body: AskRequest, user: User = Depends(require("ask")),
        services: Services = Depends(get_services)) -> dict[str, Any]:
    return services.assistant.ask(user, body.question, body.asset_context, body.asset_filter, body.cross_asset)


@app.post("/feedback", response_model=GenericResponse, tags=["assistant"])
def feedback(body: FeedbackRequest, user: User = Depends(require("ask")),
             services: Services = Depends(get_services)) -> GenericResponse:
    with services.session_factory() as session:
        session.add(Feedback(answer_id=body.answer_id, user_id=user.id, rating=body.rating, comment=body.comment))
        session.commit()
    services.audit.record(user.id, user.role.name, "FEEDBACK",
                          details={"answer_id": body.answer_id, "rating": body.rating, "comment": body.comment})
    return GenericResponse(detail="Thanks - feedback recorded")


# ------------------------------------------------------------------- documents
@app.get("/documents", tags=["knowledge"])
def list_documents(user: User = Depends(require("ask")),
                   services: Services = Depends(get_services)) -> list[dict[str, Any]]:
    """Documents the user may read, plus their own submissions awaiting review."""
    with services.session_factory() as session:
        docs = session.scalars(select(Document).order_by(Document.asset_type, Document.id)).all()
    visible = [
        d for d in docs
        if user.can_read(d.classification)
        and (d.status == "approved" or d.submitted_by == user.id or user.can("approve"))
    ]
    return [document_summary(services, d) for d in visible]


@app.get("/documents/{doc_id}", tags=["knowledge"])
def get_document(doc_id: str, user: User = Depends(require("ask")),
                 services: Services = Depends(get_services)) -> dict[str, Any]:
    return document_summary(services, load_readable_document(services, user, doc_id, "VIEW_DOCUMENT"))


@app.get("/documents/{doc_id}/pages/{page_number}", tags=["knowledge"])
def get_page(doc_id: str, page_number: int, user: User = Depends(require("ask")),
             services: Services = Depends(get_services)) -> dict[str, Any]:
    """Full page text so a reader can verify a citation in context."""
    doc = load_readable_document(services, user, doc_id, "VIEW_SOURCE")
    with services.session_factory() as session:
        page = session.scalar(select(Page).where(Page.doc_id == doc_id, Page.number == page_number))
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")
    services.audit.record(user.id, user.role.name, "VIEW_SOURCE", details={"doc_id": doc_id, "page": page_number})
    return {"doc_id": doc_id, "title": doc.title, "page": page_number, "num_pages": doc.num_pages,
            "text": page.text}


@app.get("/documents/{doc_id}/file", tags=["knowledge"])
def download_document(doc_id: str, user: User = Depends(require("ask")),
                      services: Services = Depends(get_services)) -> FileResponse:
    doc = load_readable_document(services, user, doc_id, "DOWNLOAD")
    path = file_path_for(doc)
    if path is None:
        raise HTTPException(status_code=404, detail="No original file for this item")
    services.audit.record(user.id, user.role.name, "DOWNLOAD", details={"doc_id": doc_id})
    return FileResponse(path, media_type="application/pdf", filename=doc.filename or f"{doc_id}.pdf")


@app.post("/documents", response_model=IngestResponse, tags=["knowledge"])
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    asset_type: str = Form(...),
    asset_name: str = Form(...),
    category: str = Form(...),
    classification: str = Form(...),
    problem: str = Form(""),
    solution: str = Form(""),
    impact: str = Form(""),
    location: str = Form(""),
    doc_date: str = Form(""),
    user: User = Depends(require("contribute")),
    services: Services = Depends(get_services),
) -> dict[str, Any]:
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    if classification not in services.policy.classifications:
        raise HTTPException(status_code=400, detail="Unknown classification")
    if not user.can_read(classification):
        raise HTTPException(status_code=403, detail=f"You cannot contribute {classification} documents")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File larger than 20 MB")
    status = "approved" if user.can("approve") else "pending"
    meta_ = DocumentMetadata(title=title, asset_type=asset_type, asset_name=asset_name, category=category,
                             classification=classification, problem=problem, solution=solution, impact=impact,
                             location=location, author=user.name, doc_date=doc_date)
    try:
        result = services.pipeline.ingest_pdf(data, file.filename or "upload.pdf", meta_,
                                              submitted_by=user.id, status=status)
    except DuplicateDocumentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (IngestionError, PDFExtractionError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    services.audit.record(user.id, user.role.name, "UPLOAD", details={
        "doc_id": result["doc_id"], "filename": file.filename, "classification": classification,
        "status": status, "chunks": result["chunks"], "pii_redactions": result["pii_redactions"]})
    result["message"] = ("Published to the knowledge base." if status == "approved"
                         else "Submitted for Knowledge Steward review - searchable once approved.")
    return result


@app.post("/lessons", response_model=IngestResponse, tags=["knowledge"])
def capture_lesson(body: LessonRequest, user: User = Depends(require("contribute")),
                   services: Services = Depends(get_services)) -> dict[str, Any]:
    """Capture an expert lesson (tacit -> explicit) as a governed, citable knowledge item."""
    if body.classification not in services.policy.classifications or not user.can_read(body.classification):
        raise HTTPException(status_code=403, detail=f"You cannot contribute {body.classification} knowledge")
    sections = [
        f"Expert lesson: {body.title}",
        f"Asset: {body.asset_name} ({body.asset_type}). Contributed by {user.name}, {user.title}.",
        f"Problem: {body.problem}",
        f"Context: {body.context}" if body.context else "",
        f"What worked: {body.solution}",
        f"Impact: {body.impact}" if body.impact else "",
        f"Lessons and rules of thumb: {body.lessons}" if body.lessons else "",
    ]
    status = "approved" if user.can("approve") else "pending"
    meta_ = DocumentMetadata(title=body.title, asset_type=body.asset_type, asset_name=body.asset_name,
                             category=body.category, classification=body.classification, problem=body.problem,
                             solution=body.solution, impact=body.impact, location=body.location,
                             author=user.name)
    try:
        result = services.pipeline.ingest_text(["\n".join(s for s in sections if s)], meta_,
                                               submitted_by=user.id, status=status)
    except DuplicateDocumentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IngestionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    services.audit.record(user.id, user.role.name, "CAPTURE_LESSON", body.title, {
        "doc_id": result["doc_id"], "classification": body.classification, "status": status})
    result["message"] = ("Lesson published." if status == "approved"
                         else "Lesson submitted for Knowledge Steward review - searchable once approved.")
    return result


# ---------------------------------------------------------------------- review
@app.get("/review/queue", tags=["governance"])
def review_queue(_: User = Depends(require("approve")),
                 services: Services = Depends(get_services)) -> list[dict[str, Any]]:
    with services.session_factory() as session:
        pending = session.scalars(select(Document).where(Document.status == "pending")
                                  .order_by(Document.created_at)).all()
        items = []
        for doc in pending:
            data = document_summary(services, doc)
            data["preview"] = " ".join(p.text for p in doc.pages)[:1500]
            items.append(data)
    return items


@app.post("/review/{doc_id}", response_model=GenericResponse, tags=["governance"])
def review(doc_id: str, body: ReviewDecision, user: User = Depends(require("approve")),
           services: Services = Depends(get_services)) -> GenericResponse:
    status = "approved" if body.decision == "approve" else "rejected"
    try:
        services.pipeline.set_status(doc_id, status, reviewer=user.id, note=body.note)
    except IngestionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    services.audit.record(user.id, user.role.name, "REVIEW",
                          details={"doc_id": doc_id, "decision": status, "note": body.note})
    return GenericResponse(detail=f"{doc_id} {status}")


# ----------------------------------------------------------------------- graph
@app.get("/graph", tags=["knowledge graph"])
def graph_view(asset_types: list[str] | None = Query(default=None), detailed: bool = False,
               user: User = Depends(require("ask")), services: Services = Depends(get_services)) -> dict[str, Any]:
    allowed = readable_doc_ids(services, user)
    return {
        **services.graph.view(allowed, set(asset_types) if asset_types else None, detailed=detailed),
        "bridges": services.graph.cross_asset_bridges(allowed),
        "stats": services.graph.stats(),
    }


@app.get("/graph/similar/{doc_id}", tags=["knowledge graph"])
def similar(doc_id: str, cross_asset_only: bool = True, limit: int = Query(default=5, le=20),
            user: User = Depends(require("ask")), services: Services = Depends(get_services)) -> dict[str, Any]:
    """"Who solved something like this elsewhere?" - analogous solutions in other asset classes."""
    doc = load_readable_document(services, user, doc_id, "SIMILAR")
    allowed = readable_doc_ids(services, user)
    with services.session_factory() as session:
        rows = session.execute(select(Chunk.id, Chunk.doc_id).where(Chunk.doc_id.in_(allowed | {doc_id}))).all()
    by_doc: dict[str, list[int]] = {}
    for chunk_id, owner in rows:
        by_doc.setdefault(owner, []).append(chunk_id)
    centroids = {}
    for owner, ids in by_doc.items():
        vectors = np.vstack([services.store.reconstruct(i) for i in ids])
        centroid = vectors.mean(axis=0)
        centroids[owner] = centroid / (np.linalg.norm(centroid) or 1.0)
    return {
        "document": document_summary(services, doc),
        "similar": services.assistant.similar_solutions(doc_id, allowed, centroids, cross_asset_only, limit),
    }


@app.get("/graph/export", tags=["knowledge graph"])
def export_graph(format: str = Query(default="graphml", pattern="^(graphml|turtle)$"),
                 user: User = Depends(require("ask")), services: Services = Depends(get_services)):
    """Export the (RBAC-filtered) graph for Neo4j (GraphML) or RDF stores (Turtle)."""
    subgraph = services.graph.subgraph_for(readable_doc_ids(services, user))
    services.audit.record(user.id, user.role.name, "EXPORT_GRAPH", details={"format": format})
    if format == "turtle":
        return PlainTextResponse(to_turtle(subgraph, services.taxonomy), media_type="text/turtle")
    return PlainTextResponse(to_graphml(subgraph), media_type="application/graphml+xml")


# ------------------------------------------------------------------ governance
@app.get("/audit", tags=["governance"])
def audit_log(limit: int = Query(default=200, le=1000), action: str | None = None, user_id: str | None = None,
              _: User = Depends(require("view_audit")),
              services: Services = Depends(get_services)) -> list[dict[str, Any]]:
    return services.audit.list(limit=limit, action=action, user_id=user_id)


@app.get("/audit/verify", tags=["governance"])
def audit_verify(_: User = Depends(require("view_audit")),
                 services: Services = Depends(get_services)) -> dict[str, Any]:
    return services.audit.verify()


@app.get("/governance/summary", tags=["governance"])
def governance_summary(_: User = Depends(require("view_audit")),
                       services: Services = Depends(get_services)) -> dict[str, Any]:
    with services.session_factory() as session:
        ratings = dict(session.execute(select(Feedback.rating, func.count()).group_by(Feedback.rating)).all())
        pending = session.scalar(select(func.count()).select_from(Document).where(Document.status == "pending"))
        redaction_rows = session.scalars(select(Document.pii_redactions)).all()
    redactions: dict[str, int] = {}
    for row in redaction_rows:
        for label, count in (row or {}).items():
            redactions[label] = redactions.get(label, 0) + count
    return {
        "events_by_action": services.audit.counts_by_action(),
        "feedback": {"helpful": ratings.get(1, 0), "not_helpful": ratings.get(-1, 0)},
        "pending_reviews": pending or 0,
        "pii_redactions": redactions,
        "knowledge_gaps": services.audit.knowledge_gaps(limit=25),
    }


# ------------------------------------------------------------------ evaluation
@app.post("/eval/run", tags=["evaluation"])
def eval_run(generation: bool = False, user: User = Depends(require("run_eval")),
             services: Services = Depends(get_services)) -> dict[str, Any]:
    report = run_evaluation(services, include_generation=generation)
    services.audit.record(user.id, user.role.name, "EVAL_RUN", details={"mode": report["mode"],
                                                                        "summary": report["summary"]})
    return report


@app.get("/eval/latest", tags=["evaluation"])
def eval_latest(_: User = Depends(require("ask")), services: Services = Depends(get_services)) -> dict[str, Any]:
    path = services.settings.eval_report_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="No evaluation has been run yet")
    return json.loads(path.read_text(encoding="utf-8"))
