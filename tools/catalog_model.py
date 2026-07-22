"""Shared, validated catalogue model used by the offline DSO builders.

The browser does not import this module.  It deliberately favours descriptive
field names and complete provenance; :mod:`catalog_output` creates the flatter
runtime representation consumed by Celestia Atlas.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
import math
from typing import Any, Mapping, Sequence


TYPE_NAMES: dict[str, str] = {
    "G": "Galaxy",
    "GPair": "Galaxy pair",
    "GTrpl": "Galaxy triplet",
    "GGroup": "Galaxy group",
    "GCluster": "Galaxy cluster",
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
    "DoubleStar": "Double star",
}


class CatalogValidationError(ValueError):
    """Raised when a source row cannot produce a scientifically valid object."""


def _finite(value: float | None) -> bool:
    return value is not None and math.isfinite(value)


def _clean_tuple(values: Sequence[str]) -> tuple[str, ...]:
    return tuple(value.strip() for value in values if value and value.strip())


@dataclass(frozen=True, slots=True)
class Coordinates:
    """Final ICRS position together with the source coordinate provenance."""

    ra_deg: float
    dec_deg: float
    frame: str = "ICRS"
    original_frame: str | None = None
    original_values: Mapping[str, Any] = field(default_factory=dict)
    accuracy_arcsec: float | None = None
    origin: str | None = None

    def __post_init__(self) -> None:
        if not _finite(self.ra_deg) or not 0 <= self.ra_deg < 360:
            raise CatalogValidationError(f"RA must be finite and in [0, 360): {self.ra_deg!r}")
        if not _finite(self.dec_deg) or not -90 <= self.dec_deg <= 90:
            raise CatalogValidationError(f"Dec must be finite and in [-90, 90]: {self.dec_deg!r}")
        if self.frame != "ICRS":
            raise CatalogValidationError(f"Normalized coordinates must be ICRS, got {self.frame!r}")
        if self.accuracy_arcsec is not None and (
            not _finite(self.accuracy_arcsec) or self.accuracy_arcsec < 0
        ):
            raise CatalogValidationError("Coordinate accuracy must be a non-negative finite number")


@dataclass(frozen=True, slots=True)
class Shape:
    """A catalogue marker shape, never an assertion of an accurate boundary."""

    kind: str = "point"
    major_arcmin: float | None = None
    minor_arcmin: float | None = None
    position_angle_deg: float | None = None
    approximate: bool = False
    derivation: str | None = None

    def __post_init__(self) -> None:
        if self.kind not in {"point", "circle", "ellipse"}:
            raise CatalogValidationError(f"Unsupported shape kind: {self.kind!r}")
        for name, value in (("major", self.major_arcmin), ("minor", self.minor_arcmin)):
            if value is not None and (not _finite(value) or value <= 0):
                raise CatalogValidationError(f"{name} axis must be positive and finite")
        if self.major_arcmin is None and self.minor_arcmin is not None:
            raise CatalogValidationError("A minor axis requires a major axis")
        if (
            self.major_arcmin is not None
            and self.minor_arcmin is not None
            and self.minor_arcmin > self.major_arcmin
        ):
            raise CatalogValidationError("Shape major axis must be greater than or equal to minor axis")
        if self.position_angle_deg is not None and (
            not _finite(self.position_angle_deg) or not 0 <= self.position_angle_deg < 180
        ):
            raise CatalogValidationError("Equatorial position angle must be in [0, 180)")
        if self.kind == "point" and (self.major_arcmin is not None or self.minor_arcmin is not None):
            raise CatalogValidationError("Point shapes cannot contain dimensions")


@dataclass(frozen=True, slots=True)
class CatalogSourceRef:
    catalogue: str
    identifier: str
    vizier_id: str | None = None
    table: str | None = None
    original_identifier: str | None = None
    original_frame: str | None = None

    def __post_init__(self) -> None:
        if not self.catalogue.strip() or not self.identifier.strip():
            raise CatalogValidationError("A source reference requires catalogue and identifier")


@dataclass(frozen=True, slots=True)
class CatalogObject:
    uid: str
    primary_name: str
    aliases: tuple[str, ...]
    type_code: str
    coordinates: Coordinates
    shape: Shape = field(default_factory=Shape)
    properties: Mapping[str, Any] = field(default_factory=dict)
    sources: tuple[CatalogSourceRef, ...] = field(default_factory=tuple)
    catalogue_groups: tuple[str, ...] = field(default_factory=tuple)
    cross_identifications: tuple[str, ...] = field(default_factory=tuple)
    related_source_refs: tuple[CatalogSourceRef, ...] = field(default_factory=tuple)
    common_name: str | None = None

    def __post_init__(self) -> None:
        if not self.uid.strip() or not self.primary_name.strip():
            raise CatalogValidationError("Catalogue objects require a uid and primary name")
        if self.type_code not in TYPE_NAMES:
            raise CatalogValidationError(f"Unknown DSO type code: {self.type_code!r}")
        if not self.sources:
            raise CatalogValidationError(f"{self.uid} has no source provenance")
        object.__setattr__(self, "aliases", _clean_tuple(self.aliases))
        object.__setattr__(self, "catalogue_groups", _clean_tuple(self.catalogue_groups))
        object.__setattr__(self, "cross_identifications", _clean_tuple(self.cross_identifications))

    @property
    def type_name(self) -> str:
        return TYPE_NAMES[self.type_code]

    @property
    def display_name(self) -> str:
        return self.common_name or self.primary_name

    def with_updates(self, **changes: Any) -> "CatalogObject":
        return replace(self, **changes)


@dataclass(frozen=True, slots=True)
class DedupCandidate:
    left_uid: str
    right_uid: str
    separation_arcmin: float
    reason: str


@dataclass(frozen=True, slots=True)
class DedupResult:
    objects: tuple[CatalogObject, ...]
    candidates: tuple[DedupCandidate, ...] = field(default_factory=tuple)
    ambiguous_cross_identifications: tuple[tuple[str, tuple[str, ...]], ...] = field(
        default_factory=tuple
    )
