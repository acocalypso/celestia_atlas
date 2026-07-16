import test from "node:test";
import assert from "node:assert/strict";
import {
  equatorialToHorizontal,
  horizontalToHourAngle,
  horizontalToEquatorial,
  horizonAltitudeAtAzimuth,
  hourAngleToHorizontal,
  normalizeDegrees,
  panHorizontalView,
  pinchZoomFov,
  validateEquatorialCoordinates,
  validateObserver,
} from "../src/index.js";

const RADIANS_TO_DEGREES = 180 / Math.PI;
const SOFA_AZIMUTH_TOLERANCE_DEG = 1e-13 * RADIANS_TO_DEGREES;
const SOFA_ANGLE_TOLERANCE_DEG = 1e-14 * RADIANS_TO_DEGREES;
const FULL_FRAME_TOLERANCE_DEG = 1e-10;

function angularErrorDeg(actual, expected) {
  return Math.abs(((actual - expected + 540) % 360) - 180);
}

function assertAngleClose(actual, expected, tolerance, label) {
  const error = angularErrorDeg(actual, expected);
  assert.ok(
    error <= tolerance,
    `${label}: expected ${expected}, received ${actual}, error ${error}`,
  );
}

function assertNumberClose(actual, expected, tolerance, label) {
  const error = Math.abs(actual - expected);
  assert.ok(
    error <= tolerance,
    `${label}: expected ${expected}, received ${actual}, error ${error}`,
  );
}

const FULL_FRAME_FIXTURES = [
  {
    name: "Berlin below the horizon",
    timestampUtcMs: Date.parse("2026-07-13T00:00:00.000Z"),
    observer: {
      latitudeDeg: 52.52,
      longitudeDeg: 13.405,
      elevationM: 35,
    },
    coordinates: { raDeg: 120, decDeg: 30, frame: "J2000" },
    horizontal: {
      azimuthDeg: 3.3919848105957726,
      altitudeDeg: -7.483089613944132,
    },
  },
  {
    name: "Sydney leap day",
    timestampUtcMs: Date.parse("2024-02-29T23:45:00.000Z"),
    observer: {
      latitudeDeg: -33.87,
      longitudeDeg: 151.21,
      elevationM: 10,
    },
    coordinates: { raDeg: 359.9, decDeg: -42.5, frame: "J2000" },
    horizontal: {
      azimuthDeg: 117.90436211674,
      altitudeDeg: 47.79220714620261,
    },
  },
  {
    name: "Mauna Kea west longitude",
    timestampUtcMs: Date.parse("2031-01-15T06:00:00.000Z"),
    observer: {
      latitudeDeg: 19.8206,
      longitudeDeg: -155.4681,
      elevationM: 4205,
    },
    coordinates: { raDeg: 45, decDeg: -10, frame: "J2000" },
    horizontal: {
      azimuthDeg: 187.23334142711226,
      altitudeDeg: 60.08441308989654,
    },
  },
  {
    name: "Greenwich equator at the RA wrap",
    timestampUtcMs: Date.parse("2040-03-20T12:00:00.000Z"),
    observer: { latitudeDeg: 0, longitudeDeg: 0, elevationM: 0 },
    coordinates: { raDeg: 0, decDeg: 20, frame: "J2000" },
    horizontal: {
      azimuthDeg: 5.090393572323137,
      altitudeDeg: 69.6942424217848,
    },
  },
];

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
  assert.equal(leftRight.azimuthDeg, 0);
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

// Official validation vectors from the IAU SOFA ANSI C release 2023-10-11,
// t_sofa_c.c tests t_hd2ae and t_ae2hd.
// https://www.iausofa.org/2023-10-11c
test("matches the IAU SOFA equatorial-to-horizontal handedness fixture", () => {
  const result = hourAngleToHorizontal(
    1.1 * RADIANS_TO_DEGREES,
    1.2 * RADIANS_TO_DEGREES,
    0.3 * RADIANS_TO_DEGREES,
  );

  assertAngleClose(
    result.azimuthDeg,
    5.916889243730066194 * RADIANS_TO_DEGREES,
    SOFA_AZIMUTH_TOLERANCE_DEG,
    "SOFA azimuth",
  );
  assertNumberClose(
    result.altitudeDeg,
    0.4472186304990486228 * RADIANS_TO_DEGREES,
    SOFA_ANGLE_TOLERANCE_DEG,
    "SOFA altitude",
  );
});

test("matches the IAU SOFA horizontal-to-equatorial handedness fixture", () => {
  const result = horizontalToHourAngle(
    {
      azimuthDeg: 5.5 * RADIANS_TO_DEGREES,
      altitudeDeg: 1.1 * RADIANS_TO_DEGREES,
    },
    0.7 * RADIANS_TO_DEGREES,
  );

  assertAngleClose(
    result.hourAngleDeg,
    0.5933291115507309663 * RADIANS_TO_DEGREES,
    SOFA_ANGLE_TOLERANCE_DEG,
    "SOFA hour angle",
  );
  assertNumberClose(
    result.declinationDeg,
    0.961393476164781762 * RADIANS_TO_DEGREES,
    SOFA_ANGLE_TOLERANCE_DEG,
    "SOFA declination",
  );
});

// Fixed reference values generated with Astronomy Engine 2.1.19's EQJ-to-HOR
// rotation, without atmospheric refraction.
for (const fixture of FULL_FRAME_FIXTURES) {
  test(`matches the Astronomy Engine full-frame fixture for ${fixture.name}`, () => {
    const horizontal = equatorialToHorizontal(
      fixture.coordinates,
      fixture.observer,
      fixture.timestampUtcMs,
    );

    assertAngleClose(
      horizontal.azimuthDeg,
      fixture.horizontal.azimuthDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `${fixture.name} azimuth`,
    );
    assertNumberClose(
      horizontal.altitudeDeg,
      fixture.horizontal.altitudeDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `${fixture.name} altitude`,
    );

    const equatorial = horizontalToEquatorial(
      horizontal,
      fixture.observer,
      fixture.timestampUtcMs,
      fixture.coordinates.frame,
    );
    assert.equal(equatorial.frame, fixture.coordinates.frame);
    assertAngleClose(
      equatorial.raDeg,
      fixture.coordinates.raDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `${fixture.name} inverse RA`,
    );
    assertNumberClose(
      equatorial.decDeg,
      fixture.coordinates.decDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `${fixture.name} inverse declination`,
    );
  });
}

test("keeps a below-horizon full-frame solution valid and invertible", () => {
  const fixture = FULL_FRAME_FIXTURES[0];
  const horizontal = equatorialToHorizontal(
    fixture.coordinates,
    fixture.observer,
    fixture.timestampUtcMs,
  );
  assert.ok(horizontal.altitudeDeg < 0);

  const equatorial = horizontalToEquatorial(
    horizontal,
    fixture.observer,
    fixture.timestampUtcMs,
    fixture.coordinates.frame,
  );
  assertAngleClose(
    equatorial.raDeg,
    fixture.coordinates.raDeg,
    FULL_FRAME_TOLERANCE_DEG,
    "below-horizon inverse RA",
  );
  assertNumberClose(
    equatorial.decDeg,
    fixture.coordinates.decDeg,
    FULL_FRAME_TOLERANCE_DEG,
    "below-horizon inverse declination",
  );
});

for (const fixture of [
  {
    name: "near the north celestial pole in ICRS",
    timestampUtcMs: Date.parse("2026-07-13T00:00:00.000Z"),
    observer: {
      latitudeDeg: 52.52,
      longitudeDeg: 13.405,
      elevationM: 35,
    },
    coordinates: { raDeg: 12.345, decDeg: 89.9999, frame: "ICRS" },
    horizontal: {
      azimuthDeg: 359.79636594197365,
      altitudeDeg: 52.43818724004485,
    },
  },
  {
    name: "near the south celestial pole in J2000",
    timestampUtcMs: Date.parse("2031-01-15T06:00:00.000Z"),
    observer: {
      latitudeDeg: 19.8206,
      longitudeDeg: -155.4681,
      elevationM: 4205,
    },
    coordinates: { raDeg: 271.25, decDeg: -89.9999, frame: "J2000" },
    horizontal: {
      azimuthDeg: 180.14051148347485,
      altitudeDeg: -19.706548474689278,
    },
  },
]) {
  test(`stays stable ${fixture.name}`, () => {
    const horizontal = equatorialToHorizontal(
      fixture.coordinates,
      fixture.observer,
      fixture.timestampUtcMs,
    );
    assertAngleClose(
      horizontal.azimuthDeg,
      fixture.horizontal.azimuthDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `${fixture.name} azimuth`,
    );
    assertNumberClose(
      horizontal.altitudeDeg,
      fixture.horizontal.altitudeDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `${fixture.name} altitude`,
    );

    const equatorial = horizontalToEquatorial(
      horizontal,
      fixture.observer,
      fixture.timestampUtcMs,
      fixture.coordinates.frame,
    );
    assert.equal(equatorial.frame, fixture.coordinates.frame);
    // Right ascension becomes ill-conditioned close to a pole, so keep a
    // strict angular tolerance while allowing for the expected amplification.
    assertAngleClose(
      equatorial.raDeg,
      fixture.coordinates.raDeg,
      1e-7,
      `${fixture.name} inverse RA`,
    );
    assertNumberClose(
      equatorial.decDeg,
      fixture.coordinates.decDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `${fixture.name} inverse declination`,
    );
  });
}

test("invalidates the observed-frame cache when time or site changes", () => {
  const coordinates = { raDeg: 120, decDeg: 30, frame: "J2000" };
  const berlin = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 35,
  };
  const sydney = {
    latitudeDeg: -33.87,
    longitudeDeg: 151.21,
    elevationM: 10,
  };
  const midnightUtcMs = Date.parse("2026-07-13T00:00:00.000Z");
  const sixUtcMs = Date.parse("2026-07-13T06:00:00.000Z");
  const cases = [
    {
      observer: berlin,
      timestampUtcMs: midnightUtcMs,
      expected: FULL_FRAME_FIXTURES[0].horizontal,
    },
    {
      observer: berlin,
      timestampUtcMs: sixUtcMs,
      expected: {
        azimuthDeg: 73.62094804306426,
        altitudeDeg: 25.713081220570718,
      },
    },
    {
      observer: berlin,
      timestampUtcMs: midnightUtcMs,
      expected: FULL_FRAME_FIXTURES[0].horizontal,
    },
    {
      observer: sydney,
      timestampUtcMs: midnightUtcMs,
      expected: {
        azimuthDeg: 34.11279896619396,
        altitudeDeg: 16.652836637362746,
      },
    },
    {
      observer: berlin,
      timestampUtcMs: midnightUtcMs,
      expected: FULL_FRAME_FIXTURES[0].horizontal,
    },
  ];

  for (const [index, fixture] of cases.entries()) {
    const horizontal = equatorialToHorizontal(
      coordinates,
      fixture.observer,
      fixture.timestampUtcMs,
    );
    assertAngleClose(
      horizontal.azimuthDeg,
      fixture.expected.azimuthDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `cache case ${index} azimuth`,
    );
    assertNumberClose(
      horizontal.altitudeDeg,
      fixture.expected.altitudeDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `cache case ${index} altitude`,
    );
  }
});

test("crosses the local meridian continuously from east to west", () => {
  const observer = {
    latitudeDeg: 34.05,
    longitudeDeg: -118.25,
    elevationM: 89,
  };
  const coordinates = {
    raDeg: 145.97744874075636,
    decDeg: -5.808449070215144,
    frame: "J2000",
  };
  const meridianUtcMs = Date.parse("2030-04-01T05:00:00.000Z");
  const fixtures = [
    {
      offsetMs: -60_000,
      azimuthDeg: 179.61210918078132,
      altitudeDeg: 49.999296921999544,
    },
    { offsetMs: 0, azimuthDeg: 180, altitudeDeg: 50.000000000000014 },
    {
      offsetMs: 60_000,
      azimuthDeg: 180.3878908182131,
      altitudeDeg: 49.999296923123005,
    },
  ];

  for (const fixture of fixtures) {
    const horizontal = equatorialToHorizontal(
      coordinates,
      observer,
      meridianUtcMs + fixture.offsetMs,
    );
    assertAngleClose(
      horizontal.azimuthDeg,
      fixture.azimuthDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `meridian ${fixture.offsetMs} azimuth`,
    );
    assertNumberClose(
      horizontal.altitudeDeg,
      fixture.altitudeDeg,
      FULL_FRAME_TOLERANCE_DEG,
      `meridian ${fixture.offsetMs} altitude`,
    );
  }
});
