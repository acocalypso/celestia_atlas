"""Local VizieR TSV parsing helpers shared by source-specific importers."""

from __future__ import annotations

import csv
from dataclasses import dataclass
import math
from pathlib import Path
import re
from typing import Iterable, Mapping

from catalog_model import CatalogValidationError


@dataclass(frozen=True, slots=True)
class SourceSpec:
    key: str
    catalogue: str
    vizier_id: str
    table: str
    filename: str
    expected_rows: int
    required_columns: tuple[str, ...]
    url: str
    rights_status: str = "review-required"
    notes_filename: str | None = None
    notes_table: str | None = None
    notes_expected_rows: int | None = None
    notes_url: str | None = None


class SourceRowError(CatalogValidationError):
    pass


def _separator(row: list[str]) -> bool:
    populated = [cell.strip() for cell in row if cell.strip()]
    return bool(populated) and all(re.fullmatch(r"-+", cell) for cell in populated)


def read_vizier_tsv(
    path: Path,
    required_columns: Iterable[str],
    *,
    expected_rows: int | None = None,
) -> list[dict[str, str]]:
    """Read either a raw ASU-TSV response or its canonical header+rows cache."""

    if not path.is_file():
        raise FileNotFoundError(f"Catalogue source not found: {path}")
    text = path.read_text(encoding="utf-8-sig")
    content_lines = [line for line in text.splitlines() if line.strip() and not line.startswith("#")]
    if not content_lines:
        raise SourceRowError(f"{path}: no TSV table found")
    rows = list(csv.reader(content_lines, delimiter="\t"))
    header = [cell.strip() for cell in rows[0]]
    required = tuple(required_columns)
    missing = [column for column in required if column not in header]
    if missing:
        raise SourceRowError(f"{path}: missing required columns: {', '.join(missing)}")

    start = 1
    if start < len(rows) and _separator(rows[start]):
        start += 1
    elif start + 1 < len(rows) and _separator(rows[start + 1]):
        # Raw VizieR TSV has a units row followed by a dashed separator.
        start += 2

    result: list[dict[str, str]] = []
    for source_index, row in enumerate(rows[start:], start=start + 1):
        if _separator(row) or not any(cell.strip() for cell in row):
            continue
        if len(row) > len(header):
            raise SourceRowError(
                f"{path}:{source_index}: expected {len(header)} columns, found {len(row)}"
            )
        padded = row + [""] * (len(header) - len(row))
        record = {name: value.strip() for name, value in zip(header, padded)}
        record["__row__"] = str(source_index)
        result.append(record)
    if expected_rows is not None and len(result) != expected_rows:
        raise SourceRowError(
            f"{path}: expected {expected_rows:,} rows, found {len(result):,}"
        )
    return result


def row_error(path: Path, row: Mapping[str, str], message: str) -> SourceRowError:
    return SourceRowError(f"{path}:{row.get('__row__', '?')}: {message}")


def required(row: Mapping[str, str], name: str, path: Path) -> str:
    value = row.get(name, "").strip()
    if not value:
        raise row_error(path, row, f"required field {name} is blank")
    return value


def optional_float(row: Mapping[str, str], name: str, path: Path) -> float | None:
    value = row.get(name, "").strip()
    if not value:
        return None
    try:
        result = float(value)
    except ValueError as exc:
        raise row_error(path, row, f"invalid number in {name}: {value!r}") from exc
    if not math.isfinite(result):
        raise row_error(path, row, f"non-finite number in {name}: {value!r}")
    return result


def optional_int(row: Mapping[str, str], name: str, path: Path) -> int | None:
    value = row.get(name, "").strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError as exc:
        raise row_error(path, row, f"invalid integer in {name}: {value!r}") from exc


def ranged_int(
    row: Mapping[str, str],
    name: str,
    path: Path,
    minimum: int,
    maximum: int,
    *,
    optional: bool = True,
) -> int | None:
    value = optional_int(row, name, path)
    if value is None:
        if optional:
            return None
        raise row_error(path, row, f"required field {name} is blank")
    if not minimum <= value <= maximum:
        raise row_error(path, row, f"{name} must be in [{minimum}, {maximum}], got {value}")
    return value


def positive(value: float | None) -> float | None:
    return value if value is not None and value > 0 else None


def compact_properties(values: Mapping[str, object]) -> dict[str, object]:
    return {
        key: value
        for key, value in values.items()
        if value is not None and value != "" and value != () and value != []
    }
