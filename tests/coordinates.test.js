import test from "node:test";
import assert from "node:assert/strict";
import {
  equatorialToHorizontal,
  horizontalToEquatorial,
  normalizeDegrees,
  validateEquatorialCoordinates,
  validateObserver,
} from "../src/index.js";

test("normalizes RA wrap and east-positive longitude", () => {
  assert.equal(
    validateEquatorialCoordinates({ raDeg: 360, decDeg: 0, frame: "ICRS" })
      .raDeg,
    0,
  );
  assert.equal(
    validateObserver({ latitudeDeg: 0, longitudeDeg: 181, elevationM: 0 })
      .longitudeDeg,
    -179,
  );
  assert.equal(normalizeDegrees(-1), 359);
});

test("rejects untagged command-producing coordinates", () => {
  assert.throws(
    () => validateEquatorialCoordinates({ raDeg: 10, decDeg: 20 }),
    /explicit/,
  );
  assert.throws(
    () =>
      validateEquatorialCoordinates({ raDeg: 10, decDeg: 91, frame: "ICRS" }),
    /decDeg/,
  );
});

test("Greenwich meridian transit places an equatorial target on the celestial equator horizon geometry", () => {
  const timestampUtcMs = Date.UTC(2000, 0, 1, 12);
  const result = equatorialToHorizontal(
    { raDeg: 280.46061837, decDeg: 0, frame: "J2000", epochJulianYear: 2000 },
    { latitudeDeg: 0, longitudeDeg: 0, elevationM: 0 },
    timestampUtcMs,
  );
  assert.ok(Math.abs(result.altitudeDeg - 90) < 1e-7);
});

test("round trips horizontal coordinates for northern and southern observers", () => {
  const timestampUtcMs = Date.UTC(2024, 1, 29, 23, 45);
  for (const observer of [
    { latitudeDeg: 52.52, longitudeDeg: 13.405, elevationM: 35 },
    { latitudeDeg: -33.87, longitudeDeg: 151.21, elevationM: 10 },
  ]) {
    const target = { raDeg: 359.9, decDeg: -42.5, frame: "ICRS" };
    const horizontal = equatorialToHorizontal(target, observer, timestampUtcMs);
    const result = horizontalToEquatorial(horizontal, observer, timestampUtcMs);
    const raError = Math.abs(((result.raDeg - target.raDeg + 540) % 360) - 180);
    assert.ok(raError < 1e-9);
    assert.ok(Math.abs(result.decDeg - target.decDeg) < 1e-9);
  }
});
