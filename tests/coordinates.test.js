import test from "node:test";
import assert from "node:assert/strict";
import {
  equatorialToHorizontal,
  horizontalToEquatorial,
  horizonAltitudeAtAzimuth,
  normalizeDegrees,
  panHorizontalView,
  pinchZoomFov,
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

test("interpolates a custom horizon continuously across north", () => {
  const points = [
    { azimuthDeg: 10, altitudeDeg: 20 },
    { azimuthDeg: 180, altitudeDeg: 5 },
    { azimuthDeg: 350, altitudeDeg: 10 },
  ];
  assert.equal(horizonAltitudeAtAzimuth(points, 350), 10);
  assert.equal(horizonAltitudeAtAzimuth(points, 0), 15);
  assert.equal(horizonAltitudeAtAzimuth([], 0), 0);
});

test("pinch zoom follows two-finger distance and clamps its field of view", () => {
  assert.equal(pinchZoomFov(70, 100, 200), 35);
  assert.equal(pinchZoomFov(70, 100, 50), 130);
  assert.equal(pinchZoomFov(0.1, 100, 1000), 0.05);
  assert.throws(() => pinchZoomFov(70, 0, 100), /positive finite/);
});

test("pans along the local horizon independently of grid visibility", () => {
  const leftRight = panHorizontalView(
    { azimuthDeg: 2, altitudeDeg: 25 },
    20,
    0,
    70,
    700,
  );
  assert.equal(leftRight.azimuthDeg, 4);
  assert.equal(leftRight.altitudeDeg, 25);

  const upDown = panHorizontalView(
    { azimuthDeg: 180, altitudeDeg: 89 },
    0,
    20,
    70,
    700,
  );
  assert.equal(upDown.azimuthDeg, 180);
  assert.equal(upDown.altitudeDeg, 89.5);
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
