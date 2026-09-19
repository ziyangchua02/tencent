"""Graph exports that make the NetworkX prototype portable.

- GraphML  -> Neo4j (`CALL apoc.import.graphml(...)`), Gephi, yEd
- Turtle   -> any RDF triple store; assets typed as RealEstateCore `rec:Building`,
              systems as Brick classes where a mapping exists, concepts as SKOS.
"""

from __future__ import annotations

import io
import re

import networkx as nx

from backend.graph.taxonomy import Taxonomy

_KB = "https://keppel-knowledge-bridge.example/kb#"
_PREFIXES = f"""@prefix kb: <{_KB}> .
@prefix rec: <https://w3id.org/rec#> .
@prefix brick: <https://brickschema.org/schema/Brick#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

"""

_CLASS_BY_KIND = {
    "asset_class": "kb:AssetClass",
    "asset": "rec:Building",
    "document": "kb:Document",
    "problem": "kb:Problem",
    "solution": "kb:Solution",
    "concept": "skos:Concept",
    "system": "kb:BuildingSystem",
}

_PREDICATE_BY_RELATION = {
    "IS_A": "kb:assetClass",
    "DESCRIBES": "kb:describesAsset",
    "REPORTS": "kb:reportsProblem",
    "PROPOSES": "kb:proposesSolution",
    "ADDRESSES": "kb:addressesProblem",
    "APPLIES": "kb:appliesConcept",
    "RELATES_TO": "kb:relatesToConcept",
    "MENTIONS": "kb:mentionsConcept",
    "INVOLVES": "kb:involvesSystem",
    "BROADER": "skos:broader",
    "RELATED": "skos:related",
}


def _scalar(value: object) -> str | int | float | bool:
    if isinstance(value, (str, int, float, bool)):
        return value
    return "" if value is None else str(value)


def to_graphml(graph: nx.DiGraph) -> str:
    clean = nx.DiGraph()
    for node, data in graph.nodes(data=True):
        clean.add_node(node, **{k: _scalar(v) for k, v in data.items()})
    for source, target, data in graph.edges(data=True):
        clean.add_edge(source, target, **{k: _scalar(v) for k, v in data.items()})
    buffer = io.BytesIO()
    nx.write_graphml(clean, buffer)
    return buffer.getvalue().decode("utf-8")


def _iri(node_id: str) -> str:
    return "kb:" + re.sub(r"[^A-Za-z0-9_-]", "_", node_id.replace(":", "_"))


def _literal(text: object) -> str:
    escaped = str(text).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
    return f'"{escaped}"'


def to_turtle(graph: nx.DiGraph, taxonomy: Taxonomy) -> str:
    lines = [_PREFIXES]
    for node, data in graph.nodes(data=True):
        kind = data.get("kind", "")
        rdf_class = _CLASS_BY_KIND.get(kind, "kb:Thing")
        if kind == "system":
            system = taxonomy.systems.get(data.get("key", ""))
            if system and system.brick_class:
                rdf_class = f"brick:{system.brick_class}"
        triples = [f"a {rdf_class}", f"rdfs:label {_literal(data.get('label', node))}"]
        if kind == "document":
            triples.append(f"kb:classification {_literal(data.get('classification', ''))}")
            triples.append(f"kb:assetType {_literal(data.get('asset_type', ''))}")
        lines.append(f"{_iri(node)} " + " ;\n    ".join(triples) + " .")
    for source, target, data in graph.edges(data=True):
        predicate = _PREDICATE_BY_RELATION.get(data.get("relation", ""), "kb:relatedTo")
        lines.append(f"{_iri(source)} {predicate} {_iri(target)} .")
    return "\n".join(lines) + "\n"
