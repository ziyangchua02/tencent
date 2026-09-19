"""End-to-end API behaviour: cross-asset answers, citations, RBAC, audit, review workflow."""

from tests.conftest import as_user, make_pdf

PAYBACK = "What was the payback period of the chiller plant retrofit and should we replicate it?"


def ask(client, user, question, **extra):
    response = client.post("/ask", json={"question": question, **extra}, headers=as_user(user))
    assert response.status_code == 200, response.text
    return response.json()


def test_health_reports_seeded_corpus(api_client):
    health = api_client.get("/health").json()
    assert health["status"] == "ok"
    assert health["documents"]["approved"] == 21
    assert health["vector_store"]["vectors"] == health["chunks"] > 0


def test_requests_without_identity_are_rejected(api_client):
    assert api_client.post("/ask", json={"question": "How do we cool?"}).status_code == 401
    assert api_client.post("/ask", json={"question": "How?"}, headers=as_user("mallory")).status_code == 401


def test_answers_are_cross_asset_and_fully_cited(api_client):
    answer = ask(api_client, "alex.tan", "How can we reduce cooling energy consumption in our data centre?")
    assert answer["context_asset_type"] == "Data Centre" and not answer["abstained"]
    source_ids = {s["source_id"] for s in answer["sources"]}
    assert {s["asset_type"] for s in answer["sources"]} >= {"Data Centre", "Office"}
    for rec in answer["recommendations"]:
        assert rec["source_ids"] and set(rec["source_ids"]) <= source_ids
        assert all(c["page"] >= 1 and c["filename"] for c in rec["citations"])
        assert 0 <= rec["confidence"] <= 1
        if rec["is_cross_asset"]:
            assert rec["transfer_rationale"].startswith("Although this solution originated from")
            assert rec["adaptation_notes"]
    assert answer["governance"]["audit_id"] is not None


def test_rbac_filters_evidence_by_role(api_client):
    engineer = ask(api_client, "alex.tan", PAYBACK)
    assert all(s["classification"] in {"Technical", "Maintenance", "Operational"} for s in engineer["sources"])
    assert engineer["governance"]["withheld_count"] >= 1
    assert "Financial" in engineer["governance"]["withheld_classifications"]

    manager = ask(api_client, "marcus.lee", PAYBACK)
    assert "OFF-05" in {s["doc_id"] for s in manager["sources"]}
    assert all(s["classification"] in {"Financial", "Strategic", "Operational"} for s in manager["sources"])


def test_out_of_scope_questions_abstain(api_client):
    answer = ask(api_client, "priya.nair", "Who won the football World Cup in 2022?")
    assert answer["abstained"] and answer["recommendations"] == [] and answer["sources"] == []


def test_restricted_documents_are_invisible(api_client):
    listed = {d["id"] for d in api_client.get("/documents", headers=as_user("alex.tan")).json()}
    assert "OFF-01" in listed and "OFF-05" not in listed
    assert api_client.get("/documents/OFF-05/pages/1", headers=as_user("alex.tan")).status_code == 404
    page = api_client.get("/documents/OFF-05/pages/1", headers=as_user("marcus.lee"))
    assert page.status_code == 200 and "Investment summary" in page.json()["text"]
    graph_ids = {n["id"] for n in api_client.get("/graph", headers=as_user("alex.tan")).json()["nodes"]}
    assert "doc:OFF-01" in graph_ids and "doc:OFF-05" not in graph_ids


def test_audit_is_steward_only_and_chain_verifies(api_client):
    assert api_client.get("/audit", headers=as_user("alex.tan")).status_code == 403
    events = api_client.get("/audit", headers=as_user("sarah.lim")).json()
    actions = {e["action"] for e in events}
    assert {"QUERY", "ACCESS_DENIED"} <= actions
    denied = [e for e in events if e["action"] == "ACCESS_DENIED" and e["details"].get("doc_id") == "OFF-05"]
    assert denied and denied[0]["user_id"] == "alex.tan"
    assert api_client.get("/audit/verify", headers=as_user("sarah.lim")).json()["valid"] is True


def test_contributions_need_steward_approval(api_client):
    pdf = make_pdf(["Zeolite desiccant wheel retrofit at Harmony Senior Residences.",
                    "The zeolite desiccant wheel cut humidity complaints and mould reports."])
    form = {"title": "Zeolite desiccant wheel retrofit", "asset_type": "Senior Living",
            "asset_name": "Harmony Senior Residences", "category": "Indoor Environment",
            "classification": "Technical", "problem": "Humidity and mould in resident rooms",
            "solution": "Zeolite desiccant wheel dehumidification", "impact": "Mould reports down"}
    upload = api_client.post("/documents", data=form, files={"file": ("zeolite.pdf", pdf, "application/pdf")},
                             headers=as_user("priya.nair"))
    assert upload.status_code == 200, upload.text
    doc_id = upload.json()["doc_id"]
    assert upload.json()["status"] == "pending"

    question = "Does a zeolite desiccant wheel help with humidity?"
    assert doc_id not in {s["doc_id"] for s in ask(api_client, "priya.nair", question)["sources"]}
    assert api_client.post(f"/review/{doc_id}", json={"decision": "approve"},
                           headers=as_user("priya.nair")).status_code == 403
    assert api_client.post(f"/review/{doc_id}", json={"decision": "approve"},
                           headers=as_user("sarah.lim")).status_code == 200
    assert doc_id in {s["doc_id"] for s in ask(api_client, "priya.nair", question)["sources"]}

    duplicate = api_client.post("/documents", data=form, files={"file": ("zeolite.pdf", pdf, "application/pdf")},
                                headers=as_user("sarah.lim"))
    assert duplicate.status_code == 409


def test_contributors_cannot_label_documents_above_their_clearance(api_client):
    pdf = make_pdf(["Budget table for next year"])
    form = {"title": "Budget", "asset_type": "Office", "asset_name": "Keppel Bay Tower",
            "category": "Budget", "classification": "Financial"}
    response = api_client.post("/documents", data=form, files={"file": ("b.pdf", pdf, "application/pdf")},
                               headers=as_user("alex.tan"))
    assert response.status_code == 403


def test_expert_lesson_capture(api_client):
    lesson = {
        "title": "Pre-cool data halls before planned chiller maintenance",
        "asset_type": "Data Centre", "asset_name": "Tampines Data Centre 1", "category": "Expert Knowledge",
        "classification": "Operational",
        "problem": "Rack inlet temperatures spike during planned chiller switchovers",
        "solution": "Lower the supply air setpoint by 1C for 30 minutes before switching chillers",
        "lessons": "Always confirm the standby chiller is running before isolating the duty unit.",
    }
    response = api_client.post("/lessons", json=lesson, headers=as_user("alex.tan"))
    assert response.status_code == 200 and response.json()["status"] == "pending"
    queue = api_client.get("/review/queue", headers=as_user("sarah.lim")).json()
    assert response.json()["doc_id"] in {d["id"] for d in queue}


def test_feedback_graph_similarity_and_exports(api_client):
    answer = ask(api_client, "priya.nair", "How should we prepare for power outages?")
    assert api_client.post("/feedback", json={"answer_id": answer["answer_id"], "rating": 1},
                           headers=as_user("priya.nair")).status_code == 200
    similar = api_client.get("/graph/similar/SL-02", headers=as_user("priya.nair")).json()["similar"]
    assert similar and all(s["asset_type"] != "Senior Living" for s in similar)
    turtle = api_client.get("/graph/export?format=turtle", headers=as_user("alex.tan")).text
    assert "skos:broader" in turtle and "kb:doc_OFF-05" not in turtle
    assert "<graphml" in api_client.get("/graph/export?format=graphml", headers=as_user("alex.tan")).text


def test_evaluation_suite_reports_zero_leakage(api_client):
    assert api_client.post("/eval/run", headers=as_user("alex.tan")).status_code == 403
    report = api_client.post("/eval/run", headers=as_user("sarah.lim")).json()
    assert report["summary"]["rbac_leakage"] == 0
    assert report["summary"]["cases"] == len(report["cases"])
