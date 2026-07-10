(() => {
  "use strict";

  const astronomy = globalThis.Astronomy;
  if (!astronomy) {
    console.error("Celestia Atlas solar-system ephemeris failed to load");
    return;
  }

  const bodies = [
    [astronomy.Body.Sun, "Star", ["Sol"]],
    [astronomy.Body.Moon, "Natural satellite", ["Luna"]],
    [astronomy.Body.Mercury, "Planet", []],
    [astronomy.Body.Venus, "Planet", []],
    [astronomy.Body.Mars, "Planet", []],
    [astronomy.Body.Jupiter, "Planet", []],
    [astronomy.Body.Saturn, "Planet", []],
    [astronomy.Body.Uranus, "Planet", []],
    [astronomy.Body.Neptune, "Planet", []],
    [astronomy.Body.Pluto, "Dwarf planet", []],
  ];

  function getObjects(timestampUtcMs, observer) {
    const date = new Date(timestampUtcMs);
    const site = new astronomy.Observer(
      observer.latitudeDeg,
      observer.longitudeDeg,
      observer.elevationM ?? 0,
    );
    return bodies.map(([body, type, aliases]) => {
      const equatorial = astronomy.Equator(body, date, site, false, true);
      const illumination = astronomy.Illumination(body, date);
      return {
        id: `solar-system:${body.toLowerCase()}`,
        name: body,
        aliases,
        kind: "solar-system",
        type,
        ra: equatorial.ra,
        dec: equatorial.dec,
        mag: illumination.mag,
        phaseFraction: illumination.phase_fraction,
        distanceAu: equatorial.dist,
        catalogSource: "Astronomy Engine",
        description: `${body} at its apparent topocentric J2000 position for the selected observer and time.`,
      };
    });
  }

  globalThis.CelestiaAtlasSolarSystem = Object.freeze({ getObjects });
})();
