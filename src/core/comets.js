import {
  Body,
  HelioVector,
  MakeTime,
  Observer as AstronomyObserver,
  ObserverVector,
} from "astronomy-engine";
import cometCatalog from "../../data/comets.js";
import { normalizeDegrees, validateObserver } from "./coordinates.js";

const GAUSSIAN_GRAVITATIONAL_CONSTANT = 0.01720209895;
const SOLAR_MU = GAUSSIAN_GRAVITATIONAL_CONSTANT ** 2;
const SQRT_SOLAR_MU = Math.sqrt(SOLAR_MU);
const LIGHT_DAYS_PER_AU = 499.004783836 / 86400;
const DEG = Math.PI / 180;

function stumpff(z) {
  if (z > 1e-8) {
    const root = Math.sqrt(z);
    return {
      c: (1 - Math.cos(root)) / z,
      s: (root - Math.sin(root)) / root ** 3,
    };
  }
  if (z < -1e-8) {
    const root = Math.sqrt(-z);
    return {
      c: (Math.cosh(root) - 1) / -z,
      s: (Math.sinh(root) - root) / root ** 3,
    };
  }
  return {
    c: 1 / 2 - z / 24 + z ** 2 / 720,
    s: 1 / 6 - z / 120 + z ** 2 / 5040,
  };
}

/** Propagates MPC perihelion elements in their J2000 ecliptic orbital plane. */
export function propagateComet(elements, terrestrialDaysSinceJ2000) {
  const q = elements?.qAu;
  const eccentricity = elements?.eccentricity;
  if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(eccentricity) || eccentricity < 0)
    throw new TypeError("Comet elements require positive qAu and non-negative eccentricity");
  if (!Number.isFinite(elements.perihelionTt) || !Number.isFinite(terrestrialDaysSinceJ2000))
    throw new TypeError("Comet propagation requires finite TT values");

  const deltaDays = terrestrialDaysSinceJ2000 - elements.perihelionTt;
  if (deltaDays === 0) return { x: q, y: 0, distanceAu: q };
  const sign = Math.sign(deltaDays);
  const target = SQRT_SOLAR_MU * Math.abs(deltaDays);
  const alpha = (1 - eccentricity) / q;
  const equation = (chi) => {
    const { c, s } = stumpff(alpha * chi ** 2);
    return {
      value: eccentricity * chi ** 3 * s + q * chi - target,
      derivative: eccentricity * chi ** 2 * c + q,
    };
  };

  let low = 0;
  let high = 1;
  while (equation(high).value < 0 && high < Number.MAX_VALUE / 4) high *= 2;
  let chi = (low + high) / 2;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const result = equation(chi);
    if (Math.abs(result.value) < 1e-13) break;
    if (result.value > 0) high = chi;
    else low = chi;
    const newton = chi - result.value / result.derivative;
    chi = Number.isFinite(newton) && newton > low && newton < high
      ? newton
      : (low + high) / 2;
  }
  chi *= sign;
  const { c, s } = stumpff(alpha * chi ** 2);
  const f = 1 - (chi ** 2 / q) * c;
  const g = deltaDays - (chi ** 3 / SQRT_SOLAR_MU) * s;
  const perihelionSpeed = Math.sqrt((SOLAR_MU * (1 + eccentricity)) / q);
  const x = f * q;
  const y = g * perihelionSpeed;
  return { x, y, distanceAu: Math.hypot(x, y) };
}

function orbitalPlaneToEquatorial(elements, position) {
  const argument = elements.argumentPerihelionDeg * DEG;
  const node = elements.ascendingNodeDeg * DEG;
  const inclination = elements.inclinationDeg * DEG;
  const cosArgument = Math.cos(argument);
  const sinArgument = Math.sin(argument);
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosInclination = Math.cos(inclination);
  const eclipticX =
    (cosNode * cosArgument - sinNode * sinArgument * cosInclination) * position.x +
    (-cosNode * sinArgument - sinNode * cosArgument * cosInclination) * position.y;
  const eclipticY =
    (sinNode * cosArgument + cosNode * sinArgument * cosInclination) * position.x +
    (-sinNode * sinArgument + cosNode * cosArgument * cosInclination) * position.y;
  const eclipticZ =
    sinArgument * Math.sin(inclination) * position.x +
    cosArgument * Math.sin(inclination) * position.y;
  const obliquity = 23.439291111 * DEG;
  return {
    x: eclipticX,
    y: eclipticY * Math.cos(obliquity) - eclipticZ * Math.sin(obliquity),
    z: eclipticY * Math.sin(obliquity) + eclipticZ * Math.cos(obliquity),
  };
}

export function getCometObjects(
  timestampUtcMs,
  observer,
  elements = cometCatalog.objects,
) {
  if (!Number.isFinite(timestampUtcMs))
    throw new TypeError("UTC timestamp must be finite");
  if (!Array.isArray(elements)) throw new TypeError("Comet elements must be an array");
  const site = validateObserver(observer);
  const date = new Date(timestampUtcMs);
  const time = MakeTime(date);
  const astronomyObserver = new AstronomyObserver(
    site.latitudeDeg,
    site.longitudeDeg,
    site.elevationM,
  );
  const earth = HelioVector(Body.Earth, date);
  const topocentricObserver = ObserverVector(date, astronomyObserver, false);

  return elements.map((item) => {
    let emissionTt = time.tt;
    let relative;
    let position;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      position = propagateComet(item, emissionTt);
      const heliocentric = orbitalPlaneToEquatorial(item, position);
      relative = {
        x: heliocentric.x - earth.x - topocentricObserver.x,
        y: heliocentric.y - earth.y - topocentricObserver.y,
        z: heliocentric.z - earth.z - topocentricObserver.z,
      };
      emissionTt = time.tt - Math.hypot(relative.x, relative.y, relative.z) * LIGHT_DAYS_PER_AU;
    }
    const distanceAu = Math.hypot(relative.x, relative.y, relative.z);
    const magnitude =
      Number.isFinite(item.absoluteMagnitude) && Number.isFinite(item.slope)
        ? item.absoluteMagnitude +
          5 * Math.log10(distanceAu) +
          item.slope * Math.log10(position.distanceAu)
        : undefined;
    const raDeg = normalizeDegrees(Math.atan2(relative.y, relative.x) / DEG);
    const decDeg = Math.asin(relative.z / distanceAu) / DEG;
    return {
      id: item.id,
      name: item.name,
      aliases: item.packedDesignation ? [item.packedDesignation] : [],
      type: "comet",
      objectType: "comet",
      mag: magnitude,
      magnitude,
      distanceAu,
      heliocentricDistanceAu: position.distanceAu,
      catalogSource: "IAU Minor Planet Center",
      catalogueSource: "IAU Minor Planet Center",
      reference: item.reference,
      raDeg,
      decDeg,
      frame: "J2000",
      epochJulianYear: 2000,
      coordinates: { raDeg, decDeg, frame: "J2000", epochJulianYear: 2000 },
    };
  });
}
