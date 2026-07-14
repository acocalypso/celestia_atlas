"""Importer for VII/68A extended clouds (FeSt 1); globules are future work."""

from __future__ import annotations

from pathlib import Path

from catalog_coordinates import fk4_to_icrs, shape_from_area
from catalog_identifiers import catalogue_aliases, dedupe_aliases, expand_prefixed_identifiers
from catalog_model import CatalogObject, CatalogSourceRef
from catalog_sources.base import SourceSpec, compact_properties, optional_float, optional_int, positive, ranged_int, read_vizier_tsv, required


SPEC = SourceSpec(
    key="feitzinger",
    catalogue="FeSt 1",
    vizier_id="VII/68A",
    table="darkneb",
    filename="feitzinger-darkneb.tsv",
    expected_rows=489,
    required_columns=("FEST", "Field", "Foil", "Seq", "Desc", "GLON", "GLAT", "RA1950", "DE1950", "Area", "Mult", "OpClass", "Class", "i", "Ident"),
    url="https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII%2F68A%2Fdarkneb&-out.all&-out.max=unlimited",
)


def load(path: Path, *, strict: bool = True) -> list[CatalogObject]:
    rows = read_vizier_tsv(path, SPEC.required_columns, expected_rows=SPEC.expected_rows if strict else None)
    objects: list[CatalogObject] = []
    for row in rows:
        number = optional_int(row, "FEST", path)
        if number is None:
            required(row, "FEST", path)
        identifier = str(number)
        primary = f"FeSt 1-{identifier}"
        area = positive(optional_float(row, "Area", path))
        cross_ids = expand_prefixed_identifiers(row.get("Ident", ""))
        objects.append(
            CatalogObject(
                uid=f"fest1:{identifier}",
                primary_name=primary,
                aliases=dedupe_aliases(primary, (*catalogue_aliases("fest1", identifier), *cross_ids)),
                type_code="DrkN",
                coordinates=fk4_to_icrs(required(row, "RA1950", path), required(row, "DE1950", path), equinox="B1950", accuracy_arcsec=900, origin="VII/68A extended-cloud centre"),
                shape=shape_from_area(area),
                properties=compact_properties(
                    {
                        "areaSquareDeg": area,
                        "surveyField": optional_int(row, "Field", path),
                        "surveyMedium": row.get("Foil", "").strip(),
                        "fieldSequence": row.get("Seq", "").strip(),
                        "appearanceCode": row.get("Desc", "").strip(),
                        "opacityClass": ranged_int(row, "OpClass", path, 1, 6),
                        "morphologyClass": row.get("Class", "").strip(),
                        "galacticInclinationDeg": optional_float(row, "i", path),
                        "galacticLongitudeDeg": optional_float(row, "GLON", path),
                        "galacticLatitudeDeg": optional_float(row, "GLAT", path),
                        "globuleMultiplicity": optional_int(row, "Mult", path),
                        "inclinationCaveat": "Angle is relative to the Galactic plane, not equatorial position angle",
                    }
                ),
                sources=(CatalogSourceRef("FeSt 1", identifier, SPEC.vizier_id, SPEC.table, identifier, "FK4/B1950"),),
                catalogue_groups=("feitzinger",),
                cross_identifications=cross_ids,
            )
        )
    return objects
