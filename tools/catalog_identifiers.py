"""Catalogue-aware identifiers, aliases and search normalization."""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable


_DASHES = str.maketrans({"‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "−": "-"})


def normalize_text(value: str) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).translate(_DASHES).casefold().strip()


def _integer(text: str) -> str:
    return str(int(text))


def _catalog_match(value: str) -> tuple[str, str] | None:
    text = normalize_text(value)
    patterns: tuple[tuple[str, str], ...] = (
        (r"^(?:lynds\s+dark\s+nebula|ldn)\s*0*(\d+)$", "ldn"),
        (r"^(?:barnard|b)\s*0*(\d+)\s*([a-z]?)$", "barnard"),
        (r"^(?:lynds\s+bright\s+nebula|lbn)\s*0*(\d+)$", "lbn"),
        (r"^(?:sharpless|sh)\s*2?\s*[- ]?\s*0*(\d+)$", "sh2"),
        (r"^(?:van\s+den\s+bergh|vdb)\s*0*(\d+)$", "vdb"),
        (r"^rcw\s*0*(\d+)$", "rcw"),
        (r"^(?:fest|feitzinger\s*[- ]?\s*st(?:u|ü)we)\s*([12])\s*-?\s*0*(\d+)$", "fest"),
        (r"^(ngc|ic)\s*0*(\d+)\s*([a-z]?)$", "ngcic"),
        (r"^(m|c)\s*0*(\d+)$", "messiercaldwell"),
    )
    for pattern, namespace in patterns:
        match = re.fullmatch(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        groups = match.groups()
        if namespace == "barnard":
            return namespace, f"{_integer(groups[0])}{groups[1].lower()}"
        if namespace == "fest":
            return f"fest{groups[0]}", _integer(groups[1])
        if namespace == "ngcic":
            return groups[0].lower(), f"{_integer(groups[1])}{groups[2].lower()}"
        if namespace == "messiercaldwell":
            return groups[0].lower(), _integer(groups[1])
        return namespace, _integer(groups[0])

    dcld = re.fullmatch(
        r"^(?:dcld|dc)\s*(\d{1,3}(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*(c?)$",
        text,
        flags=re.IGNORECASE,
    )
    if dcld:
        longitude, sign, latitude, complex_flag = dcld.groups()
        return "dcld", f"{longitude}{sign}{latitude}{complex_flag.lower()}"
    return None


def identifier_key(value: str, catalogue: str | None = None) -> str:
    """Return a lossless identity key; unlike search keys it preserves signs."""

    hinted = normalize_text(catalogue or "")
    raw = str(value or "").strip()
    if hinted:
        prefix = {
            "ldn": "LDN ",
            "barnard": "Barnard ",
            "lbn": "LBN ",
            "sh2": "Sh2-",
            "vdb": "vdB ",
            "rcw": "RCW ",
            "dcld": "DCld ",
        }.get(hinted)
        if prefix and not normalize_text(raw).startswith(normalize_text(prefix).split()[0]):
            raw = prefix + raw
    match = _catalog_match(raw)
    if match:
        return f"{match[0]}:{match[1]}"
    normalized = normalize_text(raw)
    normalized = normalized.replace("+", " plus ").replace("-", " minus ")
    normalized = re.sub(r"[^a-z0-9]+", "", normalized)
    return f"text:{normalized}" if normalized else ""


def search_key(value: str) -> str:
    match = _catalog_match(value)
    if match:
        return f"{match[0]}{match[1]}".replace(":", "")
    return re.sub(r"[^a-z0-9]+", "", normalize_text(value))


def dedupe_aliases(primary_name: str, aliases: Iterable[str]) -> tuple[str, ...]:
    # Preserve useful display variants (``LDN123`` versus ``LDN 123``) even
    # though identifier_key intentionally considers them the same identity.
    # Search and deduplication use their own normalized indexes.
    seen = {normalize_text(primary_name)}
    result: list[str] = []
    for alias in aliases:
        value = str(alias or "").strip()
        if not value:
            continue
        key = normalize_text(value)
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return tuple(result)


def catalogue_aliases(catalogue: str, identifier: str) -> tuple[str, ...]:
    catalog = normalize_text(catalogue)
    value = str(identifier).strip()
    if catalog == "ldn":
        return (f"LDN{value}", f"Lynds Dark Nebula {value}")
    if catalog == "barnard":
        return (f"B {value}", f"B{value}", f"Barnard{value}")
    if catalog == "lbn":
        return (f"LBN{value}", f"Lynds Bright Nebula {value}")
    if catalog == "sh2":
        return (f"Sh 2-{value}", f"Sh2 {value}", f"Sharpless {value}")
    if catalog == "vdb":
        return (f"VdB {value}", f"vdB{value}", f"van den Bergh {value}")
    if catalog == "rcw":
        return (f"RCW{value}",)
    if catalog in {"fest1", "fest2"}:
        family = catalog[-1]
        return (f"FEST {family}-{value}", f"Feitzinger-Stüwe {family}-{value}")
    return ()


def natural_sort_key(value: str) -> tuple[object, ...]:
    return tuple(int(part) if part.isdigit() else part for part in re.split(r"(\d+)", normalize_text(value)))


def expand_prefixed_identifiers(value: str) -> tuple[str, ...]:
    """Expand historical comma shorthand without inventing small IDs.

    Examples include ``NGC6164,5`` (NGC 6164 and NGC 6165), ``G38,a,b``
    (G38, G38a and G38b), and mixed groups such as
    ``NGC3293,3324,IC2599``. Parenthesized aliases are retained, while the
    most plausible recent prefix is selected by number width for a following
    abbreviated token.
    """

    def display(prefix: str, number: str, suffix: str = "") -> str:
        separator = " " if prefix in {"NGC", "IC", "HS", "BBW", "M"} else ""
        return f"{prefix}{separator}{number}{suffix.lower()}"

    results: list[str] = []
    seen: set[str] = set()

    def add(identifier: str) -> None:
        normalized = normalize_text(identifier)
        if normalized and normalized not in seen:
            seen.add(normalized)
            results.append(identifier)

    explicit_pattern = re.compile(
        r"(?i)(?<![A-Za-z])(NGC|IC|HS|BBW|G|E|M)\s*(\d+)([a-z]?)"
    )
    for group in re.split(r"\s*;\s*", value or ""):
        recent: list[tuple[str, str, str]] = []
        for raw_piece in group.split(","):
            piece = raw_piece.strip()
            if not piece:
                continue
            matches = list(explicit_pattern.finditer(piece))
            if matches:
                for match in matches:
                    prefix, number, suffix = match.groups()
                    state = (prefix.upper(), number, suffix.lower())
                    recent.append(state)
                    add(display(*state))
                continue

            continuation = re.fullmatch(r"[^A-Za-z0-9]*(\d*)([A-Za-z]?)[^A-Za-z0-9]*", piece)
            if continuation and recent:
                number, suffix = continuation.groups()
                if not number and suffix:
                    prefix, base, _ = recent[-1]
                    state = (prefix, base, suffix.lower())
                    recent.append(state)
                    add(display(*state))
                    continue
                if number:
                    eligible = [state for state in recent if len(state[1]) >= len(number)]
                    prefix, base, _ = eligible[-1] if eligible else recent[-1]
                    expanded = base[: len(base) - len(number)] + number if len(number) < len(base) else number
                    state = (prefix, expanded, suffix.lower())
                    recent.append(state)
                    add(display(*state))
                    continue

            # Preserve an unparsed source token verbatim for provenance, but
            # never manufacture a catalogue identifier from it.
            add(piece)
    return tuple(results)
