"""Embedding providers behind one interface.

- local              : BAAI/bge-small-en-v1.5 via fastembed (ONNX, CPU, no GPU/torch needed)
- openai_compatible  : any OpenAI-style /embeddings API, e.g. Tencent TokenHub
                       `kinfra-text-embedding-0.6b` (1024-d)
- hash               : dependency-free hashing embedder, used offline or as a fallback

Each embedder carries a similarity calibration (floor/ceiling/min_relevance),
because cosine scores are not comparable across models. Retrieval thresholds
and confidence scores read these values instead of hard-coding numbers.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
from abc import ABC, abstractmethod
from collections import Counter
from collections.abc import Sequence
from pathlib import Path

import numpy as np

from backend.config import Settings

log = logging.getLogger(__name__)

# Bump when the text that gets embedded changes (e.g. chunk header format) to force a re-index.
INDEX_SCHEMA_VERSION = 1


def l2_normalize(matrix: np.ndarray) -> np.ndarray:
    matrix = np.asarray(matrix, dtype=np.float32)
    if matrix.ndim == 1:
        matrix = matrix.reshape(1, -1)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return matrix / norms


class Embedder(ABC):
    provider: str = "base"
    model: str = ""
    dim: int = 0
    # cosine similarity of an unrelated passage / a strong match / minimum to count as evidence
    sim_floor: float = 0.3
    sim_ceiling: float = 0.8
    min_relevance: float = 0.5

    @property
    def id(self) -> str:
        return f"{self.provider}:{self.model}:{self.dim}:v{INDEX_SCHEMA_VERSION}"

    @abstractmethod
    def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        """Return an (n, dim) float32 matrix of L2-normalised vectors."""

    @abstractmethod
    def embed_query(self, text: str) -> np.ndarray:
        """Return a (dim,) float32 L2-normalised vector."""

    def calibrate(self, settings: Settings) -> "Embedder":
        if settings.sim_floor is not None:
            self.sim_floor = settings.sim_floor
        if settings.sim_ceiling is not None:
            self.sim_ceiling = settings.sim_ceiling
        if settings.min_relevance is not None:
            self.min_relevance = settings.min_relevance
        return self

    def describe(self) -> dict:
        return {"provider": self.provider, "model": self.model, "dim": self.dim}


class FastEmbedEmbedder(Embedder):
    provider = "local"
    sim_floor = 0.45
    sim_ceiling = 0.78
    min_relevance = 0.56
    _BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "

    def __init__(self, model: str, cache_dir: Path, batch_size: int = 32):
        from fastembed import TextEmbedding  # imported lazily: optional dependency

        self.model = model
        self._batch_size = batch_size
        self._engine = TextEmbedding(model_name=model, cache_dir=str(cache_dir))
        self._query_prefix = self._BGE_QUERY_INSTRUCTION if "bge" in model.lower() else ""
        self.dim = int(len(next(iter(self._engine.embed(["dimension probe"])))))

    def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        vectors = list(self._engine.embed(list(texts), batch_size=self._batch_size))
        return l2_normalize(np.vstack(vectors))

    def embed_query(self, text: str) -> np.ndarray:
        vector = next(iter(self._engine.embed([self._query_prefix + text])))
        return l2_normalize(vector)[0]


class OpenAICompatibleEmbedder(Embedder):
    provider = "openai_compatible"
    sim_floor = 0.35
    sim_ceiling = 0.80
    min_relevance = 0.50

    def __init__(self, base_url: str, api_key: str | None, model: str, batch_size: int = 16, timeout: float = 60):
        from openai import OpenAI

        self.model = model
        self._batch_size = batch_size
        self._client = OpenAI(base_url=base_url, api_key=api_key or "not-needed", timeout=timeout, max_retries=2)
        self.dim = int(self._embed(["dimension probe"]).shape[1])

    def _embed(self, texts: Sequence[str]) -> np.ndarray:
        rows: list[list[float]] = []
        for start in range(0, len(texts), self._batch_size):
            batch = list(texts[start : start + self._batch_size])
            response = self._client.embeddings.create(model=self.model, input=batch, encoding_format="float")
            rows.extend(item.embedding for item in sorted(response.data, key=lambda d: d.index))
        return l2_normalize(np.array(rows, dtype=np.float32))

    def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        return self._embed(texts)

    def embed_query(self, text: str) -> np.ndarray:
        return self._embed([text])[0]


_STOPWORDS = frozenset(
    "a an and are as at be by for from has have how in is it its of on or our that the their this to was we "
    "were what when where which who why will with can could should would do does did not no".split()
)


class HashingEmbedder(Embedder):
    """Signed feature hashing over unigrams + bigrams (lexical, deterministic, no downloads)."""

    provider = "hash"
    sim_floor = 0.05
    sim_ceiling = 0.35
    min_relevance = 0.11

    def __init__(self, dim: int = 2048):
        self.model = f"feature-hashing-{dim}"
        self.dim = dim

    @staticmethod
    def _tokens(text: str) -> list[str]:
        words = [w for w in re.findall(r"[a-z0-9]+(?:/[a-z0-9]+)?", text.lower()) if w not in _STOPWORDS]
        # light stemming so "failures"/"failure" and "cooling"/"cooled" collide
        stems = [re.sub(r"(ing|ed|es|s)$", "", w) if len(w) > 4 else w for w in words]
        return stems + [f"{a}_{b}" for a, b in zip(stems, stems[1:])]

    def _vector(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dim, dtype=np.float32)
        for token, count in Counter(self._tokens(text)).items():
            digest = hashlib.blake2b(token.encode(), digest_size=8).digest()
            value = int.from_bytes(digest, "little")
            sign = 1.0 if (value >> 63) & 1 else -1.0
            vec[value % self.dim] += sign * (1.0 + math.log(count))
        return vec

    def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        return l2_normalize(np.vstack([self._vector(t) for t in texts]))

    def embed_query(self, text: str) -> np.ndarray:
        return l2_normalize(self._vector(text))[0]


def build_embedder(settings: Settings) -> Embedder:
    """Create the configured embedder, degrading to hashing so the demo never hard-fails."""
    provider = settings.embedding_provider
    try:
        if provider == "local":
            embedder: Embedder = FastEmbedEmbedder(
                settings.embedding_model, settings.models_dir, settings.embedding_batch_size
            )
        elif provider == "openai_compatible":
            embedder = OpenAICompatibleEmbedder(
                base_url=settings.embedding_base_url or settings.llm_base_url,
                api_key=settings.embedding_api_key or settings.llm_api_key,
                model=settings.embedding_model,
                batch_size=min(settings.embedding_batch_size, 16),
            )
        else:
            embedder = HashingEmbedder()
    except Exception as exc:  # network down, model not downloadable, bad key...
        log.warning("Embedding provider %r unavailable (%s); falling back to hashing embedder.", provider, exc)
        embedder = HashingEmbedder()
    return embedder.calibrate(settings)
