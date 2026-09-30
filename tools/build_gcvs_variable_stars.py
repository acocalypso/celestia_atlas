#!/usr/bin/env python3
"""Build an offline search layer from the pinned GCVS 5.1 named-star file."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "http://www.sai.msu.su/gcvs/gcvs/gcvs5/gcvs5.txt"
SOURCE_DATE = "2026-07-11"
SOURCE_SHA256 = "dc2a9b886a3243f4f4896d13d237ec1aa8c41615e7457c71459b2a4952439aba"
DEFAULT_SOURCE = ROOT / ".cache" / f"gcvs5-{SOURCE_DATE}.txt"
OUTPUT_JSON = ROOT / "data" / "gcvs-variable-stars.json"
OUTPUT_JS = ROOT / "gcvs-variable-stars.js"
COORDINATES = re.compile(
    r"^\s*(\d{2})(\d{2})(\d{2}(?:\.\d*)?)\s+"
    r"([+-])(\d{2})(\d{2})(\d{2}(?:\.\d*)?)"
)
SIMPLE_NUMBER = re.compile(r"^\d+(?:\.\d*)?$")
PADDED_VARIABLE = re.compile(r"^V0+(\d+)\b", re.IGNORECASE)


def source_bytes(path: Path, *, offline: bool) -> bytes:
    if not path.exists():
        if offline:
            raise FileNotFoundError(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        request = Request(SOURCE_URL, headers={"User-Agent": "Celestia-Atlas-GCVS-builder"})
        with urlopen(request, timeout=120) as response:  # noqa: S310 - SHA-256 pinned
            data = response.read()
        path.write_bytes(data)
    data = path.read_bytes()
    actual = hashlib.sha256(data).hexdigest()
    if actual != SOURCE_SHA256:
        raise ValueError(f"GCVS source SHA-256 mismatch: expected {SOURCE_SHA256}, got {actual}")
    return data


def parse_coordinates(value: str) -> tuple[float, float] | None:
    match = COORDINATES.match(value)
    if not match:
        return None
    hour, minute, second, sign, degree, arcminute, arcsecond = match.groups()
    h, m, s = int(hour), int(minute), float(second)
    d, dm, ds = int(degree), int(arcminute), float(arcsecond)
    if h >= 24 or m >= 60 or s >= 60 or d > 90 or dm >= 60 or ds >= 60:
        return None
    if d == 90 and (dm or ds):
        return None
    ra = (h + m / 60 + s / 3600) * 15
    dec = (d + dm / 60 + ds / 3600) * (-1 if sign == "-" else 1)
    return round(ra, 7), round(dec, 7)


def parse_name(value: str) -> tuple[str, list[str]]:
    original = " ".join(value.replace("*", " ").split())
    canonical = PADDED_VARIABLE.sub(lambda match: f"V{int(match.group(1))}", original)
    return canonical, [original] if original != canonical else []


def optional_number(value: str) -> float | None:
    stripped = value.strip()
    return float(stripped) if SIMPLE_NUMBER.fullmatch(stripped) else None


def parse_row(line: str) -> dict | None:
    fields = line.split("|")
    if len(fields) < 11:
        return None
    coordinates = parse_coordinates(fields[2])
    if coordinates is None:
        return None  # GCVS aliases and non-existing objects have no position.
    number = fields[0].strip()
    if not re.fullmatch(r"\d{6}[A-Z0-9]?", number):
        raise ValueError(f"Invalid GCVS numeric designation: {number!r}")
    name, aliases = parse_name(fields[1])
    if not name:
        raise ValueError(f"GCVS {number} has coordinates but no designation")
    ra, dec = coordinates
    item = {
        "id": f"GCVS {number}",
        "name": name,
        "raDeg": ra,
        "decDeg": dec,
        "frame": "J2000",
        "type": "Variable star",
        "catalogueSource": "GCVS 5.1",
    }
    if aliases:
        item["aliases"] = aliases
    variability_type = fields[3].strip()
    if variability_type:
        item["variabilityType"] = variability_type
    for field, key in ((4, "maxMagnitude"), (5, "minMagnitude")):
        value = optional_number(fields[field])
        if value is not None:
            item[key] = value
        elif fields[field].strip():
            item[f"{key}Text"] = fields[field].strip()
    band = fields[7].strip()
    if band:
        item["magnitudeBand"] = band
    period = optional_number(fields[10])
    if period is not None and period > 0:
        item["periodDays"] = period
    return item


def compact_row(item: dict) -> list:
    maximum = item.get("maxMagnitude", item.get("maxMagnitudeText"))
    minimum = item.get("minMagnitude", item.get("minMagnitudeText"))
    row = [
        item["id"][5:], item["name"], item["raDeg"], item["decDeg"],
        item.get("variabilityType"), maximum, minimum,
        item.get("magnitudeBand"), item.get("periodDays"),
        item.get("aliases"),
    ]
    while row and row[-1] is None:
        row.pop()
    return row


def build(data: bytes) -> tuple[list[list], dict]:
    lines = data.decode("latin-1").splitlines()
    stars = [item for line in lines if (item := parse_row(line)) is not None]
    ids = [item["id"] for item in stars]
    if len(ids) != len(set(ids)):
        raise ValueError("GCVS source contains duplicate numeric designations")
    add_named_star_aliases(stars)
    meta = {
        "catalogue": "General Catalogue of Variable Stars 5.1",
        "sourceDate": SOURCE_DATE,
        "sourceUrl": SOURCE_URL,
        "sourceSha256": SOURCE_SHA256,
        "sourceRows": len(lines),
        "searchableStars": len(stars),
        "excludedWithoutCoordinates": len(lines) - len(stars),
        "reference": "Samus et al. (2017), Astronomy Reports 61, 80-88",
    }
    return [compact_row(star) for star in stars], meta


def add_named_star_aliases(stars: list[dict]) -> None:
    """Add existing Atlas names only for unique positional matches within 5 arcsec."""
    bright = json.loads((ROOT / "data" / "bright-sky.json").read_text(encoding="utf-8"))["stars"]
    hyg = json.loads((ROOT / "data" / "hyg-star-catalog.json").read_text(encoding="utf-8"))["stars"]
    names = [
        (star["name"], star["raDeg"], star["decDeg"])
        for star in bright if star.get("name")
    ] + [
        (star["name"], star["ra"] * 15, star["dec"])
        for star in hyg if star.get("named") and star.get("name")
    ]
    bins: dict[int, list[dict]] = {}
    for star in stars:
        bins.setdefault(int(star["decDeg"]), []).append(star)
    for name, ra, dec in names:
        candidates = []
        for degree in range(max(-90, int(dec) - 1), min(90, int(dec) + 1) + 1):
            for star in bins.get(degree, []):
                dra = math.radians(star["raDeg"] - ra)
                ddec = math.radians(star["decDeg"] - dec)
                a = (math.sin(ddec / 2) ** 2
                     + math.cos(math.radians(dec)) * math.cos(math.radians(star["decDeg"]))
                     * math.sin(dra / 2) ** 2)
                if 2 * math.asin(min(1, math.sqrt(a))) < math.radians(5 / 3600):
                    candidates.append((2 * math.asin(min(1, math.sqrt(a))), star))
        candidates.sort(key=lambda match: match[0])
        if candidates and (len(candidates) == 1 or candidates[1][0] > 3 * candidates[0][0]):
            nearest = candidates[0][1]
            if name not in (nearest["name"], *nearest.get("aliases", [])):
                nearest.setdefault("aliases", []).append(name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    rows, meta = build(source_bytes(args.source, offline=args.offline))
    compact = lambda value: json.dumps(value, ensure_ascii=True, separators=(",", ":"))
    data = {"meta": meta, "columns": [
        "gcvsNumber", "name", "raDeg", "decDeg", "variabilityType",
        "maxMagnitude", "minMagnitude", "magnitudeBand", "periodDays", "aliases",
    ], "rows": rows}
    OUTPUT_JSON.write_text(compact(data) + "\n", encoding="utf-8")
    OUTPUT_JS.write_text(
        f"globalThis.GCVS_VARIABLE_STAR_DATA={compact(data)};\n",
        encoding="utf-8",
    )
    print(f"Built {len(rows):,} GCVS variable stars; {meta['excludedWithoutCoordinates']} rows omitted")


if __name__ == "__main__":
    main()
