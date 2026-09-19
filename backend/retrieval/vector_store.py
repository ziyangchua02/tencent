"""Vector store abstraction with a FAISS implementation.

The retriever only depends on `VectorStore`, so swapping FAISS for Tencent
Cloud VectorDB (or Milvus / pgvector) means writing one adapter class.

RBAC is enforced *inside* the search call: the caller passes the ids of chunks
the user may read (`allowed_ids`) and FAISS only scores those. Restricted
vectors are never candidates, so they cannot leak through ranking side-effects.

Migrating to Tencent Cloud VectorDB (`pip install tcvectordb`):
  * one collection per environment, vector field of size `dim`, metric COSINE
  * document id = chunk id; scalar fields: doc_id, asset_type, classification, status
  * replace `allowed_ids` with a native filter built from the user's role, e.g.
    `classification in ("Technical", "Maintenance") and status = "approved"`
"""

from __future__ import annotations

import json
import threading
from abc import ABC, abstractmethod
from collections.abc import Iterable
from pathlib import Path

import faiss
import numpy as np


class VectorStore(ABC):
    @abstractmethod
    def add(self, ids: Iterable[int], vectors: np.ndarray) -> None: ...

    @abstractmethod
    def remove(self, ids: Iterable[int]) -> int: ...

    @abstractmethod
    def search(
        self, vector: np.ndarray, k: int, allowed_ids: Iterable[int] | None = None
    ) -> list[tuple[int, float]]:
        """Return up to k (id, cosine similarity) pairs, best first."""

    @abstractmethod
    def reset(self, dim: int, embedder_id: str) -> None: ...

    @abstractmethod
    def save(self) -> None: ...

    @property
    @abstractmethod
    def count(self) -> int: ...


class FaissVectorStore(VectorStore):
    """Exact inner-product search over L2-normalised vectors (= cosine similarity).

    `IndexFlatIP` is exact and fast for tens of thousands of chunks. For millions,
    swap in `IndexHNSWFlat` or a managed service without touching callers.
    """

    def __init__(self, directory: Path, dim: int, embedder_id: str):
        self._dir = Path(directory)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._index_path = self._dir / "faiss.index"
        self._meta_path = self._dir / "faiss_meta.json"
        self._lock = threading.RLock()
        self.dim = dim
        self.embedder_id = embedder_id
        self.compatible_on_load = self._load()

    def _new_index(self) -> faiss.Index:
        return faiss.IndexIDMap2(faiss.IndexFlatIP(self.dim))

    def _load(self) -> bool:
        """Load a persisted index if it was built by the same embedder; else start empty."""
        if self._index_path.exists() and self._meta_path.exists():
            meta = json.loads(self._meta_path.read_text())
            if meta.get("embedder_id") == self.embedder_id and meta.get("dim") == self.dim:
                self._index = faiss.read_index(str(self._index_path))
                return True
        self._index = self._new_index()
        return False

    @property
    def count(self) -> int:
        return int(self._index.ntotal)

    def ids(self) -> set[int]:
        with self._lock:
            return {int(i) for i in faiss.vector_to_array(self._index.id_map)}

    def reconstruct(self, vector_id: int) -> np.ndarray:
        with self._lock:
            return self._index.reconstruct(int(vector_id))

    def add(self, ids: Iterable[int], vectors: np.ndarray) -> None:
        id_array = np.asarray(list(ids), dtype=np.int64)
        if len(id_array) == 0:
            return
        vectors = np.ascontiguousarray(vectors, dtype=np.float32)
        if vectors.shape != (len(id_array), self.dim):
            raise ValueError(f"Expected vectors of shape ({len(id_array)}, {self.dim}), got {vectors.shape}")
        with self._lock:
            self._index.add_with_ids(vectors, id_array)

    def remove(self, ids: Iterable[int]) -> int:
        id_array = np.asarray(list(ids), dtype=np.int64)
        if len(id_array) == 0:
            return 0
        with self._lock:
            return int(self._index.remove_ids(faiss.IDSelectorBatch(id_array)))

    def search(
        self, vector: np.ndarray, k: int, allowed_ids: Iterable[int] | None = None
    ) -> list[tuple[int, float]]:
        query = np.ascontiguousarray(vector, dtype=np.float32).reshape(1, -1)
        with self._lock:
            total = self.count
            if total == 0 or k <= 0:
                return []
            if allowed_ids is None:
                scores, labels = self._index.search(query, min(k, total))
            else:
                allowed = np.asarray(sorted(set(allowed_ids)), dtype=np.int64)
                if len(allowed) == 0:
                    return []
                selector = faiss.IDSelectorBatch(allowed)  # keep a reference for the duration of the call
                params = faiss.SearchParameters(sel=selector)
                scores, labels = self._index.search(query, min(k, len(allowed), total), params=params)
        return [(int(i), float(s)) for i, s in zip(labels[0], scores[0]) if i != -1]

    def reset(self, dim: int, embedder_id: str) -> None:
        with self._lock:
            self.dim = dim
            self.embedder_id = embedder_id
            self._index = self._new_index()

    def save(self) -> None:
        with self._lock:
            faiss.write_index(self._index, str(self._index_path))
            self._meta_path.write_text(
                json.dumps({"embedder_id": self.embedder_id, "dim": self.dim, "count": self.count})
            )

