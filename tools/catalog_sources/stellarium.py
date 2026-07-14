"""Importer for the target nebula cross-indexes in Stellarium's DSO catalogue.

The upstream file is a 45-column tab-separated catalogue.  This module reads a
local copy only and emits one shared-model object for each row carrying a
Barnard, Sh2, vdB, RCW, LDN, or LBN designation.
"""

from __future__ import annotations

import math
from pathlib import Path

from catalog_coordinates import fk5_j2000_to_icrs, shape_from_axes
from catalog_identifiers import catalogue_aliases, dedupe_aliases
from catalog_model import CatalogObject, CatalogSourceRef
from catalog_sources.base import SourceRowError, compact_properties


SOURCE_VERSION = "v26.2"
CATALOG_VERSION = "3.23"
EXPECTED_ROWS = 94_899
EXPECTED_SELECTED_ROWS = 3_409
SOURCE_URL = (
    "https://raw.githubusercontent.com/Stellarium/stellarium/"
    f"{SOURCE_VERSION}/nebulae/default/catalog.txt"
)
SOURCE_SHA256 = "38a7c8c19b07bb3b2a659769acf4e5611a261732727d8e541c52ce691ab607aa"
SOURCE_TABLE = "nebulae/default/catalog.txt"

_FIELD_COUNT = 45

# Zero-based field, normalized group, display prefix, separator, integer field.
_CROSS_INDEX_FIELDS = (
    (16, "NGC", "NGC", " ", True),
    (17, "IC", "IC", " ", True),
    (18, "M", "M", "", True),
    (19, "C", "C", "", True),
    (20, "Barnard", "Barnard", " ", True),
    (21, "Sh2", "Sh2", "-", True),
    (22, "vdB", "vdB", " ", True),
    (23, "RCW", "RCW", " ", True),
    (24, "LDN", "LDN", " ", True),
    (25, "LBN", "LBN", " ", True),
    (26, "Cr", "Cr", " ", True),
    (27, "Mel", "Mel", " ", True),
    (28, "PGC", "PGC", " ", True),
    (29, "UGC", "UGC", " ", True),
    (30, "Ced", "Ced", " ", False),
    (31, "Arp", "Arp", " ", True),
    (32, "VV", "VV", " ", True),
    (33, "PK", "PK", " ", False),
    (34, "PN G", "PN G", "", False),
    (35, "SNR G", "SNR G", "", False),
    (36, "ACO", "ACO", " ", False),
    (37, "HCG", "HCG", " ", False),
    (38, "ESO", "ESO", " ", False),
    (39, "vdBH", "vdBH", " ", False),
    (40, "DWB", "DWB", " ", True),
    (41, "Tr", "Tr", " ", True),
    (42, "St", "St", " ", True),
    (43, "Ru", "Ru", " ", True),
    (44, "vdB-Ha", "vdB-Ha", " ", True),
)

# Field, identifier-normalization hint, explicit UI provenance label.
_TARGET_FIELDS = (
    (20, "barnard", "Barnard via Stellarium"),
    (21, "sh2", "Sharpless 2 via Stellarium"),
    (22, "vdb", "vdB via Stellarium"),
    (23, "rcw", "RCW via Stellarium"),
    (24, "ldn", "LDN via Stellarium"),
    (25, "lbn", "LBN via Stellarium"),
)
_TARGET_GROUPS = {
    "barnard": "barnard",
    "sh2": "sharpless",
    "vdb": "vdb",
    "rcw": "rcw",
    "ldn": "ldn",
    "lbn": "lbn",
}

_TYPE_MAP = {
    "G": "G",
    "GX": "G",
    "OC": "OCl",
    "OPC": "OCl",
    "PN": "PN",
    "PN?": "PN",
    "DN": "DrkN",
    "IR": "DrkN",
    "MOC": "DrkN",
    "CGB": "Neb",
    "GIG": "G",
    "RN": "RfN",
    "EN": "EmN",
    "C+N": "Cl+N",
    "HII": "HII",
    "SNR": "SNR",
    "NB": "Neb",
    "BN": "Neb",
    "GNE": "HII",
    "ISM": "Neb",
    "SFR": "Neb",
}


def _error(path: Path, line_number: int, message: str) -> SourceRowError:
    return SourceRowError(f"{path}:{line_number}: {message}")


def _float(row: list[str], index: int, name: str, path: Path, line_number: int) -> float:
    raw = row[index].strip()
    if not raw:
        raise _error(path, line_number, f"required field {name} is blank")
    try:
        value = float(raw)
    except ValueError as exc:
        raise _error(path, line_number, f"invalid number in {name}: {raw!r}") from exc
    if not math.isfinite(value):
        raise _error(path, line_number, f"non-finite number in {name}: {raw!r}")
    return value


def _integer(
    row: list[str], index: int, name: str, path: Path, line_number: int, *, optional: bool = False
) -> int | None:
    raw = row[index].strip()
    if optional and raw in {"", "0"}:
        return None
    if not raw:
        raise _error(path, line_number, f"required field {name} is blank")
    try:
        value = int(raw)
    except ValueError as exc:
        raise _error(path, line_number, f"invalid integer in {name}: {raw!r}") from exc
    if optional and value <= 0:
        raise _error(path, line_number, f"{name} must be a positive integer or 0 (missing)")
    return value


def _catalog_float(
    row: list[str], index: int, name: str, path: Path, line_number: int, *, sentinel_99: bool = False
) -> float | None:
    value = _float(row, index, name, path, line_number)
    return None if sentinel_99 and value == 99 else value


def _magnitude(
    row: list[str], index: int, name: str, path: Path, line_number: int
) -> float | None:
    value = _catalog_float(
        row, index, name, path, line_number, sentinel_99=True
    )
    # Stellarium's own text-to-binary converter treats non-positive
    # photometry as missing (while preserving the documented sub-1 values).
    return None if value is None or value <= 0 else value


def _cross_identifications(
    row: list[str], path: Path, line_number: int
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    identifiers: list[str] = []
    groups: list[str] = []
    for index, group, prefix, separator, integer_field in _CROSS_INDEX_FIELDS:
        raw = row[index].strip()
        if raw in {"", "0"}:
            continue
        if integer_field:
            value = _integer(row, index, group, path, line_number, optional=True)
            assert value is not None
            suffix = str(value)
        else:
            suffix = raw
        identifiers.append(f"{prefix}{separator}{suffix}")
        groups.append(group)
    return tuple(identifiers), tuple(groups)


def _target_values(
    row: list[str], path: Path, line_number: int
) -> tuple[tuple[int, str, str, int], ...]:
    values: list[tuple[int, str, str, int]] = []
    for index, hint, catalogue in _TARGET_FIELDS:
        value = _integer(row, index, hint, path, line_number, optional=True)
        if value is not None:
            values.append((index, hint, catalogue, value))
    return tuple(values)


def _target_designation(index: int, value: int) -> str:
    return {
        20: f"Barnard {value}",
        21: f"Sh2-{value}",
        22: f"vdB {value}",
        23: f"RCW {value}",
        24: f"LDN {value}",
        25: f"LBN {value}",
    }[index]


def _object(row: list[str], path: Path, line_number: int) -> CatalogObject | None:
    targets = _target_values(row, path, line_number)
    if not targets:
        return None

    stellarium_id = _integer(row, 0, "Stellarium DSO id", path, line_number)
    assert stellarium_id is not None
    ra_deg = _float(row, 1, "RA", path, line_number)
    dec_deg = _float(row, 2, "Dec", path, line_number)
    b_magnitude = _magnitude(row, 3, "B magnitude", path, line_number)
    v_magnitude = _magnitude(row, 4, "V magnitude", path, line_number)
    source_type = row[5].strip()
    morphology = row[6].strip()
    normalized_source_type = source_type.upper()
    type_code = _TYPE_MAP.get(normalized_source_type, "Other")

    major = _float(row, 7, "major axis", path, line_number)
    minor = _float(row, 8, "minor axis", path, line_number)
    position_angle = _float(row, 9, "position angle", path, line_number)
    if major < 0 or minor < 0:
        raise _error(path, line_number, "major and minor axes must be non-negative")
    if not major and minor:
        raise _error(path, line_number, "a positive minor axis requires a positive major axis")
    if position_angle < -1:
        raise _error(path, line_number, "position angle must be -1 (missing) or non-negative")
    shape = shape_from_axes(
        major if major > 0 else None,
        minor if minor > 0 else None,
        position_angle_deg=(position_angle if minor > 0 and position_angle >= 0 else None),
        derivation="stellarium_catalog_axes",
    )

    cross_ids, source_groups = _cross_identifications(row, path, line_number)
    primary = _target_designation(targets[0][0], targets[0][3])
    variants: list[str] = []
    sources: list[CatalogSourceRef] = []
    for index, hint, catalogue, value in targets:
        designation = _target_designation(index, value)
        variants.extend(catalogue_aliases(hint, str(value)))
        sources.append(
            CatalogSourceRef(
                catalogue=catalogue,
                identifier=str(value),
                table=SOURCE_TABLE,
                original_identifier=designation,
                original_frame="FK5/J2000",
            )
        )

    redshift = _catalog_float(row, 10, "redshift", path, line_number, sentinel_99=True)
    redshift_error = _catalog_float(row, 11, "redshift error", path, line_number)
    parallax = _catalog_float(row, 12, "parallax", path, line_number)
    parallax_error = _catalog_float(row, 13, "parallax error", path, line_number)
    distance = _catalog_float(row, 14, "distance", path, line_number)
    distance_error = _catalog_float(row, 15, "distance error", path, line_number)
    # Stellarium deliberately reuses the V-magnitude field as the 1–6
    # opacity class for dark nebulae and objects carrying a Barnard number.
    # It must not enter astronomical magnitude filters or detail readouts.
    uses_opacity = (
        type_code == "DrkN"
        or any(target[0] in {20, 24} for target in targets)
    )
    opacity_class: int | None = None
    if uses_opacity and v_magnitude is not None:
        if not v_magnitude.is_integer() or not 1 <= v_magnitude <= 6:
            raise _error(
                path,
                line_number,
                f"dark-nebula opacity must be an integer from 1 to 6, got {v_magnitude}",
            )
        opacity_class = int(v_magnitude)
    magnitude = None if uses_opacity else (
        v_magnitude if v_magnitude is not None else b_magnitude
    )
    magnitude_band = None if uses_opacity else (
        "V" if v_magnitude is not None else ("B" if b_magnitude is not None else None)
    )

    return CatalogObject(
        uid=f"stellarium:{stellarium_id}",
        primary_name=primary,
        aliases=dedupe_aliases(primary, (*cross_ids, *variants)),
        type_code=type_code,
        coordinates=fk5_j2000_to_icrs(
            ra_deg,
            dec_deg,
            origin=f"Stellarium DSO Catalogue {CATALOG_VERSION} ({SOURCE_VERSION})",
            original_values={"raDeg": ra_deg, "decDeg": dec_deg},
        ),
        shape=shape,
        properties=compact_properties(
            {
                "stellariumId": stellarium_id,
                "stellariumType": source_type,
                "morphologyClass": morphology,
                "stellariumCatalogueGroups": source_groups,
                "bMagnitude": None if uses_opacity else b_magnitude,
                "vMagnitude": None if uses_opacity else v_magnitude,
                "magnitude": magnitude,
                "magnitudeBand": magnitude_band,
                "opacityClass": opacity_class,
                "redshift": redshift,
                "redshiftError": redshift_error if redshift_error else None,
                "parallaxMas": parallax if parallax else None,
                "parallaxErrorMas": parallax_error if parallax_error else None,
                "distanceKpc": distance if distance and distance > 0 else None,
                "distanceErrorKpc": distance_error if distance_error and distance_error > 0 else None,
            }
        ),
        sources=tuple(sources),
        catalogue_groups=tuple(_TARGET_GROUPS[target[1]] for target in targets),
        cross_identifications=cross_ids,
    )


def load(path: Path, *, strict: bool = True) -> list[CatalogObject]:
    """Parse a local Stellarium ``catalog.txt`` into normalized target objects."""

    if not path.is_file():
        raise FileNotFoundError(f"Stellarium catalogue source not found: {path}")
    objects: list[CatalogObject] = []
    row_count = 0
    found_version: str | None = None
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        for line_number, line in enumerate(stream, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("#"):
                if stripped.startswith("# Version "):
                    found_version = stripped.removeprefix("# Version ").split()[0]
                continue
            row_count += 1
            row = line.rstrip("\r\n").split("\t")
            if len(row) != _FIELD_COUNT:
                raise _error(
                    path,
                    line_number,
                    f"expected {_FIELD_COUNT} tab-separated fields, found {len(row)}",
                )
            parsed = _object(row, path, line_number)
            if parsed is not None:
                objects.append(parsed)

    if strict and found_version != CATALOG_VERSION:
        raise SourceRowError(
            f"{path}: expected Stellarium DSO catalogue version {CATALOG_VERSION}, "
            f"found {found_version or 'no version header'}"
        )
    if strict and row_count != EXPECTED_ROWS:
        raise SourceRowError(f"{path}: expected {EXPECTED_ROWS:,} rows, found {row_count:,}")
    if strict and len(objects) != EXPECTED_SELECTED_ROWS:
        raise SourceRowError(
            f"{path}: expected {EXPECTED_SELECTED_ROWS:,} target rows, found {len(objects):,}"
        )
    return objects
