"""Role-based access control.

The policy is declarative (config/rbac_policy.yaml) so knowledge stewards can
review it without reading code. `User.can_read()` is the single decision point
used by retrieval, the knowledge-graph view, citations and file downloads.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

PERMISSIONS = frozenset({"ask", "contribute", "approve", "view_audit", "run_eval"})


class PolicyError(ValueError):
    """Raised when the RBAC policy file is inconsistent."""


@dataclass(frozen=True)
class Role:
    name: str
    description: str
    classifications: frozenset[str]
    permissions: frozenset[str]


@dataclass(frozen=True)
class User:
    id: str
    name: str
    title: str
    role: Role
    home_asset_type: str | None = None

    def can(self, permission: str) -> bool:
        return permission in self.role.permissions

    def can_read(self, classification: str) -> bool:
        return classification in self.role.classifications

    @property
    def readable_classifications(self) -> list[str]:
        return sorted(self.role.classifications)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "title": self.title,
            "role": self.role.name,
            "role_description": self.role.description,
            "home_asset_type": self.home_asset_type,
            "classifications": self.readable_classifications,
            "permissions": sorted(self.role.permissions),
        }


class AccessPolicy:
    def __init__(self, classifications: dict[str, str], roles: dict[str, Role], users: dict[str, User]):
        self.classifications = classifications
        self.roles = roles
        self.users = users

    @classmethod
    def from_yaml(cls, path: Path) -> "AccessPolicy":
        raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        classifications: dict[str, str] = raw.get("classifications") or {}
        roles: dict[str, Role] = {}
        for name, spec in (raw.get("roles") or {}).items():
            unknown_cls = set(spec.get("classifications", [])) - set(classifications)
            unknown_perm = set(spec.get("permissions", [])) - PERMISSIONS
            if unknown_cls or unknown_perm:
                raise PolicyError(f"Role {name!r} references unknown {unknown_cls or unknown_perm}")
            roles[name] = Role(
                name=name,
                description=spec.get("description", ""),
                classifications=frozenset(spec.get("classifications", [])),
                permissions=frozenset(spec.get("permissions", [])),
            )
        users: dict[str, User] = {}
        for spec in raw.get("users") or []:
            if spec["role"] not in roles:
                raise PolicyError(f"User {spec['id']!r} has unknown role {spec['role']!r}")
            users[spec["id"]] = User(
                id=spec["id"],
                name=spec["name"],
                title=spec.get("title", ""),
                role=roles[spec["role"]],
                home_asset_type=spec.get("home_asset_type"),
            )
        return cls(classifications, roles, users)

    def get_user(self, user_id: str | None) -> User | None:
        return self.users.get(user_id or "")

    def matrix(self) -> list[dict[str, Any]]:
        """Role x classification grid for the governance dashboard."""
        return [
            {
                "role": role.name,
                "description": role.description,
                "permissions": sorted(role.permissions),
                **{c: (c in role.classifications) for c in self.classifications},
            }
            for role in self.roles.values()
        ]
