"""Service wiring. One place builds every component, so providers are swappable via config."""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from backend.config import Settings
from backend.db import Chunk, Document, create_db_engine, create_session_factory
from backend.graph.knowledge_graph import DocRecord, KnowledgeGraph
from backend.graph.taxonomy import Taxonomy
from backend.ingestion.pipeline import IngestionPipeline
from backend.ingestion.seed import seed_sample_corpus
from backend.llm.client import LLMClient, build_llm
from backend.retrieval.embeddings import Embedder, build_embedder
from backend.retrieval.retriever import Retriever
from backend.retrieval.vector_store import FaissVectorStore
from backend.security.rbac import AccessPolicy
from backend.services.assistant import KnowledgeAssistant
from backend.services.audit import AuditTrail

log = logging.getLogger(__name__)


@dataclass
class Services:
    settings: Settings
    engine: Engine
    session_factory: sessionmaker
    policy: AccessPolicy
    taxonomy: Taxonomy
    embedder: Embedder
    store: FaissVectorStore
    graph: KnowledgeGraph
    llm: LLMClient
    audit: AuditTrail
    pipeline: IngestionPipeline
    retriever: Retriever
    assistant: KnowledgeAssistant

    def document_count(self) -> int:
        with self.session_factory() as session:
            return session.scalar(select(func.count()).select_from(Document)) or 0

    def rebuild_graph(self) -> None:
        with self.session_factory() as session:
            self.graph.rebuild(DocRecord.from_document(d) for d in session.scalars(select(Document)))

    def _taxonomy_changed(self) -> bool:
        """True when taxonomy.yaml differs from the version used to tag the stored documents."""
        digest = hashlib.sha256(self.settings.taxonomy_path.read_bytes()).hexdigest()
        marker = self.settings.store_dir / "taxonomy_version.json"
        previous = json.loads(marker.read_text()).get("sha256") if marker.exists() else None
        marker.write_text(json.dumps({"sha256": digest}))
        return previous is not None and previous != digest

    def startup(self) -> None:
        if self._taxonomy_changed() and self.document_count():
            log.info("Taxonomy changed - re-tagged %d documents", self.pipeline.retag_all())
        self.rebuild_graph()
        with self.session_factory() as session:
            chunk_ids = set(session.scalars(select(Chunk.id)))
        if not self.store.compatible_on_load or self.store.ids() != chunk_ids:
            if chunk_ids:
                log.info("Vector index out of date for %s - re-indexing", self.embedder.id)
            self.pipeline.reindex_all()
        if self.settings.auto_seed and self.document_count() == 0:
            seed_sample_corpus(self.pipeline, self.settings.sample_docs_dir)


def build_services(settings: Settings) -> Services:
    settings.store_dir.mkdir(parents=True, exist_ok=True)
    settings.files_dir.mkdir(parents=True, exist_ok=True)
    engine = create_db_engine(settings.resolved_database_url)
    session_factory = create_session_factory(engine)
    policy = AccessPolicy.from_yaml(settings.rbac_policy_path)
    taxonomy = Taxonomy.from_yaml(settings.taxonomy_path)
    embedder = build_embedder(settings)
    store = FaissVectorStore(settings.store_dir, embedder.dim, embedder.id)
    graph = KnowledgeGraph(taxonomy)
    llm = build_llm(settings)
    audit = AuditTrail(session_factory)
    pipeline = IngestionPipeline(settings, session_factory, embedder, store, graph, taxonomy)
    retriever = Retriever(settings, session_factory, embedder, store, graph, taxonomy)
    assistant = KnowledgeAssistant(settings, retriever, graph, taxonomy, llm, audit)
    services = Services(settings, engine, session_factory, policy, taxonomy, embedder, store, graph, llm, audit,
                        pipeline, retriever, assistant)
    services.startup()
    log.info("Knowledge Bridge ready: %d documents | embedder=%s | llm=%s", services.document_count(),
             embedder.id, llm.describe())
    return services
