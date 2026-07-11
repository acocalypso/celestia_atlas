import test from "node:test";
import assert from "node:assert/strict";
import {
  getJupiterMoonObjects,
  getSolarSystemObjects,
} from "../src/index.js";

const BERLIN = {
  latitudeDeg: 52.52,
  longitudeDeg: 13.405,
  elevationM: 40,
};

function angularSeparationDeg(a, b) {
  const radians = Math.PI / 180;
  const decA = a.decDeg * radians;
  const decB = b.decDeg * radians;
  const deltaRa = (a.raDeg - b.raDeg) * radians;
  return (
    Math.acos(
      Math.min(
        1,
        Math.max(
          -1,
          Math.sin(decA) * Math.sin(decB) +
            Math.cos(decA) * Math.cos(decB) * Math.cos(deltaRa),
        ),
      ),
    ) / radians
  );
}

test("returns the searchable Sun, Moon, planets, and Pluto in J2000", () => {
  const objects = getSolarSystemObjects(
    Date.parse("2024-02-29T00:00:00Z"),
    BERLIN,
  );
  assert.deepEqual(
    objects.map((object) => object.name),
    [
      "Sun",
      "Moon",
      "Mercury",
      "Venus",
      "Mars",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
      "Pluto",
    ],
  );
  for (const object of objects) {
    assert.equal(object.frame, "J2000");
    assert.equal(object.coordinates.frame, "J2000");
    assert.ok(object.raDeg >= 0 && object.raDeg < 360);
    assert.ok(object.decDeg >= -90 && object.decDeg <= 90);
    assert.ok(Number.isFinite(object.magnitude));
  }
});

test("matches a topocentric JPL Horizons Mars fixture within one arcminute", () => {
  const mars = getSolarSystemObjects(
    Date.parse("2024-02-29T00:00:00Z"),
    BERLIN,
  ).find((object) => object.name === "Mars");
  // JPL Horizons observer ephemeris: coord@399, Berlin, ICRF/J2000.
  // 2024-Feb-29 00:00 UTC: RA 20 58 19.48, Dec -18 15 34.4.
  const horizons = {
    raDeg: 15 * (20 + 58 / 60 + 19.48 / 3600),
    decDeg: -(18 + 15 / 60 + 34.4 / 3600),
  };
  assert.ok(angularSeparationDeg(mars, horizons) < 1 / 60);
});

test("updates moving objects with time and observer parallax", () => {
  const timestamp = Date.parse("2024-02-29T00:00:00Z");
  const now = getSolarSystemObjects(timestamp, BERLIN);
  const tomorrow = getSolarSystemObjects(timestamp + 86400000, BERLIN);
  const antipode = getSolarSystemObjects(timestamp, {
    latitudeDeg: -52.52,
    longitudeDeg: -166.595,
    elevationM: 40,
  });
  const moonNow = now.find((object) => object.name === "Moon");
  const moonTomorrow = tomorrow.find((object) => object.name === "Moon");
  const moonAntipode = antipode.find((object) => object.name === "Moon");
  assert.ok(angularSeparationDeg(moonNow, moonTomorrow) > 5);
  assert.ok(angularSeparationDeg(moonNow, moonAntipode) > 1);
});

test("rejects invalid time and observer inputs", () => {
  assert.throws(() => getSolarSystemObjects(Number.NaN, BERLIN), /finite/);
  assert.throws(
    () =>
      getSolarSystemObjects(Date.now(), {
        latitudeDeg: 91,
        longitudeDeg: 0,
        elevationM: 0,
      }),
    /latitudeDeg/,
  );
});

test("returns Jupiter's four Galilean moons and matches JPL Horizons for Io", () => {
  const timestamp = Date.parse("2024-02-29T00:00:00Z");
  const moons = getJupiterMoonObjects(timestamp, BERLIN);
  assert.deepEqual(
    moons.map((object) => object.name),
    ["Io", "Europa", "Ganymede", "Callisto"],
  );
  assert.ok(moons.every((object) => object.parentBody === "Jupiter"));
  // JPL Horizons target 501, coord@399 Berlin, ICRF/J2000:
  // 2024-Feb-29 00:00 UTC: RA 02 34 41.61, Dec +14 11 28.9.
  const horizonsIo = {
    raDeg: 15 * (2 + 34 / 60 + 41.61 / 3600),
    decDeg: 14 + 11 / 60 + 28.9 / 3600,
  };
  assert.ok(angularSeparationDeg(moons[0], horizonsIo) < 1 / 60);
  const later = getJupiterMoonObjects(timestamp + 6 * 3600000, BERLIN);
  assert.ok(angularSeparationDeg(moons[0], later[0]) > 0.01);
});
