#!/usr/bin/env python3
"""Build the independently licensed SIMBAD A66 planetary-nebula layer."""

from __future__ import annotations

import argparse
from collections import Counter
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
SNAPSHOT_DATE = "2026-07-15"
SIMBAD_RELEASE = "SIMBAD4 1.8 - 2026-06"
SNAPSHOT_PATH = (
    ROOT / "data" / "sources" / "simbad" / f"a66-{SNAPSHOT_DATE}.tsv"
)
QUERY_PATH = (
    ROOT / "data" / "sources" / "simbad" / f"a66-{SNAPSHOT_DATE}.adql"
)
SOURCE_SHA256 = "1aac0fb91c4ae39581b86a6bf1e8cc2fbdeaa93d0460762f73df59dd7e501348"
EXPECTED_SOURCE_ROWS = 1_152
EXPECTED_OBJECTS = 86
SOURCE_ENDPOINT = "https://simbad.u-strasbg.fr/simbad/sim-tap/sync"
SOURCE_PAGE = "https://simbad.u-strasbg.fr/simbad/"
LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/"
REQUIRED_COLUMNS = {
    "a66_id",
    "main_id",
    "ra",
    "dec",
    "otype",
    "identifier",
}
A66_PATTERN = re.compile(r"^PN\s+A66\s+0*(\d+)$", re.IGNORECASE)
NGC_IC_PATTERN = re.compile(r"^(NGC|IC)\s*0*(\d+)([A-Za-z]?)$", re.IGNORECASE)


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_source(path: Path, *, expected_sha256: str = SOURCE_SHA256) -> str:
    if not path.is_file():
        raise FileNotFoundError(path)
    actual = sha256_path(path)
    if actual.casefold() != expected_sha256.casefold():
        raise RuntimeError(f"{path}: expected sha256 {expected_sha256}, got {actual}")
    return actual


def _clean(value: str) -> str:
    return " ".join(value.strip().split())


def _a66_number(value: str, *, row_number: int) -> int:
    match = A66_PATTERN.fullmatch(_clean(value))
    if not match:
        raise ValueError(f"row {row_number}: invalid A66 identifier {value!r}")
    number = int(match.group(1))
    if not 1 <= number <= EXPECTED_OBJECTS:
        raise ValueError(f"row {row_number}: A66 number is outside 1..86")
    return number


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


def load_snapshot(
    path: Path,
    *,
    expected_source_rows: int | None = EXPECTED_SOURCE_ROWS,
    expected_objects: int | None = EXPECTED_OBJECTS,
) -> tuple[list[dict[str, Any]], int]:
    """Parse and validate the long-form, committed SIMBAD TAP response."""

    grouped: dict[int, dict[str, Any]] = {}
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
            number = _a66_number(row.get("a66_id") or "", row_number=row_number)
            main_id = _clean(row.get("main_id") or "")
            otype = _clean(row.get("otype") or "")
            identifier = _clean(row.get("identifier") or "")
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
            identity = (main_id, ra_deg, dec_deg, otype)
            record = grouped.setdefault(
                number,
                {
                    "number": number,
                    "mainId": main_id,
                    "raDeg": ra_deg,
                    "decDeg": dec_deg,
                    "simbadOtype": otype,
                    "identifiers": set(),
                    "_identity": identity,
                },
            )
            if record["_identity"] != identity:
                raise ValueError(
                    f"row {row_number}: inconsistent SIMBAD identity for A66 {number}"
                )
            if identifier in record["identifiers"]:
                raise ValueError(
                    f"row {row_number}: duplicate identifier {identifier!r} for A66 {number}"
                )
            record["identifiers"].add(identifier)

    if expected_source_rows is not None and source_rows != expected_source_rows:
        raise ValueError(
            f"{path}: expected {expected_source_rows:,} source rows, got {source_rows:,}"
        )
    if expected_objects is not None and len(grouped) != expected_objects:
        raise ValueError(
            f"{path}: expected {expected_objects} A66 objects, got {len(grouped)}"
        )
    if expected_objects == EXPECTED_OBJECTS and set(grouped) != set(range(1, 87)):
        missing = sorted(set(range(1, 87)).difference(grouped))
        raise ValueError(f"{path}: missing A66 numbers: {missing}")

    result: list[dict[str, Any]] = []
    for number in sorted(grouped):
        record = grouped[number]
        expected_identifier = f"PN A66 {number}"
        if expected_identifier not in record["identifiers"]:
            raise ValueError(
                f"{path}: A66 {number} lacks exact SIMBAD identifier {expected_identifier!r}"
            )
        result.append(
            {
                key: value
                for key, value in record.items()
                if key != "_identity"
            }
        )
    return result, source_rows


def _canonical_ngc_ic(value: str) -> str:
    match = NGC_IC_PATTERN.fullmatch(_clean(value))
    if not match:
        return ""
    suffix = match.group(3).lower()
    return f"{match.group(1).lower()}:{int(match.group(2))}{suffix}"


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


def _runtime_type(simbad_otype: str) -> tuple[str, str]:
    return {
        "PN": ("PN", "Planetary nebula"),
        "PN?": ("PN", "Possible planetary nebula"),
        "G": ("G", "Galaxy"),
        "AG?": ("G", "Possible active galaxy"),
        "EmG": ("G", "Emission-line galaxy"),
        "HII": ("HII", "H II region"),
        "SNR": ("SNR", "Supernova remnant"),
        "?": ("Other", "Deep-sky object"),
    }.get(simbad_otype, ("Other", "Deep-sky object"))


def compact_records(objects: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Create runtime records; only unique exact NGC/IC IDs become merge keys."""

    object_keys = [
        {_canonical_ngc_ic(value) for value in obj["identifiers"]}
        - {""}
        for obj in objects
    ]
    occurrences = Counter(key for keys in object_keys for key in keys)
    records: list[dict[str, Any]] = []
    for obj, keys in zip(objects, object_keys):
        number = obj["number"]
        primary_id = f"Abell PN {number}"
        exact_identifiers = sorted(
            obj["identifiers"], key=lambda value: (value.casefold(), value)
        )
        required_aliases = [
            f"Abell {number}",
            f"Abell{number}",
            f"A66 {number}",
            f"A66-{number}",
            f"PN A66 {number}",
        ]
        aliases = _unique(
            [*required_aliases, obj["mainId"], *exact_identifiers],
            exclude=primary_id,
        )
        type_code, type_name = _runtime_type(obj["simbadOtype"])
        record: dict[str, Any] = {
            "uid": f"simbad-a66:{number}",
            "id": primary_id,
            "aliases": aliases,
            "raDeg": obj["raDeg"],
            "decDeg": obj["decDeg"],
            "frame": "ICRS",
            "type": type_name,
            "typeCode": type_code,
            "catalogueGroups": ["abell-pn"],
            "catalogSource": "SIMBAD A66",
            "sources": [
                {
                    "catalogue": "SIMBAD A66",
                    "identifier": f"PN A66 {number}",
                }
            ],
            "crossIdentifiers": exact_identifiers,
            "properties": {
                "simbadMainId": obj["mainId"],
                "simbadOtype": obj["simbadOtype"],
                "simbadIdentifierCount": len(exact_identifiers),
            },
        }
        merge_keys = sorted(key for key in keys if occurrences[key] == 1)
        if merge_keys:
            record["mergeKeys"] = merge_keys
        records.append(record)
    return records


def metadata(
    *,
    source_sha256: str,
    query_sha256: str,
    source_record_count: int,
    records: Sequence[dict[str, Any]],
    source_date_epoch: int | None,
) -> dict[str, Any]:
    type_counts = Counter(record["properties"]["simbadOtype"] for record in records)
    result: dict[str, Any] = {
        "name": "Abell 1966 planetary-nebula catalogue layer",
        "version": SNAPSHOT_DATE,
        "versionLabel": "SIMBAD A66",
        "schemaVersion": 1,
        "objectCount": len(records),
        "sourceRecordCount": source_record_count,
        "sourceIdentifierCount": sum(
            len(record["crossIdentifiers"]) for record in records
        ),
        "mergeKeyCount": sum(len(record.get("mergeKeys", ())) for record in records),
        "coordinateFrame": "ICRS",
        "catalogueGroups": ["abell-pn"],
        "source": SOURCE_ENDPOINT,
        "sourcePage": SOURCE_PAGE,
        "sourceSnapshot": f"data/sources/simbad/a66-{SNAPSHOT_DATE}.tsv",
        "queryFile": f"data/sources/simbad/a66-{SNAPSHOT_DATE}.adql",
        "retrievedAt": SNAPSHOT_DATE,
        "serviceRelease": SIMBAD_RELEASE,
        "sourceSha256": source_sha256,
        "querySha256": query_sha256,
        "simbadObjectTypeCounts": dict(sorted(type_counts.items())),
        "license": "ODbL-1.0",
        "licenseUrl": LICENSE_URL,
        "attribution": (
            "This research has made use of the SIMBAD database, operated at "
            "CDS, Strasbourg, France."
        ),
        "modifications": (
            "Selected the 86 objects having exact PN A66 identifiers; grouped the "
            "long-form TAP identifier response by SIMBAD object; normalized display "
            "spacing; added deterministic Abell/A66 search variants; preserved "
            "SIMBAD main identifier, object type, ICRS coordinates, and exact "
            "cross-identifiers; emitted only unique exact NGC/IC merge keys; "
            "serialized separate JSON and JavaScript assets. No positional identity "
            "matching is used."
        ),
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
    return f'''// SPDX-License-Identifier: ODbL-1.0
// Derived from the pinned SIMBAD A66 TAP snapshot; see THIRD_PARTY_NOTICES.md.
"use strict";
window.ABELL_PN_CATALOG_META={_json(meta)};
window.ABELL_PN_CATALOG_DATA={_json(records)};
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
        output_dir / "abell-pn-catalog.js": browser_script(meta, records),
        data_dir / "abell-pn-catalog.json": _json(
            {"meta": meta, "objects": records}
        )
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
    parser.add_argument("--source-file", type=Path, default=SNAPSHOT_PATH)
    parser.add_argument("--expected-sha256", default=SOURCE_SHA256)
    parser.add_argument("--query-file", type=Path, default=QUERY_PATH)
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    parser.add_argument("--source-date-epoch", type=int)
    args = parser.parse_args(argv)

    source_sha256 = validate_source(
        args.source_file, expected_sha256=args.expected_sha256
    )
    if not args.query_file.is_file():
        raise FileNotFoundError(args.query_file)
    query_sha256 = sha256_path(args.query_file)
    objects, source_rows = load_snapshot(args.source_file)
    records = compact_records(objects)
    epoch = args.source_date_epoch
    if epoch is None and os.environ.get("SOURCE_DATE_EPOCH"):
        epoch = int(os.environ["SOURCE_DATE_EPOCH"])
    meta = metadata(
        source_sha256=source_sha256,
        query_sha256=query_sha256,
        source_record_count=source_rows,
        records=records,
        source_date_epoch=epoch,
    )
    paths = write_outputs(args.output_dir, meta=meta, records=records)
    print(
        f"Generated {len(records)} SIMBAD A66 records at "
        f"{paths['abell-pn-catalog.js']} ({meta['mergeKeyCount']} exact merge keys)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
