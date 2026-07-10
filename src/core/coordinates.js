const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function normalizeDegrees(value) {
  if (value >= 0 && value < 360) return value;
  return ((value % 360) + 360) % 360;
}

export function validateEquatorialCoordinates(value) {
  if (!value || !Number.isFinite(value.raDeg) || !Number.isFinite(value.decDeg)) {
    throw new TypeError('Equatorial coordinates require finite raDeg and decDeg values');
  }
  if (!['ICRS', 'J2000'].includes(value.frame)) {
    throw new TypeError('Equatorial coordinates require an explicit ICRS or J2000 frame');
  }
  if (value.decDeg < -90 || value.decDeg > 90) {
    throw new RangeError('decDeg must be between -90 and 90 degrees');
  }
  return { ...value, raDeg: normalizeDegrees(value.raDeg) };
}

export function validateObserver(value) {
  if (!value || !Number.isFinite(value.latitudeDeg) || !Number.isFinite(value.longitudeDeg)) {
    throw new TypeError('Observer requires finite latitudeDeg and longitudeDeg values');
  }
  if (value.latitudeDeg < -90 || value.latitudeDeg > 90) {
    throw new RangeError('latitudeDeg must be between -90 and 90 degrees');
  }
  if (!Number.isFinite(value.elevationM)) {
    throw new TypeError('Observer requires a finite elevationM value');
  }
  return {
    latitudeDeg: value.latitudeDeg,
    longitudeDeg: ((value.longitudeDeg + 180) % 360 + 360) % 360 - 180,
    elevationM: value.elevationM,
  };
}

export function julianDate(timestampUtcMs) {
  if (!Number.isFinite(timestampUtcMs)) throw new TypeError('UTC timestamp must be finite');
  return timestampUtcMs / 86400000 + 2440587.5;
}

export function localSiderealDegrees(timestampUtcMs, longitudeDeg) {
  return normalizeDegrees(
    280.46061837 + 360.98564736629 * (julianDate(timestampUtcMs) - 2451545) + longitudeDeg,
  );
}

export function equatorialToHorizontal(coordinates, observer, timestampUtcMs) {
  const target = validateEquatorialCoordinates(coordinates);
  const site = validateObserver(observer);
  const hourAngle = normalizeDegrees(localSiderealDegrees(timestampUtcMs, site.longitudeDeg) - target.raDeg);
  const h = (hourAngle > 180 ? hourAngle - 360 : hourAngle) * DEG;
  const dec = target.decDeg * DEG;
  const lat = site.latitudeDeg * DEG;
  const east = -Math.cos(dec) * Math.sin(h);
  const north = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(h) * Math.sin(lat);
  const up = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(h) * Math.cos(lat);
  return {
    azimuthDeg: normalizeDegrees(Math.atan2(east, north) * RAD),
    altitudeDeg: Math.asin(Math.max(-1, Math.min(1, up))) * RAD,
  };
}
