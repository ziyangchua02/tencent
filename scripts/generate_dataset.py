"""Render the synthetic corpus to PDFs and write data/sample_docs/manifest.json.

Usage:  python -m scripts.generate_dataset

Every logical page in synthetic_corpus.py must fit on one physical PDF page, so
citation page numbers are exact; the script verifies this with PyPDF.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (ListFlowable, ListItem, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scripts.synthetic_corpus import DOCUMENTS, EXPERT_LESSONS  # noqa: E402

OUT_DIR = PROJECT_ROOT / "data" / "sample_docs"
MARGIN = 16 * mm
CLASS_COLOURS = {
    "Technical": "#1f6feb", "Maintenance": "#8250df", "Operational": "#1a7f37",
    "Financial": "#9a6700", "Strategic": "#cf222e",
}
DISCLAIMER = ("SYNTHETIC DEMO DOCUMENT - illustrative data created for the Tencent Cloud AI CAN DO IT Hackathon; "
              "not actual Keppel data.")


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.8, leading=13.6,
                          spaceAfter=5)
    return {
        "title": ParagraphStyle("title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=16.5,
                                leading=20, alignment=TA_LEFT, spaceAfter=3, textColor=colors.HexColor("#0b1f33")),
        "subtitle": ParagraphStyle("subtitle", parent=body, fontSize=10.5, textColor=colors.HexColor("#57606a"),
                                   spaceAfter=8),
        "h": ParagraphStyle("h", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=11.8, leading=15,
                            spaceBefore=7, spaceAfter=4, textColor=colors.HexColor("#0b3d62")),
        "p": body,
        "li": ParagraphStyle("li", parent=body, spaceAfter=2.5),
        "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.8, leading=11.2),
        "cell_head": ParagraphStyle("cell_head", fontName="Helvetica-Bold", fontSize=8.8, leading=11.2,
                                    textColor=colors.white),
    }


def _table(rows: list[list[str]], styles: dict[str, ParagraphStyle], width: float) -> Table:
    columns = len(rows[0])
    longest = [max(len(str(r[c])) for r in rows) for c in range(columns)]
    weights = [max(12, min(n, 60)) for n in longest]
    widths = [width * w / sum(weights) for w in weights]
    data = [[Paragraph(escape(str(cell)), styles["cell_head" if i == 0 else "cell"]) for cell in row]
            for i, row in enumerate(rows)]
    table = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0b3d62")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f6f9")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c9d1d9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


def _meta_table(doc_meta: dict, styles: dict[str, ParagraphStyle], width: float) -> Table:
    rows = [
        ("Document ID", doc_meta["id"]), ("Category", doc_meta["category"]),
        ("Classification", doc_meta["classification"]), ("Date", doc_meta["doc_date"]),
        ("Prepared by", doc_meta["author"]),
    ]
    data = [[Paragraph(f"<b>{escape(k)}</b>", styles["cell"]), Paragraph(escape(v), styles["cell"])] for k, v in rows]
    table = Table(data, colWidths=[32 * mm, width - 32 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2f6")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c9d1d9")),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    return table


def _page_decorator(doc_meta: dict, total_pages: int):
    colour = colors.HexColor(CLASS_COLOURS[doc_meta["classification"]])

    def draw(canvas, doc) -> None:
        width, height = A4
        canvas.saveState()
        canvas.setFillColor(colour)
        canvas.rect(0, height - 11 * mm, width, 11 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 8.8)
        canvas.drawString(MARGIN, height - 7.2 * mm,
                          f"{doc_meta['classification'].upper()}  |  {doc_meta['asset_type']}  |  "
                          f"{doc_meta['asset_name']}")
        canvas.drawRightString(width - MARGIN, height - 7.2 * mm, doc_meta["id"])
        canvas.setFillColor(colors.HexColor("#6e7781"))
        canvas.setFont("Helvetica", 7.2)
        canvas.drawString(MARGIN, 9 * mm, DISCLAIMER)
        canvas.drawRightString(width - MARGIN, 9 * mm, f"Page {doc.page} of {total_pages}")
        canvas.restoreState()

    return draw


def render_pdf(doc_meta: dict, path: Path) -> None:
    styles = _styles()
    frame_width = A4[0] - 2 * MARGIN
    story = [
        Paragraph(escape(doc_meta["title"]), styles["title"]),
        Paragraph(escape(f"{doc_meta['asset_name']}  ·  {doc_meta['asset_type']}  ·  {doc_meta['location']}"),
                  styles["subtitle"]),
        _meta_table(doc_meta, styles, frame_width),
        Spacer(1, 6),
    ]
    for page_index, page in enumerate(doc_meta["pages"]):
        if page_index:
            story.append(PageBreak())
        for kind, content in page:
            if kind == "h":
                story.append(Paragraph(escape(content), styles["h"]))
            elif kind == "p":
                story.append(Paragraph(escape(content), styles["p"]))
            elif kind == "ul":
                story.append(ListFlowable(
                    [ListItem(Paragraph(escape(item), styles["li"]), leftIndent=12) for item in content],
                    bulletType="bullet", start="•", leftIndent=12, bulletFontName="Helvetica",
                    bulletFontSize=8))
            elif kind == "table":
                story.append(_table(content, styles, frame_width))
                story.append(Spacer(1, 6))
            else:
                raise ValueError(f"Unknown block type {kind!r} in {doc_meta['id']}")

    decorator = _page_decorator(doc_meta, len(doc_meta["pages"]))
    pdf = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                            topMargin=18 * mm, bottomMargin=16 * mm, title=doc_meta["title"],
                            author=doc_meta["author"], subject=f"{doc_meta['asset_type']} - {doc_meta['category']}")
    pdf.build(story, onFirstPage=decorator, onLaterPages=decorator)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_docs, overflow = [], []
    for doc in DOCUMENTS:
        path = OUT_DIR / doc["filename"]
        render_pdf(doc, path)
        actual = len(PdfReader(str(path)).pages)
        if actual != len(doc["pages"]):
            overflow.append(f"{doc['id']}: expected {len(doc['pages'])} pages, rendered {actual}")
        manifest_docs.append({k: v for k, v in doc.items() if k != "pages"} | {"num_pages": len(doc["pages"])})
        print(f"  {doc['id']:7s} {doc['classification']:11s} {doc['asset_type']:13s} {path.name}")
    for lesson in EXPERT_LESSONS:
        manifest_docs.append(dict(lesson))
        print(f"  {lesson['id']:7s} {lesson['classification']:11s} {lesson['asset_type']:13s} (expert lesson)")

    manifest = {
        "description": "Synthetic Keppel-like multi-asset knowledge corpus for the Knowledge Bridge demo",
        "disclaimer": DISCLAIMER,
        "documents": manifest_docs,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(DOCUMENTS)} PDFs + {len(EXPERT_LESSONS)} expert lessons to {OUT_DIR}")
    if overflow:
        raise SystemExit("Page overflow - shorten these pages:\n  " + "\n  ".join(overflow))


if __name__ == "__main__":
    main()
