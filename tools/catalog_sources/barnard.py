"""Importer for Barnard's dark objects, VizieR VII/220A."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from catalog_coordinates import fk4_to_icrs, shape_from_axes
from catalog_identifiers import catalogue_aliases, dedupe_aliases
from catalog_model import CatalogObject, CatalogSourceRef
from catalog_sources.base import SourceSpec, compact_properties, optional_float, read_vizier_tsv, required


SPEC = SourceSpec(
    key="barnard",
    catalogue="Barnard",
    vizier_id="VII/220A",
    table="barnard",
    filename="barnard.tsv",
    expected_rows=349,
    required_columns=("Barn", "RA1875", "DE1875", "Diam"),
    url="https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII%2F220A%2Fbarnard&-out.all&-out.max=unlimited",
    notes_filename="barnard-notes.tsv",
    notes_table="notes",
    notes_expected_rows=603,
    notes_url="https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII%2F220A%2Fnotes&-out.all&-out.max=unlimited",
)


def _notes(path: Path | None, strict: bool) -> dict[str, str]:
    if path is None or not path.exists():
        return {}
    rows = read_vizier_tsv(
        path,
        ("Barn", "Text"),
        expected_rows=SPEC.notes_expected_rows if strict else None,
    )
    grouped: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        identifier = required(row, "Barn", path).strip()
        text = row.get("Text", "").strip()
        if text:
            grouped[identifier].append(text)
    return {key: " ".join(values) for key, values in grouped.items()}


def load(path: Path, *, strict: bool = True, notes_path: Path | None = None) -> list[CatalogObject]:
    rows = read_vizier_tsv(path, SPEC.required_columns, expected_rows=SPEC.expected_rows if strict else None)
    notes = _notes(notes_path, strict)
    objects: list[CatalogObject] = []
    for row in rows:
        identifier = required(row, "Barn", path).replace(" ", "")
        primary = f"Barnard {identifier}"
        diameter = optional_float(row, "Diam", path)
        objects.append(
            CatalogObject(
                uid=f"barnard:{identifier.casefold()}",
                primary_name=primary,
                aliases=dedupe_aliases(primary, catalogue_aliases("barnard", identifier)),
                type_code="DrkN",
                coordinates=fk4_to_icrs(
                    required(row, "RA1875", path),
                    required(row, "DE1875", path),
                    equinox="B1875",
                    accuracy_arcsec=60,
                    origin="VII/220A original 1875.0 position",
                ),
                shape=shape_from_axes(diameter, diameter, derivation="catalog_diameter") if diameter and diameter > 0 else shape_from_axes(None),
                properties=compact_properties({"notes": notes.get(identifier)}),
                sources=(CatalogSourceRef("Barnard", identifier, SPEC.vizier_id, SPEC.table, identifier, "FK4/B1875"),),
                catalogue_groups=("barnard",),
            )
        )
    return objects
