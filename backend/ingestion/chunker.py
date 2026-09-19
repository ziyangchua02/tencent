"""Page-aware, sentence-aligned chunking.

Chunks never cross a page boundary, so every retrieved passage maps to exactly
one page number for its citation. Consecutive chunks share a small sentence
overlap so that facts sitting on a chunk boundary are not lost.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from backend.ingestion.pdf_loader import PageText

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?;])\s+(?=[\"'(\[A-Z0-9•-])")
_MIN_CHUNK_CHARS = 40


@dataclass(frozen=True)
class TextChunk:
    page: int
    index: int  # position within the document
    text: str


def split_sentences(text: str, max_len: int) -> list[str]:
    flat = re.sub(r"\s+", " ", text).strip()
    if not flat:
        return []
    sentences: list[str] = []
    for sentence in _SENTENCE_BOUNDARY.split(flat):
        # Hard-wrap run-on text (e.g. flattened tables) so no unit exceeds max_len.
        while len(sentence) > max_len:
            cut = sentence.rfind(" ", 0, max_len)
            cut = cut if cut > max_len // 2 else max_len
            sentences.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if sentence:
            sentences.append(sentence)
    return sentences


def _chunk_page(text: str, chunk_size: int, overlap: int) -> list[str]:
    sentences = split_sentences(text, max_len=chunk_size)
    chunks: list[str] = []
    current: list[str] = []
    fresh = 0  # sentences in `current` that are not overlap carried from the previous chunk
    for sentence in sentences:
        if current and fresh and len(" ".join([*current, sentence])) > chunk_size:
            chunks.append(" ".join(current))
            carried: list[str] = []
            for prev in reversed(current):
                if sum(len(s) + 1 for s in carried) + len(prev) > overlap:
                    break
                carried.insert(0, prev)
            current, fresh = carried, 0
        current.append(sentence)
        fresh += 1
    if current and fresh:
        chunks.append(" ".join(current))
    return [c for c in chunks if len(c) >= _MIN_CHUNK_CHARS]


def chunk_pages(pages: list[PageText], chunk_size: int = 900, overlap: int = 150) -> list[TextChunk]:
    if overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")
    result: list[TextChunk] = []
    for page in pages:
        for text in _chunk_page(page.text, chunk_size, overlap):
            result.append(TextChunk(page=page.number, index=len(result), text=text))
    return result
