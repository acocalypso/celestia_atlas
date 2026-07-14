"""Conservative catalogue deduplication with explicit ambiguity reporting."""

from __future__ import annotations

from collections import defaultdict
import json
import math
from pathlib import Path
from typing import Any, Iterable, Mapping

from catalog_coordinates import angular_separation_arcmin
from catalog_identifiers import dedupe_aliases, identifier_key, natural_sort_key
from catalog_model import CatalogObject, CatalogSourceRef, DedupCandidate, DedupResult, Shape


_CANONICAL_GROUP_PRIORITY = {
    "openngc": 0,
    "barnard": 10,
    "ldn": 11,
    "sharpless": 12,
    "lbn": 13,
    "vdb": 14,
    "rcw": 15,
    "dcld": 16,
    "feitzinger": 17,
}
_TYPE_SPECIFICITY = {
    "SNR": 0,
    "HII": 1,
    "RfN": 2,
    "DrkN": 3,
    "EmN": 4,
    "Cl+N": 5,
    "Neb": 20,
    "Other": 30,
}


class _UnionFind:
    def __init__(self, values: Iterable[str]) -> None:
        self.parent = {value: value for value in values}

    def find(self, value: str) -> str:
        parent = self.parent[value]
        if parent != value:
            self.parent[value] = self.find(parent)
        return self.parent[value]

    def union(self, left: str, right: str) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[max(left_root, right_root)] = min(left_root, right_root)


def _source_key(ref: CatalogSourceRef) -> str:
    hint = ref.catalogue.casefold().replace(" ", "")
    hint = {"sh2": "sh2", "fest1": "fest1", "dcld": "dcld"}.get(hint, hint)
    if hint == "fest1":
        return identifier_key(f"FeSt 1-{ref.identifier}")
    return identifier_key(ref.identifier, hint)


def _source_sort_key(ref: CatalogSourceRef) -> tuple[str, ...]:
    """Sort provenance without comparing optional ``None`` and string values."""

    return tuple(
        (value or "").casefold()
        for value in (
            ref.catalogue,
            ref.identifier,
            ref.vizier_id,
            ref.table,
            ref.original_identifier,
            ref.original_frame,
        )
    )


def _compatible(left: str, right: str) -> bool:
    if left == right:
        return True
    pair = frozenset((left, right))
    return pair in {
        frozenset(("Neb", "HII")),
        frozenset(("Neb", "EmN")),
        frozenset(("Neb", "RfN")),
        frozenset(("Neb", "SNR")),
        frozenset(("EmN", "HII")),
        frozenset(("EmN", "SNR")),
    }


def _identity_position_is_plausible(left: CatalogObject, right: CatalogObject) -> bool:
    """Reject absurd historical xrefs while allowing large overlapping nebulae."""

    separation = angular_separation_arcmin(left.coordinates, right.coordinates)
    left_radius = (left.shape.major_arcmin or 0) / 2
    right_radius = (right.shape.major_arcmin or 0) / 2
    # Half a degree is already generous for the published coordinate
    # precision. Larger objects may differ by their combined radii plus that
    # margin before requiring manual review. This is important for source
    # fields that describe an object as merely "associated" with another
    # catalogue designation.
    maximum = max(30.0, left_radius + right_radius + 30.0)
    return separation <= maximum


def _canonical_key(obj: CatalogObject) -> tuple[Any, ...]:
    group_rank = min((_CANONICAL_GROUP_PRIORITY.get(group, 99) for group in obj.catalogue_groups), default=99)
    return group_rank, natural_sort_key(obj.primary_name), obj.uid


def _shape_rank(shape: Shape) -> tuple[int, float]:
    derivation_rank = {
        "catalog_axes": 0,
        "catalog_axes_or_total_length": 1,
        "catalog_diameter": 2,
        "catalog_maximum_diameter": 3,
        "maximum_plate_radius": 4,
        "area_equivalent": 5,
        None: 9,
    }.get(shape.derivation, 8)
    return derivation_rank, -(shape.major_arcmin or 0)


def _merge_component(objects: list[CatalogObject], canonical_uid: str | None = None) -> CatalogObject:
    ordered = sorted(objects, key=_canonical_key)
    if canonical_uid:
        selected = next((obj for obj in ordered if obj.uid == canonical_uid), None)
        if selected:
            ordered.remove(selected)
            ordered.insert(0, selected)
    canonical = ordered[0]
    coordinate_object = min(
        ordered,
        key=lambda obj: (
            obj.coordinates.accuracy_arcsec if obj.coordinates.accuracy_arcsec is not None else math.inf,
            _canonical_key(obj),
        ),
    )
    shape_object = min(ordered, key=lambda obj: (_shape_rank(obj.shape), _canonical_key(obj)))
    type_code = min((obj.type_code for obj in ordered), key=lambda value: _TYPE_SPECIFICITY.get(value, 10))

    aliases: list[str] = []
    for obj in ordered:
        if obj is not canonical:
            aliases.append(obj.primary_name)
        aliases.extend(obj.aliases)
    sources = tuple(
        sorted({source for obj in ordered for source in obj.sources}, key=_source_sort_key)
    )
    related = tuple(
        sorted(
            {source for obj in ordered for source in obj.related_source_refs} - set(sources),
            key=_source_sort_key,
        )
    )
    groups = tuple(sorted({group for obj in ordered for group in obj.catalogue_groups}))
    cross_ids = tuple(sorted({value for obj in ordered for value in obj.cross_identifications}, key=natural_sort_key))

    properties: dict[str, Any] = dict(canonical.properties)
    conflicts: dict[str, dict[str, Any]] = {}
    for obj in ordered[1:]:
        for key, value in obj.properties.items():
            if key not in properties:
                properties[key] = value
            elif properties[key] != value:
                conflicts.setdefault(obj.uid, {})[key] = value
    if conflicts:
        properties["sourcePropertyConflicts"] = conflicts

    return canonical.with_updates(
        aliases=dedupe_aliases(canonical.primary_name, aliases),
        type_code=type_code,
        coordinates=coordinate_object.coordinates,
        shape=shape_object.shape,
        properties=properties,
        sources=sources,
        catalogue_groups=groups,
        cross_identifications=cross_ids,
        related_source_refs=related,
        common_name=canonical.common_name or next((obj.common_name for obj in ordered if obj.common_name), None),
    )


def load_overrides(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {"merge": [], "doNotMerge": []}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("merge", []), list):
        raise ValueError(f"{path}: invalid catalogue override document")
    return value


def _pair(left: str, right: str) -> tuple[str, str]:
    return tuple(sorted((left, right)))  # type: ignore[return-value]


def deduplicate_catalog(
    objects: Iterable[CatalogObject],
    *,
    overrides: Mapping[str, Any] | None = None,
    include_spatial_candidates: bool = True,
) -> DedupResult:
    """Merge only unambiguous identities; proximity is report-only."""

    source_objects = sorted(objects, key=_canonical_key)
    by_uid = {obj.uid: obj for obj in source_objects}
    if len(by_uid) != len(source_objects):
        raise ValueError("Duplicate input uid in catalogue pipeline")
    union = _UnionFind(by_uid)
    override_data = dict(overrides or {"merge": [], "doNotMerge": []})
    forbidden = {
        _pair(str(pair[0]), str(pair[1]))
        for pair in override_data.get("doNotMerge", [])
        if isinstance(pair, list) and len(pair) == 2
    }
    canonical_for_member: dict[str, str] = {}
    for entry in override_data.get("merge", []):
        members = [str(value) for value in entry.get("members", [])]
        unknown = [value for value in members if value not in by_uid]
        if unknown:
            raise ValueError(f"Override references unknown uid(s): {', '.join(unknown)}")
        for left, right in zip(members, members[1:]):
            if _pair(left, right) not in forbidden:
                union.union(left, right)
        canonical = str(entry.get("canonical", members[0] if members else ""))
        if canonical and canonical not in members:
            raise ValueError("Override canonical uid must be a merge member")
        for member in members:
            canonical_for_member[member] = canonical

    identity_index: dict[str, set[str]] = defaultdict(set)
    for obj in source_objects:
        for source in obj.sources:
            key = _source_key(source)
            if key:
                identity_index[key].add(obj.uid)

    proposed_edges: set[tuple[str, str, str]] = set()
    unresolved: dict[str, set[str]] = defaultdict(set)
    for obj in source_objects:
        for cross_id in obj.cross_identifications:
            key = identifier_key(cross_id)
            targets = identity_index.get(key, set()) - {obj.uid}
            if len(targets) == 1:
                target = next(iter(targets))
                if _compatible(obj.type_code, by_uid[target].type_code):
                    proposed_edges.add((obj.uid, target, key))
            elif targets:
                unresolved[key].update((obj.uid, *targets))

    # Exact aliases are considered only after removing explicitly declared
    # cross-identifications, which prevents that ambiguity gate being bypassed.
    exact_index: dict[str, set[str]] = defaultdict(set)
    for obj in source_objects:
        excluded = {identifier_key(value) for value in obj.cross_identifications}
        for value in (obj.primary_name, *obj.aliases):
            key = identifier_key(value)
            if key and not key.startswith("text:") and key not in excluded:
                exact_index[key].add(obj.uid)
    identity_edges: dict[tuple[str, str], set[str]] = defaultdict(set)
    for left, right, key in proposed_edges:
        if (
            _pair(left, right) not in forbidden
            and not (set(by_uid[left].catalogue_groups) & set(by_uid[right].catalogue_groups))
        ):
            if _identity_position_is_plausible(by_uid[left], by_uid[right]):
                identity_edges[_pair(left, right)].add(key)
            else:
                unresolved[key].update((left, right))
    for key, members in exact_index.items():
        if len(members) != 2:
            if len(members) > 2:
                unresolved[key].update(members)
            continue
        left, right = sorted(members)
        if (
            _pair(left, right) not in forbidden
            and _compatible(by_uid[left].type_code, by_uid[right].type_code)
            and not (set(by_uid[left].catalogue_groups) & set(by_uid[right].catalogue_groups))
        ):
            if _identity_position_is_plausible(by_uid[left], by_uid[right]):
                identity_edges[_pair(left, right)].add(key)
            else:
                unresolved[key].update((left, right))

    # Evaluate the complete explicit+alias identity graph before unioning.
    # Only a component consisting of one mutual pair can merge automatically.
    # This blocks conflicting cross-catalogue cycles such as two LBN rows whose
    # source xrefs and OpenNGC aliases point at opposite NGC components.
    edge_neighbors: dict[str, set[str]] = defaultdict(set)
    for left, right in identity_edges:
        edge_neighbors[left].add(right)
        edge_neighbors[right].add(left)
    for (left, right), keys in sorted(identity_edges.items()):
        if edge_neighbors[left] == {right} and edge_neighbors[right] == {left}:
            union.union(left, right)
        else:
            for key in keys:
                unresolved[key].update((left, right))

    related: dict[str, set[CatalogSourceRef]] = defaultdict(set)
    for _, members in unresolved.items():
        for uid in members:
            for other in members - {uid}:
                related[uid].update(by_uid[other].sources)
    updated_objects = [
        obj.with_updates(
            related_source_refs=tuple(
                sorted(
                    set(obj.related_source_refs) | related[obj.uid],
                    key=_source_sort_key,
                )
            )
        )
        if related[obj.uid]
        else obj
        for obj in source_objects
    ]

    components: dict[str, list[CatalogObject]] = defaultdict(list)
    for obj in updated_objects:
        components[union.find(obj.uid)].append(obj)
    merged: list[CatalogObject] = []
    for component in components.values():
        canonical_uid = next((canonical_for_member[obj.uid] for obj in component if obj.uid in canonical_for_member), None)
        merged.append(_merge_component(component, canonical_uid))
    merged.sort(key=_canonical_key)

    candidates: list[DedupCandidate] = []
    if include_spatial_candidates:
        buckets: dict[tuple[int, int], list[CatalogObject]] = defaultdict(list)
        cell_deg = 0.25
        for obj in merged:
            dec_cell = int(math.floor((obj.coordinates.dec_deg + 90) / cell_deg))
            ra_cell = int(math.floor(obj.coordinates.ra_deg / cell_deg))
            buckets[(ra_cell, dec_cell)].append(obj)
        seen_pairs: set[tuple[str, str]] = set()
        ra_cells = int(360 / cell_deg)
        for (ra_cell, dec_cell), values in buckets.items():
            neighbors = [
                item
                for dx in (-1, 0, 1)
                for dy in (-1, 0, 1)
                for item in buckets.get(((ra_cell + dx) % ra_cells, dec_cell + dy), ())
            ]
            for left in values:
                for right in neighbors:
                    pair = _pair(left.uid, right.uid)
                    if left.uid == right.uid or pair in seen_pairs or pair in forbidden:
                        continue
                    seen_pairs.add(pair)
                    if set(left.catalogue_groups) == set(right.catalogue_groups) or not _compatible(left.type_code, right.type_code):
                        continue
                    separation = angular_separation_arcmin(left.coordinates, right.coordinates)
                    if separation > 2:
                        continue
                    left_size = left.shape.major_arcmin
                    right_size = right.shape.major_arcmin
                    if left_size and right_size and max(left_size, right_size) / min(left_size, right_size) > 2:
                        continue
                    candidates.append(DedupCandidate(left.uid, right.uid, separation, "position, compatible type and dimensions"))
    candidates.sort(key=lambda value: (value.left_uid, value.right_uid))
    ambiguous = tuple(
        (key, tuple(sorted(members))) for key, members in sorted(unresolved.items()) if len(members) > 1
    )
    return DedupResult(tuple(merged), tuple(candidates), ambiguous)
