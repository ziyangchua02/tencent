"""Ingestion: extract -> redact PII -> chunk -> tag concepts -> embed -> index -> graph.

The same pipeline handles uploaded PDFs and expert lessons captured in the UI,
so tacit knowledge becomes exactly as searchable, citable and governed as a
formal report. Contributions from non-stewards enter as `pending` and are only
retrievable after a Knowledge Steward approves them.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from backend.config import ASSET_TYPES, Settings
from backend.db import Chunk, Document, Page
from backend.graph.knowledge_graph import DocRecord, KnowledgeGraph
from backend.graph.taxonomy import Taxonomy
from backend.ingestion.chunker import chunk_pages
from backend.ingestion.pdf_loader import PageText, clean_text, extract_pages
from backend.ingestion.pii import redact_pii
from backend.retrieval.embeddings import Embedder
from backend.retrieval.vector_store import VectorStore

log = logging.getLogger(__name__)

_ID_PREFIX = {"Office": "OFF", "Data Centre": "DC", "Senior Living": "SL"}


class IngestionError(ValueError):
    """The input cannot be ingested (bad metadata, no text, ...)."""


class DuplicateDocumentError(IngestionError):
    """The same content (or id) is already in the knowledge base."""


@dataclass
class DocumentMetadata:
    title: str
    asset_type: str
    asset_name: str
    category: str
    classification: str
    problem: str = ""
    solution: str = ""
    impact: str = ""
    location: str = ""
    author: str = ""
    doc_date: str = ""

    def validate(self) -> None:
        if self.asset_type not in ASSET_TYPES:
            raise IngestionError(f"asset_type must be one of {', '.join(ASSET_TYPES)}")
        for name in ("title", "asset_name", "category", "classification"):
            if not str(getattr(self, name)).strip():
                raise IngestionError(f"{name} is required")


def embedding_text(doc: Document, chunk_text: str) -> str:
    """Contextual chunk header: the passage is embedded together with what it is about."""
    return f"{doc.title}. {doc.asset_type} - {doc.asset_name}. {doc.category}.\n{chunk_text}"


class IngestionPipeline:
    def __init__(self, settings: Settings, session_factory: sessionmaker, embedder: Embedder,
                 store: VectorStore, graph: KnowledgeGraph, taxonomy: Taxonomy):
        self.settings = settings
        self.session_factory = session_factory
        self.embedder = embedder
        self.store = store
        self.graph = graph
        self.taxonomy = taxonomy
        self._lock = threading.Lock()  # one writer at a time keeps DB and FAISS consistent

    # ---------------------------------------------------------------- entrypoints
    def ingest_pdf(self, data: bytes, filename: str, meta: DocumentMetadata, *, submitted_by: str,
                   status: str = "approved", doc_id: str | None = None, file_path: str | None = None
                   ) -> dict[str, Any]:
        pages = extract_pages(data)
        return self._ingest(pages, meta, source_type="document", filename=filename,
                            sha256=hashlib.sha256(data).hexdigest(), submitted_by=submitted_by, status=status,
                            doc_id=doc_id, file_bytes=None if file_path else data, file_path=file_path)

    def ingest_text(self, pages: list[str], meta: DocumentMetadata, *, submitted_by: str,
                    status: str = "approved", doc_id: str | None = None,
                    source_type: str = "expert_lesson") -> dict[str, Any]:
        page_texts = [PageText(number=i, text=clean_text(t)) for i, t in enumerate(pages, start=1)]
        digest = hashlib.sha256("\n\f".join(pages).encode("utf-8")).hexdigest()
        return self._ingest(page_texts, meta, source_type=source_type, filename=None, sha256=digest,
                            submitted_by=submitted_by, status=status, doc_id=doc_id)

    # ------------------------------------------------------------------- core
    def _new_id(self, meta: DocumentMetadata, source_type: str) -> str:
        prefix = "LES" if source_type == "expert_lesson" else _ID_PREFIX.get(meta.asset_type, "DOC")
        return f"{prefix}-{uuid.uuid4().hex[:6].upper()}"

    def _ingest(self, pages: list[PageText], meta: DocumentMetadata, *, source_type: str, filename: str | None,
                sha256: str, submitted_by: str, status: str, doc_id: str | None,
                file_bytes: bytes | None = None, file_path: str | None = None) -> dict[str, Any]:
        meta.validate()
        with self._lock, self.session_factory() as session:
            if session.scalar(select(Document.id).where(Document.sha256 == sha256)):
                raise DuplicateDocumentError("This content is already in the knowledge base")
            doc_id = doc_id or self._new_id(meta, source_type)
            if session.get(Document, doc_id) is not None:
                raise DuplicateDocumentError(f"Document id {doc_id} already exists")

            redactions: Counter[str] = Counter()
            clean_pages = []
            for page in pages:
                text, counts = redact_pii(page.text) if self.settings.pii_redaction else (page.text, {})
                redactions.update(counts)
                clean_pages.append(PageText(number=page.number, text=text))
            chunks = chunk_pages(clean_pages, self.settings.chunk_size, self.settings.chunk_overlap)
            if not chunks:
                raise IngestionError("No usable text found in the document")

            metadata_text = " ".join([meta.title, meta.problem, meta.solution, meta.impact])
            concepts, systems = self.taxonomy.tag_document(" ".join(p.text for p in clean_pages), metadata_text)
            doc = Document(
                id=doc_id, title=meta.title.strip(), filename=filename, file_path=file_path,
                source_type=source_type, asset_type=meta.asset_type, asset_name=meta.asset_name.strip(),
                location=meta.location or None, category=meta.category.strip(),
                classification=meta.classification, problem=meta.problem or None,
                solution=meta.solution or None, impact=meta.impact or None, author=meta.author or None,
                doc_date=meta.doc_date or None, status=status, submitted_by=submitted_by,
                num_pages=len(pages), sha256=sha256, concepts=concepts, systems=systems,
                pii_redactions=dict(redactions),
            )
            doc.pages = [Page(number=p.number, text=p.text) for p in clean_pages]
            doc.chunks = [Chunk(page=c.page, chunk_index=c.index, text=c.text) for c in chunks]
            session.add(doc)
            session.flush()  # assigns chunk ids, which double as vector ids

            vectors = self.embedder.embed_documents([embedding_text(doc, c.text) for c in doc.chunks])
            chunk_ids = [c.id for c in doc.chunks]
            self.store.add(chunk_ids, vectors)
            try:
                session.commit()
            except Exception:
                self.store.remove(chunk_ids)
                raise
            self.store.save()

            if file_bytes is not None:
                self.settings.files_dir.mkdir(parents=True, exist_ok=True)
                target = self.settings.files_dir / f"{doc_id}.pdf"
                target.write_bytes(file_bytes)
                doc.file_path = str(target)
                session.commit()
            self.graph.upsert(DocRecord.from_document(doc))

        log.info("Ingested %s (%s, %d chunks, status=%s)", doc_id, meta.asset_type, len(chunk_ids), status)
        return {
            "doc_id": doc_id,
            "title": doc.title,
            "status": status,
            "pages": len(pages),
            "chunks": len(chunk_ids),
            "concepts": {self.taxonomy.label(k): v for k, v in sorted(concepts.items(), key=lambda kv: -kv[1])},
            "systems": {self.taxonomy.system_label(k): v for k, v in sorted(systems.items(), key=lambda kv: -kv[1])},
            "pii_redactions": dict(redactions),
        }

    # ------------------------------------------------------------- governance
    def set_status(self, doc_id: str, status: str, reviewer: str, note: str | None = None) -> Document:
        with self._lock, self.session_factory() as session:
            doc = session.get(Document, doc_id)
            if doc is None:
                raise IngestionError(f"Unknown document {doc_id}")
            doc.status = status
            doc.reviewed_by = reviewer
            doc.reviewed_at = datetime.now(timezone.utc)
            doc.review_note = note
            session.commit()
            self.graph.upsert(DocRecord.from_document(doc))
            return doc

    # ------------------------------------------------------------ maintenance
    def reindex_all(self) -> int:
        """Re-embed every chunk (after an embedding-model change or index loss)."""
        with self._lock, self.session_factory() as session:
            self.store.reset(self.embedder.dim, self.embedder.id)
            docs = {d.id: d for d in session.scalars(select(Document))}
            chunks = list(session.scalars(select(Chunk).order_by(Chunk.id)))
            batch = 64
            for start in range(0, len(chunks), batch):
                part = chunks[start:start + batch]
                vectors = self.embedder.embed_documents([embedding_text(docs[c.doc_id], c.text) for c in part])
                self.store.add([c.id for c in part], vectors)
            self.store.save()
            log.info("Re-indexed %d chunks with %s", len(chunks), self.embedder.id)
            return len(chunks)

    def retag_all(self) -> int:
        """Recompute concept/system tags after the taxonomy changes."""
        with self._lock, self.session_factory() as session:
            docs = list(session.scalars(select(Document)))
            for doc in docs:
                body = " ".join(p.text for p in doc.pages)
                metadata_text = " ".join(filter(None, [doc.title, doc.problem, doc.solution, doc.impact]))
                doc.concepts, doc.systems = self.taxonomy.tag_document(body, metadata_text)
            session.commit()
            self.graph.rebuild(DocRecord.from_document(d) for d in docs)
            return len(docs)


def file_path_for(doc: Document) -> Path | None:
    return Path(doc.file_path) if doc.file_path and Path(doc.file_path).exists() else None
