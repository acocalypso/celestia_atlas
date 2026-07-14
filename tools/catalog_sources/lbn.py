"""Importer for Lynds' Catalogue of Bright Nebulae, VizieR VII/9."""

from __future__ import annotations

from pathlib import Path
import re

from catalog_coordinates import fk4_to_icrs, shape_from_area, shape_from_axes
from catalog_identifiers import catalogue_aliases, dedupe_aliases
from catalog_model import CatalogObject, CatalogSourceRef
from catalog_sources.base import SourceSpec, compact_properties, optional_float, optional_int, positive, ranged_int, read_vizier_tsv, required


SPEC = SourceSpec(
    key="lbn",
    catalogue="LBN",
    vizier_id="VII/9",
    table="catalog",
    filename="lbn.tsv",
    expected_rows=1125,
    required_columns=("Seq", "GLON", "GLAT", "RA1950", "DE1950", "Diam1", "Diam2", "Area", "Color", "Bright", "ID", "Name"),
    url="https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII%2F9%2Fcatalog&-out.all&-out.max=unlimited",
)


def _cross_identification(value: str) -> str | None:
    text = value.strip()
    if not text:
        return None
    sharpless = re.fullmatch(r"S\s*(\d+)", text, flags=re.IGNORECASE)
    if sharpless:
        return f"Sh2-{int(sharpless.group(1))}"
    ngcic = re.fullmatch(r"(NGC|IC)\s*0*(\d+)([A-Za-z]?)", text, flags=re.IGNORECASE)
    if ngcic:
        return f"{ngcic.group(1).upper()} {int(ngcic.group(2))}{ngcic.group(3).upper()}"
    return text


def _published_class(row: dict[str, str], name: str, path: Path, maximum: int) -> int | None:
    value = optional_int(row, name, path)
    if value in (None, 0):
        return None
    if not 1 <= value <= maximum:
        from catalog_sources.base import row_error

        raise row_error(path, row, f"{name} must be 0 (unknown) or in [1, {maximum}]")
    return value


def load(path: Path, *, strict: bool = True) -> list[CatalogObject]:
    rows = read_vizier_tsv(path, SPEC.required_columns, expected_rows=SPEC.expected_rows if strict else None)
    result: list[CatalogObject] = []
    for row in rows:
        sequence = optional_int(row, "Seq", path)
        if sequence is None:
            required(row, "Seq", path)
        identifier = str(sequence)
        primary = f"LBN {identifier}"
        major = positive(optional_float(row, "Diam1", path))
        minor = positive(optional_float(row, "Diam2", path))
        area = positive(optional_float(row, "Area", path))
        shape = shape_from_axes(major, minor, derivation="catalog_axes") if major else shape_from_area(area)
        source_name = row.get("Name", "").strip()
        cross_id = _cross_identification(source_name)
        aliases = (*catalogue_aliases("lbn", identifier), *((cross_id,) if cross_id else ()))
        result.append(
            CatalogObject(
                uid=f"lbn:{identifier}",
                primary_name=primary,
                aliases=dedupe_aliases(primary, aliases),
                type_code="Neb",
                coordinates=fk4_to_icrs(required(row, "RA1950", path), required(row, "DE1950", path), equinox="B1950", accuracy_arcsec=900, origin="VII/9 cloud centre"),
                shape=shape,
                properties=compact_properties(
                    {
                        "areaSquareDeg": area,
                        "colorClass": _published_class(row, "Color", path, 4),
                        "brightnessClass": _published_class(row, "Bright", path, 6),
                        "brightnessScale": "1 brightest; 6 barely detectable",
                        "complexityId": optional_int(row, "ID", path),
                        "galacticLongitudeDeg": optional_float(row, "GLON", path),
                        "galacticLatitudeDeg": optional_float(row, "GLAT", path),
                    }
                ),
                sources=(CatalogSourceRef("LBN", identifier, SPEC.vizier_id, SPEC.table, identifier, "FK4/B1950"),),
                catalogue_groups=("lbn",),
                cross_identifications=((cross_id,) if cross_id else ()),
            )
        )
    return result
