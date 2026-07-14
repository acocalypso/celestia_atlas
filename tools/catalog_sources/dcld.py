"""Importer for the Hartley et al. southern dark clouds, VizieR VII/191."""

from __future__ import annotations

from pathlib import Path

from catalog_coordinates import fk4_to_icrs, shape_from_axes
from catalog_identifiers import dedupe_aliases, identifier_key
from catalog_model import CatalogObject, CatalogSourceRef
from catalog_sources.base import SourceSpec, compact_properties, optional_float, optional_int, positive, read_vizier_tsv, required


SPEC = SourceSpec(
    key="dcld",
    catalogue="DCld",
    vizier_id="VII/191",
    table="table1",
    filename="dcld.tsv",
    expected_rows=1101,
    required_columns=("DCld", "n_DCld", "RA1950", "DE1950", "Size1", "Size2", "Density", "Field", "Comments"),
    url="https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII%2F191%2Ftable1&-out.all&-out.max=unlimited",
)


def load(path: Path, *, strict: bool = True) -> list[CatalogObject]:
    rows = read_vizier_tsv(path, SPEC.required_columns, expected_rows=SPEC.expected_rows if strict else None)
    objects: list[CatalogObject] = []
    occurrences: dict[str, int] = {}
    for row in rows:
        identifier = required(row, "DCld", path)
        complex_flag = row.get("n_DCld", "").strip().upper() == "C"
        source_identifier = f"{identifier}{'C' if complex_flag else ''}"
        primary = f"DCld {source_identifier}"
        major = positive(optional_float(row, "Size1", path))
        minor = positive(optional_float(row, "Size2", path))
        identity = identifier_key(primary)
        occurrences[identity] = occurrences.get(identity, 0) + 1
        # VII/191 contains repeated designations for physically distinct rows.
        # The occurrence is an internal stable discriminator, not a published
        # catalogue identifier and is therefore never displayed as an alias.
        uid = f"{identity}:{occurrences[identity]}"
        objects.append(
            CatalogObject(
                uid=uid,
                primary_name=primary,
                aliases=dedupe_aliases(primary, (f"DCLD {source_identifier}", f"DC {source_identifier}")),
                type_code="DrkN",
                coordinates=fk4_to_icrs(required(row, "RA1950", path), required(row, "DE1950", path), equinox="B1950", accuracy_arcsec=10, origin="VII/191 cloud centroid"),
                shape=shape_from_axes(major, minor, derivation="catalog_axes_or_total_length") if major else shape_from_axes(None),
                properties=compact_properties(
                    {
                        "complex": complex_flag or None,
                        "densityClass": row.get("Density", "").strip(),
                        "densityScale": "A most dense; C least dense",
                        "surveyField": optional_int(row, "Field", path),
                        "notes": row.get("Comments", "").strip(),
                        "sizeCaveat": "Size1 can be total length for curved or elongated clouds",
                    }
                ),
                sources=(CatalogSourceRef("DCld", source_identifier, SPEC.vizier_id, SPEC.table, source_identifier, "FK4/B1950"),),
                catalogue_groups=("dcld",),
            )
        )
    return objects
