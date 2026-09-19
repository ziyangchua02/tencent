from pathlib import Path

import pytest
from sqlalchemy import select

from backend.config import PROJECT_ROOT
from backend.db import AuditEvent
from backend.graph.taxonomy import Taxonomy
from backend.security.rbac import AccessPolicy, PolicyError

POLICY = PROJECT_ROOT / "config" / "rbac_policy.yaml"
TAXONOMY = PROJECT_ROOT / "config" / "taxonomy.yaml"


def test_role_permissions_match_policy():
    policy = AccessPolicy.from_yaml(POLICY)
    engineer, manager, steward = (policy.get_user(u) for u in ("alex.tan", "marcus.lee", "sarah.lim"))
    assert engineer.can_read("Maintenance") and not engineer.can_read("Financial")
    assert manager.can_read("Financial") and manager.can_read("Strategic") and not manager.can_read("Technical")
    assert all(steward.can_read(c) for c in policy.classifications)
    assert steward.can("view_audit") and not engineer.can("view_audit") and not manager.can("approve")


def test_policy_rejects_unknown_classification(tmp_path: Path):
    bad = tmp_path / "policy.yaml"
    bad.write_text("classifications: {Technical: x}\nroles:\n  Engineer: {classifications: [Secret]}\nusers: []\n")
    with pytest.raises(PolicyError):
        AccessPolicy.from_yaml(bad)


def test_taxonomy_matches_plurals_hierarchy_and_related_concepts():
    taxonomy = Taxonomy.from_yaml(TAXONOMY)
    found = taxonomy.match_text("How do we prepare for power outages when our lifts keep breaking down?")
    assert {"power_resilience", "vertical_transportation", "equipment_reliability"} <= set(found)
    expanded = taxonomy.expand_related(found)
    assert expanded["predictive_maintenance"] > 0  # breakdowns -> predictive maintenance (skos:related)
    assert "smart_monitoring" not in taxonomy.match_text("the chair was set aside")  # "ai" is whole-word only


def test_document_tagging_propagates_to_parent_concepts():
    taxonomy = Taxonomy.from_yaml(TAXONOMY)
    concepts, systems = taxonomy.tag_document("Chiller plant optimisation. The chillers and chilled water loop.")
    assert concepts["cooling_efficiency"] == 1.0
    assert 0 < concepts["energy_optimisation"] < 1.0
    assert "chiller_plant" in systems


def test_audit_chain_detects_tampering(services):
    audit = services.audit
    first = audit.record("alex.tan", "Engineer", "QUERY", "How do we cool?", {"confidence": 0.8})
    audit.record("alex.tan", "Engineer", "QUERY", "Second question", {"confidence": 0.7})
    assert audit.verify()["valid"]

    with services.session_factory() as session:
        event = session.scalar(select(AuditEvent).where(AuditEvent.id == first.id))
        event.question = "Something else entirely"
        session.commit()
    result = audit.verify()
    assert result["valid"] is False and result["broken_at"] == first.id
