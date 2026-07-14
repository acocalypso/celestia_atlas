#!/usr/bin/env python3
"""Build Celestia Atlas' normalized, fully offline DSO catalogue.

With no arguments this reproduces the OpenNGC-only Pages build.  Historical
VizieR catalogues are opt-in, read only from an acknowledged local cache, and
never fetched by the importer or browser runtime.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import time
from typing import Any, Iterable, Sequence
import urllib.error
import urllib.request

import astropy

from catalog_dedup import deduplicate_catalog, load_overrides
from catalog_model import CatalogObject, DedupResult
from catalog_output import write_outputs
from catalog_sources import SOURCE_MODULES, SOURCE_SPECS
from catalog_sources import openngc


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OPENNGC_VERSION = "v20260501"
OPENNGC_BASE = "https://raw.githubusercontent.com/mattiaverga/OpenNGC/{version}/database_files/{name}"
USER_AGENT = "CelestiaAtlasCatalogBuilder/3.0 (+https://github.com/acocalypso/celestia_atlas)"
SOURCE_MANIFEST = Path(__file__).with_name("catalog_sources") / "manifest.json"
DEFAULT_OVERRIDES = Path(__file__).with_name("catalog_overrides.json")


def _sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _download(url: str, retries: int = 4) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/csv,*/*;q=0.8"})
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
            if isinstance(exc, urllib.error.HTTPError) and exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise
            if attempt + 1 < retries:
                time.sleep(2**attempt)
    assert last is not None
    raise last


def prepare_openngc_sources(
    *,
    version: str,
    source_dir: Path | None,
    offline: bool,
) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9._-]+", version):
        raise ValueError("OpenNGC version contains unsupported URL characters")
    if source_dir is not None:
        if not (source_dir / "NGC.csv").is_file():
            raise FileNotFoundError(source_dir / "NGC.csv")
        return source_dir
    cache = ROOT / ".cache" / "openngc" / version
    if offline:
        if not (cache / "NGC.csv").is_file():
            raise FileNotFoundError(f"No cached OpenNGC {version}; run once without --offline")
        return cache
    cache.mkdir(parents=True, exist_ok=True)
    for name in openngc.FILES:
        url = OPENNGC_BASE.format(version=version, name=name)
        try:
            data = _download(url)
        except urllib.error.HTTPError as exc:
            if name == "addendum.csv" and exc.code == 404:
                continue
            raise
        temporary = (cache / name).with_suffix(".csv.tmp")
        temporary.write_bytes(data)
        temporary.replace(cache / name)
    return cache


def _selected_manifest(
    selected: Sequence[str],
    *,
    openngc_dir: Path | None,
    openngc_version: str,
    vizier_dir: Path | None,
    overrides_path: Path,
) -> dict[str, Any]:
    policy = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    catalogues: dict[str, Any] = {}
    if "openngc" in selected:
        assert openngc_dir is not None
        files = {
            name: _sha256_path(openngc_dir / name)
            for name in openngc.FILES
            if (openngc_dir / name).exists()
        }
        catalogues["openngc"] = {
            "name": "OpenNGC",
            "authors": "Mattia Verga and OpenNGC contributors",
            "version": openngc_version,
            "project": "https://github.com/mattiaverga/OpenNGC",
            "publicationUrl": "https://github.com/mattiaverga/OpenNGC",
            "vizierId": None,
            "sourceTables": sorted(files),
            "sourceUrls": [
                OPENNGC_BASE.format(version=openngc_version, name=name)
                for name in openngc.FILES
                if name in files
            ],
            "excludedTypes": sorted(openngc.EXCLUDED_TYPES),
            "readMeUrl": "https://github.com/mattiaverga/OpenNGC#readme",
            "requiredAcknowledgement": "Attribute OpenNGC to Mattia Verga and contributors, link CC BY-SA 4.0, and indicate modifications.",
            "license": "CC-BY-SA-4.0",
            "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
            "termsUrl": "https://github.com/mattiaverga/OpenNGC/blob/master/LICENSE",
            "rightsStatus": "redistribution-permitted-with-attribution-and-share-alike",
            "modifications": "Parsed the semicolon-delimited OpenNGC release files; excluded unsupported stellar, duplicate, nonexistent, and nova rows; normalized identifiers and ICRS coordinates; selected V magnitude with B magnitude as fallback.",
            "files": files,
        }
    for key in selected:
        if key == "openngc":
            continue
        assert vizier_dir is not None
        spec = SOURCE_SPECS[key]
        entry = dict(policy["catalogues"][key])
        entry.update(
            {
                "table": spec.table,
                "filename": spec.filename,
                "sourceUrl": spec.url,
                "sourceSha256": _sha256_path(vizier_dir / spec.filename),
            }
        )
        if spec.notes_filename and (vizier_dir / spec.notes_filename).exists():
            entry["notesFilename"] = spec.notes_filename
            entry["notesSourceSha256"] = _sha256_path(vizier_dir / spec.notes_filename)
        catalogues[key] = entry
    return {
        "schemaVersion": 1,
        "rightsNoticeUrl": policy["rightsNoticeUrl"],
        "rightsPolicy": policy["rightsPolicy"],
        "vizierServiceDoi": policy["vizierServiceDoi"],
        "catalogues": catalogues,
        "transformSoftware": {"astropy": astropy.__version__},
        "dedupOverridesSha256": _sha256_path(overrides_path),
    }


def _verify_cached_source(key: str, source_dir: Path, policy: dict[str, Any]) -> None:
    spec = SOURCE_SPECS[key]
    path = source_dir / spec.filename
    if not path.is_file():
        raise FileNotFoundError(
            f"Missing {path}. Run tools/fetch_catalog_sources.py with explicit rights acknowledgement."
        )
    expected = policy["catalogues"][key].get("canonicalSha256")
    actual = _sha256_path(path)
    if expected and actual != expected:
        raise RuntimeError(f"{path}: expected sha256 {expected}, got {actual}")
    if spec.notes_filename:
        notes_path = source_dir / spec.notes_filename
        if not notes_path.is_file():
            raise FileNotFoundError(
                f"Missing {notes_path}. Fetch the complete {key} source, including its notes table."
            )
        notes_expected = policy["catalogues"][key].get("notesCanonicalSha256")
        notes_actual = _sha256_path(notes_path)
        if notes_expected and notes_actual != notes_expected:
            raise RuntimeError(
                f"{notes_path}: expected sha256 {notes_expected}, got {notes_actual}"
            )


def build_catalog(
    *,
    catalogues: Sequence[str] = ("openngc",),
    openngc_version: str = DEFAULT_OPENNGC_VERSION,
    openngc_source_dir: Path | None = None,
    vizier_source_dir: Path | None = None,
    offline: bool = False,
    acknowledge_rights_review: bool = False,
    overrides_path: Path = DEFAULT_OVERRIDES,
    include_spatial_candidates: bool = True,
) -> tuple[DedupResult, dict[str, Any]]:
    selected = tuple(dict.fromkeys(catalogues))
    unknown = sorted(set(selected) - {"openngc", *SOURCE_MODULES})
    if unknown:
        raise ValueError(f"Unknown catalogue(s): {', '.join(unknown)}")
    vizier_selected = [key for key in selected if key != "openngc"]
    if vizier_selected and not acknowledge_rights_review:
        raise PermissionError(
            "VizieR catalogue rights remain review-required; pass acknowledge_rights_review=True for a local build"
        )
    if vizier_selected and vizier_source_dir is None:
        raise ValueError("vizier_source_dir is required for selected VizieR catalogues")

    objects: list[CatalogObject] = []
    openngc_dir: Path | None = None
    if "openngc" in selected:
        openngc_dir = prepare_openngc_sources(
            version=openngc_version,
            source_dir=openngc_source_dir,
            offline=offline,
        )
        objects.extend(openngc.load(openngc_dir, version=openngc_version))

    policy = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    if vizier_source_dir is not None:
        for key in vizier_selected:
            _verify_cached_source(key, vizier_source_dir, policy)
            spec = SOURCE_SPECS[key]
            kwargs: dict[str, Any] = {"strict": True}
            if spec.notes_filename:
                kwargs["notes_path"] = vizier_source_dir / spec.notes_filename
            objects.extend(SOURCE_MODULES[key].load(vizier_source_dir / spec.filename, **kwargs))

    overrides = load_overrides(overrides_path)
    result = deduplicate_catalog(
        objects,
        overrides=overrides,
        include_spatial_candidates=include_spatial_candidates,
    )
    manifest = _selected_manifest(
        selected,
        openngc_dir=openngc_dir,
        openngc_version=openngc_version,
        vizier_dir=vizier_source_dir,
        overrides_path=overrides_path,
    )
    return result, manifest


def _parse_catalogues(value: str) -> tuple[str, ...]:
    if value.strip().casefold() == "all":
        return ("openngc", *SOURCE_MODULES.keys())
    return tuple(part.strip().casefold() for part in value.split(",") if part.strip())


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogues", default="openngc", help="Comma-separated keys or 'all' (default: OpenNGC only)")
    parser.add_argument("--openngc-version", default=DEFAULT_OPENNGC_VERSION)
    parser.add_argument("--openngc-source-dir", type=Path)
    parser.add_argument("--vizier-source-dir", type=Path)
    parser.add_argument("--offline", action="store_true", help="Forbid OpenNGC network downloads")
    parser.add_argument("--acknowledge-rights-review", action="store_true")
    parser.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES)
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    parser.add_argument("--source-date-epoch", type=int, default=None)
    parser.add_argument("--legacy-openngc-outputs", action=argparse.BooleanOptionalAction, default=None)
    parser.add_argument("--no-spatial-candidates", action="store_true")
    args = parser.parse_args(argv)
    selected = _parse_catalogues(args.catalogues)
    try:
        result, manifest = build_catalog(
            catalogues=selected,
            openngc_version=args.openngc_version,
            openngc_source_dir=args.openngc_source_dir,
            vizier_source_dir=args.vizier_source_dir,
            offline=args.offline,
            acknowledge_rights_review=args.acknowledge_rights_review,
            overrides_path=args.overrides,
            include_spatial_candidates=not args.no_spatial_candidates,
        )
    except (ValueError, PermissionError) as exc:
        parser.error(str(exc))
    epoch = args.source_date_epoch
    if epoch is None and os.environ.get("SOURCE_DATE_EPOCH"):
        epoch = int(os.environ["SOURCE_DATE_EPOCH"])
    legacy = args.legacy_openngc_outputs
    if legacy is None:
        legacy = selected == ("openngc",)
    paths = write_outputs(
        args.output_dir,
        result.objects,
        source_manifest=manifest,
        candidates=result.candidates,
        ambiguous_cross_identifications=result.ambiguous_cross_identifications,
        source_date_epoch=epoch,
        legacy_openngc_outputs=legacy,
    )
    print(f"Generated {len(result.objects):,} normalized DSO records")
    for path in sorted(paths.values()):
        print(f"  {path}")
    if result.ambiguous_cross_identifications:
        print(f"Preserved {len(result.ambiguous_cross_identifications):,} ambiguous cross-identifications without merging")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
