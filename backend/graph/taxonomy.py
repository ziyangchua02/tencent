"""Concept taxonomy loading and deterministic concept tagging.

Tagging is rule-based on purpose: it is explainable ("tagged Cooling Efficiency
because the text mentions chillers 14 times"), reproducible, offline and cheap.
An LLM-based entity extractor can later add candidate concepts, but a human
steward keeps ownership of the controlled vocabulary.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

# Curated metadata (title, problem, solution) counts more than body text.
METADATA_BOOST = 3
MIN_DOC_HITS = 2


@dataclass(frozen=True)
class Concept:
    key: str
    label: str
    description: str
    parent: str | None
    aliases: tuple[str, ...]
    related: tuple[str, ...] = ()


@dataclass(frozen=True)
class SystemType:
    key: str
    label: str
    concepts: tuple[str, ...]
    aliases: tuple[str, ...]
    brick_class: str | None = None


def _compile(aliases: tuple[str, ...]) -> re.Pattern[str]:
    # Longest alias first; hyphen counts as part of a word so "ai" does not fire inside "ai-driven".
    # An optional plural suffix lets "power outage" also match "power outages".
    parts = sorted({a.lower() for a in aliases}, key=len, reverse=True)
    body = "|".join(re.escape(p) for p in parts)
    return re.compile(rf"(?<![\w-])(?:{body})(?:e?s)?(?![\w-])", re.IGNORECASE)


class Taxonomy:
    def __init__(self, concepts: dict[str, Concept], systems: dict[str, SystemType]):
        self.concepts = concepts
        self.systems = systems
        self._concept_patterns = {k: _compile(c.aliases) for k, c in concepts.items() if c.aliases}
        self._system_patterns = {k: _compile(s.aliases) for k, s in systems.items() if s.aliases}

    @classmethod
    def from_yaml(cls, path: Path) -> "Taxonomy":
        raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        concepts = {
            key: Concept(
                key=key,
                label=spec["label"],
                description=" ".join(str(spec.get("description", "")).split()),
                parent=spec.get("parent"),
                aliases=tuple(spec.get("aliases", [])),
                related=tuple(spec.get("related", [])),
            )
            for key, spec in (raw.get("concepts") or {}).items()
        }
        for concept in concepts.values():
            if concept.parent and concept.parent not in concepts:
                raise ValueError(f"Concept {concept.key!r} has unknown parent {concept.parent!r}")
            unknown = set(concept.related) - set(concepts)
            if unknown:
                raise ValueError(f"Concept {concept.key!r} has unknown related concepts {unknown}")
        systems = {
            key: SystemType(
                key=key,
                label=spec["label"],
                concepts=tuple(c for c in spec.get("concepts", []) if c in concepts),
                aliases=tuple(spec.get("aliases", [])),
                brick_class=spec.get("brick_class"),
            )
            for key, spec in (raw.get("systems") or {}).items()
        }
        return cls(concepts, systems)

    # ------------------------------------------------------------------ labels
    def label(self, concept_key: str) -> str:
        concept = self.concepts.get(concept_key)
        return concept.label if concept else concept_key

    def system_label(self, system_key: str) -> str:
        system = self.systems.get(system_key)
        return system.label if system else system_key

    def ancestors(self, concept_key: str) -> list[str]:
        chain, parent = [], self.concepts[concept_key].parent if concept_key in self.concepts else None
        while parent:
            chain.append(parent)
            parent = self.concepts[parent].parent
        return chain

    # ----------------------------------------------------------------- tagging
    @staticmethod
    def _weights(hits: dict[str, int], min_hits: int) -> dict[str, float]:
        kept = {k: h for k, h in hits.items() if h >= min_hits}
        if not kept:
            return {}
        top = max(kept.values())
        return {k: round(math.log1p(h) / math.log1p(top), 3) for k, h in kept.items()}

    def tag_document(self, body: str, metadata_text: str = "") -> tuple[dict[str, float], dict[str, float]]:
        """Weight (0-1] of each concept and system in a document, with parent propagation."""
        concept_hits = {
            k: len(p.findall(body)) + METADATA_BOOST * len(p.findall(metadata_text))
            for k, p in self._concept_patterns.items()
        }
        concepts = self._weights(concept_hits, MIN_DOC_HITS)
        for key, weight in list(concepts.items()):
            for depth, ancestor in enumerate(self.ancestors(key), start=1):
                inherited = round(weight * 0.5**depth, 3)
                concepts[ancestor] = max(concepts.get(ancestor, 0.0), inherited)

        system_hits = {
            k: len(p.findall(body)) + METADATA_BOOST * len(p.findall(metadata_text))
            for k, p in self._system_patterns.items()
        }
        return concepts, self._weights(system_hits, MIN_DOC_HITS)

    def match_text(self, text: str, include_parents: bool = True) -> dict[str, float]:
        """Concepts explicitly mentioned in a short text such as a question (1.0; parents 0.5)."""
        found = {k: 1.0 for k, p in self._concept_patterns.items() if p.search(text)}
        if include_parents:
            for key in list(found):
                for ancestor in self.ancestors(key):
                    found.setdefault(ancestor, 0.5)
        return found

    def expand_related(self, weights: dict[str, float], factor: float = 0.6) -> dict[str, float]:
        """Add related concepts (skos:related) at a reduced weight."""
        expanded = dict(weights)
        for key, weight in weights.items():
            for related in self.concepts[key].related if key in self.concepts else ():
                expanded[related] = max(expanded.get(related, 0.0), round(factor * weight, 3))
        return expanded

    def patterns_for(self, concept_keys) -> list[re.Pattern[str]]:
        return [self._concept_patterns[k] for k in concept_keys if k in self._concept_patterns]

    def match_systems(self, text: str) -> set[str]:
        return {k for k, p in self._system_patterns.items() if p.search(text)}
