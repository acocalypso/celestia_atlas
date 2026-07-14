#!/usr/bin/env python3
"""Fetch acknowledged local VizieR TSV caches for the DSO builder.

No downloaded catalogue is committed by this tool.  The generic VizieR terms
permit scientific use with citation but do not establish public redistribution
permission for these historical catalogues, so acknowledgement is explicit.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
from typing import Sequence
import urllib.request

from catalog_sources import SOURCE_SPECS
from catalog_sources.base import read_vizier_tsv


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = Path(__file__).with_name("catalog_sources") / "manifest.json"
USER_AGENT = "CelestiaAtlasCatalogBuilder/3.0 (+https://github.com/acocalypso/celestia_atlas)"


def canonicalize_vizier_tsv(text: str) -> bytes:
    lines = [line for line in text.splitlines() if line.strip() and not line.startswith("#")]
    if len(lines) < 2:
        raise ValueError("VizieR response did not contain a TSV table")
    rows = list(csv.reader(lines, delimiter="\t"))
    header = rows[0]

    def separator(row: list[str]) -> bool:
        populated = [cell.strip() for cell in row if cell.strip()]
        return bool(populated) and all(re.fullmatch(r"-+", cell) for cell in populated)

    start = 1
    if start < len(rows) and separator(rows[start]):
        start += 1
    elif start + 1 < len(rows) and separator(rows[start + 1]):
        start += 2
    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter="\t", lineterminator="\n")
    writer.writerow(header)
    for row in rows[start:]:
        if any(cell.strip() for cell in row) and not separator(row):
            writer.writerow(row)
    return output.getvalue().encode("utf-8")


def _download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/tab-separated-values,text/plain"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return canonicalize_vizier_tsv(response.read().decode("utf-8-sig"))


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _write_verified(
    destination: Path,
    data: bytes,
    *,
    required_columns: tuple[str, ...],
    expected_rows: int,
    expected_sha256: str | None,
) -> str:
    digest = _sha256(data)
    if expected_sha256 and digest != expected_sha256:
        raise RuntimeError(
            f"{destination.name}: source checksum changed: expected {expected_sha256}, got {digest}. Review the upstream revision before updating the manifest."
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_bytes(data)
    read_vizier_tsv(temporary, required_columns, expected_rows=expected_rows)
    temporary.replace(destination)
    return digest


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=ROOT / ".cache" / "catalog-sources")
    parser.add_argument("--catalogues", default=",".join(SOURCE_SPECS), help="Comma-separated source keys or 'all'")
    parser.add_argument("--acknowledge-rights-review", action="store_true", help="Acknowledge that source rights require review and caches are for local use")
    args = parser.parse_args(argv)
    if not args.acknowledge_rights_review:
        parser.error("--acknowledge-rights-review is required; these sources are not cleared for bundled redistribution")
    selected = list(SOURCE_SPECS) if args.catalogues == "all" else [value.strip() for value in args.catalogues.split(",") if value.strip()]
    unknown = sorted(set(selected) - set(SOURCE_SPECS))
    if unknown:
        parser.error(f"unknown catalogue(s): {', '.join(unknown)}")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    for key in selected:
        spec = SOURCE_SPECS[key]
        policy = manifest["catalogues"][key]
        digest = _write_verified(
            args.cache_dir / spec.filename,
            _download(spec.url),
            required_columns=spec.required_columns,
            expected_rows=spec.expected_rows,
            expected_sha256=policy.get("canonicalSha256"),
        )
        print(f"{key}: {spec.expected_rows:,} rows, sha256={digest}")
        if spec.notes_url and spec.notes_filename and spec.notes_expected_rows:
            notes_digest = _write_verified(
                args.cache_dir / spec.notes_filename,
                _download(spec.notes_url),
                required_columns=(spec.catalogue if spec.catalogue != "Barnard" else "Barn", "Text"),
                expected_rows=spec.notes_expected_rows,
                expected_sha256=policy.get("notesCanonicalSha256"),
            )
            print(f"{key} notes: {spec.notes_expected_rows:,} rows, sha256={notes_digest}")
    print("Local scientific-use cache created. Do not redistribute until each catalogue's rights are cleared.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
