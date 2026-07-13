import {
  InverseRotation,
  Observer as AstronomyObserver,
  Rotation_EQJ_HOR,
} from "astronomy-engine";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// Transpose of the IAU SOFA 2023-10-11 iauFk5hip orientation matrix.
// It rotates Hipparcos/ICRS axes into FK5 equinox and epoch J2000.0 axes.
// https://www.iausofa.org/current-software
const ICRS_TO_J2000 = Object.freeze([
  Object.freeze([
    0.9999999999999929, -0.00000011102233084587464, -0.00000004411805033656962,
  ]),
  Object.freeze([
    0.00000011102233510229197, 0.9999999999999892, 0.00000009647792009175314,
  ]),
  Object.freeze([
    0.00000004411803962536558, -0.00000009647792498984142, 0.9999999999999943,
  ]),
]);
const J2000_TO_ICRS = Object.freeze(
  ICRS_TO_J2000.map((_, row) =>
    Object.freeze(ICRS_TO_J2000.map((source) => source[row])),
  ),
);

let observedFrameCache = null;

export function normalizeDegrees(value) {
  if (value >= 0 && value < 360) return value;
  return ((value % 360) + 360) % 360;
}

export function validateEquatorialCoordinates(value) {
  if (
    !value ||
    !Number.isFinite(value.raDeg) ||
    !Number.isFinite(value.decDeg)
  ) {
    throw new TypeError(
      "Equatorial coordinates require finite raDeg and decDeg values",
    );
  }
  if (!["ICRS", "J2000"].includes(value.frame)) {
    throw new TypeError(
      "Equatorial coordinates require an explicit ICRS or J2000 frame",
    );
  }
  if (value.decDeg < -90 || value.decDeg > 90) {
    throw new RangeError("decDeg must be between -90 and 90 degrees");
  }
  return { ...value, raDeg: normalizeDegrees(value.raDeg) };
}

export function validateObserver(value) {
  if (
    !value ||
    !Number.isFinite(value.latitudeDeg) ||
    !Number.isFinite(value.longitudeDeg)
  ) {
    throw new TypeError(
      "Observer requires finite latitudeDeg and longitudeDeg values",
    );
  }
  if (value.latitudeDeg < -90 || value.latitudeDeg > 90) {
    throw new RangeError("latitudeDeg must be between -90 and 90 degrees");
  }
  if (!Number.isFinite(value.elevationM)) {
    throw new TypeError("Observer requires a finite elevationM value");
  }
  return {
    latitudeDeg: value.latitudeDeg,
    longitudeDeg: ((((value.longitudeDeg + 180) % 360) + 360) % 360) - 180,
    elevationM: value.elevationM,
  };
}

export function julianDate(timestampUtcMs) {
  if (!Number.isFinite(timestampUtcMs))
    throw new TypeError("UTC timestamp must be finite");
  return timestampUtcMs / 86400000 + 2440587.5;
}

export function localSiderealDegrees(timestampUtcMs, longitudeDeg) {
  return normalizeDegrees(
    280.46061837 +
      360.98564736629 * (julianDate(timestampUtcMs) - 2451545) +
      longitudeDeg,
  );
}

function validateHorizontalCoordinates(horizontal) {
  if (
    !horizontal ||
    !Number.isFinite(horizontal.azimuthDeg) ||
    !Number.isFinite(horizontal.altitudeDeg)
  ) {
    throw new TypeError(
      "Horizontal coordinates require finite azimuth and altitude",
    );
  }
  if (horizontal.altitudeDeg < -90 || horizontal.altitudeDeg > 90) {
    throw new RangeError("altitudeDeg must be between -90 and 90 degrees");
  }
  return {
    azimuthDeg: normalizeDegrees(horizontal.azimuthDeg),
    altitudeDeg: horizontal.altitudeDeg,
  };
}

function applyRowMajorMatrix(matrix, vector) {
  return {
    x:
      matrix[0][0] * vector.x +
      matrix[0][1] * vector.y +
      matrix[0][2] * vector.z,
    y:
      matrix[1][0] * vector.x +
      matrix[1][1] * vector.y +
      matrix[1][2] * vector.z,
    z:
      matrix[2][0] * vector.x +
      matrix[2][1] * vector.y +
      matrix[2][2] * vector.z,
  };
}

// Astronomy Engine stores its rotation matrices in the same orientation used
// by RotateVector. Keeping this multiplication local avoids allocating a
// Vector for every catalogue object and horizon sample.
function applyAstronomyRotation(matrix, vector) {
  return {
    x:
      matrix[0][0] * vector.x +
      matrix[1][0] * vector.y +
      matrix[2][0] * vector.z,
    y:
      matrix[0][1] * vector.x +
      matrix[1][1] * vector.y +
      matrix[2][1] * vector.z,
    z:
      matrix[0][2] * vector.x +
      matrix[1][2] * vector.y +
      matrix[2][2] * vector.z,
  };
}

function equatorialUnitVector(coordinates) {
  const rightAscension = coordinates.raDeg * DEG;
  const declination = coordinates.decDeg * DEG;
  const cosDeclination = Math.cos(declination);
  return {
    x: cosDeclination * Math.cos(rightAscension),
    y: cosDeclination * Math.sin(rightAscension),
    z: Math.sin(declination),
  };
}

function horizontalUnitVector(horizontal) {
  const azimuth = horizontal.azimuthDeg * DEG;
  const altitude = horizontal.altitudeDeg * DEG;
  const cosAltitude = Math.cos(altitude);
  return {
    x: cosAltitude * Math.cos(azimuth),
    // Astronomy Engine HOR is right-handed: x=north, y=west, z=up.
    y: -cosAltitude * Math.sin(azimuth),
    z: Math.sin(altitude),
  };
}

function observationFrame(observer, timestampUtcMs) {
  // Retain the public timestamp validation even though Astronomy Engine also
  // validates dates, so callers receive the Atlas contract error consistently.
  julianDate(timestampUtcMs);
  const cached = observedFrameCache;
  if (
    cached &&
    cached.timestampUtcMs === timestampUtcMs &&
    cached.latitudeDeg === observer.latitudeDeg &&
    cached.longitudeDeg === observer.longitudeDeg &&
    cached.elevationM === observer.elevationM
  ) {
    return cached;
  }

  const date = new Date(timestampUtcMs);
  const astronomyObserver = new AstronomyObserver(
    observer.latitudeDeg,
    observer.longitudeDeg,
    observer.elevationM,
  );
  const eqjToHorRotation = Rotation_EQJ_HOR(date, astronomyObserver);
  const next = {
    timestampUtcMs,
    latitudeDeg: observer.latitudeDeg,
    longitudeDeg: observer.longitudeDeg,
    elevationM: observer.elevationM,
    eqjToHor: eqjToHorRotation.rot,
    horToEqj: InverseRotation(eqjToHorRotation).rot,
  };
  observedFrameCache = next;
  return next;
}

/**
 * Builds a linear equatorial-vector to local-horizontal transform for raster
 * and other batch geometry. The returned axes are east, north, and up.
 * @internal
 */
export function createEquatorialToHorizontalVectorTransform(
  observer,
  timestampUtcMs,
  frame,
) {
  const site = validateObserver(observer);
  if (!["ICRS", "J2000"].includes(frame))
    throw new TypeError("Equatorial vectors require an ICRS or J2000 frame");
  const rotation = observationFrame(site, timestampUtcMs);
  return (vector) => {
    let equatorial = vector;
    if (frame === "ICRS")
      equatorial = applyRowMajorMatrix(ICRS_TO_J2000, equatorial);
    const horizontal = applyAstronomyRotation(rotation.eqjToHor, equatorial);
    return {
      east: -horizontal.y,
      north: horizontal.x,
      up: horizontal.z,
    };
  };
}

/**
 * Converts west-positive local hour angle and declination to geometric
 * north-zero, east-positive horizontal coordinates. This pure spherical step
 * is exported separately so its handedness can be checked against IAU SOFA.
 */
export function hourAngleToHorizontal(
  hourAngleDeg,
  declinationDeg,
  latitudeDeg,
) {
  if (
    !Number.isFinite(hourAngleDeg) ||
    !Number.isFinite(declinationDeg) ||
    !Number.isFinite(latitudeDeg)
  ) {
    throw new TypeError("Hour angle, declination, and latitude must be finite");
  }
  if (declinationDeg < -90 || declinationDeg > 90)
    throw new RangeError("declinationDeg must be between -90 and 90 degrees");
  if (latitudeDeg < -90 || latitudeDeg > 90)
    throw new RangeError("latitudeDeg must be between -90 and 90 degrees");

  const hourAngle = hourAngleDeg * DEG;
  const declination = declinationDeg * DEG;
  const latitude = latitudeDeg * DEG;
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north =
    Math.sin(declination) * Math.cos(latitude) -
    Math.cos(declination) * Math.cos(hourAngle) * Math.sin(latitude);
  const up =
    Math.sin(declination) * Math.sin(latitude) +
    Math.cos(declination) * Math.cos(hourAngle) * Math.cos(latitude);
  return {
    azimuthDeg: normalizeDegrees(Math.atan2(east, north) * RAD),
    altitudeDeg: Math.atan2(up, Math.hypot(north, east)) * RAD,
  };
}

/** Inverse of hourAngleToHorizontal; returned hour angle is in [-180, 180]. */
export function horizontalToHourAngle(horizontal, latitudeDeg) {
  const target = validateHorizontalCoordinates(horizontal);
  if (!Number.isFinite(latitudeDeg))
    throw new TypeError("Latitude must be finite");
  if (latitudeDeg < -90 || latitudeDeg > 90)
    throw new RangeError("latitudeDeg must be between -90 and 90 degrees");

  const azimuth = target.azimuthDeg * DEG;
  const altitude = target.altitudeDeg * DEG;
  const latitude = latitudeDeg * DEG;
  const north = Math.cos(altitude) * Math.cos(azimuth);
  const east = Math.cos(altitude) * Math.sin(azimuth);
  const up = Math.sin(altitude);
  const sinDeclination = Math.max(
    -1,
    Math.min(1, north * Math.cos(latitude) + up * Math.sin(latitude)),
  );
  const declination = Math.asin(sinDeclination);
  const hourAngle = Math.atan2(
    -east,
    up * Math.cos(latitude) - north * Math.sin(latitude),
  );
  return {
    hourAngleDeg: hourAngle * RAD,
    declinationDeg: declination * RAD,
  };
}

export function equatorialToHorizontal(coordinates, observer, timestampUtcMs) {
  const target = validateEquatorialCoordinates(coordinates);
  const site = validateObserver(observer);
  const rotation = observationFrame(site, timestampUtcMs);
  let equatorial = equatorialUnitVector(target);
  if (target.frame === "ICRS")
    equatorial = applyRowMajorMatrix(ICRS_TO_J2000, equatorial);
  const horizontal = applyAstronomyRotation(rotation.eqjToHor, equatorial);
  return {
    azimuthDeg: normalizeDegrees(Math.atan2(-horizontal.y, horizontal.x) * RAD),
    altitudeDeg:
      Math.atan2(horizontal.z, Math.hypot(horizontal.x, horizontal.y)) * RAD,
  };
}

export function horizontalToEquatorial(
  horizontal,
  observer,
  timestampUtcMs,
  frame = "ICRS",
) {
  const site = validateObserver(observer);
  const target = validateHorizontalCoordinates(horizontal);
  if (!["ICRS", "J2000"].includes(frame))
    throw new TypeError("Equatorial output requires an ICRS or J2000 frame");
  const rotation = observationFrame(site, timestampUtcMs);
  let equatorial = applyAstronomyRotation(
    rotation.horToEqj,
    horizontalUnitVector(target),
  );
  if (frame === "ICRS")
    equatorial = applyRowMajorMatrix(J2000_TO_ICRS, equatorial);
  return validateEquatorialCoordinates({
    raDeg: Math.atan2(equatorial.y, equatorial.x) * RAD,
    decDeg:
      Math.atan2(equatorial.z, Math.hypot(equatorial.x, equatorial.y)) * RAD,
    frame,
  });
}

export function panHorizontalView(
  center,
  deltaX,
  deltaY,
  fovDeg,
  viewportHeight,
) {
  if (
    !center ||
    !Number.isFinite(center.azimuthDeg) ||
    !Number.isFinite(center.altitudeDeg) ||
    !Number.isFinite(deltaX) ||
    !Number.isFinite(deltaY) ||
    !Number.isFinite(fovDeg) ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  )
    throw new TypeError("Horizontal panning requires finite view geometry");
  const degreesPerPixel = fovDeg / Math.max(280, viewportHeight);
  return {
    azimuthDeg: normalizeDegrees(center.azimuthDeg + deltaX * degreesPerPixel),
    altitudeDeg: Math.max(
      -89.5,
      Math.min(89.5, center.altitudeDeg + deltaY * degreesPerPixel),
    ),
  };
}

export function pinchZoomFov(startFovDeg, startDistance, currentDistance) {
  if (
    !Number.isFinite(startFovDeg) ||
    !Number.isFinite(startDistance) ||
    !Number.isFinite(currentDistance) ||
    startFovDeg <= 0 ||
    startDistance <= 0 ||
    currentDistance <= 0
  )
    throw new TypeError("Pinch zoom requires positive finite geometry");
  return Math.max(
    0.05,
    Math.min(130, startFovDeg * (startDistance / currentDistance)),
  );
}

export function horizonAltitudeAtAzimuth(points, azimuthDeg, fallback = 0) {
  if (!Array.isArray(points) || points.length < 2) return fallback;
  const azimuth = normalizeDegrees(azimuthDeg);
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].azimuthDeg <= azimuth) low = middle + 1;
    else high = middle;
  }
  const rightIndex = low % points.length;
  const leftIndex = (low - 1 + points.length) % points.length;
  const left = points[leftIndex];
  const right = points[rightIndex];
  const leftAzimuth = left.azimuthDeg;
  const rightAzimuth = right.azimuthDeg + (rightIndex === 0 ? 360 : 0);
  const sampleAzimuth =
    azimuth + (rightIndex === 0 && azimuth < leftAzimuth ? 360 : 0);
  const span = rightAzimuth - leftAzimuth;
  if (span <= 0) return left.altitudeDeg;
  const ratio = (sampleAzimuth - leftAzimuth) / span;
  return left.altitudeDeg + (right.altitudeDeg - left.altitudeDeg) * ratio;
}
