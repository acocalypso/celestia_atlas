#!/usr/bin/env python3
"""Compatibility wrapper for the shared normalized catalogue builder.

Existing automation may keep using the historical OpenNGC flags. All parsing,
normalization, provenance, and output generation is delegated to
``build_dso_catalog.py`` so neutral and legacy files cannot become stale
relative to one another.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from build_dso_catalog import DEFAULT_OPENNGC_VERSION, main as build_main


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default=DEFAULT_OPENNGC_VERSION)
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument(
        "--include-other",
        action="store_true",
        help="Retained for CLI compatibility; OpenNGC Other rows are already included.",
    )
    parser.add_argument("--source-date-epoch", type=int)
    args = parser.parse_args(argv)

    forwarded = [
        "--catalogues",
        "openngc",
        "--openngc-version",
        args.version,
    ]
    if args.source_dir is not None:
        forwarded.extend(["--openngc-source-dir", str(args.source_dir)])
    if args.offline:
        forwarded.append("--offline")
    if args.source_date_epoch is not None:
        forwarded.extend(["--source-date-epoch", str(args.source_date_epoch)])
    return build_main(forwarded)


if __name__ == "__main__":
    raise SystemExit(main())
