#!/usr/bin/env python3
"""Build the separately licensed Stellarium nebula catalogue supplement."""

from __future__ import annotations

import argparse
from collections import Counter
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any, Iterable, Sequence

from build_dso_catalog import ROOT, _download
from catalog_identifiers import identifier_key
from catalog_model import CatalogObject
from catalog_output import compact_object
from catalog_sources import stellarium


DEFAULT_VERSION = "v26.2"
KNOWN_SOURCES = {
    DEFAULT_VERSION: {
        "sha256": "38a7c8c19b07bb3b2a659769acf4e5611a261732727d8e541c52ce691ab607aa",
        "catalogVersion": "3.23",
    }
}
SOURCE_URL = (
    "https://raw.githubusercontent.com/Stellarium/stellarium/"
    "{version}/nebulae/default/catalog.txt"
)
SOURCE_PAGE = (
    "https://github.com/Stellarium/stellarium/blob/"
    "{version}/nebulae/default/catalog.txt"
)
LICENSE_URL = (
    "https://github.com/Stellarium/stellarium/blob/{version}/COPYING"
)
# Cross-layer attachment is deliberately limited to unique NGC/IC identities.
# Repeated historical nebula designations often represent distinct components.
MERGE_NAMESPACES = {"ic", "ngc"}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def prepare_source(
    *,
    version: str,
    source_file: Path | None,
    expected_sha256: str | None,
    offline: bool,
) -> tuple[Path, str]:
    if not re.fullmatch(r"[A-Za-z0-9._-]+", version):
        raise ValueError("Stellarium version contains unsupported URL characters")
    pinned = KNOWN_SOURCES.get(version, {}).get("sha256")
    expected = (expected_sha256 or pinned or "").casefold()
    if not expected:
        raise ValueError(
            "An explicit --expected-sha256 is required for an unpinned Stellarium version"
        )
    path = source_file or ROOT / ".cache" / "stellarium" / version / "catalog.txt"
    if not path.is_file():
        if offline:
            raise FileNotFoundError(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".txt.tmp")
        temporary.write_bytes(_download(SOURCE_URL.format(version=version)))
        temporary.replace(path)
    actual = _sha256(path)
    if actual.casefold() != expected:
        raise RuntimeError(
            f"{path}: expected sha256 {expected}, got {actual}"
        )
    return path, actual


def _object_identity_keys(obj: CatalogObject) -> set[str]:
    keys: set[str] = set()
    for value in (
        obj.primary_name,
        *obj.aliases,
        *obj.cross_identifications,
    ):
        key = identifier_key(value)
        namespace = key.partition(":")[0]
        if namespace in MERGE_NAMESPACES:
            keys.add(key)
    return keys


def compact_records(objects: Iterable[CatalogObject]) -> list[dict[str, Any]]:
    records = list(objects)
    object_keys = [_object_identity_keys(obj) for obj in records]
    occurrences = Counter(key for keys in object_keys for key in keys)
    result: list[dict[str, Any]] = []
    for obj, keys in zip(records, object_keys):
        value = compact_object(obj)
        # Only unique explicit identifiers may attach a supplement row to an
        # OpenNGC object. Repeated LDN/Sh2/etc. components remain independent.
        unique_keys = sorted(key for key in keys if occurrences[key] == 1)
        if unique_keys:
            value["mergeKeys"] = unique_keys
        result.append(value)
    return result


def _metadata(
    *,
    objects: Sequence[CatalogObject],
    version: str,
    source_sha256: str,
    source_date_epoch: int | None,
) -> dict[str, Any]:
    groups = sorted({group for obj in objects for group in obj.catalogue_groups})
    result: dict[str, Any] = {
        "name": "Stellarium DSO cross-index supplement",
        "version": version,
        "catalogVersion": KNOWN_SOURCES.get(version, {}).get("catalogVersion"),
        "schemaVersion": 1,
        "objectCount": len(objects),
        "coordinateFrame": "ICRS",
        "catalogueGroups": groups,
        "source": SOURCE_PAGE.format(version=version),
        "sourceSha256": source_sha256,
        "project": "https://github.com/Stellarium/stellarium",
        "license": "GPL-2.0-or-later",
        "licenseUrl": LICENSE_URL.format(version=version),
        "attribution": "Stellarium DSO catalogue by the Stellarium project and contributors",
        "modifications": (
            "Selected rows carrying Barnard, Sh2, vdB, RCW, LDN, or LBN "
            "cross-identifiers; normalized names and types; preserved dark-nebula "
            "opacity classes without treating them as magnitudes; transformed the "
            "catalogue's J2000 positions to ICRS; serialized a separate browser asset."
        ),
    }
    if source_date_epoch is not None:
        generated = dt.datetime.fromtimestamp(
            source_date_epoch, dt.timezone.utc
        ).replace(microsecond=0)
        result["generatedAt"] = generated.isoformat()
    return {key: value for key, value in result.items() if value is not None}


def _json(value: Any, *, pretty: bool = False) -> str:
    if pretty:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )


def _browser_script(meta: dict[str, Any], records: list[dict[str, Any]]) -> str:
    meta_json = _json(meta)
    records_json = _json(records)
    return f'''// SPDX-License-Identifier: GPL-2.0-or-later
// Derived from the Stellarium DSO catalogue; see THIRD_PARTY_NOTICES.md.
"use strict";
window.STELLARIUM_DSO_SUPPLEMENT_META={meta_json};
window.STELLARIUM_DSO_SUPPLEMENT_DATA={records_json};
'''


def write_outputs(
    output_dir: Path,
    *,
    meta: dict[str, Any],
    records: list[dict[str, Any]],
) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    values = {
        output_dir / "stellarium-supplement.js": _browser_script(meta, records),
        data_dir / "stellarium-dso-supplement.json": _json(
            {"meta": meta, "objects": records}
        )
        + "\n",
        data_dir / "stellarium-supplement-meta.json": _json(meta, pretty=True),
    }
    written: dict[str, Path] = {}
    for path, text in values.items():
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(text, encoding="utf-8", newline="\n")
        temporary.replace(path)
        written[path.name] = path
    return written


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default=DEFAULT_VERSION)
    parser.add_argument("--source-file", type=Path)
    parser.add_argument("--expected-sha256")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    parser.add_argument("--source-date-epoch", type=int)
    args = parser.parse_args(argv)
    try:
        source, source_sha256 = prepare_source(
            version=args.version,
            source_file=args.source_file,
            expected_sha256=args.expected_sha256,
            offline=args.offline,
        )
    except ValueError as exc:
        parser.error(str(exc))
    objects = stellarium.load(source, strict=True)
    records = compact_records(objects)
    epoch = args.source_date_epoch
    if epoch is None and os.environ.get("SOURCE_DATE_EPOCH"):
        epoch = int(os.environ["SOURCE_DATE_EPOCH"])
    meta = _metadata(
        objects=objects,
        version=args.version,
        source_sha256=source_sha256,
        source_date_epoch=epoch,
    )
    paths = write_outputs(args.output_dir, meta=meta, records=records)
    print(
        f"Generated {len(records):,} Stellarium supplement records at "
        f"{paths['stellarium-supplement.js']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
