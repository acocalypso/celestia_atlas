"""Importer for the Sharpless 2 H II catalogue, VizieR VII/20."""

from __future__ import annotations

from pathlib import Path

from catalog_coordinates import fk4_to_icrs, shape_from_axes
from catalog_identifiers import catalogue_aliases, dedupe_aliases
from catalog_model import CatalogObject, CatalogSourceRef
from catalog_sources.base import SourceSpec, compact_properties, optional_float, optional_int, positive, ranged_int, read_vizier_tsv, required


SPEC = SourceSpec(
    key="sharpless",
    catalogue="Sh2",
    vizier_id="VII/20",
    table="catalog",
    filename="sharpless.tsv",
    expected_rows=313,
    required_columns=("Sh2", "RA1900", "DE1900", "Diam", "Form", "Struct", "Bright", "Stars"),
    url="https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII%2F20%2Fcatalog&-out.all&-out.max=unlimited",
)


def load(path: Path, *, strict: bool = True) -> list[CatalogObject]:
    rows = read_vizier_tsv(path, SPEC.required_columns, expected_rows=SPEC.expected_rows if strict else None)
    objects: list[CatalogObject] = []
    for row in rows:
        number = optional_int(row, "Sh2", path)
        if number is None:
            required(row, "Sh2", path)
        identifier = str(number)
        primary = f"Sh2-{identifier}"
        form = ranged_int(row, "Form", path, 1, 3, optional=False)
        diameter = positive(optional_float(row, "Diam", path))
        objects.append(
            CatalogObject(
                uid=f"sh2:{identifier}",
                primary_name=primary,
                aliases=dedupe_aliases(primary, catalogue_aliases("sh2", identifier)),
                type_code="HII",
                coordinates=fk4_to_icrs(required(row, "RA1900", path), required(row, "DE1900", path), equinox="B1900", accuracy_arcsec=15, origin="VII/20 original 1900.0 position"),
                shape=shape_from_axes(
                    diameter,
                    diameter,
                    approximate=form != 1,
                    derivation="catalog_maximum_diameter",
                ) if diameter else shape_from_axes(None),
                properties=compact_properties(
                    {
                        "formClass": form,
                        "structureClass": ranged_int(row, "Struct", path, 1, 3, optional=False),
                        "brightnessClass": ranged_int(row, "Bright", path, 1, 3, optional=False),
                        "brightnessScale": "1 faintest; 3 brightest",
                        "associatedStarCount": optional_int(row, "Stars", path),
                    }
                ),
                sources=(CatalogSourceRef("Sh2", identifier, SPEC.vizier_id, SPEC.table, identifier, "FK4/B1900"),),
                catalogue_groups=("sharpless",),
            )
        )
    return objects
