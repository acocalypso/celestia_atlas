"""Importer for van den Bergh reflection nebulae, VizieR VII/21."""

from __future__ import annotations

from pathlib import Path

from catalog_coordinates import fk5_j2000_to_icrs, galactic_to_icrs, shape_from_axes
from catalog_identifiers import catalogue_aliases, dedupe_aliases
from catalog_model import CatalogObject, CatalogSourceRef
from catalog_sources.base import SourceSpec, compact_properties, optional_float, optional_int, positive, read_vizier_tsv, required


SPEC = SourceSpec(
    key="vdb",
    catalogue="vdB",
    vizier_id="VII/21",
    table="catalog",
    filename="vdb.tsv",
    expected_rows=158,
    required_columns=("VdB", "DM", "HD", "SpType", "Vmag", "Type", "SurfBr", "Color", "Absorb", "BRadMax", "RRadMax", "oGLON", "oGLAT"),
    url="https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII%2F21%2Fcatalog&-out.all&-out.max=unlimited",
)


def load(path: Path, *, strict: bool = True) -> list[CatalogObject]:
    rows = read_vizier_tsv(path, SPEC.required_columns, expected_rows=SPEC.expected_rows if strict else None)
    objects: list[CatalogObject] = []
    for row in rows:
        number = optional_int(row, "VdB", path)
        if number is None:
            required(row, "VdB", path)
        identifier = str(number)
        primary = f"vdB {identifier}"
        longitude = optional_float(row, "oGLON", path)
        latitude = optional_float(row, "oGLAT", path)
        if longitude is None or latitude is None:
            required(row, "oGLON" if longitude is None else "oGLAT", path)
        original_converted = galactic_to_icrs(
            longitude,
            latitude,
            accuracy_arcsec=360,
            origin="VII/21 original Galactic coordinates",
        )
        modern_ra = optional_float(row, "_RA", path)
        modern_dec = optional_float(row, "_DE", path)
        modern_coordinates = None
        if modern_ra is not None and modern_dec is not None:
            modern_coordinates = fk5_j2000_to_icrs(
                modern_ra,
                modern_dec,
                accuracy_arcsec=1,
                origin="VizieR-added SIMBAD J2000 illuminating-star position",
                original_values={
                    "raDeg": modern_ra,
                    "decDeg": modern_dec,
                    "galacticLongitudeDeg": longitude,
                    "galacticLatitudeDeg": latitude,
                },
            )
        # The catalogue's actual positions are its Galactic coordinates.
        # VizieR's SIMBAD fields are useful supplementary provenance, but must
        # not silently replace the published catalogue position.
        coordinates = original_converted

        blue_radius = positive(optional_float(row, "BRadMax", path))
        red_radius = positive(optional_float(row, "RRadMax", path))
        radius = max(value for value in (blue_radius, red_radius) if value is not None) if blue_radius or red_radius else None
        hd = row.get("HD", "").strip()
        hd_suffix = row.get("HD2", "").strip()
        associated = [row.get("DM", "").strip()]
        if hd:
            associated.append(f"HD {hd}{hd_suffix}")
        objects.append(
            CatalogObject(
                uid=f"vdb:{identifier}",
                primary_name=primary,
                aliases=dedupe_aliases(primary, catalogue_aliases("vdb", identifier)),
                type_code="RfN",
                coordinates=coordinates,
                shape=shape_from_axes(radius * 2, radius * 2, approximate=True, derivation="maximum_plate_radius") if radius else shape_from_axes(None),
                properties=compact_properties(
                    {
                        "originalGalacticIcrsRaDeg": original_converted.ra_deg,
                        "originalGalacticIcrsDecDeg": original_converted.dec_deg,
                        "vizierSimbadRaDeg": modern_coordinates.ra_deg if modern_coordinates else None,
                        "vizierSimbadDecDeg": modern_coordinates.dec_deg if modern_coordinates else None,
                        "vizierSimbadPositionIsSupplementary": bool(modern_coordinates) or None,
                        "associatedIdentifiers": tuple(value for value in associated if value),
                        "illuminatingStarSpectralType": row.get("SpType", "").strip(),
                        "illuminatingStarVMagnitude": optional_float(row, "Vmag", path),
                        "nebulaClass": row.get("Type", "").strip(),
                        "surfaceBrightnessClass": row.get("SurfBr", "").strip(),
                        "colorClass": row.get("Color", "").strip(),
                        "absorptionClass": row.get("Absorb", "").strip(),
                        "bluePlateRadiusArcmin": blue_radius,
                        "redPlateRadiusArcmin": red_radius,
                    }
                ),
                sources=(CatalogSourceRef("vdB", identifier, SPEC.vizier_id, SPEC.table, identifier, coordinates.original_frame),),
                catalogue_groups=("vdb",),
            )
        )
    return objects
