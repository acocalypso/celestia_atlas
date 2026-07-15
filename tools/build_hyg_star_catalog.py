#!/usr/bin/env python3
"""Build the separately licensed, naked-eye HYG v4.1 star layer."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
from typing import Any, Iterable, Sequence
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SOURCE_VERSION = "v4.1"
SOURCE_COMMIT = "3bf37f4b2d5460e1278286320d1d62fab9b493c1"
SOURCE_SHA256 = "d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd"
SOURCE_URL = (
    "https://raw.githubusercontent.com/astronexus/HYG-Database/"
    f"{SOURCE_COMMIT}/hyg/CURRENT/hygdata_v41.csv"
)
SOURCE_PAGE = (
    "https://github.com/astronexus/HYG-Database/blob/"
    f"{SOURCE_COMMIT}/hyg/CURRENT/hygdata_v41.csv"
)
LICENSE_URL = (
    "https://github.com/astronexus/HYG-Database/blob/"
    f"{SOURCE_COMMIT}/LICENSE"
)
EXPECTED_SOURCE_ROWS = 119_626
EXPECTED_ELIGIBLE_ROWS = 8_920
MAGNITUDE_LIMIT = 6.5
CURATED_MATCH_RADIUS_ARCMIN = 2.0
REQUIRED_COLUMNS = {
    "id",
    "hip",
    "proper",
    "ra",
    "dec",
    "mag",
    "ci",
    "con",
}
STAR_DATA_PATTERN = re.compile(
    r"(?:window|globalThis)\.STAR_DATA\s*=\s*(\[.*?\])\s*;",
    re.DOTALL,
)


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def prepare_source(
    *,
    source_file: Path | None,
    expected_sha256: str,
    offline: bool,
) -> tuple[Path, str]:
    path = source_file or ROOT / ".cache" / "hyg" / "v4.1" / "hygdata_v41.csv"
    if not path.is_file():
        if offline:
            raise FileNotFoundError(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        request = Request(SOURCE_URL, headers={"User-Agent": "Celestia-Atlas-builder"})
        with urlopen(request, timeout=120) as response:  # noqa: S310 - pinned HTTPS URL
            with temporary.open("wb") as output:
                shutil.copyfileobj(response, output, length=1024 * 1024)
        temporary.replace(path)
    actual = sha256_path(path)
    if actual.casefold() != expected_sha256.casefold():
        raise RuntimeError(f"{path}: expected sha256 {expected_sha256}, got {actual}")
    return path, actual


def _finite_float(value: str, *, field: str, row_number: int) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"row {row_number}: invalid {field} {value!r}") from exc
    if not math.isfinite(result):
        raise ValueError(f"row {row_number}: non-finite {field} {value!r}")
    return result


def _positive_integer(value: str, *, field: str, row_number: int) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"row {row_number}: invalid {field} {value!r}") from exc
    if result <= 0:
        raise ValueError(f"row {row_number}: {field} must be positive")
    return result


def _unit_vector(ra_hours: float, dec_degrees: float) -> tuple[float, float, float]:
    ra = math.radians(ra_hours * 15.0)
    dec = math.radians(dec_degrees)
    cos_dec = math.cos(dec)
    return cos_dec * math.cos(ra), cos_dec * math.sin(ra), math.sin(dec)


def load_curated_stars(path: Path) -> list[dict[str, Any]]:
    match = STAR_DATA_PATTERN.search(path.read_text(encoding="utf-8"))
    if not match:
        raise ValueError(f"{path}: could not find a JSON STAR_DATA assignment")
    payload = json.loads(match.group(1))
    if not isinstance(payload, list):
        raise ValueError(f"{path}: STAR_DATA must be an array")
    result: list[dict[str, Any]] = []
    for index, star in enumerate(payload, start=1):
        if not isinstance(star, dict):
            raise ValueError(f"{path}: curated star {index} must be an object")
        ra = star.get("ra")
        dec = star.get("dec")
        if not isinstance(ra, (int, float)) or not math.isfinite(ra):
            raise ValueError(f"{path}: curated star {index} has invalid RA")
        if not isinstance(dec, (int, float)) or not math.isfinite(dec):
            raise ValueError(f"{path}: curated star {index} has invalid declination")
        if not 0 <= ra < 24 or not -90 <= dec <= 90:
            raise ValueError(f"{path}: curated star {index} is outside the sky")
        result.append(star)
    return result


def load_hyg_candidates(
    path: Path,
    *,
    expected_source_rows: int | None = EXPECTED_SOURCE_ROWS,
    expected_eligible_rows: int | None = EXPECTED_ELIGIBLE_ROWS,
) -> tuple[list[dict[str, Any]], int]:
    candidates: list[dict[str, Any]] = []
    source_rows = 0
    seen_hyg_ids: set[int] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        missing = REQUIRED_COLUMNS.difference(reader.fieldnames or ())
        if missing:
            raise ValueError(f"{path}: missing required columns: {', '.join(sorted(missing))}")
        for row_number, row in enumerate(reader, start=2):
            source_rows += 1
            raw_hyg_id = (row.get("id") or "").strip()
            try:
                hyg_id = int(raw_hyg_id)
            except ValueError as exc:
                raise ValueError(
                    f"row {row_number}: invalid HYG id {raw_hyg_id!r}"
                ) from exc
            if hyg_id in seen_hyg_ids:
                raise ValueError(f"row {row_number}: duplicate HYG id {hyg_id}")
            seen_hyg_ids.add(hyg_id)
            # HYG id 0 is Sol. Solar-system rendering owns it, so the star layer
            # deliberately starts with positive HYG identifiers.
            if hyg_id == 0:
                continue
            if hyg_id < 0:
                raise ValueError(f"row {row_number}: HYG id must not be negative")
            magnitude = _finite_float(
                row.get("mag") or "", field="magnitude", row_number=row_number
            )
            if magnitude > MAGNITUDE_LIMIT:
                continue
            ra = _finite_float(row.get("ra") or "", field="RA", row_number=row_number)
            dec = _finite_float(
                row.get("dec") or "", field="declination", row_number=row_number
            )
            if not 0 <= ra < 24 or not -90 <= dec <= 90:
                raise ValueError(f"row {row_number}: coordinates are outside the sky")
            hip_text = (row.get("hip") or "").strip()
            hip = (
                _positive_integer(hip_text, field="HIP id", row_number=row_number)
                if hip_text
                else None
            )
            proper = (row.get("proper") or "").strip()
            identifier = f"HIP {hip}" if hip is not None else f"HYG {hyg_id}"
            record: dict[str, Any] = {
                "uid": f"hyg:{hyg_id}",
                "hyg": hyg_id,
                "id": identifier,
                "name": proper or identifier,
                "ra": ra,
                "dec": dec,
                "mag": magnitude,
                "con": (row.get("con") or "").strip(),
                "catalogSource": "HYG",
            }
            if proper:
                record["named"] = True
            color_index = (row.get("ci") or "").strip()
            if color_index:
                record["bv"] = _finite_float(
                    color_index, field="color index", row_number=row_number
                )
            candidates.append(record)
    if expected_source_rows is not None and source_rows != expected_source_rows:
        raise ValueError(
            f"{path}: expected {expected_source_rows:,} source rows, got {source_rows:,}"
        )
    if expected_eligible_rows is not None and len(candidates) != expected_eligible_rows:
        raise ValueError(
            f"{path}: expected {expected_eligible_rows:,} stars at mag <= "
            f"{MAGNITUDE_LIMIT}, got {len(candidates):,}"
        )
    return candidates, source_rows


def exclude_curated_duplicates(
    candidates: Iterable[dict[str, Any]],
    curated_stars: Iterable[dict[str, Any]],
    *,
    radius_arcmin: float = CURATED_MATCH_RADIUS_ARCMIN,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not math.isfinite(radius_arcmin) or radius_arcmin <= 0:
        raise ValueError("duplicate-match radius must be finite and positive")
    curated_vectors = [
        _unit_vector(float(star["ra"]), float(star["dec"]))
        for star in curated_stars
    ]
    threshold = math.cos(math.radians(radius_arcmin / 60.0))
    kept: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for record in candidates:
        vector = _unit_vector(record["ra"], record["dec"])
        duplicate = any(
            sum(left * right for left, right in zip(vector, curated_vector))
            >= threshold
            for curated_vector in curated_vectors
        )
        (excluded if duplicate else kept).append(record)
    return kept, excluded


def metadata(
    *,
    source_sha256: str,
    source_record_count: int,
    eligible_record_count: int,
    records: Sequence[dict[str, Any]],
    curated_record_count: int,
    curated_excluded_count: int,
    source_date_epoch: int | None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "name": "HYG naked-eye star supplement",
        "version": SOURCE_VERSION,
        "schemaVersion": 1,
        "objectCount": len(records),
        "namedRecordCount": sum(record.get("named") is True for record in records),
        "colorIndexRecordCount": sum("bv" in record for record in records),
        "sourceRecordCount": source_record_count,
        "eligibleRecordCount": eligible_record_count,
        "curatedRecordCount": curated_record_count,
        "curatedExcludedCount": curated_excluded_count,
        "magnitudeLimit": MAGNITUDE_LIMIT,
        "curatedMatchRadiusArcmin": CURATED_MATCH_RADIUS_ARCMIN,
        "coordinateFrame": "Equatorial J2000.0",
        "source": SOURCE_URL,
        "sourcePage": SOURCE_PAGE,
        "sourceSha256": source_sha256,
        "sourceCommit": SOURCE_COMMIT,
        "project": "https://github.com/astronexus/HYG-Database",
        "license": "CC-BY-SA-4.0",
        "licenseUrl": LICENSE_URL,
        "attribution": "HYG Database by David Nash (Astronomy Nexus)",
        "modifications": (
            "Selected non-solar stars with apparent visual magnitude <= 6.5; "
            "excluded HYG components within 2 arcminutes of the curated STAR_DATA "
            "layer to prevent duplicate rendering; renamed HYG ci to optional bv; "
            "serialized compact JSON and JavaScript assets."
        ),
        "fields": {
            "uid": "Stable HYG row identity (hyg:<id>)",
            "hyg": "HYG v4.1 row id",
            "id": "HIP identifier when available, otherwise HYG identifier",
            "name": "HYG proper name, otherwise the identifier",
            "named": "Present and true only when HYG proper is non-empty",
            "ra": "J2000.0 right ascension in hours",
            "dec": "J2000.0 declination in degrees",
            "mag": "Apparent visual magnitude",
            "bv": "Optional B-V color index from HYG ci",
            "con": "IAU constellation abbreviation",
            "catalogSource": "Compact per-record provenance label",
        },
    }
    if source_date_epoch is not None:
        generated = dt.datetime.fromtimestamp(source_date_epoch, dt.timezone.utc)
        result["generatedAt"] = generated.replace(microsecond=0).isoformat()
    return result


def _json(value: Any, *, pretty: bool = False) -> str:
    if pretty:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )


def browser_script(meta: dict[str, Any], records: Sequence[dict[str, Any]]) -> str:
    return f'''// SPDX-License-Identifier: CC-BY-SA-4.0
// Derived from HYG v4.1; see THIRD_PARTY_NOTICES.md.
"use strict";
window.HYG_STAR_CATALOG_META={_json(meta)};
window.HYG_STAR_DATA={_json(records)};
'''


def write_outputs(
    output_dir: Path,
    *,
    meta: dict[str, Any],
    records: Sequence[dict[str, Any]],
) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    values = {
        output_dir / "hyg-star-catalog.js": browser_script(meta, records),
        data_dir / "hyg-star-catalog.json": _json({"meta": meta, "stars": records})
        + "\n",
    }
    written: dict[str, Path] = {}
    for path, content in values.items():
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(content, encoding="utf-8", newline="\n")
        temporary.replace(path)
        written[path.name] = path
    return written


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-file", type=Path)
    parser.add_argument("--expected-sha256", default=SOURCE_SHA256)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--curated-file", type=Path, default=ROOT / "catalog.js")
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    parser.add_argument("--source-date-epoch", type=int)
    args = parser.parse_args(argv)

    source, source_sha256 = prepare_source(
        source_file=args.source_file,
        expected_sha256=args.expected_sha256,
        offline=args.offline,
    )
    curated = load_curated_stars(args.curated_file)
    candidates, source_rows = load_hyg_candidates(source)
    records, excluded = exclude_curated_duplicates(candidates, curated)
    epoch = args.source_date_epoch
    if epoch is None and os.environ.get("SOURCE_DATE_EPOCH"):
        epoch = int(os.environ["SOURCE_DATE_EPOCH"])
    meta = metadata(
        source_sha256=source_sha256,
        source_record_count=source_rows,
        eligible_record_count=len(candidates),
        records=records,
        curated_record_count=len(curated),
        curated_excluded_count=len(excluded),
        source_date_epoch=epoch,
    )
    paths = write_outputs(args.output_dir, meta=meta, records=records)
    print(
        f"Generated {len(records):,} HYG stars at {paths['hyg-star-catalog.js']} "
        f"({len(excluded):,} curated duplicates excluded)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
