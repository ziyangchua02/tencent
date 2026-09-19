"""Application settings, loaded from environment variables or a `.env` file.

Every provider (LLM, embeddings, vector store) is selected here, so moving from
the laptop demo to Tencent Cloud (TokenHub / Hunyuan, Tencent VectorDB,
PostgreSQL) is a configuration change rather than a code change.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent

ASSET_TYPES: tuple[str, ...] = ("Office", "Data Centre", "Senior Living")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "Keppel Knowledge Bridge AI"

    # --- Paths --------------------------------------------------------------
    store_dir: Path = PROJECT_ROOT / "data" / "store"
    sample_docs_dir: Path = PROJECT_ROOT / "data" / "sample_docs"
    golden_set_path: Path = PROJECT_ROOT / "data" / "eval" / "golden_set.json"
    rbac_policy_path: Path = PROJECT_ROOT / "config" / "rbac_policy.yaml"
    taxonomy_path: Path = PROJECT_ROOT / "config" / "taxonomy.yaml"
    # Any SQLAlchemy URL, e.g. postgresql+psycopg://user:pass@host/db
    database_url: str | None = None
    # Ingest the synthetic corpus on first start if the knowledge base is empty.
    auto_seed: bool = True

    # --- LLM (any OpenAI-compatible endpoint) -------------------------------
    # auto: use the API if LLM_API_KEY is set, otherwise the offline composer.
    llm_provider: Literal["auto", "openai_compatible", "extractive"] = "auto"
    llm_base_url: str = "https://tokenhub-intl.tencentcloudmaas.com/v1"
    llm_api_key: str | None = None
    llm_model: str = "hy3"
    llm_temperature: float = 0.1
    llm_max_tokens: int = 2000
    llm_timeout_s: float = 90.0
    llm_json_mode: bool = True

    # --- Embeddings ---------------------------------------------------------
    embedding_provider: Literal["local", "openai_compatible", "hash"] = "local"
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_base_url: str | None = None  # defaults to llm_base_url
    embedding_api_key: str | None = None  # defaults to llm_api_key
    embedding_batch_size: int = 32
    # Optional overrides of the embedder's similarity calibration.
    sim_floor: float | None = None
    sim_ceiling: float | None = None
    min_relevance: float | None = None

    # --- Ingestion & retrieval ---------------------------------------------
    chunk_size: int = 900
    chunk_overlap: int = 150
    pii_redaction: bool = True
    candidate_pool: int = 60
    docs_per_asset_type: int = 2
    chunks_per_doc: int = 2
    max_sources: int = 8
    graph_max_discoveries: int = 2

    @property
    def resolved_database_url(self) -> str:
        return self.database_url or f"sqlite:///{self.store_dir / 'kbridge.db'}"

    @property
    def files_dir(self) -> Path:
        return self.store_dir / "files"

    @property
    def models_dir(self) -> Path:
        return self.store_dir / "models"

    @property
    def eval_report_path(self) -> Path:
        return self.store_dir / "eval_latest.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
