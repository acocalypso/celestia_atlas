#!/usr/bin/env python3
"""Build a searchable Galactic Wolf-Rayet star supplement from SIMBAD TAP."""

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
from typing import Any, Iterable, Sequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data" / "sources" / "simbad" / "wr-stars-vmag-2026-09-12.tsv"
SOURCE_SHA256 = "cf4a23213c1c01f058fe6cb826cc0b18a7ebd10b42f19d5e6ba257e38f1ae995"
QUERY_PATH = ROOT / "data" / "sources" / "simbad" / "wr-stars.adql"
SOURCE_ENDPOINT = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
SOURCE_PAGE = "https://simbad.u-strasbg.fr/simbad/"
LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/"
REQUIRED_COLUMNS = {
    "oid",
    "wr_id",
    "main_id",
    "ra",
    "dec",
    "otype",
    "identifier",
}
WR_PATTERN = re.compile(r"^WR\s+([0-9][0-9A-Za-z-]*)$", re.IGNORECASE)


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _clean(value: str) -> str:
    return " ".join(value.strip().split())


def _coordinate(
    value: str,
    *,
    field: str,
    minimum: float,
    maximum: float,
    maximum_inclusive: bool,
    row_number: int,
) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"row {row_number}: invalid {field} {value!r}") from exc
    within = minimum <= result <= maximum if maximum_inclusive else minimum <= result < maximum
    if not math.isfinite(result) or not within:
        bracket = "]" if maximum_inclusive else ")"
        raise ValueError(
            f"row {row_number}: {field} must be finite and in "
            f"[{minimum}, {maximum}{bracket}"
        )
    return result


def _wr_identifier(value: str, *, row_number: int) -> str:
    cleaned = _clean(value)
    match = WR_PATTERN.fullmatch(cleaned)
    if not match or not int(re.match(r"\d+", match.group(1)).group()):
        raise ValueError(f"row {row_number}: invalid WR identifier {value!r}")
    return f"WR {match.group(1)}"


def _unique(values: Iterable[str], *, exclude: str = "") -> list[str]:
    seen = {exclude.casefold()} if exclude else set()
    result: list[str] = []
    for value in values:
        cleaned = _clean(value)
        key = cleaned.casefold()
        if not cleaned or key in seen:
            continue
        seen.add(key)
        result.append(cleaned)
    return result


def load_snapshot(
    path: Path,
    *,
    expected_source_rows: int | None = None,
    expected_objects: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    grouped: dict[str, dict[str, Any]] = {}
    wr_owners: dict[str, str] = {}
    source_rows = 0
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        missing = REQUIRED_COLUMNS.difference(reader.fieldnames or ())
        if missing:
            raise ValueError(
                f"{path}: missing required columns: {', '.join(sorted(missing))}"
            )
        for row_number, row in enumerate(reader, start=2):
            source_rows += 1
            oid = _clean(row.get("oid") or "")
            if not oid.isascii() or not oid.isdecimal() or int(oid) <= 0:
                raise ValueError(f"row {row_number}: invalid SIMBAD oid {oid!r}")
            oid = str(int(oid))
            wr_id = _wr_identifier(row.get("wr_id") or "", row_number=row_number)
            key = wr_id.casefold()
            if key in wr_owners and wr_owners[key] != oid:
                raise ValueError(f"row {row_number}: duplicate WR identity {wr_id}")
            wr_owners[key] = oid
            main_id = _clean(row.get("main_id") or "")
            otype = _clean(row.get("otype") or "")
            identifier = _clean(row.get("identifier") or "")
            magnitude_text = (row.get("vmag") or "").strip()
            magnitude = float(magnitude_text) if magnitude_text else None
            if magnitude is not None and not math.isfinite(magnitude):
                raise ValueError(f"row {row_number}: invalid visual magnitude")
            if not main_id or not otype or not identifier:
                raise ValueError(f"row {row_number}: source identity fields must not be empty")
            ra_deg = _coordinate(
                row.get("ra") or "",
                field="RA",
                minimum=0,
                maximum=360,
                maximum_inclusive=False,
                row_number=row_number,
            )
            dec_deg = _coordinate(
                row.get("dec") or "",
                field="declination",
                minimum=-90,
                maximum=90,
                maximum_inclusive=True,
                row_number=row_number,
            )
            identity = (main_id, ra_deg, dec_deg, otype, magnitude)
            record = grouped.setdefault(
                oid,
                {
                    "oid": oid,
                    "mainId": main_id,
                    "raDeg": ra_deg,
                    "decDeg": dec_deg,
                    "simbadOtype": otype,
                    "magnitude": magnitude,
                    "wrIds": set(),
                    "identifiers": set(),
                    "_identity": identity,
                },
            )
            if record["_identity"] != identity:
                raise ValueError(f"row {row_number}: inconsistent SIMBAD identity for oid {oid}")
            record["wrIds"].add(wr_id)
            record["identifiers"].add(identifier)

    if not source_rows:
        raise ValueError(f"{path}: empty WR snapshot")
    if expected_source_rows is not None and source_rows != expected_source_rows:
        raise ValueError(
            f"{path}: expected {expected_source_rows:,} source rows, got {source_rows:,}"
        )
    if expected_objects is not None and len(grouped) != expected_objects:
        raise ValueError(
            f"{path}: expected {expected_objects:,} WR objects, got {len(grouped):,}"
        )
    return list(grouped.values()), source_rows


def compact_records(objects: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for obj in objects:
        wr_ids = sorted(obj["wrIds"], key=lambda value: (value.casefold(), value))
        primary_id = wr_ids[0]
        identifiers = sorted(
            obj["identifiers"], key=lambda value: (value.casefold(), value)
        )
        aliases = _unique(
            [*wr_ids[1:], obj["mainId"], *identifiers], exclude=primary_id
        )
        records.append(
            {
                "uid": f"simbad-wr:{obj['oid']}",
                "id": primary_id,
                "name": primary_id,
                "aliases": aliases,
                "raDeg": obj["raDeg"],
                "decDeg": obj["decDeg"],
                "frame": "ICRS",
                "type": "Wolf-Rayet star",
                "searchOnly": obj["magnitude"] is None,
                **({"mag": obj["magnitude"]} if obj["magnitude"] is not None else {}),
                "catalogSource": "SIMBAD WR",
                "properties": {"simbadOtype": obj["simbadOtype"]},
            }
        )
    records.sort(key=lambda record: (record["id"].casefold(), record["uid"]))
    return records


def metadata(
    *,
    source_sha256: str,
    source_record_count: int,
    records: Sequence[dict[str, Any]],
    source_date_epoch: int | None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "name": "SIMBAD Wolf-Rayet star search supplement",
        "schemaVersion": 1,
        "objectCount": len(records),
        "sourceRecordCount": source_record_count,
        "coordinateFrame": "ICRS",
        "source": SOURCE_ENDPOINT,
        "sourcePage": SOURCE_PAGE,
        "sourceSha256": source_sha256,
        "query": str(QUERY_PATH.relative_to(ROOT)),
        "querySha256": hashlib.sha256(QUERY_PATH.read_text(encoding="utf-8").encode("utf-8")).hexdigest(),
        "license": "ODbL-1.0",
        "licenseUrl": LICENSE_URL,
        "attribution": "SIMBAD astronomical database — CDS, Strasbourg",
        "modifications": (
            "Grouped long-form SIMBAD identifier rows by object; retained WR "
            "designations, cross-identifiers and ICRS positions; emitted the "
            "measured SIMBAD V magnitudes when available; unknown-magnitude "
            "records are search-only. No visual magnitudes are invented."
        ),
    }
    if source_date_epoch is not None:
        generated = dt.datetime.fromtimestamp(source_date_epoch, dt.timezone.utc)
        result["generatedAt"] = generated.replace(microsecond=0).isoformat()
    return result


def _json(value: Any, *, pretty: bool = False) -> str:
    if pretty:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def browser_script(meta: dict[str, Any], records: Sequence[dict[str, Any]]) -> str:
    return f'''// SPDX-License-Identifier: ODbL-1.0
// Derived from a local SIMBAD TAP snapshot; see THIRD_PARTY_NOTICES.md.
"use strict";
window.WR_STAR_CATALOG_META={_json(meta)};
window.WR_STAR_DATA={_json(records)};
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
        output_dir / "wr-star-catalog.js": browser_script(meta, records),
        data_dir / "wr-star-catalog.json": _json({"meta": meta, "stars": records}, pretty=True),
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
    parser.add_argument("--source-file", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--expected-sha256", default=SOURCE_SHA256)
    parser.add_argument("--expected-objects", type=int)
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    parser.add_argument("--source-date-epoch", type=int)
    args = parser.parse_args(argv)

    if not args.source_file.is_file():
        raise FileNotFoundError(
            f"{args.source_file} does not exist; create it with the documented "
            "SIMBAD TAP query before building the WR supplement"
        )
    source_sha256 = sha256_path(args.source_file)
    if args.expected_sha256 and source_sha256.casefold() != args.expected_sha256.casefold():
        raise RuntimeError(
            f"{args.source_file}: expected sha256 {args.expected_sha256}, got {source_sha256}"
        )
    objects, source_rows = load_snapshot(
        args.source_file, expected_objects=args.expected_objects
    )
    if args.source_file.resolve() == DEFAULT_SOURCE.resolve() and (len(objects), source_rows) != (518, 6458):
        raise ValueError("Pinned WR response count changed")
    records = compact_records(objects)
    epoch = args.source_date_epoch
    if epoch is None and os.environ.get("SOURCE_DATE_EPOCH"):
        epoch = int(os.environ["SOURCE_DATE_EPOCH"])
    if epoch is None:
        epoch = 1789171200
    meta = metadata(
        source_sha256=source_sha256,
        source_record_count=source_rows,
        records=records,
        source_date_epoch=epoch,
    )
    paths = write_outputs(args.output_dir, meta=meta, records=records)
    print(f"Generated {len(records):,} WR search stars at {paths['wr-star-catalog.js']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
