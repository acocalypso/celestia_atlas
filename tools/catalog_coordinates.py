"""Build-time astronomy and marker-shape conversions.

Astropy/ERFA is intentionally a catalogue-build dependency, not a browser
dependency.  Old equatorial coordinates are transformed from their real FK4
Besselian frames; they are never relabelled as J2000.
"""

from __future__ import annotations

import math
from typing import Any

from astropy import units as u
from astropy.coordinates import FK4, FK5, Galactic, ICRS, SkyCoord
from astropy.time import Time

from catalog_model import CatalogValidationError, Coordinates, Shape


def _coordinate_result(
    coordinate: SkyCoord,
    *,
    original_frame: str,
    original_values: dict[str, Any],
    accuracy_arcsec: float | None = None,
    origin: str | None = None,
) -> Coordinates:
    icrs = coordinate.transform_to(ICRS())
    return Coordinates(
        ra_deg=float(icrs.ra.wrap_at(360 * u.deg).degree % 360),
        dec_deg=float(icrs.dec.degree),
        original_frame=original_frame,
        original_values=original_values,
        accuracy_arcsec=accuracy_arcsec,
        origin=origin,
    )


def fk4_to_icrs(
    ra: str,
    dec: str,
    *,
    equinox: str,
    accuracy_arcsec: float | None = None,
    origin: str | None = None,
) -> Coordinates:
    """Convert sexagesimal FK4 coordinates at a Besselian equinox to ICRS."""

    try:
        frame = FK4(equinox=Time(equinox))
        coordinate = SkyCoord(ra=ra, dec=dec, unit=(u.hourangle, u.deg), frame=frame)
    except Exception as exc:  # Astropy exceptions vary by malformed input.
        raise CatalogValidationError(
            f"Invalid FK4 {equinox} coordinate RA={ra!r}, Dec={dec!r}: {exc}"
        ) from exc
    return _coordinate_result(
        coordinate,
        original_frame=f"FK4/{equinox}",
        original_values={"ra": ra, "dec": dec},
        accuracy_arcsec=accuracy_arcsec,
        origin=origin,
    )


def fk5_j2000_to_icrs(
    ra_deg: float,
    dec_deg: float,
    *,
    accuracy_arcsec: float | None = None,
    origin: str | None = None,
    original_values: dict[str, Any] | None = None,
) -> Coordinates:
    try:
        coordinate = SkyCoord(
            ra=float(ra_deg) * u.deg,
            dec=float(dec_deg) * u.deg,
            frame=FK5(equinox=Time("J2000")),
        )
    except Exception as exc:
        raise CatalogValidationError(f"Invalid FK5/J2000 coordinate: {exc}") from exc
    return _coordinate_result(
        coordinate,
        original_frame="FK5/J2000",
        original_values=original_values or {"raDeg": ra_deg, "decDeg": dec_deg},
        accuracy_arcsec=accuracy_arcsec,
        origin=origin,
    )


def icrs_from_sexagesimal(
    ra: str,
    dec: str,
    *,
    accuracy_arcsec: float | None = None,
    origin: str | None = None,
) -> Coordinates:
    try:
        coordinate = SkyCoord(ra=ra, dec=dec, unit=(u.hourangle, u.deg), frame=ICRS())
    except Exception as exc:
        raise CatalogValidationError(
            f"Invalid ICRS coordinate RA={ra!r}, Dec={dec!r}: {exc}"
        ) from exc
    return _coordinate_result(
        coordinate,
        original_frame="ICRS",
        original_values={"ra": ra, "dec": dec},
        accuracy_arcsec=accuracy_arcsec,
        origin=origin,
    )


def galactic_to_icrs(
    longitude_deg: float,
    latitude_deg: float,
    *,
    accuracy_arcsec: float | None = None,
    origin: str | None = None,
) -> Coordinates:
    try:
        longitude = float(longitude_deg)
        latitude = float(latitude_deg)
        if not math.isfinite(longitude) or not 0 <= longitude < 360:
            raise ValueError("longitude must be in [0, 360)")
        if not math.isfinite(latitude) or not -90 <= latitude <= 90:
            raise ValueError("latitude must be in [-90, 90]")
        coordinate = SkyCoord(l=longitude * u.deg, b=latitude * u.deg, frame=Galactic())
    except Exception as exc:
        raise CatalogValidationError(f"Invalid Galactic coordinate: {exc}") from exc
    return _coordinate_result(
        coordinate,
        original_frame="Galactic/IAU1958",
        original_values={"longitudeDeg": longitude, "latitudeDeg": latitude},
        accuracy_arcsec=accuracy_arcsec,
        origin=origin,
    )


def area_to_equivalent_diameter_arcmin(area_square_deg: float) -> float:
    """Return the diameter of a circle having the supplied area."""

    area = float(area_square_deg)
    if not math.isfinite(area) or area <= 0:
        raise CatalogValidationError("Area must be a positive finite number")
    return 120 * math.sqrt(area / math.pi)


def shape_from_area(area_square_deg: float | None) -> Shape:
    if area_square_deg is None:
        return Shape()
    diameter = area_to_equivalent_diameter_arcmin(area_square_deg)
    return Shape(
        kind="circle",
        major_arcmin=diameter,
        minor_arcmin=diameter,
        approximate=True,
        derivation="area_equivalent",
    )


def shape_from_axes(
    major_arcmin: float | None,
    minor_arcmin: float | None = None,
    *,
    position_angle_deg: float | None = None,
    approximate: bool = False,
    derivation: str = "catalog_axes",
) -> Shape:
    if major_arcmin is None:
        return Shape()
    major = float(major_arcmin)
    if minor_arcmin is None:
        return Shape(
            kind="ellipse",
            major_arcmin=major,
            minor_arcmin=None,
            position_angle_deg=None,
            approximate=approximate,
            derivation=derivation,
        )
    minor = float(minor_arcmin)
    position_angle = float(position_angle_deg) % 180 if position_angle_deg is not None else None
    if minor > major:
        major, minor = minor, major
        if position_angle is not None:
            position_angle = (position_angle + 90) % 180
    return Shape(
        kind="circle" if abs(major - minor) < 1e-12 else "ellipse",
        major_arcmin=major,
        minor_arcmin=minor,
        position_angle_deg=position_angle,
        approximate=approximate,
        derivation=derivation,
    )


def angular_separation_arcmin(left: Coordinates, right: Coordinates) -> float:
    first = SkyCoord(left.ra_deg * u.deg, left.dec_deg * u.deg, frame=ICRS())
    second = SkyCoord(right.ra_deg * u.deg, right.dec_deg * u.deg, frame=ICRS())
    return float(first.separation(second).arcminute)
