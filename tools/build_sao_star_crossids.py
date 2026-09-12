#!/usr/bin/env python3
"""Build the separately licensed HD-to-SAO search cross-index from SIMBAD TAP."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any, Sequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data" / "sources" / "simbad" / "sao-hd-crossids-2026-09-12.tsv"
SOURCE_SHA256 = "1d29a83094ef71c56de270e8f259112b669c4465dbec1297b6208e5d7ac4d4de"
QUERY_PATH = ROOT / "data" / "sources" / "simbad" / "sao-hd-crossids.adql"
SOURCE_ENDPOINT = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
SOURCE_PAGE = "https://simbad.u-strasbg.fr/simbad/"
LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/"
REQUIRED_COLUMNS = {"oid", "hd_id", "sao_id"}
HD_PATTERN = re.compile(r"^HD\s+0*(\d+)([A-Za-z]*)$", re.IGNORECASE)
SAO_PATTERN = re.compile(r"^SAO\s+0*(\d+)$", re.IGNORECASE)


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _number(
    value: str,
    *,
    pattern: re.Pattern[str],
    field: str,
    row_number: int,
) -> int:
    cleaned = " ".join(value.strip().split())
    match = pattern.fullmatch(cleaned)
    if not match:
        raise ValueError(f"row {row_number}: invalid {field} identifier {value!r}")
    number = int(match.group(1))
    if number <= 0:
        raise ValueError(f"row {row_number}: {field} identifier must be positive")
    return number


def load_cross_ids(path: Path) -> tuple[list[dict[str, Any]], dict[str, int]]:
    grouped: dict[str, set[int]] = {}
    hd_objects: dict[str, set[str]] = {}
    sao_objects: dict[int, set[str]] = {}
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
            oid = (row.get("oid") or "").strip()
            if not oid.isascii() or not oid.isdecimal() or int(oid) <= 0:
                raise ValueError(f"row {row_number}: invalid SIMBAD oid {oid!r}")
            oid = str(int(oid))
            raw_hd = (row.get("hd_id") or "").strip()
            match = HD_PATTERN.fullmatch(raw_hd)
            if not match or int(match.group(1)) <= 0:
                raise ValueError(f"row {row_number}: invalid HD identifier {raw_hd!r}")
            hd = f"{int(match.group(1))}{match.group(2).upper()}"
            sao = _number(
                row.get("sao_id") or "",
                pattern=SAO_PATTERN,
                field="SAO",
                row_number=row_number,
            )
            grouped.setdefault(hd, set()).add(sao)
            hd_objects.setdefault(hd, set()).add(oid)
            sao_objects.setdefault(sao, set()).add(oid)

    if not source_rows:
        raise ValueError(f"{path}: empty SAO snapshot")
    records = [
        {**({"hd": int(hd)} if hd.isdecimal() else {"hdDesignation": f"HD {hd}"}),
         "saos": sorted(sao_ids),
         "ambiguous": len(hd_objects[hd]) != 1 or
                      any(len(sao_objects[sao]) != 1 for sao in sao_ids)}
        for hd, sao_ids in grouped.items()
    ]
    records.sort(key=lambda record: (record.get("hd", 0), record.get("hdDesignation", "")))
    return records, {
        "sourceRowCount": source_rows,
        "hdKeyCount": len(grouped),
        "objectCount": len(records),
        "pairCount": sum(len(values) for values in grouped.values()),
        "ambiguousHdKeyCount": sum(record["ambiguous"] for record in records),
    }


def metadata(
    *,
    source_sha256: str,
    stats: dict[str, int],
    source_date_epoch: int | None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "name": "SIMBAD HD-to-SAO star cross-index",
        "schemaVersion": 1,
        **stats,
        "source": SOURCE_ENDPOINT,
        "sourcePage": SOURCE_PAGE,
        "sourceSha256": source_sha256,
        "query": str(QUERY_PATH.relative_to(ROOT)),
        "querySha256": hashlib.sha256(QUERY_PATH.read_text(encoding="utf-8").encode("utf-8")).hexdigest(),
        "license": "ODbL-1.0",
        "licenseUrl": LICENSE_URL,
        "attribution": "SIMBAD astronomical database — CDS, Strasbourg",
        "modifications": (
            "Retained all distinct HD/SAO pairs grouped by HD; marked conflicting "
            "HD or SAO object identities using SIMBAD oid. Ambiguous groups must "
            "not be attached to stars at runtime."
        ),
        "fields": {
            "hd": "Henry Draper identifier used as the runtime attachment key",
            "hdDesignation": "Exact component designation when HD is not purely numeric",
            "saos": "Sorted unique SAO identifiers",
            "ambiguous": "HD or SAO identifier belongs to multiple SIMBAD objects",
        },
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
window.SAO_STAR_CROSSIDS_META={_json(meta)};
window.SAO_STAR_CROSSIDS={_json(records)};
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
        output_dir / "sao-star-crossids.js": browser_script(meta, records),
        data_dir / "sao-star-crossids.json": _json(
            {"meta": meta, "crossIds": records}, pretty=True
        ),
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
    parser.add_argument("--target-catalogue", type=Path, action="append", default=[])
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    parser.add_argument("--source-date-epoch", type=int)
    args = parser.parse_args(argv)

    if not args.source_file.is_file():
        raise FileNotFoundError(
            f"{args.source_file} does not exist; create it with the documented "
            "SIMBAD TAP query before building the SAO cross-index"
        )
    source_sha256 = sha256_path(args.source_file)
    if args.expected_sha256 and source_sha256.casefold() != args.expected_sha256.casefold():
        raise RuntimeError(
            f"{args.source_file}: expected sha256 {args.expected_sha256}, got {source_sha256}"
        )
    records, stats = load_cross_ids(args.source_file)
    if args.source_file.resolve() == DEFAULT_SOURCE.resolve() and stats["sourceRowCount"] != 190390:
        raise ValueError("Pinned SAO response row count changed")
    target_metadata = []
    if args.target_catalogue:
        keys: set[str] = set()

        def collect(value: Any) -> None:
            if isinstance(value, dict):
                hd = value.get("hd")
                if isinstance(hd, int) and hd > 0:
                    keys.add(f"HD {hd}")
                for child in value.values():
                    collect(child)
            elif isinstance(value, list):
                for child in value:
                    collect(child)
            elif isinstance(value, str):
                match = HD_PATTERN.fullmatch(value.strip())
                if match:
                    keys.add(f"HD {int(match.group(1))}{match.group(2).upper()}")

        for path in args.target_catalogue:
            collect(json.loads(path.read_text(encoding="utf-8")))
            target_metadata.append({"file": path.as_posix(), "sha256": sha256_path(path)})
        if not keys:
            raise ValueError("Target catalogues contain no HD identities")
        stats["unfilteredHdKeyCount"] = len(records)
        stats["sourceAmbiguousHdKeyCount"] = stats["ambiguousHdKeyCount"]
        records = [record for record in records
                   if record.get("hdDesignation", f"HD {record.get('hd')}") in keys]
        stats["objectCount"] = len(records)
        stats["pairCount"] = sum(len(record["saos"]) for record in records)
        stats["ambiguousHdKeyCount"] = sum(record["ambiguous"] for record in records)
    epoch = args.source_date_epoch
    if epoch is None and os.environ.get("SOURCE_DATE_EPOCH"):
        epoch = int(os.environ["SOURCE_DATE_EPOCH"])
    if epoch is None:
        epoch = 1789171200
    meta = metadata(
        source_sha256=source_sha256,
        stats=stats,
        source_date_epoch=epoch,
    )
    meta["targetCatalogues"] = target_metadata
    paths = write_outputs(args.output_dir, meta=meta, records=records)
    print(
        f"Generated {len(records):,} HD groups of SAO cross-identifiers at "
        f"{paths['sao-star-crossids.js']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
