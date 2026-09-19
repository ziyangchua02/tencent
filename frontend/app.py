"""Keppel Knowledge Bridge AI - Streamlit demo UI.

Run (from the project root, with the API running on :8000):
    streamlit run frontend/app.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
import streamlit as st
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))  # allow `streamlit run frontend/app.py`
load_dotenv(PROJECT_ROOT / ".env")

from frontend import ui  # noqa: E402
from frontend.api_client import APIError, KnowledgeBridgeAPI  # noqa: E402

API_URL = os.environ.get("KB_API_URL", "http://localhost:8000")
ASSET_TYPES = list(ui.ASSET_TYPES)
PAYBACK = "What was the payback period of the chiller plant retrofit and should we replicate it?"
SCENARIOS = [
    {"label": "🧊 DC cooling energy", "user": "alex.tan",
     "question": "How can we reduce cooling energy consumption in our data centre?",
     "note": "An office chiller retrofit transfers to a data centre"},
    {"label": "🛗 Lift breakdowns", "user": "priya.nair",
     "question": "Our lifts keep breaking down and residents are getting stranded. How can we reduce lift downtime?",
     "note": "The graph links breakdowns to predictive maintenance in other asset classes"},
    {"label": "🌡️ Setpoint lessons", "user": "daniel.ong",
     "question": "What went wrong when temperature setpoints were raised, and how do we avoid complaints?",
     "note": "The same lesson was learned in three asset classes"},
    {"label": "🔒 Payback · Engineer", "user": "alex.tan", "question": PAYBACK,
     "note": "RBAC: financial documents are withheld from engineers"},
    {"label": "💰 Payback · Manager", "user": "marcus.lee", "question": PAYBACK,
     "note": "RBAC: the manager sees the business case"},
    {"label": "⚡ Power outages", "user": "priya.nair",
     "question": "How should we prepare for power outages to protect residents and critical equipment?",
     "note": "Senior living learns from data-centre UPS practice"},
]

st.set_page_config(page_title="Keppel Knowledge Bridge AI", page_icon="🌉", layout="wide")
st.html(ui.CSS)


@st.cache_resource
def get_api() -> KnowledgeBridgeAPI:
    return KnowledgeBridgeAPI(API_URL)


api = get_api()


@st.cache_data(ttl=10, show_spinner=False)
def cached_health() -> dict:
    return api.health()


@st.cache_data(ttl=300, show_spinner=False)
def cached_users() -> list[dict]:
    return api.users()


@st.cache_data(ttl=20, show_spinner=False)
def cached_documents(user_id: str) -> list[dict]:
    return api.documents(user_id)


@st.cache_data(ttl=120, show_spinner=False)
def cached_meta(user_id: str) -> dict:
    return api.meta(user_id)


def refresh_caches() -> None:
    cached_documents.clear()
    cached_health.clear()
    cached_meta.clear()


# ---------------------------------------------------------------- bootstrap
try:
    USERS = cached_users()
    HEALTH = cached_health()
except APIError as exc:
    st.html(ui.hero("Keppel Knowledge Bridge AI", "Governed cross-asset knowledge intelligence"))
    st.error(exc.detail)
    st.info("Start the backend first (from the project root):\n\n`uvicorn backend.main:app --reload`")
    st.stop()

USERS_BY_ID = {u["id"]: u for u in USERS}
st.session_state.setdefault("user_id", USERS[0]["id"])
# `?user=marcus.lee` opens the app as that persona - handy for side-by-side RBAC demos.
requested = st.query_params.get("user")
if requested in USERS_BY_ID and st.session_state.get("_user_from_url") != requested:
    st.session_state.user_id = st.session_state._user_from_url = requested
for key, default in {"question_input": "", "context_input": "Auto-detect", "filter_input": ASSET_TYPES,
                     "cross_input": True, "answers": {}}.items():
    st.session_state.setdefault(key, default)


def current_user() -> dict:
    return USERS_BY_ID[st.session_state.user_id]


def can(permission: str) -> bool:
    return permission in current_user()["permissions"]


with st.sidebar:
    st.selectbox("Signed in as (simulated SSO)", list(USERS_BY_ID), key="user_id",
                 format_func=lambda uid: f"{USERS_BY_ID[uid]['name']} · {USERS_BY_ID[uid]['role']}")
    st.query_params["user"] = st.session_state._user_from_url = st.session_state.user_id
    me = current_user()
    st.html(
        f'<div class="kb-side"><b>{ui.esc(me["title"])}</b><br>'
        f'{ui.asset_badge(me["home_asset_type"]) if me["home_asset_type"] else ui.chip("All asset classes", "🌐")}'
        f'<br>Role: <b>{ui.esc(me["role"])}</b><br>Can read: '
        f'{"".join(ui.chip(c, "🔓") for c in me["classifications"])}</div>')
    st.divider()
    llm = HEALTH["llm"]
    engine = f"{llm['model']}" if llm["enabled"] else "offline composer (no LLM key)"
    docs = HEALTH["documents"]
    st.html(
        f'<div class="kb-side"><b>System</b><br>🧠 LLM: {ui.esc(engine)}<br>'
        f'🔢 Embeddings: {ui.esc(HEALTH["embedder"]["model"])}<br>'
        f'📚 {docs.get("approved", 0)} approved items · {HEALTH["chunks"]} chunks'
        f'{" · " + str(docs["pending"]) + " pending review" if docs.get("pending") else ""}<br>'
        f'🕸️ Graph: {HEALTH["graph"]["nodes"]} nodes · {HEALTH["graph"]["edges"]} edges<br>'
        f'🛡️ PII redaction: {"on" if HEALTH["pii_redaction"] else "off"}</div>')
    st.caption(f"API: {API_URL}")


# ----------------------------------------------------------------- ask page
def load_scenario(scenario: dict) -> None:
    st.session_state.user_id = scenario["user"]
    st.session_state.question_input = scenario["question"]
    st.session_state.context_input = "Auto-detect"
    st.session_state.filter_input = ASSET_TYPES
    st.session_state.cross_input = True
    st.session_state.run_now = True


def send_feedback(user_id: str, answer_id: int, key: str) -> None:
    value = st.session_state.get(key)
    if value is None:
        return
    try:
        api.feedback(user_id, answer_id, 1 if value == 1 else -1)
        st.toast("Thanks - feedback recorded in the audit trail.", icon="🧾")
    except APIError as exc:
        st.toast(f"Feedback failed: {exc.detail}", icon="⚠️")


@st.dialog("Source page", width="large")
def show_page(user_id: str, source: dict) -> None:
    try:
        page = api.page(user_id, source["doc_id"], source["page"])
    except APIError as exc:
        st.error(exc.detail)
        return
    st.html(f'<div class="kb-side">{ui.asset_badge(source["asset_type"])}{ui.chip(source["classification"], "🔒")}'
            f'<br><b>{ui.esc(page["title"])}</b> - page {page["page"]} of {page["num_pages"]} · '
            f'{ui.esc(source["filename"])}</div>')
    st.text(page["text"])
    if source["source_type"] == "document":
        st.download_button("Download original PDF", data=lambda: api.file(user_id, source["doc_id"]),
                           file_name=source["filename"], mime="application/pdf", icon="📄")
    st.caption("Opening a source is recorded in the audit trail.")


def render_answer(answer: dict, user: dict) -> None:
    st.divider()
    if answer["abstained"]:
        st.html(ui.abstain_box(answer))
        st.html(ui.governance_banner(answer))
        return
    st.html(ui.answer_stats(answer))
    st.html(ui.governance_banner(answer))
    st.html(ui.summary_box(answer))

    sources = {s["source_id"]: s for s in answer["sources"]}
    left, right = st.columns([3, 2], gap="large")
    with left:
        st.subheader("Recommendations")
        for index, rec in enumerate(answer["recommendations"], start=1):
            st.html(ui.recommendation_card(index, rec, answer["context_asset_type"], sources))
    with right:
        st.subheader("Why these results")
        if answer["bridges"]:
            st.markdown("**Cross-asset bridges**")
            for bridge in answer["bridges"]:
                st.html(ui.bridge_card(bridge))
        if answer["lessons_learned"]:
            st.markdown("**Lessons learned**")
            for lesson in answer["lessons_learned"]:
                st.html(f'<div class="kb-lesson">• {ui.esc(lesson)}</div>')
        if answer["gaps"]:
            st.caption(f"Gaps & caveats: {answer['gaps']}")

    st.subheader("Knowledge-graph path")
    st.caption("How the graph connects your question to proven solutions in each asset class: "
               "question → shared concept → solution → asset → asset class.")
    st.graphviz_chart(ui.reasoning_dot(answer["reasoning_graph"]), width="stretch")

    st.subheader("Evidence")
    st.caption("Every passage the answer may cite, with where it came from and how it was found.")
    for source in answer["sources"]:
        label = (f"[{source['source_id']}] {source['title']} - p.{source['page']} · {source['asset_name']} "
                 f"({source['asset_type']}){' · 🕸️ graph' if source['retrieval'] == 'graph' else ''}")
        with st.expander(label):
            st.html(ui.source_detail(source))
            if st.button("View full page", key=f"view_{answer['answer_id']}_{source['source_id']}", icon="📖"):
                show_page(user["id"], source)

    if answer["answer_id"]:
        st.caption("Was this answer helpful? Your feedback improves the knowledge base.")
        key = f"feedback_{answer['answer_id']}"
        st.feedback("thumbs", key=key, on_change=send_feedback, args=(user["id"], answer["answer_id"], key))


def page_ask() -> None:
    user = current_user()
    # `?q=...` deep-links a question (bookmarkable demo scenarios); it runs once per distinct value.
    url_question = st.query_params.get("q")
    if url_question and st.session_state.get("_q_from_url") != url_question:
        st.session_state._q_from_url = st.session_state.question_input = url_question
        st.session_state.run_now = True
    st.html(ui.hero("Ask across every asset class",
                    "Find proven solutions and lessons learned from offices, data centres and senior living - "
                    "with citations, permissions and an audit trail."))
    st.caption("Demo scenarios (each signs in as the right persona)")
    columns = st.columns(len(SCENARIOS))
    for column, scenario in zip(columns, SCENARIOS):
        persona = USERS_BY_ID[scenario["user"]]["name"]
        column.button(scenario["label"], key=f"scenario_{scenario['label']}", on_click=load_scenario,
                      args=(scenario,), help=f"{scenario['note']} - asks as {persona}", width="stretch")

    with st.form("ask_form"):
        st.text_area("Your question", key="question_input", height=90,
                     placeholder="e.g. How can we reduce cooling energy consumption in our data centre?")
        c1, c2, c3 = st.columns([1.2, 2.2, 1.2])
        c1.selectbox("I'm working on", ["Auto-detect", *ASSET_TYPES], key="context_input",
                     help="Your asset class. Auto-detect reads it from the question, then your profile.")
        c2.multiselect("Search across", ASSET_TYPES, key="filter_input")
        c3.toggle("Cross-asset discovery", key="cross_input",
                  help="Include evidence and knowledge-graph discoveries from other asset classes")
        submitted = st.form_submit_button("Ask Knowledge Bridge", type="primary", icon="🔎")

    if submitted or st.session_state.pop("run_now", False):
        question = st.session_state.question_input.strip()
        if len(question) < 3:
            st.warning("Please type a question first.")
        else:
            context = None if st.session_state.context_input == "Auto-detect" else st.session_state.context_input
            chosen = st.session_state.filter_input
            asset_filter = None if not chosen or set(chosen) == set(ASSET_TYPES) else chosen
            with st.spinner("Searching permitted knowledge, walking the graph and composing a cited answer…"):
                try:
                    answer = api.ask(user["id"], question, context, asset_filter, st.session_state.cross_input)
                    st.session_state.answers[user["id"]] = answer  # answers are kept per user: no cross-role leaks
                except APIError as exc:
                    st.error(exc.detail)

    answer = st.session_state.answers.get(user["id"])
    if answer:
        render_answer(answer, user)


# ----------------------------------------------------------- knowledge graph
def page_graph() -> None:
    user = current_user()
    st.html(ui.hero("Knowledge graph",
                    "Assets, documents, problems and solutions linked through shared concepts and building "
                    "systems - filtered to what you are allowed to see."))
    c1, c2 = st.columns([3, 1])
    selected = c1.multiselect("Asset classes", ASSET_TYPES, default=ASSET_TYPES, key="graph_assets")
    detailed = c2.toggle("Show problems, solutions & systems", value=False)
    try:
        graph = api.graph(user["id"], selected or None, detailed)
    except APIError as exc:
        st.error(exc.detail)
        return
    documents = sum(1 for n in graph["nodes"] if n["kind"] == "document")
    st.html(ui.stats_row([
        ui.stat("Visible documents", str(documents), f"for {ui.esc(user['role'])}"),
        ui.stat("Nodes · edges", f'{len(graph["nodes"])} · {len(graph["edges"])}', "in this view"),
        ui.stat("Cross-asset concepts", str(len(graph["bridges"])), "concepts shared by 2+ asset classes"),
    ]))
    st.html(ui.legend())
    st.iframe(ui.pyvis_html(graph, height=620), height=640)

    left, right = st.columns([2, 3], gap="large")
    with left:
        st.subheader("Cross-asset bridges")
        if graph["bridges"]:
            st.dataframe(pd.DataFrame([{"Concept": b["concept"], "Asset classes": ", ".join(b["asset_types"]),
                                        "Documents": b["documents"]} for b in graph["bridges"]]),
                         hide_index=True, width="stretch")
        st.caption("Export for Neo4j or an RDF triple store (RBAC-filtered):")
        e1, e2 = st.columns(2)
        e1.download_button("GraphML (Neo4j)", data=lambda: api.export_graph(user["id"], "graphml"),
                           file_name="knowledge_graph.graphml", mime="application/xml", icon="⬇️")
        e2.download_button("Turtle (RDF)", data=lambda: api.export_graph(user["id"], "turtle"),
                           file_name="knowledge_graph.ttl", mime="text/turtle", icon="⬇️")
    with right:
        st.subheader("Who solved something like this elsewhere?")
        try:
            docs = [d for d in cached_documents(user["id"]) if d["status"] == "approved"]
        except APIError as exc:
            st.error(exc.detail)
            return
        options = {d["id"]: f"{d['id']} · {d['title']} ({d['asset_type']})" for d in docs}
        doc_id = st.selectbox("Start from a document", list(options), format_func=options.get,
                              index=list(options).index("SL-02") if "SL-02" in options else 0)
        cross_only = st.toggle("Other asset classes only", value=True)
        try:
            result = api.similar(user["id"], doc_id, cross_only)
        except APIError as exc:
            st.error(exc.detail)
            return
        for item in result["similar"]:
            shared = ", ".join(item["shared_concepts"] + item["shared_systems"]) or "semantic similarity"
            st.html(
                f'<div class="kb-bridge"><div class="kb-bridge-head">{ui.asset_badge(item["asset_type"])}'
                f'{ui.esc(item["title"])} · {ui.esc(item["asset_name"])}</div>'
                f'<b>Solution:</b> {ui.esc(item["solution"] or "-")}<br><b>Impact:</b> {ui.esc(item["impact"] or "-")}'
                f'<br><span style="color:{ui.MUTED}">Similarity {ui.pct(item["score"])} (graph '
                f'{item["graph_similarity"]:.2f} · semantic {item["semantic_similarity"]:.2f}) · shared: '
                f'{ui.esc(shared)}</span></div>')
        if not result["similar"]:
            st.info("No similar documents you are permitted to see.")


# ------------------------------------------------------------------ library
def page_library() -> None:
    user = current_user()
    st.html(ui.hero("Knowledge library",
                    "Everything you can access, plus two ways to add knowledge: upload a report or capture an "
                    "expert's lessons before they walk out of the door."))
    try:
        docs = cached_documents(user["id"])
    except APIError as exc:
        st.error(exc.detail)
        return
    table = pd.DataFrame([{
        "ID": d["id"], "Title": d["title"], "Asset class": d["asset_type"], "Asset": d["asset_name"],
        "Classification": d["classification"], "Status": d["status"],
        "Type": "Expert lesson" if d["source_type"] == "expert_lesson" else "Document",
        "Concepts": ", ".join(d["concept_labels"][:3]), "Pages": d["num_pages"],
        "PII redacted": sum(d["pii_redactions"].values()),
    } for d in docs])
    st.caption(f"{len(docs)} items visible to {user['name']} ({user['role']}). "
               f"Items at other classifications are hidden, not just greyed out.")
    st.dataframe(table, hide_index=True, width="stretch", height=360)

    if not can("contribute"):
        return
    st.subheader("Contribute knowledge")
    needs_review = not can("approve")
    if needs_review:
        st.caption("Your contributions go to the Knowledge Steward's review queue and become searchable once approved.")
    meta = cached_meta(user["id"])
    classifications = [c for c in meta["classifications"] if c in user["classifications"]]
    upload_tab, lesson_tab = st.tabs(["📄 Upload a PDF report", "🧠 Capture an expert lesson"])
    with upload_tab, st.form("upload_form", clear_on_submit=True):
        file = st.file_uploader("PDF report", type=["pdf"], key="up_file")
        c1, c2, c3 = st.columns(3)
        title = c1.text_input("Title", key="up_title")
        asset_type = c2.selectbox("Asset class", ASSET_TYPES, key="up_asset_type", index=ASSET_TYPES.index(user["home_asset_type"])
                                  if user["home_asset_type"] in ASSET_TYPES else 0)
        asset_name = c3.text_input("Asset name", placeholder="e.g. Keppel Bay Tower", key="up_asset")
        c4, c5, c6 = st.columns(3)
        category = c4.text_input("Category", placeholder="e.g. Energy Efficiency", key="up_category")
        classification = c5.selectbox("Classification (drives access control)", classifications, key="up_class")
        doc_date = c6.text_input("Date (YYYY-MM)", key="up_date")
        problem = st.text_input("Problem addressed", key="up_problem")
        solution = st.text_input("Solution applied", key="up_solution")
        impact = st.text_input("Measured impact", key="up_impact")
        if st.form_submit_button("Ingest document", type="primary", icon="📥"):
            if not (file and title and asset_name and category):
                st.warning("A PDF, title, asset name and category are required.")
            else:
                form = {"title": title, "asset_type": asset_type, "asset_name": asset_name, "category": category,
                        "classification": classification, "problem": problem, "solution": solution,
                        "impact": impact, "doc_date": doc_date}
                with st.spinner("Extracting, redacting PII, chunking, tagging concepts, embedding…"):
                    try:
                        result = api.upload(user["id"], file.name, file.getvalue(), form)
                        show_ingest_result(result)
                        refresh_caches()
                    except APIError as exc:
                        st.error(exc.detail)
    with lesson_tab, st.form("lesson_form", clear_on_submit=True):
        st.caption("A structured debrief turns tacit know-how into governed, citable knowledge.")
        c1, c2, c3 = st.columns(3)
        title = c1.text_input("Lesson title", placeholder="e.g. Pre-cool data halls before chiller switchovers", key="le_title")
        asset_type = c2.selectbox("Asset class", ASSET_TYPES, key="le_asset_type", index=ASSET_TYPES.index(user["home_asset_type"])
                                  if user["home_asset_type"] in ASSET_TYPES else 0)
        asset_name = c3.text_input("Asset name", key="le_asset")
        c4, c5 = st.columns(2)
        category = c4.text_input("Category", value="Expert Knowledge", key="le_category")
        classification = c5.selectbox("Classification", classifications, key="le_class",
                                      index=classifications.index("Operational")
                                      if "Operational" in classifications else 0)
        problem = st.text_area("What problem did you face?", height=70, key="le_problem")
        context = st.text_area("Context (equipment, conditions, constraints)", height=70, key="le_context")
        solution = st.text_area("What worked?", height=70, key="le_solution")
        impact = st.text_input("Impact (measured if possible)", key="le_impact")
        lessons = st.text_area("Rules of thumb, pitfalls, what you would tell your successor", height=90, key="le_lessons")
        if st.form_submit_button("Capture lesson", type="primary", icon="🧠"):
            payload = {"title": title, "asset_type": asset_type, "asset_name": asset_name, "category": category,
                       "classification": classification, "problem": problem, "context": context,
                       "solution": solution, "impact": impact, "lessons": lessons}
            try:
                show_ingest_result(api.lesson(user["id"], payload))
                refresh_caches()
            except APIError as exc:
                st.error(exc.detail)


def show_ingest_result(result: dict) -> None:
    (st.success if result["status"] == "approved" else st.info)(
        f"{result['doc_id']}: {result['message']} ({result['pages']} page(s), {result['chunks']} chunks)")
    concepts = "".join(ui.chip(f"{k} {v:.2f}", "◆") for k, v in list(result["concepts"].items())[:6])
    systems = "".join(ui.chip(k, "▲") for k in list(result["systems"])[:4])
    redactions = ", ".join(f"{k} ×{v}" for k, v in result["pii_redactions"].items()) or "none found"
    st.html(f'<div class="kb-side">Graph links created: {concepts}{systems}<br>PII redacted before indexing: '
            f'<b>{ui.esc(redactions)}</b></div>')


# --------------------------------------------------------------- governance
def page_governance() -> None:
    user = current_user()
    st.html(ui.hero("Governance & audit",
                    "Role-based access, human review of new knowledge, and a tamper-evident record of every "
                    "question, answer and access attempt."))
    meta = cached_meta(user["id"])
    st.subheader("Access policy")
    matrix = pd.DataFrame([{"Role": row["role"], **{c: "✅" if row[c] else "-" for c in meta["classifications"]},
                            "Permissions": ", ".join(row["permissions"])} for row in meta["rbac_matrix"]])
    st.dataframe(matrix, hide_index=True, width="stretch")
    st.caption("Enforced inside the vector search: restricted passages are never candidates, so they cannot reach "
               "the LLM, the citations or the knowledge-graph view.")

    if not can("view_audit"):
        st.info(f"The audit trail and review queue are restricted to Knowledge Stewards. You are signed in as "
                f"{user['role']}.")
        if st.button("Try to open the audit trail anyway", icon="🔐"):
            try:
                api.audit(user["id"], limit=5)
            except APIError as exc:
                st.error(f"Denied by the server ({exc.status}): {exc.detail}")
                st.caption("This attempt was itself recorded in the audit trail as ACCESS_DENIED.")
        return

    st.subheader("Review queue")
    try:
        queue = api.review_queue(user["id"])
    except APIError as exc:
        st.error(exc.detail)
        queue = []
    if not queue:
        st.caption("Nothing waiting for review. Contributions from engineers and managers appear here.")
    for item in queue:
        with st.container(border=True):
            st.html(f'<div class="kb-side">{ui.asset_badge(item["asset_type"])}{ui.chip(item["classification"], "🔒")}'
                    f'{ui.chip("Expert lesson" if item["source_type"] == "expert_lesson" else "Document")}<br>'
                    f'<b>{ui.esc(item["id"])} · {ui.esc(item["title"])}</b> - submitted by '
                    f'{ui.esc(item["submitted_by"])} · concepts: {ui.esc(", ".join(item["concept_labels"][:4]))}</div>')
            with st.expander("Preview extracted text"):
                st.text(item["preview"])
            note = st.text_input("Review note", key=f"note_{item['id']}")
            a, r, _ = st.columns([1, 1, 4])
            for column, decision, label, icon in ((a, "approve", "Approve", "✅"), (r, "reject", "Reject", "🚫")):
                if column.button(label, key=f"{decision}_{item['id']}", icon=icon):
                    try:
                        api.review(user["id"], item["id"], decision, note or None)
                    except APIError as exc:
                        st.error(exc.detail)
                    else:
                        refresh_caches()
                        st.rerun()

    try:
        summary = api.governance(user["id"])
    except APIError as exc:
        st.error(exc.detail)
        return
    st.subheader("Activity")
    c1, c2 = st.columns([3, 2], gap="large")
    with c1:
        events = summary["events_by_action"]
        if events:
            st.caption("Audit events by action")
            st.altair_chart(ui.events_chart(events), width="stretch")
    with c2:
        fb = summary["feedback"]
        redactions = ", ".join(f"{k} ×{v}" for k, v in summary["pii_redactions"].items()) or "none"
        st.html(ui.stats_row([
            ui.stat("Helpful answers", str(fb["helpful"]), f'{fb["not_helpful"]} marked not helpful'),
            ui.stat("PII redacted", str(sum(summary["pii_redactions"].values())), ui.esc(redactions)),
            ui.stat("Pending reviews", str(summary["pending_reviews"]), "awaiting a steward"),
        ]))

    st.subheader("Knowledge gaps")
    st.caption("Questions the knowledge base could not answer confidently - the capture backlog for stewards.")
    gaps = summary["knowledge_gaps"]
    if gaps:
        st.dataframe(pd.DataFrame([{"Audit #": g["audit_id"], "When": g["timestamp"][:19].replace("T", " "),
                                    "User": g["user_id"], "Question": g["question"],
                                    "Confidence": g["confidence"], "Abstained": g["abstained"],
                                    "Withheld docs": g["withheld"]} for g in gaps]),
                     hide_index=True, width="stretch")
    else:
        st.caption("No gaps recorded yet.")

    st.subheader("Audit trail")
    c1, c2, c3 = st.columns([2, 1, 2])
    action = c1.selectbox("Action", ["All", "QUERY", "ACCESS_DENIED", "VIEW_SOURCE", "UPLOAD", "CAPTURE_LESSON",
                                     "REVIEW", "FEEDBACK", "DOWNLOAD", "EXPORT_GRAPH", "EVAL_RUN"])
    limit = c2.number_input("Rows", min_value=10, max_value=1000, value=100, step=10)
    if c3.button("Verify hash chain integrity", icon="🔗"):
        check = api.audit_verify(user["id"])
        if check["valid"]:
            st.success(f"Chain intact - {check['checked']} records verified. Head hash {check['head'][:16]}…")
        else:
            st.error(f"Tampering detected at record #{check['broken_at']} after {check['checked']} valid records.")
    try:
        rows = api.audit(user["id"], limit=int(limit), action=None if action == "All" else action)
    except APIError as exc:
        st.error(exc.detail)
        return
    st.dataframe(pd.DataFrame([{
        "#": e["id"], "When (UTC)": e["timestamp"][:19].replace("T", " "), "User": e["user_id"],
        "Role": e["user_role"], "Action": e["action"], "Question": e["question"] or "",
        "Retrieved": ", ".join(sorted({r["doc_id"] for r in e["details"].get("retrieved", [])})),
        "Withheld": ", ".join(w["doc_id"] for w in e["details"].get("withheld", [])),
        "Confidence": e["details"].get("confidence"), "Hash": e["record_hash"][:12],
    } for e in rows]), hide_index=True, width="stretch", height=380)


# --------------------------------------------------------------- evaluation
def page_evaluation() -> None:
    user = current_user()
    st.html(ui.hero("Evaluation",
                    "A golden question set measures retrieval quality, cross-asset coverage, access-control "
                    "leakage, abstention and grounding - so claims are backed by numbers."))
    if can("run_eval"):
        c1, c2, _ = st.columns([1, 1, 2])
        run_fast = c1.button("Run evaluation", type="primary", icon="▶️",
                             help="Retrieval + offline composer: fast and deterministic")
        run_llm = c2.button("Run with LLM generation", icon="🧠", disabled=not HEALTH["llm"]["enabled"],
                            help="Also measures LLM citation validity and grounding (needs an LLM key)")
        if run_fast or run_llm:
            with st.spinner("Running the golden question set…"):
                try:
                    api.eval_run(user["id"], generation=run_llm)
                except APIError as exc:
                    st.error(exc.detail)
    else:
        st.caption("Only Knowledge Stewards can run the suite; showing the latest report.")
    try:
        report = api.eval_latest(user["id"])
    except APIError:
        st.info("No evaluation has been run yet. Sign in as the Knowledge Steward and click Run evaluation.")
        return
    s = report["summary"]

    def fmt(value: float | None, as_pct: bool = True) -> str:
        return "-" if value is None else (ui.pct(value) if as_pct else str(value))

    st.caption(f"Last run {report['generated_at']} · {report['mode']} · embeddings {report['embedder']['model']}")
    leak_note = (f'<span style="color:{ui.STATUS["High"][0]}">✓</span> no restricted source shown (target 0)'
                 if s["rbac_leakage"] == 0 else
                 f'<span style="color:{ui.STATUS["None"][0]}">✕</span> restricted sources were shown')
    st.html(ui.stats_row([
        ui.stat("Hit rate", fmt(s["hit_rate"]), "questions with ≥1 expected precedent"),
        ui.stat("Recall", fmt(s["recall"]), "expected precedents retrieved"),
        ui.stat("MRR", fmt(s["mrr"], False), "rank of first expected precedent"),
        ui.stat("Cross-asset coverage", fmt(s["cross_asset_coverage"]), "all expected asset classes present"),
        ui.stat("Transfer rate", fmt(s["cross_asset_transfer_rate"]), "answers with a cross-asset recommendation"),
    ]))
    st.html(ui.stats_row([
        ui.stat("RBAC leakage", str(s["rbac_leakage"]), leak_note),
        ui.stat("Abstention accuracy", fmt(s["abstention_accuracy"]), "refuses when there is no evidence"),
        ui.stat("Citation coverage", fmt(s["citation_coverage"]),
                f'{s["unsupported_removed"]} uncited recommendation(s) removed'),
        ui.stat("Groundedness", fmt(s["groundedness"]), "claims supported by cited passages"),
        ui.stat("Latency p50 / p95", f'{s["latency_p50_ms"] / 1000:.2f}s', f'p95 {s["latency_p95_ms"] / 1000:.2f}s'),
    ]))
    cases = pd.DataFrame([{
        "Case": r["id"], "Theme": r["theme"], "Asked as": f'{r["user"]} ({r["role"]})', "Question": r["question"],
        "Recall": r["recall"], "Reciprocal rank": r["reciprocal_rank"],
        "Asset classes": ", ".join(r["asset_types"]), "Cross-asset OK": r["cross_asset_ok"],
        "Leaks": len(r["leaked_docs"]) + len(r["forbidden_hits"]), "Withheld": r["withheld"],
        "Abstained": r["abstained"], "Confidence": r["confidence"], "ms": r["latency_ms"],
    } for r in report["cases"]])
    st.dataframe(cases, hide_index=True, width="stretch")
    with st.expander("How to read these metrics"):
        st.markdown(
            "- **Recall / hit rate / MRR** - were the precedents a domain expert expects retrieved, and how high?\n"
            "- **Cross-asset coverage** - did evidence span every asset class the case expects?\n"
            "- **RBAC leakage** - sources the asking role may not read, plus forbidden documents. Must be 0.\n"
            "- **Abstention accuracy** - out-of-scope questions are refused instead of answered.\n"
            "- **Citation coverage / groundedness** - every recommendation cites a passage that supports it.\n\n"
            "Caveat: the corpus and golden set are synthetic and small; they demonstrate the method, not "
            "production accuracy. Grow the golden set with real expert questions before relying on the numbers.")


# -------------------------------------------------------------------- about
def page_about() -> None:
    st.html(ui.hero("How it works",
                    "Cross-asset knowledge transfer = semantic retrieval + a knowledge graph of shared concepts, "
                    "wrapped in governance."))
    st.graphviz_chart(ui.architecture_dot(), width="stretch")
    c1, c2, c3 = st.columns(3, gap="large")
    c1.markdown("**1 · Capture**\n\nPDF reports and structured expert debriefs pass through the same pipeline: "
                "text extraction, PII redaction, page-aware chunking, concept tagging and embedding. New knowledge "
                "from non-stewards waits for review.")
    c2.markdown("**2 · Connect**\n\nA governed taxonomy of cross-asset concepts (cooling efficiency, predictive "
                "maintenance, occupant experience...) and building systems links documents from different asset "
                "classes, so a lift question can reach vibration analytics proven in a data centre.")
    c3.markdown("**3 · Answer, with evidence**\n\nPermitted passages are retrieved per asset class, the graph adds "
                "related precedents, and Hunyuan composes recommendations. Uncited claims are removed, confidence "
                "is computed from evidence, and every step is audited.")


pages = [
    st.Page(page_ask, title="Ask the Knowledge Bridge", icon="🔎", default=True),
    st.Page(page_graph, title="Knowledge graph", icon="🕸️", url_path="graph"),
    st.Page(page_library, title="Knowledge library", icon="📚", url_path="library"),
    st.Page(page_governance, title="Governance & audit", icon="🛡️", url_path="governance"),
    st.Page(page_evaluation, title="Evaluation", icon="📊", url_path="evaluation"),
    st.Page(page_about, title="How it works", icon="🧭", url_path="how-it-works"),
]
st.navigation(pages).run()
