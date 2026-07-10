#!/usr/bin/env python3
"""Batch-download local DSO images from the NASA Image and Video Library.

This is a build-time tool. The atlas never contacts NASA at runtime.

Typical usage:
  python tools/build_openngc_catalog.py
  python tools/fetch_nasa_dso_images.py M31 "NGC 253" M42
  python tools/fetch_nasa_dso_images.py --popular
  python tools/fetch_nasa_dso_images.py --all --types galaxy --mag-max 11 --limit 100
  python tools/fetch_nasa_dso_images.py --all --missing --offset 100 --limit 100

NASA's publication library does not contain a suitable photograph for every
catalogue object. Missing results are recorded and do not stop a batch.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable

try:
    from PIL import Image
except ImportError:
    Image = None

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "images" / "dso"
DATA = ROOT / "data" / "openngc-catalog.json"
CATALOG_JS = ROOT / "catalog.js"
API = "https://images-api.nasa.gov"
USER_AGENT = "CelestiaAtlasImageFetcher/2.0 (+https://github.com/acocalypso/celestia_atlas)"
REPORT = OUT / "download-report.json"
STATE = OUT / ".nasa-download-state.json"
POPULAR = [
    "M1", "M8", "M16", "M17", "M20", "M27", "M31", "M33", "M42", "M45",
    "M51", "M57", "M63", "M64", "M74", "M81", "M82", "M83", "M87", "M97",
    "M101", "M104", "M106", "NGC 253", "NGC 5128", "NGC 7000", "NGC 6960",
]
BAD_TITLE_WORDS = {
    "artist", "illustration", "concept", "diagram", "poster", "logo", "infographic",
    "animation", "simulation", "model", "chart", "map", "spectrum", "spectra",
}
GOOD_TITLE_WORDS = {"hubble", "webb", "jwst", "spitzer", "chandra", "galaxy", "nebula", "cluster"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
BROWSER_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def slug(value: str) -> str:
    return key(value) or "object"


def request(url: str, accept: str = "application/json,image/*,*/*;q=0.8") -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})


def get_json(url: str, retries: int = 4) -> Any:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request(url), timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            last = exc
        if attempt + 1 < retries:
            time.sleep(min(12, 1.5 * 2**attempt))
    assert last is not None
    raise last


def download(url: str, destination: Path, retries: int = 4) -> None:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request(url, "image/*,*/*;q=0.8"), timeout=120) as response, destination.open("wb") as target:
                while chunk := response.read(1024 * 256):
                    target.write(chunk)
            if destination.stat().st_size < 1024:
                raise OSError("downloaded asset is unexpectedly small")
            return
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
            destination.unlink(missing_ok=True)
            if attempt + 1 < retries:
                time.sleep(min(12, 1.5 * 2**attempt))
    assert last is not None
    raise last


def collection_items(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    collection = payload.get("collection")
    if isinstance(collection, dict) and isinstance(collection.get("items"), list):
        return [item for item in collection["items"] if isinstance(item, dict)]
    if isinstance(payload.get("items"), list):
        return [item for item in payload["items"] if isinstance(item, dict)]
    return []


def asset_urls(payload: Any) -> list[str]:
    if isinstance(payload, list):
        entries: list[Any] = payload
    elif isinstance(payload, dict):
        collection = payload.get("collection")
        if isinstance(collection, dict) and isinstance(collection.get("items"), list):
            entries = collection["items"]
        elif isinstance(payload.get("items"), list):
            entries = payload["items"]
        elif payload.get("href") or payload.get("url"):
            entries = [payload]
        else:
            entries = []
    else:
        entries = []

    urls: list[str] = []
    for entry in entries:
        url: Any = entry if isinstance(entry, str) else (entry.get("href") or entry.get("url") if isinstance(entry, dict) else None)
        if isinstance(url, str) and url.startswith(("https://", "http://")) and url not in urls:
            urls.append(url)
    return urls


def extension(url: str) -> str:
    return Path(urllib.parse.unquote(urllib.parse.urlparse(url).path)).suffix.lower()


def asset_score(url: str) -> int:
    ext = extension(url)
    if ext not in IMAGE_EXTENSIONS:
        return -10_000
    low = url.lower()
    score = 0
    if ext in BROWSER_EXTENSIONS:
        score += 50
    if "~orig" in low:
        score += 45
    elif "~large" in low:
        score += 40
    elif "~medium" in low:
        score += 30
    elif "~small" in low:
        score += 10
    if ext in {".tif", ".tiff"}:
        score -= 30
    return score


def choose_asset(urls: Iterable[str]) -> str | None:
    ranked = sorted(((asset_score(url), url) for url in urls), reverse=True)
    return ranked[0][1] if ranked and ranked[0][0] > -1000 else None


def item_data(item: dict[str, Any]) -> dict[str, Any]:
    data = item.get("data")
    if isinstance(data, list):
        return next((entry for entry in data if isinstance(entry, dict)), {})
    return data if isinstance(data, dict) else {}


def object_names(obj: dict[str, Any]) -> list[str]:
    values = [obj.get("id"), obj.get("catalogId"), obj.get("name"), *(obj.get("aliases") or [])]
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not isinstance(value, str) or not value.strip():
            continue
        k = key(value)
        if k and k not in seen:
            seen.add(k)
            result.append(value.strip())
    return result


def query_candidates(obj: dict[str, Any]) -> list[str]:
    names = object_names(obj)
    primary = names[0] if names else str(obj.get("id") or "")
    common = str(obj.get("name") or "").strip()
    type_name = str(obj.get("type") or "deep sky object")
    queries = []
    if common:
        queries.extend([
            f"{primary} {common} Hubble Webb",
            f"{common} {type_name} NASA",
        ])
    queries.extend([
        f"{primary} {type_name}",
        primary,
    ])
    for alias in names[1:4]:
        queries.append(f"{alias} {type_name}")
    seen: set[str] = set()
    return [q for q in queries if q and not (key(q) in seen or seen.add(key(q)))]


def result_score(obj: dict[str, Any], data: dict[str, Any]) -> int:
    title = str(data.get("title") or "")
    description = str(data.get("description") or "")
    keywords = data.get("keywords") or []
    if isinstance(keywords, str):
        keywords = [keywords]
    haystack = " ".join([title, description, " ".join(map(str, keywords))]).lower()
    compact = key(haystack)
    score = 0
    names = object_names(obj)
    for index, name in enumerate(names[:8]):
        nk = key(name)
        if nk and nk in compact:
            score += 60 if index == 0 else 35
        if name.lower() in haystack:
            score += 20
    score += sum(8 for word in GOOD_TITLE_WORDS if word in title.lower())
    score -= sum(45 for word in BAD_TITLE_WORDS if word in title.lower())
    media_type = data.get("media_type")
    if media_type == "image":
        score += 20
    return score


def find_asset(item: dict[str, Any], data: dict[str, Any]) -> str | None:
    endpoints: list[str] = []
    href = item.get("href")
    if isinstance(href, str) and href:
        endpoints.append(href)
    nasa_id = data.get("nasa_id")
    if isinstance(nasa_id, str) and nasa_id:
        endpoints.append(f"{API}/asset/{urllib.parse.quote(nasa_id, safe='')}")
    for endpoint in dict.fromkeys(endpoints):
        try:
            chosen = choose_asset(asset_urls(get_json(endpoint)))
            if chosen:
                return chosen
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            print(f"    asset manifest unavailable: {exc}", file=sys.stderr)
    links = item.get("links")
    return choose_asset(asset_urls(links)) if isinstance(links, list) else None


def search_best(obj: dict[str, Any], page_size: int = 50) -> tuple[dict[str, Any], dict[str, Any], str, str, int] | None:
    candidates: list[tuple[int, dict[str, Any], dict[str, Any], str]] = []
    used_ids: set[str] = set()
    used_queries: list[str] = []
    for query in query_candidates(obj):
        used_queries.append(query)
        params = urllib.parse.urlencode({"q": query, "media_type": "image", "page_size": page_size})
        payload = get_json(f"{API}/search?{params}")
        for item in collection_items(payload):
            data = item_data(item)
            nasa_id = str(data.get("nasa_id") or "")
            if nasa_id and nasa_id in used_ids:
                continue
            if nasa_id:
                used_ids.add(nasa_id)
            candidates.append((result_score(obj, data), item, data, query))
        # Exact catalogued names often resolve on the first query. Do not make
        # six requests when there are already strong candidates.
        if candidates and max(row[0] for row in candidates) >= 90:
            break

    for score, item, data, query in sorted(candidates, key=lambda row: row[0], reverse=True)[:20]:
        if score < 20:
            continue
        asset = find_asset(item, data)
        if asset:
            return item, data, asset, query, score
    return None


def parse_curated_catalog() -> list[dict[str, Any]]:
    text = CATALOG_JS.read_text(encoding="utf-8")
    marker = "window.DSO_DATA = "
    start = text.find(marker)
    if start < 0:
        return []
    start += len(marker)
    end = text.find(";", start)
    if end < 0:
        return []
    try:
        data = json.loads(text[start:end])
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def load_catalog(auto_build: bool) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not DATA.exists() and auto_build:
        builder = ROOT / "tools" / "build_openngc_catalog.py"
        import subprocess
        subprocess.run([sys.executable, str(builder)], cwd=ROOT, check=True)
    if DATA.exists():
        payload = json.loads(DATA.read_text(encoding="utf-8"))
        return payload.get("objects", []), payload.get("meta", {})
    fallback = parse_curated_catalog()
    return fallback, {"name": "curated fallback", "objectCount": len(fallback)}


def catalog_lookup(objects: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for obj in objects:
        for name in object_names(obj):
            lookup.setdefault(key(name), obj)
    return lookup


def existing_image(obj: dict[str, Any]) -> Path | None:
    for name in object_names(obj):
        base = slug(name)
        for ext in (".webp", ".jpg", ".jpeg", ".png", ".avif"):
            path = OUT / f"{base}{ext}"
            if path.exists():
                return path
    return None


def read_state() -> dict[str, Any]:
    if not STATE.exists():
        return {"success": {}, "failed": {}}
    try:
        data = json.loads(STATE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {"success": {}, "failed": {}}
    except (json.JSONDecodeError, OSError):
        return {"success": {}, "failed": {}}


def save_state(state: dict[str, Any]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def make_output(obj: dict[str, Any], original: Path, max_dimension: int, quality: int, output_format: str) -> Path:
    base = slug(str(obj.get("id") or obj.get("catalogId") or "object"))
    if Image is None:
        suffix = original.suffix.lower() if original.suffix.lower() in BROWSER_EXTENSIONS else ".jpg"
        output = OUT / f"{base}{suffix}"
        output.write_bytes(original.read_bytes())
        return output

    with Image.open(original) as image:
        image = image.convert("RGB")
        resampling = getattr(Image, "Resampling", Image)
        image.thumbnail((max_dimension, max_dimension), resampling.LANCZOS)
        if output_format == "jpg":
            output = OUT / f"{base}.jpg"
            image.save(output, "JPEG", quality=quality, optimize=True, progressive=True)
        else:
            output = OUT / f"{base}.webp"
            image.save(output, "WEBP", quality=quality, method=6)
    return output


def fetch_one(obj: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    object_id = str(obj.get("id") or obj.get("catalogId") or "Unknown")
    old = existing_image(obj)
    if old and not args.overwrite:
        return {"id": object_id, "status": "skipped-existing", "path": old.relative_to(ROOT).as_posix()}
    if args.dry_run:
        return {"id": object_id, "status": "dry-run", "queries": query_candidates(obj)}

    try:
        best = search_best(obj, args.page_size)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        return {"id": object_id, "status": "failed", "error": f"NASA search failed: {exc}"}
    if not best:
        return {"id": object_id, "status": "not-found", "error": "No relevant downloadable NASA image found"}

    _, data, asset_url, query, score = best
    nasa_id = data.get("nasa_id")
    suffix = extension(asset_url) or ".jpg"
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.TemporaryDirectory() as temporary:
            original = Path(temporary) / f"source{suffix}"
            download(asset_url, original)
            output = make_output(obj, original, args.max_dimension, args.quality, args.format)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        return {"id": object_id, "status": "failed", "error": f"Download/conversion failed: {exc}"}

    creators = [data.get("photographer"), data.get("secondary_creator"), data.get("center")]
    credit = " / ".join(dict.fromkeys(str(value).strip() for value in creators if value)) or "NASA"
    metadata = {
        "object": object_names(obj),
        "title": data.get("title") or f"{object_id} image",
        "alt": data.get("description_508") or data.get("title") or f"Astronomical image of {object_id}",
        "credit": credit,
        "source": f"https://images.nasa.gov/details/{urllib.parse.quote(str(nasa_id or ''))}" if nasa_id else "https://images.nasa.gov/",
        "license": "Review the NASA source page. NASA media is generally available under NASA media usage guidelines; third-party material may have separate rights.",
        "provider": "NASA Image and Video Library",
        "nasa_id": nasa_id,
        "date_created": data.get("date_created"),
        "description": data.get("description"),
        "downloaded_from": asset_url,
        "search_query": query,
        "match_score": score,
        "downloaded_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
    }
    output.with_suffix(".json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"id": object_id, "status": "downloaded", "path": output.relative_to(ROOT).as_posix(), "nasa_id": nasa_id, "score": score}


def type_matches(obj: dict[str, Any], filters: set[str]) -> bool:
    if not filters:
        return True
    haystack = f"{obj.get('typeCode', '')} {obj.get('type', '')}".lower()
    return any(value in haystack for value in filters)


def resolve_selection(objects: list[dict[str, Any]], args: argparse.Namespace) -> list[dict[str, Any]]:
    lookup = catalog_lookup(objects)
    selected: list[dict[str, Any]] = []
    requested = list(args.targets)
    if args.popular:
        requested.extend(POPULAR)
    if args.all:
        selected.extend(objects)
    for target in requested:
        obj = lookup.get(key(target))
        if obj is None:
            obj = {"id": target, "catalogId": target, "name": "", "type": "Deep-sky object", "aliases": []}
        selected.append(obj)

    filters = {value.strip().lower() for raw in args.types for value in raw.split(",") if value.strip()}
    filtered: list[dict[str, Any]] = []
    seen: set[str] = set()
    for obj in selected:
        identity = key(str(obj.get("catalogId") or obj.get("id") or ""))
        if not identity or identity in seen:
            continue
        seen.add(identity)
        if not type_matches(obj, filters):
            continue
        mag = obj.get("mag")
        if args.mag_max is not None and isinstance(mag, (int, float)) and mag > args.mag_max:
            continue
        if args.missing and existing_image(obj):
            continue
        filtered.append(obj)
    start = max(0, args.offset)
    end = None if args.limit == 0 else start + max(0, args.limit)
    return filtered[start:end]


def rebuild_index() -> None:
    import subprocess
    subprocess.run([sys.executable, str(ROOT / "tools" / "build_dso_image_index.py")], cwd=ROOT, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("targets", nargs="*", help="Any catalogue ID or alias, e.g. M31, NGC253, Andromeda Galaxy")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--popular", action="store_true", help="Download a curated list of prominent DSOs")
    group.add_argument("--all", action="store_true", help="Select all objects in the generated OpenNGC catalogue")
    parser.add_argument("--types", action="append", default=[], help="Filter by type text/code; comma-separated, e.g. galaxy,PN")
    parser.add_argument("--mag-max", type=float, help="Only include objects at or brighter than this magnitude when known")
    parser.add_argument("--missing", action="store_true", help="Only select objects without a local image")
    parser.add_argument("--offset", type=int, default=0, help="Skip this many selected objects")
    parser.add_argument("--limit", type=int, default=100, help="Maximum batch size; 0 means unlimited (default: 100)")
    parser.add_argument("--delay", type=float, default=0.8, help="Seconds between NASA searches (default: 0.8)")
    parser.add_argument("--page-size", type=int, default=50, choices=range(1, 101), metavar="1-100")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--skip-failed", action="store_true", help="Skip objects recorded as failed in the state file")
    parser.add_argument("--auto-build-catalog", action="store_true", help="Build/download OpenNGC if generated JSON is absent")
    parser.add_argument("--max-dimension", type=int, default=1920)
    parser.add_argument("--quality", type=int, default=84)
    parser.add_argument("--format", choices=("webp", "jpg"), default="webp")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--list", action="store_true", help="List selected objects and exit")
    args = parser.parse_args()

    if not (args.targets or args.popular or args.all):
        parser.error("specify targets, --popular, or --all")
    if args.limit < 0 or args.offset < 0:
        parser.error("--limit and --offset must be non-negative")

    objects, meta = load_catalog(args.auto_build_catalog)
    selection = resolve_selection(objects, args)
    print(f"Catalogue: {meta.get('name', 'unknown')} ({len(objects):,} objects available)")
    print(f"Selected: {len(selection):,} objects (offset {args.offset}, limit {'none' if args.limit == 0 else args.limit})")
    if args.list:
        for obj in selection:
            print(f"{obj.get('id', ''):12} {obj.get('type', ''):26} {obj.get('name', '')}")
        return 0

    state = read_state()
    results: list[dict[str, Any]] = []
    for index, obj in enumerate(selection, 1):
        object_id = str(obj.get("id") or obj.get("catalogId") or "Unknown")
        if args.skip_failed and key(object_id) in state.get("failed", {}):
            result = {"id": object_id, "status": "skipped-previous-failure"}
        else:
            print(f"[{index}/{len(selection)}] {object_id} — {obj.get('name') or obj.get('type') or ''}")
            result = fetch_one(obj, args)
        results.append(result)
        print(f"  {result['status']}{': ' + result.get('error', '') if result.get('error') else ''}")
        stamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
        identity = key(object_id)
        if result["status"] in {"downloaded", "skipped-existing"}:
            state.setdefault("success", {})[identity] = {**result, "updatedAt": stamp}
            state.setdefault("failed", {}).pop(identity, None)
        elif result["status"] in {"failed", "not-found"}:
            state.setdefault("failed", {})[identity] = {**result, "updatedAt": stamp}
        save_state(state)
        if index < len(selection) and not args.dry_run:
            time.sleep(max(0, args.delay))

    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "catalog": meta,
        "selectionCount": len(selection),
        "results": results,
    }
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    rebuild_index()
    failures = sum(result["status"] in {"failed", "not-found"} for result in results)
    downloaded = sum(result["status"] == "downloaded" for result in results)
    print(f"Finished: {downloaded} downloaded, {failures} unavailable/failed. Report: {REPORT.relative_to(ROOT)}")
    return 1 if failures and not downloaded else 0


if __name__ == "__main__":
    raise SystemExit(main())
