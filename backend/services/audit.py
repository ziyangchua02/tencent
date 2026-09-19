"""Tamper-evident audit trail.

Each event stores the SHA-256 of (previous hash + canonical event JSON), forming
a hash chain: editing or deleting any past row breaks verification from that
point on. The in-process lock serialises writers for this single-process MVP;
at scale, use a database sequence/advisory lock or a managed log service
(e.g. Tencent Cloud CLS with WORM retention).
"""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from backend.db import AuditEvent

GENESIS_HASH = "0" * 64


def _canonical(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


class AuditTrail:
    def __init__(self, session_factory: sessionmaker):
        self._session_factory = session_factory
        self._lock = threading.Lock()

    @staticmethod
    def compute_hash(prev_hash: str, timestamp: str, user_id: str, user_role: str, action: str,
                     question: str | None, details: dict[str, Any]) -> str:
        payload = {
            "prev": prev_hash, "ts": timestamp, "user": user_id, "role": user_role,
            "action": action, "question": question, "details": details,
        }
        return hashlib.sha256(_canonical(payload).encode("utf-8")).hexdigest()

    def record(self, user_id: str, user_role: str, action: str, question: str | None = None,
               details: dict[str, Any] | None = None) -> AuditEvent:
        # Round-trip through JSON so the hashed form equals what the database returns later.
        clean_details = json.loads(_canonical(details or {}))
        with self._lock, self._session_factory() as session:
            last_hash = session.scalar(select(AuditEvent.record_hash).order_by(AuditEvent.id.desc()).limit(1))
            prev_hash = last_hash or GENESIS_HASH
            timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
            event = AuditEvent(
                timestamp=timestamp, user_id=user_id, user_role=user_role, action=action, question=question,
                details=clean_details, prev_hash=prev_hash,
                record_hash=self.compute_hash(prev_hash, timestamp, user_id, user_role, action, question,
                                              clean_details),
            )
            session.add(event)
            session.commit()
            return event

    def verify(self) -> dict[str, Any]:
        prev_hash, checked = GENESIS_HASH, 0
        with self._session_factory() as session:
            for event in session.scalars(select(AuditEvent).order_by(AuditEvent.id)):
                expected = self.compute_hash(prev_hash, event.timestamp, event.user_id, event.user_role,
                                             event.action, event.question, event.details or {})
                if event.prev_hash != prev_hash or event.record_hash != expected:
                    return {"valid": False, "checked": checked, "broken_at": event.id, "head": prev_hash}
                prev_hash = event.record_hash
                checked += 1
        return {"valid": True, "checked": checked, "broken_at": None, "head": prev_hash}

    @staticmethod
    def to_dict(event: AuditEvent) -> dict[str, Any]:
        return {
            "id": event.id, "timestamp": event.timestamp, "user_id": event.user_id, "user_role": event.user_role,
            "action": event.action, "question": event.question, "details": event.details,
            "prev_hash": event.prev_hash, "record_hash": event.record_hash,
        }

    def list(self, limit: int = 200, action: str | None = None, user_id: str | None = None) -> list[dict[str, Any]]:
        stmt = select(AuditEvent).order_by(AuditEvent.id.desc()).limit(limit)
        if action:
            stmt = stmt.where(AuditEvent.action == action)
        if user_id:
            stmt = stmt.where(AuditEvent.user_id == user_id)
        with self._session_factory() as session:
            return [self.to_dict(e) for e in session.scalars(stmt)]

    def counts_by_action(self) -> dict[str, int]:
        with self._session_factory() as session:
            rows = session.execute(select(AuditEvent.action, func.count()).group_by(AuditEvent.action)).all()
        return {action: count for action, count in rows}

    def knowledge_gaps(self, limit: int = 50, threshold: float = 0.5) -> list[dict[str, Any]]:
        """Questions the knowledge base could not answer well - the capture backlog for stewards."""
        gaps = []
        for event in self.list(limit=1000, action="QUERY"):
            details = event["details"] or {}
            if details.get("abstained") or float(details.get("confidence", 1.0)) < threshold:
                gaps.append({
                    "audit_id": event["id"], "timestamp": event["timestamp"], "user_id": event["user_id"],
                    "question": event["question"], "confidence": details.get("confidence"),
                    "abstained": bool(details.get("abstained")),
                    "withheld": len(details.get("withheld", [])),
                })
            if len(gaps) >= limit:
                break
        return gaps
