"""Importer for Lynds' Catalogue of Dark Nebulae, VizieR VII/7A."""

from __future__ import annotations

from pathlib import Path
import re

from catalog_coordinates import fk4_to_icrs, shape_from_area
from catalog_identifiers import catalogue_aliases, dedupe_aliases
from catalog_model import CatalogObject, CatalogSourceRef
from catalog_sources.base import (
    SourceSpec,
    compact_properties,
    optional_float,
    optional_int,
    positive,
    ranged_int,
    read_vizier_tsv,
    required,
)


SPEC = SourceSpec(
    key="ldn",
    catalogue="LDN",
    vizier_id="VII/7A",
    table="ldn",
    filename="ldn.tsv",
    expected_rows=1791,
    required_columns=("LDN", "RA1950", "DE1950", "GLON", "GLAT", "Area", "Opacity", "ID", "Seq", "Lynds2", "Barn"),
    url="https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII%2F7A%2Fldn&-out.all&-out.max=unlimited",
)


def load(path: Path, *, strict: bool = True) -> list[CatalogObject]:
    rows = read_vizier_tsv(path, SPEC.required_columns, expected_rows=SPEC.expected_rows if strict else None)
    objects: list[CatalogObject] = []
    for row in rows:
        sequence = optional_int(row, "Seq", path)
        if sequence is None:
            required(row, "Seq", path)
        ldn_number = optional_int(row, "LDN", path)
        if ldn_number is None:
            identifier = f"Seq {sequence}"
            primary = f"LDN catalogue entry {sequence}"
            uid = f"ldn:seq-{sequence}"
            aliases = (f"LDN Seq {sequence}",)
        else:
            identifier = str(ldn_number)
            primary = f"LDN {identifier}"
            uid = f"ldn:{identifier}"
            aliases = catalogue_aliases("ldn", identifier)

        area = positive(optional_float(row, "Area", path))
        opacity = ranged_int(row, "Opacity", path, 1, 6)
        barnard_ids = tuple(re.findall(r"\d+[A-Za-z]?", row.get("Barn", "")))
        cross_ids = tuple(f"Barnard {value}" for value in barnard_ids)
        galactic_longitude = optional_float(row, "GLON", path)
        galactic_latitude = optional_float(row, "GLAT", path)
        coordinates = fk4_to_icrs(
            required(row, "RA1950", path),
            required(row, "DE1950", path),
            equinox="B1950",
            accuracy_arcsec=900,
            origin="VII/7A published cloud centre",
        )
        objects.append(
            CatalogObject(
                uid=uid,
                primary_name=primary,
                aliases=dedupe_aliases(primary, (*aliases, *cross_ids)),
                type_code="DrkN",
                coordinates=coordinates,
                shape=shape_from_area(area),
                properties=compact_properties(
                    {
                        "areaSquareDeg": area,
                        "opacityClass": opacity,
                        "identificationNumber": optional_int(row, "ID", path) or None,
                        "sequence": sequence,
                        "updatedLyndsNumber": optional_int(row, "Lynds2", path),
                        "galacticLongitudeDeg": galactic_longitude,
                        "galacticLatitudeDeg": galactic_latitude,
                        "catalogueNumberMissing": ldn_number is None or None,
                    }
                ),
                sources=(
                    CatalogSourceRef(
                        catalogue="LDN",
                        identifier=identifier,
                        vizier_id=SPEC.vizier_id,
                        table=SPEC.table,
                        original_identifier=row.get("LDN") or f"Seq {sequence}",
                        original_frame="FK4/B1950",
                    ),
                ),
                catalogue_groups=("ldn",),
                cross_identifications=cross_ids,
            )
        )
    return objects
