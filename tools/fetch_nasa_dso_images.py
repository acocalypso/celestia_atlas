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
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # JPEG fallback remains usable
    Image = None

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "images" / "dso"
API = "https://images-api.nasa.gov"
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


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "CelestiaAtlasImageFetcher/1.0"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)


def download(url: str, destination: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "CelestiaAtlasImageFetcher/1.0"})
    with urllib.request.urlopen(req, timeout=90) as response, destination.open("wb") as target:
        while chunk := response.read(1024 * 256):
            target.write(chunk)


def choose_asset(urls: list[str]) -> str | None:
    images = [u for u in urls if re.search(r"\.(?:jpe?g|png|tif|tiff)$", u, re.I)]
    preferences = ("~large", "~medium", "~orig", "~small")
    for token in preferences:
        for url in images:
            if token in url.lower() and re.search(r"\.(?:jpe?g|png)$", url, re.I):
                return url
    return next((u for u in images if re.search(r"\.(?:jpe?g|png)$", u, re.I)), None)


def fetch_target(target: str, query: str, overwrite: bool) -> bool:
    slug = target.lower().replace(" ", "")
    webp_path = OUT / f"{slug}.webp"
    jpg_path = OUT / f"{slug}.jpg"
    if not overwrite and (webp_path.exists() or jpg_path.exists()):
        print(f"Skip {target}: image already exists")
        return True

    params = urllib.parse.urlencode({"q": query, "media_type": "image", "page_size": 25})
    search = get_json(f"{API}/search?{params}")
    items = search.get("collection", {}).get("items", [])
    if not items:
        print(f"No NASA Image Library result for {target}", file=sys.stderr)
        return False

    item = items[0]
    data = (item.get("data") or [{}])[0]
    nasa_id = data.get("nasa_id")
    assets = get_json(item["href"]).get("collection", {}).get("items", [])
    urls = [asset.get("href", "") for asset in assets]
    asset_url = choose_asset(urls)
    if not asset_url:
        print(f"No downloadable raster image for {target}", file=sys.stderr)
        return False

    OUT.mkdir(parents=True, exist_ok=True)
    suffix = Path(urllib.parse.urlparse(asset_url).path).suffix or ".jpg"
    with tempfile.TemporaryDirectory() as tmp:
        original = Path(tmp) / ("source" + suffix)
        print(f"Downloading {target}: {data.get('title', nasa_id or query)}")
        download(asset_url, original)
        if Image is not None:
            with Image.open(original) as image:
                image = image.convert("RGB")
                image.thumbnail((1920, 1920), Image.Resampling.LANCZOS)
                image.save(webp_path, "WEBP", quality=84, method=6)
            output_path = webp_path
        else:
            safe_suffix = suffix.lower() if suffix.lower() in {'.jpg', '.jpeg', '.png'} else '.jpg'
            output_path = OUT / f"{slug}{safe_suffix}"
            output_path.write_bytes(original.read_bytes())

    creators = [data.get("photographer"), data.get("secondary_creator"), data.get("center")]
    credit = " / ".join(dict.fromkeys(str(x).strip() for x in creators if x)) or "NASA"
    metadata = {
        "object": target,
        "title": data.get("title") or f"{target} image",
        "alt": data.get("description_508") or data.get("title") or f"Astronomical image of {target}",
        "credit": credit,
        "source": f"https://images.nasa.gov/details/{urllib.parse.quote(nasa_id or '')}" if nasa_id else "https://images.nasa.gov/",
        "license": "Review source page; NASA content is generally available under NASA media usage guidelines, but third-party material may have separate rights.",
        "nasa_id": nasa_id,
        "date_created": data.get("date_created"),
        "description": data.get("description"),
        "downloaded_from": asset_url,
    }
    output_path.with_suffix(".json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    return True


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

    results = [fetch_target(target, TARGETS[target], args.overwrite) for target in requested]
    if all(results):
        build = ROOT / "tools" / "build_dso_image_index.py"
        exec(compile(build.read_text(encoding="utf-8"), str(build), "exec"), {"__name__": "__main__", "__file__": str(build)})
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
