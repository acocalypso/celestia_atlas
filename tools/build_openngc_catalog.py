#!/usr/bin/env python3
"""Build Celestia Atlas' offline DSO catalogue from OpenNGC.

The generated files are completely local at runtime:
  dso-catalog.js                 browser catalogue + curated merge
  data/openngc-catalog.json      machine-readable catalogue for tools
  data/openngc-viewer-catalog.json compact degree-based runtime catalogue
  data/openngc-meta.json         provenance/build metadata

OpenNGC is CC-BY-SA-4.0. Keep the attribution and THIRD_PARTY_NOTICES.md
when redistributing generated catalogue data.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CACHE_DIR = ROOT / ".cache" / "openngc"
DEFAULT_VERSION = "v20260501"
BASE = "https://raw.githubusercontent.com/mattiaverga/OpenNGC/{version}/database_files/{name}"
USER_AGENT = "CelestiaAtlasCatalogBuilder/2.0 (+https://github.com/acocalypso/celestia_atlas)"
FILES = ("NGC.csv", "addendum.csv")

# Physical deep-sky classes. Stars, duplicates and explicitly non-existent
# catalogue entries are intentionally not plotted as DSOs.
TYPE_NAMES = {
    "G": "Galaxy",
    "GPair": "Galaxy pair",
    "GTrpl": "Galaxy triplet",
    "GGroup": "Galaxy group",
    "OCl": "Open cluster",
    "GCl": "Globular cluster",
    "Cl+N": "Cluster with nebulosity",
    "*Ass": "Stellar association",
    "PN": "Planetary nebula",
    "HII": "H II region",
    "DrkN": "Dark nebula",
    "EmN": "Emission nebula",
    "Neb": "Nebula",
    "RfN": "Reflection nebula",
    "SNR": "Supernova remnant",
    "Other": "Deep-sky object",
}
EXCLUDED_TYPES = {"*", "**", "Nova", "NonEx", "Dup"}

GENERIC_DESCRIPTIONS = {
    "G": "A galaxy listed in the OpenNGC catalogue.",
    "GPair": "A physically associated or apparent pair of galaxies listed in OpenNGC.",
    "GTrpl": "A triplet of galaxies listed in OpenNGC.",
    "GGroup": "A group of galaxies listed in OpenNGC.",
    "OCl": "An open star cluster in the Milky Way.",
    "GCl": "A dense globular star cluster.",
    "Cl+N": "A star cluster associated with surrounding nebulosity.",
    "*Ass": "A loose stellar association.",
    "PN": "A planetary nebula produced by an evolved star.",
    "HII": "An ionized hydrogen region associated with star formation.",
    "DrkN": "A dark nebula obscuring background starlight.",
    "EmN": "An emission nebula glowing in ionized gas.",
    "Neb": "A nebula listed in the OpenNGC catalogue.",
    "RfN": "A reflection nebula illuminated by nearby stars.",
    "SNR": "A supernova remnant produced by an exploded star.",
    "Other": "A deep-sky object listed in the OpenNGC catalogue.",
}


def request(url: str) -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/csv,*/*;q=0.8"})


def download_text(url: str, retries: int = 4) -> str:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request(url), timeout=90) as response:
                raw = response.read()
            # OpenNGC is UTF-8; utf-8-sig also strips a possible BOM.
            return raw.decode("utf-8-sig")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
            if isinstance(exc, urllib.error.HTTPError) and exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
    assert last is not None
    raise last


def load_source(name: str, version: str, source_dir: Path | None, offline: bool) -> tuple[str, str]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{version}-{name}"
    if source_dir:
        path = source_dir / name
        return path.read_text(encoding="utf-8-sig"), str(path)
    if offline:
        if not cache.exists():
            raise FileNotFoundError(f"No cached {name}. Run once without --offline.")
        return cache.read_text(encoding="utf-8-sig"), str(cache)
    url = BASE.format(version=version, name=name)
    text = download_text(url)
    cache.write_text(text, encoding="utf-8")
    return text, url


def norm_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def field(row: dict[str, str], *names: str) -> str:
    wanted = {norm_header(name) for name in names}
    for key, value in row.items():
        if norm_header(key) in wanted:
            return (value or "").strip()
    return ""


def number(value: str) -> float | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        n = float(value)
    except ValueError:
        return None
    return n if n == n and abs(n) != float("inf") else None


def parse_ra(value: str) -> float | None:
    parts = re.findall(r"[+-]?\d+(?:\.\d+)?", value or "")
    if len(parts) < 3:
        return None
    h, m, s = map(float, parts[:3])
    if not (0 <= h <= 24 and 0 <= m < 60 and 0 <= s < 60.1):
        return None
    return round((h + m / 60 + s / 3600) % 24, 7)


def parse_dec(value: str) -> float | None:
    text = (value or "").strip()
    parts = re.findall(r"\d+(?:\.\d+)?", text)
    if len(parts) < 3:
        return None
    d, m, s = map(float, parts[:3])
    sign = -1 if text.startswith("-") else 1
    dec = sign * (d + m / 60 + s / 3600)
    if not -90 <= dec <= 90:
        return None
    return round(dec, 7)


def designation(value: str) -> str:
    raw = re.sub(r"\s+", "", (value or "").upper())
    match = re.match(r"^(NGC|IC|M|C)(0*)(\d+)([A-Z]?)$", raw)
    if not match:
        return (value or "").strip()
    prefix, _, digits, suffix = match.groups()
    n = int(digits)
    return f"{prefix}{n}{suffix}" if prefix in {"M", "C"} else f"{prefix} {n}{suffix}"


def split_values(value: str) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in re.split(r"\s*[,|]\s*", value) if part.strip()]


def aliases_for(row: dict[str, str], primary: str) -> tuple[str, list[str], str | None]:
    common = split_values(field(row, "Common names", "Common name"))
    messier = split_values(field(row, "M", "Messier"))
    ngc_refs = split_values(field(row, "NGC"))
    ic_refs = split_values(field(row, "IC"))
    identifiers = split_values(field(row, "Identifiers", "Identifier"))

    values: list[str] = []
    for item in messier:
        item = re.sub(r"^M", "", item, flags=re.I)
        if item.isdigit():
            values.append(f"M{int(item)}")
    for item in ngc_refs:
        item = re.sub(r"^NGC", "", item, flags=re.I).strip()
        if re.fullmatch(r"\d+[A-Za-z]?", item):
            values.append(f"NGC {int(re.match(r'\d+', item).group())}{re.sub(r'^\d+', '', item).upper()}")
    for item in ic_refs:
        item = re.sub(r"^IC", "", item, flags=re.I).strip()
        if re.fullmatch(r"\d+[A-Za-z]?", item):
            values.append(f"IC {int(re.match(r'\d+', item).group())}{re.sub(r'^\d+', '', item).upper()}")
    values.extend(designation(item) for item in identifiers[:12])
    values.extend(common)

    seen: set[str] = set()
    aliases: list[str] = []
    for item in values:
        item = item.strip()
        key = re.sub(r"[^a-z0-9]", "", item.lower())
        if not item or not key or key == re.sub(r"[^a-z0-9]", "", primary.lower()) or key in seen:
            continue
        seen.add(key)
        aliases.append(item)

    messier_ids = [item for item in aliases if re.fullmatch(r"M\d+", item)]
    common_name = common[0] if common else ""
    display_id = messier_ids[0] if messier_ids else primary
    return display_id, aliases, common_name or None


def size_text(major: float | None, minor: float | None) -> str:
    if major is None:
        return "Not available"
    def fmt(n: float) -> str:
        return f"{n:.2f}".rstrip("0").rstrip(".")
    return f"{fmt(major)} × {fmt(minor)} arcmin" if minor is not None else f"{fmt(major)} arcmin"


def object_from_row(row: dict[str, str], source_file: str) -> dict[str, Any] | None:
    type_code = field(row, "Type")
    if type_code in EXCLUDED_TYPES or type_code not in TYPE_NAMES:
        return None
    raw_name = field(row, "Name")
    primary = designation(raw_name)
    ra = parse_ra(field(row, "RA"))
    dec = parse_dec(field(row, "Dec", "Declination"))
    if not primary or ra is None or dec is None:
        return None

    obj_id, aliases, common_name = aliases_for(row, primary)
    if obj_id != primary and primary not in aliases:
        aliases.insert(0, primary)

    major = number(field(row, "MajAx", "Major axis"))
    minor = number(field(row, "MinAx", "Minor axis"))
    vmag = number(field(row, "V-Mag", "V Mag"))
    bmag = number(field(row, "B-Mag", "B Mag"))
    redshift = number(field(row, "Redshift"))
    radial_velocity = number(field(row, "RadVel", "Radial velocity"))
    notes = field(row, "OpenNGC notes", "OpenNGC note")

    obj: dict[str, Any] = {
        "id": obj_id,
        "catalogId": primary,
        "name": common_name or "",
        "ra": ra,
        "dec": dec,
        "type": TYPE_NAMES[type_code],
        "typeCode": type_code,
        "con": field(row, "Const", "Constellation"),
        "mag": vmag if vmag is not None else bmag,
        "magBand": "V" if vmag is not None else ("B" if bmag is not None else ""),
        "size": size_text(major, minor),
        "major": major,
        "minor": minor,
        "positionAngle": number(field(row, "PosAng", "Position angle")),
        "surfaceBrightness": number(field(row, "SurfBr", "Surface brightness")),
        "hubble": field(row, "Hubble"),
        "redshift": redshift,
        "radialVelocity": radial_velocity,
        "aliases": aliases,
        "description": notes or GENERIC_DESCRIPTIONS[type_code],
        "catalogSource": "OpenNGC",
        "sourceFile": source_file,
    }
    return {key: value for key, value in obj.items() if value not in (None, "", [])}


def rows_from_text(text: str) -> Iterable[dict[str, str]]:
    # newline='' lets csv correctly handle CR, LF and CRLF source releases.
    stream = io.StringIO(text, newline="")
    reader = csv.DictReader(stream, delimiter=";")
    if not reader.fieldnames or "name" not in {norm_header(x) for x in reader.fieldnames}:
        raise ValueError("OpenNGC CSV header was not recognized")
    yield from reader


def alias_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def deduplicate(objects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_catalog: dict[str, dict[str, Any]] = {}
    for obj in objects:
        key = alias_key(str(obj.get("catalogId") or obj.get("id")))
        if key and key not in by_catalog:
            by_catalog[key] = obj
    return sorted(by_catalog.values(), key=lambda o: (0 if str(o["id"]).startswith("M") else 1, str(o["catalogId"])))


def viewer_object(obj: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": obj["id"],
        "raDeg": obj["ra"] * 15,
        "decDeg": obj["dec"],
        "frame": "ICRS",
        "catalogSource": "OpenNGC",
    }
    for field in (
        "name",
        "type",
        "mag",
        "positionAngle",
        "aliases",
    ):
        value = obj.get(field)
        if value is not None and value != "":
            result[field] = value
    return result


def write_outputs(objects: list[dict[str, Any]], version: str, sources: list[str]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    meta = {
        "name": "OpenNGC offline DSO catalogue",
        "version": version,
        "objectCount": len(objects),
        "license": "CC-BY-SA-4.0",
        "attribution": "OpenNGC by Mattia Verga and contributors",
        "project": "https://github.com/mattiaverga/OpenNGC",
        "sources": sources,
        "excludedTypes": sorted(EXCLUDED_TYPES),
    }
    source_date_epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if source_date_epoch:
        generated = dt.datetime.fromtimestamp(int(source_date_epoch), dt.timezone.utc).replace(microsecond=0)
        meta["generatedAt"] = generated.isoformat()
    payload = {"meta": meta, "objects": objects}
    (DATA_DIR / "openngc-catalog.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    viewer_payload = {
        "meta": {
            **meta,
            "coordinateFrame": "ICRS",
            "rightAscensionUnit": "degrees",
        },
        "objects": [viewer_object(obj) for obj in objects],
    }
    (DATA_DIR / "openngc-viewer-catalog.json").write_text(
        json.dumps(viewer_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (DATA_DIR / "openngc-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    compact_objects = json.dumps(objects, ensure_ascii=False, separators=(",", ":"))
    compact_meta = json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
    js = f"""// Generated from OpenNGC {version}. Data license: CC-BY-SA-4.0.\n"use strict";\nwindow.OPENNGC_CATALOG_META={compact_meta};\nwindow.OPENNGC_DSO_DATA={compact_objects};\n(() => {{\n  const full=window.OPENNGC_DSO_DATA||[];\n  const curated=Array.isArray(window.DSO_DATA)?window.DSO_DATA:[];\n  const key=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'');\n  const curatedByKey=new Map();\n  for(const item of curated) for(const value of [item.id,item.catalogId,item.name,...(item.aliases||[])]) {{ const k=key(value); if(k&&!curatedByKey.has(k)) curatedByKey.set(k,item); }}\n  const used=new Set();\n  const merged=full.map(item=>{{\n    let extra=null;\n    for(const value of [item.id,item.catalogId,item.name,...(item.aliases||[])]) {{ extra=curatedByKey.get(key(value)); if(extra) break; }}\n    if(!extra) return item;\n    used.add(extra);\n    const aliases=[...(item.aliases||[]),item.catalogId,extra.id,extra.catalogId,extra.name,...(extra.aliases||[])].filter(Boolean);\n    const seen=new Set();\n    const unique=aliases.filter(value=>{{const k=key(value);if(!k||seen.has(k)||k===key(extra.id||item.id))return false;seen.add(k);return true;}});\n    return {{...item,...extra,id:extra.id||item.id,catalogId:item.catalogId||extra.catalogId,aliases:unique,catalogSource:'OpenNGC + curated details'}};\n  }});\n  for(const extra of curated) if(!used.has(extra)) merged.push(extra);\n  window.DSO_DATA=merged;\n}})();\n"""
    (ROOT / "dso-catalog.js").write_text(js, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default=DEFAULT_VERSION, help="OpenNGC tag/branch (default: %(default)s)")
    parser.add_argument("--source-dir", type=Path, help="Read NGC.csv/addendum.csv from a local directory")
    parser.add_argument("--offline", action="store_true", help="Use previously cached source CSV files")
    parser.add_argument("--include-other", action="store_true", help="Reserved for compatibility; Other is already included")
    args = parser.parse_args()

    objects: list[dict[str, Any]] = []
    sources: list[str] = []
    for name in FILES:
        try:
            text, source = load_source(name, args.version, args.source_dir, args.offline)
        except FileNotFoundError:
            # Some older versions may not have an addendum. NGC.csv remains required.
            if name == "addendum.csv":
                continue
            raise
        # Record stable public provenance rather than a machine-specific cache
        # path so online and offline builds produce identical output.
        sources.append(BASE.format(version=args.version, name=name))
        for row in rows_from_text(text):
            obj = object_from_row(row, name)
            if obj:
                objects.append(obj)

    objects = deduplicate(objects)
    if len(objects) < 1000 and args.source_dir is None:
        raise RuntimeError(f"Only {len(objects)} objects parsed; refusing to write an incomplete catalogue")
    write_outputs(objects, args.version, sources)
    print(f"Generated {len(objects):,} offline DSO records from OpenNGC {args.version}")
    print(f"  {ROOT / 'dso-catalog.js'}")
    print(f"  {DATA_DIR / 'openngc-catalog.json'}")
    print(f"  {DATA_DIR / 'openngc-viewer-catalog.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
