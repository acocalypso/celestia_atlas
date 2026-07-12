const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

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

export function equatorialToHorizontal(coordinates, observer, timestampUtcMs) {
  const target = validateEquatorialCoordinates(coordinates);
  const site = validateObserver(observer);
  const hourAngle = normalizeDegrees(
    localSiderealDegrees(timestampUtcMs, site.longitudeDeg) - target.raDeg,
  );
  const h = (hourAngle > 180 ? hourAngle - 360 : hourAngle) * DEG;
  const dec = target.decDeg * DEG;
  const lat = site.latitudeDeg * DEG;
  const east = -Math.cos(dec) * Math.sin(h);
  const north =
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(h) * Math.sin(lat);
  const up =
    Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(h) * Math.cos(lat);
  return {
    azimuthDeg: normalizeDegrees(Math.atan2(east, north) * RAD),
    altitudeDeg: Math.asin(Math.max(-1, Math.min(1, up))) * RAD,
  };
}

export function horizontalToEquatorial(
  horizontal,
  observer,
  timestampUtcMs,
  frame = "ICRS",
) {
  const site = validateObserver(observer);
  if (
    !horizontal ||
    !Number.isFinite(horizontal.azimuthDeg) ||
    !Number.isFinite(horizontal.altitudeDeg) ||
    horizontal.altitudeDeg < -90 ||
    horizontal.altitudeDeg > 90
  ) {
    throw new TypeError(
      "Horizontal coordinates require finite azimuth and altitude",
    );
  }
  const azimuth = normalizeDegrees(horizontal.azimuthDeg) * DEG;
  const altitude = horizontal.altitudeDeg * DEG;
  const latitude = site.latitudeDeg * DEG;
  const north = Math.cos(altitude) * Math.cos(azimuth);
  const east = Math.cos(altitude) * Math.sin(azimuth);
  const up = Math.sin(altitude);
  const sinDec = Math.max(
    -1,
    Math.min(1, north * Math.cos(latitude) + up * Math.sin(latitude)),
  );
  const dec = Math.asin(sinDec);
  const hourAngle = Math.atan2(
    -east,
    up * Math.cos(latitude) - north * Math.sin(latitude),
  );
  return validateEquatorialCoordinates({
    raDeg:
      localSiderealDegrees(timestampUtcMs, site.longitudeDeg) - hourAngle * RAD,
    decDeg: dec * RAD,
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
