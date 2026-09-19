"""PDF text extraction with PyPDF, one record per page (page numbers drive citations)."""

from __future__ import annotations

import io
import math
import re
from collections import Counter
from dataclasses import dataclass

from pypdf import PdfReader

_SOFT_HYPHEN = chr(0xAD)
_CONTROL_CHARS = re.compile("[" + "".join(chr(c) for c in (*range(0, 9), 11, 12, *range(14, 32), 127)) + "]")


class PDFExtractionError(ValueError):
    """The file is not a readable, text-based PDF."""


@dataclass(frozen=True)
class PageText:
    number: int  # 1-based, as printed in citations
    text: str


def clean_text(text: str) -> str:
    text = text.replace(_SOFT_HYPHEN, "")
    text = _CONTROL_CHARS.sub("", text)  # stray control chars from unusual glyph encodings
    # Re-join words split across lines at an explicit hyphen: "air-\nconditioning".
    text = re.sub(r"(\w)-\n(\w)", r"\1-\2", text)
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _norm_line(line: str) -> str:
    return re.sub(r"\d+", "#", " ".join(line.split())).lower()


def strip_repeated_lines(pages: list[PageText], zone: int = 5) -> list[PageText]:
    """Drop running headers/footers: lines near the top or bottom that repeat on (nearly) every page.

    Digits are normalised first, so "Page 1 of 3" and "Page 2 of 3" count as the same line.
    """
    if len(pages) < 2:
        return pages
    counts: Counter[str] = Counter()
    for page in pages:
        lines = [ln for ln in page.text.split("\n") if ln.strip()]
        counts.update({_norm_line(ln) for ln in lines[:zone] + lines[-zone:]})
    needed = len(pages) if len(pages) <= 3 else math.ceil(0.8 * len(pages))
    boilerplate = {ln for ln, n in counts.items() if n >= needed and len(ln) < 200}
    if not boilerplate:
        return pages
    cleaned = []
    for page in pages:
        lines = [ln for ln in page.text.split("\n") if ln.strip()]
        kept = [ln for i, ln in enumerate(lines)
                if not ((i < zone or i >= len(lines) - zone) and _norm_line(ln) in boilerplate)]
        cleaned.append(PageText(number=page.number, text="\n".join(kept).strip()))
    return cleaned


def extract_pages(data: bytes) -> list[PageText]:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            reader.decrypt("")
        pages = []
        for number, page in enumerate(reader.pages, start=1):
            try:
                raw = page.extract_text() or ""
            except Exception:  # a single malformed page should not sink the document
                raw = ""
            pages.append(PageText(number=number, text=clean_text(raw)))
    except Exception as exc:
        raise PDFExtractionError(f"Could not read PDF: {exc}") from exc

    pages = strip_repeated_lines(pages)
    if not any(p.text for p in pages):
        raise PDFExtractionError(
            "No extractable text found. Scanned PDFs need OCR, which is not part of the MVP."
        )
    return pages
