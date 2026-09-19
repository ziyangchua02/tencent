"""Load the synthetic multi-asset corpus described by data/sample_docs/manifest.json."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from backend.ingestion.pipeline import DocumentMetadata, DuplicateDocumentError, IngestionPipeline

log = logging.getLogger(__name__)

_META_FIELDS = ("title", "asset_type", "asset_name", "category", "classification", "problem", "solution",
                "impact", "location", "author", "doc_date")


def seed_sample_corpus(pipeline: IngestionPipeline, sample_dir: Path) -> int:
    manifest_path = Path(sample_dir) / "manifest.json"
    if not manifest_path.exists():
        log.warning("No manifest at %s - run `python -m scripts.generate_dataset` first.", manifest_path)
        return 0
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    ingested = 0
    for entry in manifest["documents"]:
        meta = DocumentMetadata(**{k: entry.get(k, "") or "" for k in _META_FIELDS})
        try:
            if entry.get("source_type") == "expert_lesson":
                pipeline.ingest_text(entry["pages"], meta, submitted_by=entry.get("submitted_by", "seed"),
                                     status="approved", doc_id=entry["id"])
            else:
                path = Path(sample_dir) / entry["filename"]
                pipeline.ingest_pdf(path.read_bytes(), entry["filename"], meta, submitted_by="seed",
                                    status="approved", doc_id=entry["id"], file_path=str(path))
            ingested += 1
        except DuplicateDocumentError:
            continue
    log.info("Seeded %d documents from %s", ingested, manifest_path)
    return ingested
