import {
  Body,
  Equator,
  GeoVector,
  Illumination,
  JupiterMoons,
  Observer as AstronomyObserver,
  ObserverVector,
} from "astronomy-engine";
import { normalizeDegrees, validateObserver } from "./coordinates.js";

const LIGHT_MILLISECONDS_PER_AU = 499.004783836 * 1000;

const SOLAR_SYSTEM_BODIES = Object.freeze([
  { body: Body.Sun, type: "star", aliases: ["Sol"] },
  { body: Body.Moon, type: "natural satellite", aliases: ["Luna"] },
  { body: Body.Mercury, type: "planet" },
  { body: Body.Venus, type: "planet" },
  { body: Body.Mars, type: "planet" },
  { body: Body.Jupiter, type: "planet" },
  { body: Body.Saturn, type: "planet" },
  { body: Body.Uranus, type: "planet" },
  { body: Body.Neptune, type: "planet" },
  { body: Body.Pluto, type: "dwarf planet" },
]);

/**
 * Calculates apparent topocentric positions in the J2000 equatorial frame.
 * Longitude is degrees east and elevation is metres above mean sea level.
 */
export function getSolarSystemObjects(timestampUtcMs, observer) {
  if (!Number.isFinite(timestampUtcMs))
    throw new TypeError("UTC timestamp must be finite");
  const site = validateObserver(observer);
  const date = new Date(timestampUtcMs);
  const astronomyObserver = new AstronomyObserver(
    site.latitudeDeg,
    site.longitudeDeg,
    site.elevationM,
  );

  return SOLAR_SYSTEM_BODIES.map(({ body, type, aliases = [] }) => {
    const equatorial = Equator(body, date, astronomyObserver, false, true);
    const illumination = Illumination(body, date);
    return {
      id: `solar-system:${body.toLocaleLowerCase()}`,
      name: body,
      aliases,
      type,
      objectType: type,
      mag: illumination.mag,
      magnitude: illumination.mag,
      phaseFraction: illumination.phase_fraction,
      distanceAu: equatorial.dist,
      catalogSource: "Astronomy Engine",
      catalogueSource: "Astronomy Engine",
      raDeg: equatorial.ra * 15,
      decDeg: equatorial.dec,
      frame: "J2000",
      epochJulianYear: 2000,
      coordinates: {
        raDeg: equatorial.ra * 15,
        decDeg: equatorial.dec,
        frame: "J2000",
        epochJulianYear: 2000,
      },
    };
  });
}

const GALILEAN_MOONS = Object.freeze([
  { key: "io", name: "Io", absoluteMagnitude: -1.68 },
  { key: "europa", name: "Europa", absoluteMagnitude: -1.41 },
  { key: "ganymede", name: "Ganymede", absoluteMagnitude: -2.09 },
  { key: "callisto", name: "Callisto", absoluteMagnitude: -1.05 },
]);

/** Calculates apparent topocentric J2000 positions for Jupiter's major moons. */
export function getJupiterMoonObjects(timestampUtcMs, observer) {
  if (!Number.isFinite(timestampUtcMs))
    throw new TypeError("UTC timestamp must be finite");
  const site = validateObserver(observer);
  const date = new Date(timestampUtcMs);
  const astronomyObserver = new AstronomyObserver(
    site.latitudeDeg,
    site.longitudeDeg,
    site.elevationM,
  );
  const jupiter = GeoVector(Body.Jupiter, date, true);
  const observerVector = ObserverVector(date, astronomyObserver, false);
  const jupiterDistanceAu = Math.hypot(
    jupiter.x - observerVector.x,
    jupiter.y - observerVector.y,
    jupiter.z - observerVector.z,
  );
  const emissionDate = new Date(
    timestampUtcMs - jupiterDistanceAu * LIGHT_MILLISECONDS_PER_AU,
  );
  const moons = JupiterMoons(emissionDate);
  const jupiterIllumination = Illumination(Body.Jupiter, date);

  return GALILEAN_MOONS.map(({ key, name, absoluteMagnitude }) => {
    const moon = moons[key];
    const relative = {
      x: jupiter.x + moon.x - observerVector.x,
      y: jupiter.y + moon.y - observerVector.y,
      z: jupiter.z + moon.z - observerVector.z,
    };
    const distanceAu = Math.hypot(relative.x, relative.y, relative.z);
    const raDeg = normalizeDegrees(Math.atan2(relative.y, relative.x) * 180 / Math.PI);
    const decDeg = Math.asin(relative.z / distanceAu) * 180 / Math.PI;
    const magnitude =
      absoluteMagnitude +
      5 * Math.log10(jupiterIllumination.helio_dist * distanceAu);
    return {
      id: `solar-system:jupiter:${name.toLocaleLowerCase()}`,
      name,
      aliases: [`Jupiter ${name}`],
      type: "natural satellite",
      objectType: "natural satellite",
      parentBody: "Jupiter",
      mag: magnitude,
      magnitude,
      distanceAu,
      catalogSource: "Astronomy Engine",
      catalogueSource: "Astronomy Engine",
      raDeg,
      decDeg,
      frame: "J2000",
      epochJulianYear: 2000,
      coordinates: { raDeg, decDeg, frame: "J2000", epochJulianYear: 2000 },
    };
  });
}
