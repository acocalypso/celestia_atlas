"""Importer for RCW H-alpha emission regions, VizieR VII/216."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from catalog_coordinates import fk4_to_icrs, shape_from_axes
from catalog_identifiers import catalogue_aliases, dedupe_aliases, expand_prefixed_identifiers
from catalog_model import CatalogObject, CatalogSourceRef
from catalog_sources.base import SourceSpec, compact_properties, optional_float, optional_int, positive, read_vizier_tsv, required


SPEC = SourceSpec(
    key="rcw",
    catalogue="RCW",
    vizier_id="VII/216",
    table="rcw",
    filename="rcw.tsv",
    expected_rows=181,
    required_columns=("RCW", "RAB1950", "DEB1950", "MajAxis", "MinAxis", "Br", "IDs", "Rem"),
    url="https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII%2F216%2Frcw&-out.all&-out.max=unlimited",
    notes_filename="rcw-notes.tsv",
    notes_table="notes",
    notes_expected_rows=143,
    notes_url="https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII%2F216%2Fnotes&-out.all&-out.max=unlimited",
)


def _notes(path: Path | None, strict: bool) -> dict[str, str]:
    if path is None or not path.exists():
        return {}
    rows = read_vizier_tsv(path, ("RCW", "Text"), expected_rows=SPEC.notes_expected_rows if strict else None)
    values: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        key = required(row, "RCW", path)
        if row.get("Text", "").strip():
            values[key].append(row["Text"].strip())
    return {key: " ".join(parts) for key, parts in values.items()}


def load(path: Path, *, strict: bool = True, notes_path: Path | None = None) -> list[CatalogObject]:
    rows = read_vizier_tsv(path, SPEC.required_columns, expected_rows=SPEC.expected_rows if strict else None)
    notes = _notes(notes_path, strict)
    objects: list[CatalogObject] = []
    for row in rows:
        number = optional_int(row, "RCW", path)
        if number is None:
            required(row, "RCW", path)
        identifier = str(number)
        primary = f"RCW {identifier}"
        major = positive(optional_float(row, "MajAxis", path))
        minor = positive(optional_float(row, "MinAxis", path))
        cross_ids = expand_prefixed_identifiers(row.get("IDs", ""))
        objects.append(
            CatalogObject(
                uid=f"rcw:{identifier}",
                primary_name=primary,
                aliases=dedupe_aliases(primary, (*catalogue_aliases("rcw", identifier), *cross_ids)),
                type_code="EmN",
                coordinates=fk4_to_icrs(required(row, "RAB1950", path), required(row, "DEB1950", path), equinox="B1950", accuracy_arcsec=900, origin="VII/216 H-alpha region centre"),
                shape=shape_from_axes(major, minor, derivation="catalog_axes") if major else shape_from_axes(None),
                properties=compact_properties(
                    {
                        "brightnessClass": row.get("Br", "").strip(),
                        "brightnessScale": "vb very bright; b bright; m medium; f faint",
                        "notes": notes.get(identifier),
                        "remarkFlag": row.get("Rem", "").strip(),
                    }
                ),
                sources=(CatalogSourceRef("RCW", identifier, SPEC.vizier_id, SPEC.table, identifier, "FK4/B1950"),),
                catalogue_groups=("rcw",),
                cross_identifications=cross_ids,
            )
        )
    return objects
