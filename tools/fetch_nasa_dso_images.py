#!/usr/bin/env python3
"""Download selected NASA Image Library results into images/dso.

This is a build-time helper only. The atlas never contacts NASA at runtime.
Review the generated metadata and source page before publishing because NASA
occasionally hosts third-party copyrighted material.

Examples:
  python tools/fetch_nasa_dso_images.py M31 M51 M104
  python tools/fetch_nasa_dso_images.py --all
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError:  # JPEG/PNG fallback remains usable
    Image = None

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "images" / "dso"
API = "https://images-api.nasa.gov"
USER_AGENT = "CelestiaAtlasImageFetcher/1.1"
TARGETS = {
    "M31": "M31 Andromeda Galaxy Hubble",
    "M32": "M32 galaxy Hubble",
    "M33": "M33 Triangulum Galaxy Hubble",
    "M51": "M51 Whirlpool Galaxy Hubble",
    "M63": "M63 Sunflower Galaxy Hubble",
    "M64": "M64 Black Eye Galaxy Hubble",
    "M65": "M65 galaxy Hubble",
    "M66": "M66 galaxy Hubble",
    "M74": "M74 Phantom Galaxy Hubble",
    "M81": "M81 Bode Galaxy Hubble",
    "M82": "M82 Cigar Galaxy Hubble",
    "M83": "M83 Southern Pinwheel Galaxy Hubble",
    "M87": "M87 galaxy Hubble",
    "M94": "M94 galaxy Hubble",
    "M101": "M101 Pinwheel Galaxy Hubble",
    "M104": "M104 Sombrero Galaxy Hubble",
    "M106": "M106 galaxy Hubble",
    "M110": "M110 galaxy Hubble",
    "NGC253": "NGC 253 Sculptor Galaxy NASA",
    "NGC5128": "NGC 5128 Centaurus A NASA",
}


def request(url: str, timeout: int) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json,image/*,*/*;q=0.8",
        },
    )


def get_json(url: str, retries: int = 3) -> Any:
    """Return decoded JSON, retrying transient NASA/API failures."""
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request(url, 45), timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            last_error = exc
            # Retry throttling and server errors, but not permanent client errors.
            if exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc

        if attempt + 1 < retries:
            time.sleep(1.5 * (attempt + 1))

    assert last_error is not None
    raise last_error


def download(url: str, destination: Path, retries: int = 3) -> None:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request(url, 90), timeout=90) as response, destination.open("wb") as target:
                while chunk := response.read(1024 * 256):
                    target.write(chunk)
            return
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            destination.unlink(missing_ok=True)
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))

    assert last_error is not None
    raise last_error


def collection_items(payload: Any) -> list[dict[str, Any]]:
    """Normalize a Collection+JSON search response into item dictionaries."""
    if not isinstance(payload, dict):
        return []
    collection = payload.get("collection")
    if isinstance(collection, dict) and isinstance(collection.get("items"), list):
        return [item for item in collection["items"] if isinstance(item, dict)]
    if isinstance(payload.get("items"), list):
        return [item for item in payload["items"] if isinstance(item, dict)]
    return []


def asset_urls(payload: Any) -> list[str]:
    """Normalize NASA asset manifests across known response formats.

    The assets endpoint has returned both Collection+JSON objects and a plain
    top-level list. Entries may themselves be URL strings or objects containing
    an ``href`` field.
    """
    entries: list[Any]
    if isinstance(payload, list):
        entries = payload
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
        url: Any = None
        if isinstance(entry, str):
            url = entry
        elif isinstance(entry, dict):
            url = entry.get("href") or entry.get("url")
        if isinstance(url, str) and url.startswith(("https://", "http://")) and url not in urls:
            urls.append(url)
    return urls


def extension_for_url(url: str) -> str:
    path = urllib.parse.unquote(urllib.parse.urlparse(url).path)
    return Path(path).suffix.lower()


def choose_asset(urls: list[str]) -> str | None:
    raster_extensions = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
    browser_extensions = {".jpg", ".jpeg", ".png"}
    images = [url for url in urls if extension_for_url(url) in raster_extensions]

    # Prefer reasonably sized browser-friendly derivatives over giant TIFFs.
    for token in ("~large", "~medium", "~orig", "~small"):
        for url in images:
            if token in url.lower() and extension_for_url(url) in browser_extensions:
                return url
    return next((url for url in images if extension_for_url(url) in browser_extensions), None)


def item_data(item: dict[str, Any]) -> dict[str, Any]:
    data = item.get("data")
    if isinstance(data, list):
        return next((entry for entry in data if isinstance(entry, dict)), {})
    if isinstance(data, dict):
        return data
    return {}


def find_asset(item: dict[str, Any], data: dict[str, Any]) -> str | None:
    """Find a downloadable image, tolerating endpoint and result variations."""
    nasa_id = data.get("nasa_id")
    endpoints: list[str] = []
    href = item.get("href")
    if isinstance(href, str) and href:
        endpoints.append(href)
    if isinstance(nasa_id, str) and nasa_id:
        canonical = f"{API}/asset/{urllib.parse.quote(nasa_id, safe='')}"
        if canonical not in endpoints:
            endpoints.append(canonical)

    for endpoint in endpoints:
        try:
            chosen = choose_asset(asset_urls(get_json(endpoint)))
            if chosen:
                return chosen
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            print(f"  Asset manifest unavailable ({endpoint}): {exc}", file=sys.stderr)

    # Last-resort fallback: some search items include preview image links.
    links = item.get("links")
    if isinstance(links, list):
        chosen = choose_asset(asset_urls(links))
        if chosen:
            return chosen
    return None


def fetch_target(target: str, query: str, overwrite: bool) -> bool:
    slug = target.lower().replace(" ", "")
    webp_path = OUT / f"{slug}.webp"
    jpg_path = OUT / f"{slug}.jpg"
    if not overwrite and (webp_path.exists() or jpg_path.exists()):
        print(f"Skip {target}: image already exists")
        return True

    params = urllib.parse.urlencode({"q": query, "media_type": "image", "page_size": 25})
    try:
        search = get_json(f"{API}/search?{params}")
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        print(f"NASA search failed for {target}: {exc}", file=sys.stderr)
        return False

    items = collection_items(search)
    if not items:
        print(f"No NASA Image Library result for {target}", file=sys.stderr)
        return False

    selected_item: dict[str, Any] | None = None
    selected_data: dict[str, Any] = {}
    asset_url: str | None = None

    # A first search result can be a poster, graphic, or record without assets.
    for item in items[:15]:
        data = item_data(item)
        candidate = find_asset(item, data)
        if candidate:
            selected_item = item
            selected_data = data
            asset_url = candidate
            break

    if selected_item is None or asset_url is None:
        print(f"No downloadable JPEG/PNG image for {target}", file=sys.stderr)
        return False

    data = selected_data
    nasa_id = data.get("nasa_id")
    OUT.mkdir(parents=True, exist_ok=True)
    suffix = extension_for_url(asset_url) or ".jpg"

    try:
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp) / ("source" + suffix)
            print(f"Downloading {target}: {data.get('title', nasa_id or query)}")
            download(asset_url, original)
            if Image is not None:
                with Image.open(original) as image:
                    image = image.convert("RGB")
                    resampling = getattr(Image, "Resampling", Image)
                    image.thumbnail((1920, 1920), resampling.LANCZOS)
                    image.save(webp_path, "WEBP", quality=84, method=6)
                output_path = webp_path
            else:
                safe_suffix = suffix if suffix in {".jpg", ".jpeg", ".png"} else ".jpg"
                output_path = OUT / f"{slug}{safe_suffix}"
                output_path.write_bytes(original.read_bytes())
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        print(f"Download/conversion failed for {target}: {exc}", file=sys.stderr)
        return False

    creators = [data.get("photographer"), data.get("secondary_creator"), data.get("center")]
    credit = " / ".join(dict.fromkeys(str(x).strip() for x in creators if x)) or "NASA"
    metadata = {
        "object": target,
        "title": data.get("title") or f"{target} image",
        "alt": data.get("description_508") or data.get("title") or f"Astronomical image of {target}",
        "credit": credit,
        "source": f"https://images.nasa.gov/details/{urllib.parse.quote(str(nasa_id or ''))}" if nasa_id else "https://images.nasa.gov/",
        "license": "Review the source page. NASA content is generally available under NASA media usage guidelines, but third-party material may have separate rights.",
        "nasa_id": nasa_id,
        "date_created": data.get("date_created"),
        "description": data.get("description"),
        "downloaded_from": asset_url,
    }
    output_path.with_suffix(".json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return True


def rebuild_index() -> None:
    build = ROOT / "tools" / "build_dso_image_index.py"
    namespace = {"__name__": "__main__", "__file__": str(build)}
    exec(compile(build.read_text(encoding="utf-8"), str(build), "exec"), namespace)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("targets", nargs="*", help="DSO IDs such as M31, M51, NGC253")
    parser.add_argument("--all", action="store_true", help="Download all configured galaxy targets")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    requested = list(TARGETS) if args.all else [x.upper().replace(" ", "") for x in args.targets]
    if not requested:
        parser.error("specify one or more targets, or use --all")

    unknown = [x for x in requested if x not in TARGETS]
    if unknown:
        print("Unknown target(s): " + ", ".join(unknown), file=sys.stderr)
        print("Available: " + ", ".join(TARGETS), file=sys.stderr)
        return 2

    results: list[bool] = []
    for target in requested:
        try:
            results.append(fetch_target(target, TARGETS[target], args.overwrite))
        except KeyboardInterrupt:
            print("\nCancelled.", file=sys.stderr)
            break
        except Exception as exc:  # Keep --all running when one external record is malformed.
            print(f"Unexpected failure for {target}: {exc}", file=sys.stderr)
            results.append(False)

    # Always refresh the index so successfully downloaded images are usable even
    # when one or more targets failed.
    rebuild_index()

    failures = sum(not result for result in results)
    if failures:
        print(f"Completed with {failures} failed target(s).", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
