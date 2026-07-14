#!/usr/bin/env python3
"""Build a browser-test bundle from OpenNGC plus hand-authored source fixtures.

This helper exists only for CI and local integration testing.  It never reads
or publishes the complete rights-restricted VizieR tables.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from build_dso_catalog import (
    DEFAULT_OPENNGC_VERSION,
    DEFAULT_OVERRIDES,
    ROOT,
    _selected_manifest,
    prepare_openngc_sources,
)
from catalog_dedup import deduplicate_catalog, load_overrides
from catalog_model import CatalogObject
from catalog_output import write_outputs
from catalog_sources import SOURCE_MODULES, SOURCE_SPECS
from catalog_sources import openngc


FIXTURE_DIR = ROOT / "tests" / "fixtures" / "catalog_sources"


def build_fixture_records(openngc_source_dir: Path) -> list[CatalogObject]:
    records = list(
        openngc.load(openngc_source_dir, version=DEFAULT_OPENNGC_VERSION)
    )
    for key, module in SOURCE_MODULES.items():
        spec = SOURCE_SPECS[key]
        kwargs: dict[str, object] = {"strict": False}
        if spec.notes_filename:
            kwargs["notes_path"] = FIXTURE_DIR / spec.notes_filename
        records.extend(module.load(FIXTURE_DIR / spec.filename, **kwargs))
    return records


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--openngc-source-dir",
        type=Path,
        default=ROOT / ".cache" / "openngc" / DEFAULT_OPENNGC_VERSION,
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / ".cache" / "catalog-browser-fixture",
    )
    args = parser.parse_args(argv)

    openngc_dir = prepare_openngc_sources(
        version=DEFAULT_OPENNGC_VERSION,
        source_dir=args.openngc_source_dir,
        offline=True,
    )
    selected = ("openngc", *SOURCE_MODULES.keys())
    result = deduplicate_catalog(
        build_fixture_records(openngc_dir),
        overrides=load_overrides(DEFAULT_OVERRIDES),
        include_spatial_candidates=False,
    )
    manifest = _selected_manifest(
        selected,
        openngc_dir=openngc_dir,
        openngc_version=DEFAULT_OPENNGC_VERSION,
        vizier_dir=FIXTURE_DIR,
        overrides_path=DEFAULT_OVERRIDES,
    )
    manifest["testFixture"] = (
        "Optional-source records are hand-authored schema fixtures, not full "
        "VizieR catalogue extracts."
    )
    paths = write_outputs(
        args.output_dir,
        result.objects,
        source_manifest=manifest,
        candidates=result.candidates,
        ambiguous_cross_identifications=result.ambiguous_cross_identifications,
        source_date_epoch=0,
    )
    print(
        f"Generated {len(result.objects):,} browser-fixture records at "
        f"{paths['dso-catalog.js']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
