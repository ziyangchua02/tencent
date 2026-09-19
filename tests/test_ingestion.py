from backend.ingestion.chunker import chunk_pages, split_sentences
from backend.ingestion.pdf_loader import PageText, extract_pages, strip_repeated_lines
from backend.ingestion.pii import redact_pii
from tests.conftest import make_pdf

import pytest


def test_chunks_never_cross_pages_and_keep_page_numbers():
    pages = [PageText(1, "Alpha sentence one. " * 60), PageText(2, "Beta sentence two. " * 60)]
    chunks = chunk_pages(pages, chunk_size=300, overlap=60)
    assert {c.page for c in chunks} == {1, 2}
    assert all("Beta" not in c.text for c in chunks if c.page == 1)
    assert all(len(c.text) <= 300 + 40 for c in chunks)
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_consecutive_chunks_overlap():
    text = " ".join(f"Sentence number {i} talks about chillers." for i in range(40))
    chunks = chunk_pages([PageText(1, text)], chunk_size=250, overlap=80)
    assert len(chunks) > 2
    first, second = (split_sentences(c.text, 250) for c in chunks[:2])
    carried = [s for s in second if s in first]
    assert carried and second[: len(carried)] == first[-len(carried):]  # next chunk opens with the previous tail
    assert sum(len(s) + 1 for s in carried) <= 80 + 1


def test_overlap_must_be_smaller_than_chunk_size():
    with pytest.raises(ValueError):
        chunk_pages([PageText(1, "text")], chunk_size=100, overlap=100)


def test_repeated_headers_and_footers_are_removed():
    pages = [
        PageText(1, "CONFIDENTIAL | Office\nReal content about chillers.\nPage 1 of 2"),
        PageText(2, "CONFIDENTIAL | Office\nOther content about lifts.\nPage 2 of 2"),
    ]
    cleaned = strip_repeated_lines(pages)
    assert cleaned[0].text == "Real content about chillers."
    assert cleaned[1].text == "Other content about lifts."


def test_pdf_extraction_returns_one_record_per_page():
    pages = extract_pages(make_pdf(["First page about cooling towers", "Second page about UPS batteries"]))
    assert [p.number for p in pages] == [1, 2]
    assert "cooling towers" in pages[0].text and "UPS" in pages[1].text


def test_pii_is_redacted():
    text = "Call Mr Tan at 9123 4567 or +65 8765-4321, email tan@example.com, NRIC S1234567D."
    redacted, counts = redact_pii(text)
    assert counts == {"EMAIL": 1, "NRIC": 1, "PHONE": 2}
    assert "9123" not in redacted and "@" not in redacted and "S1234567D" not in redacted


def test_pii_redaction_leaves_engineering_figures_alone():
    text = ("Plant 2,400 RT at 0.86 kW/RT; capex S$1,900,000; FY2024-2025; WUE 1.9 L/kWh; "
            "62,000 m3; 8 MW facility; pump P-07; chiller CH-03.")
    redacted, counts = redact_pii(text)
    assert counts == {} and redacted == text
