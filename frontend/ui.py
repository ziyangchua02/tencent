"""Visual language for the Streamlit UI: palette, badges, cards and graph renderers.

Asset classes use the first three slots of a CVD-validated categorical palette
(all-pairs validated). Colour never carries meaning alone - every coloured mark
sits next to a text label or icon. All dynamic text is HTML-escaped.
"""

from __future__ import annotations

import html
import json
import textwrap
from typing import Any

ASSET_TYPES = ("Office", "Data Centre", "Senior Living")
ASSET_COLORS = {"Office": "#2a78d6", "Data Centre": "#eb6834", "Senior Living": "#1baf7a"}
ASSET_TINTS = {"Office": "#e5effa", "Data Centre": "#fcebe4", "Senior Living": "#e0f4ec"}
ASSET_ICONS = {"Office": "🏢", "Data Centre": "🖥️", "Senior Living": "🏡"}
STATUS = {  # reserved status colours, always paired with an icon + label
    "High": ("#0ca30c", "▲"), "Medium": ("#fab219", "◆"), "Low": ("#ec835a", "▼"), "None": ("#d03b3b", "✕"),
}
INK, INK_2, MUTED, HAIRLINE, NAVY = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#0b3d62"

CSS = f"""<style>
.kb-hero {{padding:18px 22px;border-radius:14px;background:linear-gradient(120deg,{NAVY},#14557f);margin-bottom:6px}}
.kb-hero h1 {{font-size:1.55rem;margin:0;color:#fff;line-height:1.25}}
.kb-hero p {{margin:6px 0 0;color:#d9e6f2;font-size:.98rem}}
.kb-badge {{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;
  border:1px solid {HAIRLINE};background:#fff;font-size:.78rem;color:{INK};font-weight:600;white-space:nowrap;
  margin:0 6px 4px 0}}
.kb-dot {{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none}}
.kb-card {{border:1px solid {HAIRLINE};border-radius:12px;padding:14px 16px 12px;background:#fff;margin:0 0 12px;
  box-shadow:0 1px 2px rgba(11,11,11,.04)}}
.kb-card-head {{display:flex;gap:10px;align-items:baseline;margin-bottom:6px}}
.kb-num {{font-weight:700;color:{MUTED};font-size:.95rem}}
.kb-title {{font-weight:700;font-size:1.02rem;color:{INK};line-height:1.35}}
.kb-case {{font-size:.86rem;color:{INK_2};margin:2px 0 6px}}
.kb-detail {{font-size:.93rem;color:{INK};line-height:1.55;margin-top:4px}}
.kb-why, .kb-adapt {{border-radius:8px;padding:8px 11px;margin-top:8px;font-size:.88rem;line-height:1.5;color:{INK_2}}}
.kb-why {{background:#f2f6fb}} .kb-adapt {{background:#fbf7ee}}
.kb-why b, .kb-adapt b {{color:{INK}}}
.kb-cite {{margin-top:9px;display:flex;flex-direction:column;gap:3px}}
.kb-cite-item {{font-size:.82rem;color:{INK_2}}} .kb-cite-item b {{color:{INK}}}
.kb-conf-note {{font-size:.74rem;color:{MUTED};margin-top:6px}}
.kb-stats {{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 10px}}
.kb-stat {{flex:1 1 150px;border:1px solid {HAIRLINE};border-radius:12px;padding:10px 14px;background:#fff}}
.kb-stat-label {{font-size:.74rem;color:{MUTED};text-transform:uppercase;letter-spacing:.04em}}
.kb-stat-value {{font-size:1.45rem;font-weight:700;color:{INK};line-height:1.3}}
.kb-stat-sub {{font-size:.8rem;color:{INK_2}}}
.kb-gov {{border:1px dashed #c3c2b7;border-radius:10px;padding:9px 13px;font-size:.86rem;color:{INK_2};
  background:#fff;margin:4px 0 12px;line-height:1.55}}
.kb-gov b {{color:{INK}}}
.kb-summary {{font-size:1rem;line-height:1.6;background:#fff;border:1px solid {HAIRLINE};border-radius:12px;
  padding:12px 16px;color:{INK};margin-bottom:12px}}
.kb-summary .kb-meta {{font-size:.8rem;color:{MUTED};margin-top:6px}}
.kb-abstain {{border-radius:12px;padding:14px 16px;background:#fff7f5;border:1px solid #f3c9bd;color:{INK}}}
.kb-side {{font-size:.84rem;color:{INK_2};line-height:1.55}} .kb-side b {{color:{INK}}}
.kb-bridge {{border:1px solid {HAIRLINE};border-radius:10px;padding:9px 12px;background:#fff;margin-bottom:8px;
  font-size:.86rem;color:{INK_2};line-height:1.5}}
.kb-bridge-head {{font-weight:700;color:{INK};margin-bottom:3px}}
.kb-legend {{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.82rem;color:{INK_2};margin:2px 0 8px}}
.kb-lesson {{font-size:.9rem;color:{INK};line-height:1.5;margin:0 0 6px}}
</style>"""


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def pct(value: float) -> str:
    return f"{round(100 * value)}%"


# ------------------------------------------------------------------ small pieces
def hero(title: str, subtitle: str) -> str:
    return f'<div class="kb-hero"><h1>{esc(title)}</h1><p>{esc(subtitle)}</p></div>'


def asset_badge(asset_type: str | None) -> str:
    if not asset_type:
        return ""
    color = ASSET_COLORS.get(asset_type, MUTED)
    return (f'<span class="kb-badge"><span class="kb-dot" style="background:{color}"></span>'
            f'{ASSET_ICONS.get(asset_type, "")} {esc(asset_type)}</span>')


def transfer_badge(origin: str, target: str | None) -> str:
    return (f'<span class="kb-badge">🔁 Cross-asset: '
            f'<span class="kb-dot" style="background:{ASSET_COLORS.get(origin, MUTED)}"></span>{esc(origin)} → '
            f'<span class="kb-dot" style="background:{ASSET_COLORS.get(target or "", MUTED)}"></span>'
            f'{esc(target or "your asset")}</span>')


def confidence_badge(value: float, label: str) -> str:
    color, icon = STATUS.get(label, STATUS["Low"])
    return (f'<span class="kb-badge"><span style="color:{color}">{icon}</span>'
            f'Confidence {pct(value)} · {esc(label)}</span>')


def chip(text: str, icon: str = "") -> str:
    return f'<span class="kb-badge">{icon} {esc(text)}</span>'


def legend() -> str:
    items = [f'<span><span class="kb-dot" style="background:{ASSET_COLORS[a]}"></span> {ASSET_ICONS[a]} {a}</span>'
             for a in ASSET_TYPES]
    items += [f'<span style="color:{INK_2}">◆ Concept (cross-asset bridge)</span>',
              f'<span style="color:{MUTED}">▲ Building system</span>',
              f'<span style="color:{INK_2}">● Document · ■ Asset</span>']
    return f'<div class="kb-legend">{"".join(items)}</div>'


def stat(label: str, value: str, sub: str = "") -> str:
    return (f'<div class="kb-stat"><div class="kb-stat-label">{esc(label)}</div>'
            f'<div class="kb-stat-value">{value}</div><div class="kb-stat-sub">{sub}</div></div>')


def stats_row(items: list[str]) -> str:
    return f'<div class="kb-stats">{"".join(items)}</div>'


# ------------------------------------------------------------------- answer view
def answer_stats(answer: dict[str, Any]) -> str:
    sources = answer["sources"]
    asset_types = sorted({s["asset_type"] for s in sources})
    transfers = sum(1 for r in answer["recommendations"] if r["is_cross_asset"])
    color, icon = STATUS.get(answer["confidence_label"], STATUS["Low"])
    engine = ("Hunyuan / LLM", esc(answer["model"])) if answer["mode"] == "llm" else \
        ("Offline composer", "no LLM configured" if not answer.get("fallback_reason") else "LLM unavailable")
    return stats_row([
        stat("Confidence", pct(answer["confidence"]),
             f'<span style="color:{color}">{icon}</span> {esc(answer["confidence_label"])} · evidence-based'),
        stat("Evidence", str(len({s["doc_id"] for s in sources})),
             f"documents · {len(asset_types)} asset class(es)"),
        stat("Cross-asset transfers", str(transfers), "recommendations from other asset classes"),
        stat("Answer engine", engine[0], engine[1]),
        stat("Latency", f'{answer["latency_ms"]} ms' if answer["latency_ms"] < 1000
             else f'{answer["latency_ms"] / 1000:.1f} s', "retrieve + graph + generate"),
    ])


def governance_banner(answer: dict[str, Any]) -> str:
    gov = answer["governance"]
    withheld = gov["withheld_count"]
    parts = [f'🛡️ Signed in as <b>{esc(gov["user_name"])}</b> ({esc(gov["role"])}) — permitted: '
             f'{esc(", ".join(gov["permitted_classifications"]))}.']
    if withheld:
        detail = ", ".join(f"{esc(k)} ×{v}" for k, v in gov["withheld_classifications"].items())
        parts.append(f' 🔒 <b>{withheld} relevant document(s) withheld</b> by access policy ({detail}); their '
                     f'content never reached the model.')
    if gov.get("audit_id"):
        parts.append(f' 🧾 Logged as audit record <b>#{gov["audit_id"]}</b> (hash {esc(gov["audit_hash"])}…).')
    if answer.get("removed_unsupported"):
        parts.append(f' ✂️ {answer["removed_unsupported"]} uncited recommendation(s) removed.')
    return f'<div class="kb-gov">{"".join(parts)}</div>'


def summary_box(answer: dict[str, Any]) -> str:
    context = answer["context_asset_type"]
    meta = [f'Your context: {esc(context) if context else "not specified"} ({esc(answer["context_source"])})']
    if answer["query_concepts"]:
        meta.append("concepts detected: " + esc(", ".join(answer["query_concepts"])))
    return (f'<div class="kb-summary">{esc(answer["summary"])}'
            f'<div class="kb-meta">{" · ".join(meta)}</div></div>')


def recommendation_card(index: int, rec: dict[str, Any], context: str | None, sources: dict[str, dict]) -> str:
    color = ASSET_COLORS.get(rec["origin_asset_type"], MUTED)
    badges = [transfer_badge(rec["origin_asset_type"], context) if rec["is_cross_asset"]
              else asset_badge(rec["origin_asset_type"]), confidence_badge(rec["confidence"], rec["confidence_label"])]
    first = sources.get(rec["source_ids"][0], {}) if rec["source_ids"] else {}
    parts = [
        f'<div class="kb-card" style="border-left:4px solid {color}">',
        f'<div class="kb-card-head"><span class="kb-num">{index}.</span>'
        f'<span class="kb-title">{esc(rec["title"])}</span></div>',
        f'<div>{"".join(badges)}</div>',
        f'<div class="kb-case">Relevant case: <b>{esc(rec["origin_asset"])}</b>'
        f'{" — " + esc(first.get("title")) if first.get("title") else ""}</div>',
        f'<div class="kb-detail">{esc(rec["detail"])}</div>',
    ]
    if rec["is_cross_asset"] and rec["transfer_rationale"]:
        parts.append(f'<div class="kb-why"><b>Why it transfers.</b> {esc(rec["transfer_rationale"])}</div>')
    if rec["adaptation_notes"]:
        parts.append(f'<div class="kb-adapt"><b>Adapt for your asset.</b> {esc(rec["adaptation_notes"])}</div>')
    cites = "".join(
        f'<span class="kb-cite-item">📄 Source: <b>{esc(c["filename"])}</b> · Page {c["page"]} · '
        f'{esc(c["asset_name"])} ({esc(c["asset_type"])}) · [{esc(c["source_id"])}]</span>'
        for c in rec["citations"])
    parts.append(f'<div class="kb-cite">{cites}</div>')
    b = rec["confidence_breakdown"]
    parts.append(f'<div class="kb-conf-note">Confidence {pct(rec["confidence"])} = 0.60 × relevance '
                 f'{b["relevance"]:.2f} + 0.25 × corroboration {b["corroboration"]:.2f} + 0.15 × graph alignment '
                 f'{b["graph_alignment"]:.2f}</div></div>')
    return "".join(parts)


def bridge_card(bridge: dict[str, Any]) -> str:
    links = bridge["concepts"][:3] + bridge["systems"][:2]
    return (f'<div class="kb-bridge"><div class="kb-bridge-head">'
            f'{asset_badge(bridge["from_asset_type"])} → {asset_badge(bridge["to_asset_type"])}</div>'
            f'Linked through: <b>{esc(", ".join(links) or "semantic similarity")}</b> '
            f'· sources {esc(", ".join(bridge["source_ids"]))}</div>')


def source_detail(source: dict[str, Any]) -> str:
    how = "🕸️ Discovered via knowledge graph" if source["retrieval"] == "graph" else "🔎 Semantic match"
    links = source["shared_concepts"] + source["shared_systems"]
    return (f'<div class="kb-side">{asset_badge(source["asset_type"])}{chip(source["classification"], "🔒")}'
            f'{chip(how)}{chip("Relevance " + pct(source["relevance"]))}<br>'
            f'<b>{esc(source["filename"])}</b> · page {source["page"]} · {esc(source["asset_name"])} · '
            f'{esc(source["doc_date"] or "")}<br>'
            f'<i>"{esc(source["snippet"])}"</i><br>'
            f'<span style="color:{MUTED}">Graph links: {esc(", ".join(links) or "none")}</span></div>')


def abstain_box(answer: dict[str, Any]) -> str:
    return (f'<div class="kb-abstain"><b>{STATUS["None"][1]} No answer - insufficient evidence.</b> '
            f'{esc(answer["summary"])}<br><span style="color:{INK_2}">{esc(answer["gaps"])}</span></div>')


def events_chart(events: dict[str, int]):
    """Single-series horizontal bars: thin marks, rounded data-ends, recessive axes, hover tooltips."""
    import altair as alt
    import pandas as pd

    data = pd.DataFrame({"Action": list(events), "Events": list(events.values())})
    return (
        alt.Chart(data)
        .mark_bar(size=14, cornerRadiusEnd=4, color=NAVY)
        .encode(
            x=alt.X("Events:Q", title=None, axis=alt.Axis(tickMinStep=1, gridColor=HAIRLINE, domain=False,
                                                          labelColor=MUTED, tickColor=HAIRLINE)),
            y=alt.Y("Action:N", sort="-x", title=None,
                    axis=alt.Axis(labelColor=INK_2, domain=False, ticks=False, labelOverlap=False, labelLimit=220)),
            tooltip=[alt.Tooltip("Action:N"), alt.Tooltip("Events:Q")],
        )
        .properties(height=max(110, 36 * len(data)))
        .configure_view(strokeWidth=0)
    )


# ---------------------------------------------------------------- graph renderers
def _wrap(label: str, width: int = 26) -> str:
    lines = []
    for part in str(label).split("\n"):
        lines.extend(textwrap.wrap(part, width) or [""])
    return "\\n".join(line.replace("\\", "\\\\").replace('"', '\\"') for line in lines[:4])


def reasoning_dot(graph: dict[str, Any]) -> str:
    """Graphviz DOT for the per-answer path: question -> concept -> solution -> asset -> asset class."""
    lines = [
        "digraph G {",
        'rankdir=LR; bgcolor="transparent"; pad=0.15; nodesep=0.22; ranksep=0.42;',
        f'node [fontname="Helvetica", fontsize=10.5, color="#c3c2b7", fontcolor="{INK}", penwidth=1.2];',
        f'edge [fontname="Helvetica", fontsize=8.5, color="{MUTED}", fontcolor="{INK_2}", arrowsize=0.6];',
    ]
    for node in graph["nodes"]:
        asset = node.get("asset_type") or ""
        color, tint = ASSET_COLORS.get(asset, MUTED), ASSET_TINTS.get(asset, "#f1f0ec")
        style = {
            "question": f'shape=box, style="rounded,filled", fillcolor="{NAVY}", color="{NAVY}", fontcolor="white"',
            "concept": f'shape=ellipse, style=filled, fillcolor="#f1f0ec", color="{INK_2}"',
            "solution": f'shape=box, style="rounded,filled", fillcolor="{tint}", color="{color}", penwidth=1.6',
            "asset": f'shape=box, style=rounded, color="{color}", penwidth=1.6',
            "asset_class": f'shape=box, style="filled,bold", fillcolor="{tint}", color="{color}", penwidth=2.2, '
                           f'fontname="Helvetica-Bold"',
        }.get(node["kind"], "shape=box")
        label = _wrap(node["label"], 24 if node["kind"] == "solution" else 22)
        lines.append(f'"{node["id"]}" [label="{label}", {style}];')
    for edge in graph["edges"]:
        lines.append(f'"{edge["source"]}" -> "{edge["target"]}" [label="{_wrap(edge["label"], 20)}"];')
    lines.append("}")
    return "\n".join(lines)


def _script_safe(text: Any) -> str:
    """Neutralise angle brackets: labels are embedded in inline <script> JSON, so "</script>" must never survive."""
    return str(text).replace("<", "‹").replace(">", "›")


def pyvis_html(graph: dict[str, Any], height: int = 640) -> str:
    """Interactive, RBAC-filtered knowledge graph (vis-network inlined, works offline).

    Titles come from user uploads, so every string is passed through `_script_safe` first.
    """
    from pyvis.network import Network

    net = Network(height=f"{height}px", width="100%", directed=True, cdn_resources="in_line",
                  bgcolor="#fcfcfb", font_color=INK)
    for node in graph["nodes"]:
        kind, asset = node["kind"], node.get("asset_type") or ""
        color, tint = ASSET_COLORS.get(asset, MUTED), ASSET_TINTS.get(asset, "#f1f0ec")
        full = _script_safe(node["label"])
        label = full if len(full) <= 34 else full[:32] + "…"
        spec: dict[str, Any] = {"label": label, "title": f'{full} ({kind.replace("_", " ")})'}
        if kind == "asset_class":
            spec.update(shape="box", color={"background": tint, "border": color}, borderWidth=3,
                        font={"size": 22, "bold": True}, mass=3)
        elif kind == "asset":
            spec.update(shape="box", color={"background": "#ffffff", "border": color}, borderWidth=2,
                        font={"size": 15})
        elif kind == "document":
            spec.update(shape="dot", size=13, color={"background": color, "border": color},
                        title=f'{full} · {_script_safe(node.get("classification") or "")}')
        elif kind == "concept":
            spec.update(shape="diamond", size=16, color={"background": INK_2, "border": INK_2},
                        font={"size": 15, "bold": True})
        elif kind == "system":
            spec.update(shape="triangle", size=11, color={"background": MUTED, "border": MUTED})
        elif kind in ("problem", "solution"):
            spec.update(shape="dot", size=7, color={"background": tint, "border": color}, font={"size": 11})
        net.add_node(node["id"], **spec)
    for edge in graph["edges"]:
        net.add_edge(edge["source"], edge["target"], title=_script_safe(edge["label"]))
    net.set_options(json.dumps({
        "physics": {"solver": "forceAtlas2Based",
                    "forceAtlas2Based": {"gravitationalConstant": -70, "springLength": 120,
                                         "springConstant": 0.05, "avoidOverlap": 0.5},
                    "stabilization": {"iterations": 300}},
        "interaction": {"hover": True, "tooltipDelay": 120},
        "edges": {"smooth": False, "width": 1, "color": {"color": "#c3c2b7", "highlight": NAVY, "hover": NAVY},
                  "arrows": {"to": {"enabled": True, "scaleFactor": 0.4}}},
        "nodes": {"font": {"face": "system-ui, -apple-system, Segoe UI, sans-serif", "color": INK}},
    }))
    return net.generate_html()


def architecture_dot() -> str:
    return f"""digraph A {{
rankdir=LR; bgcolor="transparent"; nodesep=0.3; ranksep=0.5;
node [shape=box, style="rounded,filled", fillcolor="#ffffff", color="#c3c2b7", fontname="Helvetica", fontsize=10.5];
edge [color="{MUTED}", arrowsize=0.6, fontname="Helvetica", fontsize=8.5, fontcolor="{INK_2}"];
user [label="Engineer / Manager /\\nKnowledge Steward\\n(simulated SSO)", fillcolor="{NAVY}", fontcolor="white", color="{NAVY}"];
ui [label="Streamlit UI"];
api [label="FastAPI\\nRBAC dependency on every route"];
subgraph cluster_ingest {{ label="Ingestion"; fontname="Helvetica-Bold"; fontsize=10; color="#e1e0d9";
  pdf [label="PDF upload /\\nexpert lesson"]; extract [label="PyPDF text\\n+ header/footer strip"];
  pii [label="PII redaction"]; chunk [label="Page-aware\\nchunking"]; tag [label="Concept tagging\\n(taxonomy)"];
  pdf -> extract -> pii -> chunk -> tag; }}
subgraph cluster_know {{ label="Knowledge layer"; fontname="Helvetica-Bold"; fontsize=10; color="#e1e0d9";
  vec [label="FAISS vectors\\n(bge-small / TokenHub)"]; kg [label="Knowledge graph\\n(NetworkX, SKOS/Brick-style)"];
  db [label="SQLite / PostgreSQL\\ndocs · pages · chunks"]; }}
subgraph cluster_answer {{ label="Answering"; fontname="Helvetica-Bold"; fontsize=10; color="#e1e0d9";
  retr [label="RBAC pre-filtered\\nsemantic search"]; disc [label="Graph discovery\\n(cross-asset bridges)"];
  llm [label="Hunyuan via TokenHub\\n(OpenAI-compatible)\\nor offline composer"]; verify [label="Citation check +\\nevidence confidence"];
  retr -> disc -> llm -> verify; }}
audit [label="Hash-chained\\naudit trail", fillcolor="#f2f6fb"];
evals [label="Evaluation\\nharness", fillcolor="#f2f6fb"];
user -> ui -> api; api -> pdf [label="contribute"]; tag -> vec; tag -> kg; tag -> db;
api -> retr [label="ask"]; vec -> retr; kg -> disc; verify -> api [label="cited answer"];
api -> audit [label="every action"]; evals -> api [style=dashed];
}}"""
