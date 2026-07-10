import {
  Body,
  Equator,
  Illumination,
  Observer as AstronomyObserver,
} from "astronomy-engine";
import { validateObserver } from "./coordinates.js";

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
