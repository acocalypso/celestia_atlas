"""Shared-model importer for locally cached OpenNGC semicolon CSV files."""

from __future__ import annotations

import csv
from pathlib import Path
import re

from catalog_coordinates import icrs_from_sexagesimal, shape_from_axes
from catalog_identifiers import dedupe_aliases
from catalog_model import CatalogObject, CatalogSourceRef, Coordinates, TYPE_NAMES
from catalog_sources.base import compact_properties


EXCLUDED_TYPES = {"*", "**", "Nova", "NonEx", "Dup"}
FILES = ("NGC.csv", "addendum.csv")
MESSIER_DESIGNATION = re.compile(r"M\d+$")
MESSIER_102_CATALOG_ID = "NGC 5866"


def _messier_40() -> CatalogObject:
    """Return the one Messier entry OpenNGC deliberately cannot represent.

    M40 is an optical double star rather than a deep-sky object.  SIMBAD's
    catalogue-level ICRS position is retained as a point marker so the Atlas
    can expose all 110 historical Messier designations without pretending the
    pair is a nebula or cluster.
    """

    return CatalogObject(
        uid="messier:m40",
        primary_name="M40",
        common_name="Winnecke 4",
        aliases=("M 40", "WNC 4"),
        type_code="DoubleStar",
        coordinates=Coordinates(
            ra_deg=185.55,
            dec_deg=58.083333333333336,
            original_frame="ICRS/J2000",
            original_values={"ra": "12:22:12.0", "dec": "+58:05:00"},
            accuracy_arcsec=30,
            origin="SIMBAD M 40, accessed 2026-07-22",
        ),
        properties={
            "catalogId": "M40",
            "constellation": "UMa",
            "notes": "Optical double star; retained to complete the historical Messier catalogue.",
        },
        sources=(
            CatalogSourceRef(
                "SIMBAD",
                "M 40",
                original_identifier="M 40",
                original_frame="ICRS/J2000",
            ),
        ),
        catalogue_groups=("messier",),
        cross_identifications=("M 40", "WNC 4"),
    )


def _field(row: dict[str, str], *names: str) -> str:
    normalized = {re.sub(r"[^a-z0-9]", "", name.lower()) for name in names}
    for key, value in row.items():
        if re.sub(r"[^a-z0-9]", "", (key or "").lower()) in normalized:
            return (value or "").strip()
    return ""


def _number(value: str) -> float | None:
    try:
        result = float(value)
        return result if result == result and abs(result) != float("inf") else None
    except (TypeError, ValueError):
        return None


def _designation(value: str) -> str:
    raw = re.sub(r"\s+", "", value.upper())
    match = re.fullmatch(r"(NGC|IC|M|C)0*(\d+)([A-Z]?)", raw)
    if not match:
        return value.strip()
    prefix, digits, suffix = match.groups()
    return f"{prefix}{int(digits)}{suffix}" if prefix in {"M", "C"} else f"{prefix} {int(digits)}{suffix}"


def _split(value: str) -> list[str]:
    return [part.strip() for part in re.split(r"\s*[,|]\s*", value or "") if part.strip()]


def _aliases(row: dict[str, str], primary: str) -> tuple[str, tuple[str, ...], str | None]:
    common = _split(_field(row, "Common names", "Common name"))
    values: list[str] = []
    for prefix in ("M", "NGC", "IC"):
        for item in _split(_field(row, prefix, {"M": "Messier", "NGC": "NGC", "IC": "IC"}[prefix])):
            value = re.sub(f"^{prefix}", "", item, flags=re.IGNORECASE).strip()
            if re.fullmatch(r"\d+[A-Za-z]?", value):
                values.append(_designation(f"{prefix}{value}"))
    values.extend(_designation(item) for item in _split(_field(row, "Identifiers", "Identifier"))[:12])
    values.extend(common)
    messier = next((value for value in values if re.fullmatch(r"M\d+", value)), None)
    display = messier or primary
    if display != primary:
        values.insert(0, primary)
    return display, dedupe_aliases(display, values), common[0] if common else None


def _rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, delimiter=";")
        if not reader.fieldnames or "name" not in {re.sub(r"[^a-z0-9]", "", name.lower()) for name in reader.fieldnames}:
            raise ValueError(f"{path}: OpenNGC CSV header not recognized")
        return list(reader)


def load(source_dir: Path, *, strict: bool = True, version: str = "v20260501") -> list[CatalogObject]:
    paths = [source_dir / name for name in FILES if (source_dir / name).exists()]
    if not paths or paths[0].name != "NGC.csv":
        raise FileNotFoundError(f"{source_dir / 'NGC.csv'} not found")
    by_catalog: dict[str, CatalogObject] = {}
    for path in paths:
        for row_number, row in enumerate(_rows(path), start=2):
            type_code = _field(row, "Type")
            if type_code in EXCLUDED_TYPES or type_code not in TYPE_NAMES:
                continue
            primary = _designation(_field(row, "Name"))
            ra = _field(row, "RA")
            dec = _field(row, "Dec", "Declination")
            if not primary or not ra or not dec:
                if strict:
                    raise ValueError(f"{path}:{row_number}: missing identifier or coordinate")
                continue
            display, aliases, common = _aliases(row, primary)
            properties_notes = _field(row, "OpenNGC notes", "OpenNGC note")
            if primary == MESSIER_102_CATALOG_ID:
                display = "M102"
                common = "Spindle Galaxy"
                aliases = dedupe_aliases(display, (primary, *aliases))
                properties_notes = (
                    "Conventionally identified as Messier 102 by NASA; the historical "
                    "M102 identification remains disputed."
                )
            catalogue_groups = (
                ("openngc", "messier")
                if MESSIER_DESIGNATION.fullmatch(display)
                else ("openngc",)
            )
            major = _number(_field(row, "MajAx", "Major axis"))
            minor = _number(_field(row, "MinAx", "Minor axis"))
            pa = _number(_field(row, "PosAng", "Position angle"))
            vmag = _number(_field(row, "V-Mag", "V Mag"))
            bmag = _number(_field(row, "B-Mag", "B Mag"))
            obj = CatalogObject(
                uid=f"openngc:{re.sub(r'[^a-z0-9]', '', primary.casefold())}",
                primary_name=display,
                common_name=common,
                aliases=aliases,
                type_code=type_code,
                coordinates=icrs_from_sexagesimal(
                    ra,
                    dec,
                    accuracy_arcsec=1,
                    origin=f"OpenNGC {version}",
                ),
                shape=shape_from_axes(major, minor, position_angle_deg=pa, derivation="catalog_axes") if major and major > 0 else shape_from_axes(None),
                properties=compact_properties(
                    {
                        "catalogId": primary,
                        "constellation": _field(row, "Const", "Constellation"),
                        "magnitude": vmag if vmag is not None else bmag,
                        "magnitudeBand": "V" if vmag is not None else ("B" if bmag is not None else None),
                        "surfaceBrightness": _number(_field(row, "SurfBr", "Surface brightness")),
                        "hubbleClass": _field(row, "Hubble"),
                        "redshift": _number(_field(row, "Redshift")),
                        "radialVelocityKmS": _number(_field(row, "RadVel", "Radial velocity")),
                        "notes": properties_notes,
                    }
                ),
                sources=(CatalogSourceRef("OpenNGC", primary, None, path.name, primary, "ICRS"),),
                catalogue_groups=catalogue_groups,
                cross_identifications=tuple(value for value in aliases if re.match(r"^(?:M|NGC|IC)\s*\d", value)),
            )
            by_catalog.setdefault(primary.casefold().replace(" ", ""), obj)
    result = list(by_catalog.values())
    result.append(_messier_40())
    if strict and len(result) < 1000:
        raise RuntimeError(f"Only {len(result):,} OpenNGC objects parsed")
    return result
