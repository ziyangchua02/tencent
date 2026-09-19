"""Shared fixtures. Tests run fully offline: hashing embedder + offline answer composer."""

from __future__ import annotations

import io
import os

import pytest

OFFLINE_ENV = {
    "EMBEDDING_PROVIDER": "hash",
    "LLM_PROVIDER": "extractive",
    "AUTO_SEED": "true",
    "DATABASE_URL": "",
}


@pytest.fixture(scope="session")
def api_client(tmp_path_factory):
    """FastAPI TestClient over a freshly seeded, isolated knowledge base."""
    env = {**OFFLINE_ENV, "STORE_DIR": str(tmp_path_factory.mktemp("api_store"))}
    previous = {k: os.environ.get(k) for k in env}
    os.environ.update(env)
    from backend.config import get_settings

    get_settings.cache_clear()
    from fastapi.testclient import TestClient

    from backend.main import app

    with TestClient(app) as client:
        yield client
    for key, value in previous.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    get_settings.cache_clear()


@pytest.fixture(scope="session")
def services(tmp_path_factory):
    """Service container (no HTTP layer) over its own seeded knowledge base."""
    from backend.config import Settings
    from backend.container import build_services

    return build_services(Settings(store_dir=tmp_path_factory.mktemp("svc_store"), embedding_provider="hash",
                                   llm_provider="extractive", database_url=None))


def as_user(user_id: str) -> dict[str, str]:
    return {"X-User-Id": user_id}


def make_pdf(pages: list[str]) -> bytes:
    """Small text PDF for upload tests."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    for text in pages:
        y = 800
        for line in text.split("\n"):
            pdf.drawString(50, y, line)
            y -= 16
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()
