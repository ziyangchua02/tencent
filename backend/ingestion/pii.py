"""Lightweight PII redaction applied before anything is indexed (PDPA-minded).

Maintenance logs and incident reports often contain technician phone numbers,
e-mails or NRIC numbers. These add no knowledge value, so they are masked at
ingestion and never reach embeddings, prompts or citations. For production,
swap in a dedicated service (e.g. Microsoft Presidio or Tencent Cloud DLP).
"""

from __future__ import annotations

import re

_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("EMAIL", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("NRIC", re.compile(r"\b[STFGM]\d{7}[A-Z]\b")),
    # Singapore numbers: optional +65, then 8 digits starting with 6/8/9 ("9123 4567").
    ("PHONE", re.compile(r"(?<![\w.])(?:\+65[\s-]?)?[689]\d{3}[\s-]?\d{4}(?![\w.])")),
)


def redact_pii(text: str) -> tuple[str, dict[str, int]]:
    """Return the redacted text and a count of replacements per PII type."""
    counts: dict[str, int] = {}
    for label, pattern in _PATTERNS:
        text, n = pattern.subn(f"[REDACTED-{label}]", text)
        if n:
            counts[label] = counts.get(label, 0) + n
    return text, counts
