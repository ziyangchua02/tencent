"""Relational store (SQLite by default, PostgreSQL-ready via DATABASE_URL).

The database is the system of record: documents, pages, chunks, the audit
trail and user feedback. The FAISS index and the knowledge graph are derived
from it and can be rebuilt at any time.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    filename: Mapped[str | None] = mapped_column(String(300))
    file_path: Mapped[str | None] = mapped_column(String(500))
    source_type: Mapped[str] = mapped_column(String(32), default="document")  # document | expert_lesson
    asset_type: Mapped[str] = mapped_column(String(64), index=True)
    asset_name: Mapped[str] = mapped_column(String(200))
    location: Mapped[str | None] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(120))
    classification: Mapped[str] = mapped_column(String(32), index=True)
    problem: Mapped[str | None] = mapped_column(Text)
    solution: Mapped[str | None] = mapped_column(Text)
    impact: Mapped[str | None] = mapped_column(Text)
    author: Mapped[str | None] = mapped_column(String(200))
    doc_date: Mapped[str | None] = mapped_column(String(20))
    # Governance: only `approved` knowledge is retrievable.
    status: Mapped[str] = mapped_column(String(16), default="approved", index=True)
    submitted_by: Mapped[str | None] = mapped_column(String(64))
    reviewed_by: Mapped[str | None] = mapped_column(String(64))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    num_pages: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    concepts: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    systems: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    pii_redactions: Mapped[dict[str, int]] = mapped_column(JSON, default=dict)

    pages: Mapped[list["Page"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="Page.number"
    )
    chunks: Mapped[list["Chunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "filename": self.filename,
            "source_type": self.source_type,
            "asset_type": self.asset_type,
            "asset_name": self.asset_name,
            "location": self.location,
            "category": self.category,
            "classification": self.classification,
            "problem": self.problem,
            "solution": self.solution,
            "impact": self.impact,
            "author": self.author,
            "doc_date": self.doc_date,
            "status": self.status,
            "submitted_by": self.submitted_by,
            "reviewed_by": self.reviewed_by,
            "review_note": self.review_note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "num_pages": self.num_pages,
            "concepts": dict(self.concepts or {}),
            "systems": dict(self.systems or {}),
            "pii_redactions": dict(self.pii_redactions or {}),
        }


class Page(Base):
    """Full text of each page, kept so users can verify a citation in context."""

    __tablename__ = "pages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)

    document: Mapped[Document] = relationship(back_populates="pages")


class Chunk(Base):
    """A retrievable passage. Its primary key is also its FAISS vector id."""

    __tablename__ = "chunks"
    # AUTOINCREMENT stops SQLite reusing ids, so a vector id never points to the wrong text.
    __table_args__ = {"sqlite_autoincrement": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    page: Mapped[int] = mapped_column(Integer)
    chunk_index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)

    document: Mapped[Document] = relationship(back_populates="chunks")


class AuditEvent(Base):
    """Append-only, hash-chained audit record (tamper-evident)."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[str] = mapped_column(String(40), index=True)  # ISO-8601 UTC
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    user_role: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(32), index=True)
    question: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64))
    record_hash: Mapped[str] = mapped_column(String(64))


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    answer_id: Mapped[int] = mapped_column(Integer, index=True)  # audit event id of the answer
    user_id: Mapped[str] = mapped_column(String(64))
    rating: Mapped[int] = mapped_column(Integer)  # +1 helpful / -1 not helpful
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


def create_db_engine(url: str) -> Engine:
    is_sqlite = url.startswith("sqlite")
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False} if is_sqlite else {},
        future=True,
    )
    if is_sqlite:

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection, _record) -> None:  # pragma: no cover - driver hook
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    Base.metadata.create_all(engine)
    return engine


def create_session_factory(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)
