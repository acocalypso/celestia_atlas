import test from "node:test";
import assert from "node:assert/strict";
import {
  alignViewToHorizon,
  cameraFrameScreenRotationDeg,
  projectAngularExtent,
  projectEquatorial,
  unprojectEquatorial,
} from "../src/core/projection.js";
import { horizontalToEquatorial } from "../src/core/coordinates.js";

const view = { center: { raDeg: 359, decDeg: 30, frame: "ICRS" }, fovDeg: 60 };

const RAD = 180 / Math.PI;

function equatorialOffset(coordinates, distanceDeg, bearingDeg) {
  const distance = distanceDeg / RAD;
  const bearing = bearingDeg / RAD;
  const ra = coordinates.raDeg / RAD;
  const dec = coordinates.decDeg / RAD;
  const nextDec = Math.asin(
    Math.sin(dec) * Math.cos(distance) +
      Math.cos(dec) * Math.sin(distance) * Math.cos(bearing),
  );
  const nextRa =
    ra +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distance) * Math.cos(dec),
      Math.cos(distance) - Math.sin(dec) * Math.sin(nextDec),
    );
  return {
    raDeg: (((nextRa * RAD) % 360) + 360) % 360,
    decDeg: nextDec * RAD,
    frame: coordinates.frame,
  };
}

function screenBearingDeg(point, width, height) {
  return Math.atan2(point.x - width / 2, height / 2 - point.y) * RAD;
}

function assertAngleClose(actual, expected, tolerance = 1e-9) {
  const difference = ((actual - expected + 540) % 360) - 180;
  assert.ok(
    Math.abs(difference) < tolerance,
    `expected ${actual} degrees to match ${expected} degrees`,
  );
}

test("projects an angular frame through the gnomonic focal length", () => {
  const focalLengthPixels = 1000 / (2 * Math.tan(Math.PI / 6));
  const pixels = projectAngularExtent(2, focalLengthPixels);
  assert.ok(
    Math.abs(pixels - 2 * focalLengthPixels * Math.tan(Math.PI / 180)) < 1e-12,
  );
  assert.ok(pixels > 30 && pixels < 31);
  assert.throws(() => projectAngularExtent(0, focalLengthPixels), RangeError);
  assert.throws(() => projectAngularExtent(180, focalLengthPixels), RangeError);
  assert.throws(() => projectAngularExtent(2, 0), RangeError);
});

test("converts both camera position-angle conventions from celestial north", () => {
  for (const cameraRotationDeg of [0, 30, 90, 180, 270, 330]) {
    assert.equal(
      cameraFrameScreenRotationDeg(
        37,
        cameraRotationDeg,
        "clockwise-from-celestial-north",
      ),
      -37 + cameraRotationDeg,
    );
    assert.equal(
      cameraFrameScreenRotationDeg(
        37,
        cameraRotationDeg,
        "counterclockwise-from-celestial-north",
      ),
      -37 - cameraRotationDeg,
    );
  }
  assert.throws(
    () =>
      cameraFrameScreenRotationDeg(
        Number.NaN,
        0,
        "clockwise-from-celestial-north",
      ),
    TypeError,
  );
  assert.throws(
    () => cameraFrameScreenRotationDeg(0, 0, "screen-relative"),
    TypeError,
  );
});

test("keeps equivalent camera angles continuous across the rotation wrap", () => {
  for (const projectionRotationDeg of [0, 37, -112]) {
    for (const convention of [
      "clockwise-from-celestial-north",
      "counterclockwise-from-celestial-north",
    ]) {
      assertAngleClose(
        cameraFrameScreenRotationDeg(projectionRotationDeg, 360, convention),
        cameraFrameScreenRotationDeg(projectionRotationDeg, 0, convention),
      );
      assertAngleClose(
        cameraFrameScreenRotationDeg(
          projectionRotationDeg,
          359.999,
          convention,
        ),
        cameraFrameScreenRotationDeg(projectionRotationDeg, -0.001, convention),
      );
      assertAngleClose(
        cameraFrameScreenRotationDeg(
          projectionRotationDeg,
          360.001,
          convention,
        ),
        cameraFrameScreenRotationDeg(projectionRotationDeg, 0.001, convention),
      );
    }
  }
});

test("anchors camera axes to projected celestial north and east", () => {
  const width = 1000;
  const height = 600;
  const center = { raDeg: 120, decDeg: 30, frame: "ICRS" };
  for (const rotationDeg of [0, 37, -112]) {
    const rotatedView = { center, fovDeg: 60, rotationDeg };
    const north = projectEquatorial(
      equatorialOffset(center, 1, 0),
      rotatedView,
      width,
      height,
    );
    const east = projectEquatorial(
      equatorialOffset(center, 1, 90),
      rotatedView,
      width,
      height,
    );
    const west = projectEquatorial(
      equatorialOffset(center, 1, -90),
      rotatedView,
      width,
      height,
    );
    assertAngleClose(
      cameraFrameScreenRotationDeg(
        rotationDeg,
        0,
        "clockwise-from-celestial-north",
      ),
      screenBearingDeg(north, width, height),
    );
    assertAngleClose(
      cameraFrameScreenRotationDeg(
        rotationDeg,
        90,
        "clockwise-from-celestial-north",
      ),
      screenBearingDeg(east, width, height),
    );
    assertAngleClose(
      cameraFrameScreenRotationDeg(
        rotationDeg,
        90,
        "counterclockwise-from-celestial-north",
      ),
      screenBearingDeg(west, width, height),
    );
  }
});

test("keeps the Berlin horizontal camera frame on celestial north", () => {
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 34,
  };
  const timestampUtcMs = Date.UTC(2026, 6, 12, 20);
  const center = horizontalToEquatorial(
    { azimuthDeg: 90, altitudeDeg: 30 },
    observer,
    timestampUtcMs,
    "ICRS",
  );
  const aligned = alignViewToHorizon(
    { center, fovDeg: 60 },
    observer,
    timestampUtcMs,
  );
  assert.ok(Math.abs(aligned.rotationDeg - -41.40463638042479) < 1e-9);

  const north = projectEquatorial(
    equatorialOffset(center, 1, 0),
    aligned,
    1000,
    600,
  );
  const northBearingDeg = screenBearingDeg(north, 1000, 600);
  assertAngleClose(
    cameraFrameScreenRotationDeg(
      aligned.rotationDeg,
      0,
      "clockwise-from-celestial-north",
    ),
    northBearingDeg,
  );
  assertAngleClose(
    cameraFrameScreenRotationDeg(
      aligned.rotationDeg,
      30,
      "clockwise-from-celestial-north",
    ),
    northBearingDeg + 30,
  );
});

test("projects the view center to the canvas center across RA wrap", () => {
  const point = projectEquatorial(view.center, view, 1000, 600);
  assert.ok(Math.abs(point.x - 500) < 1e-9);
  assert.ok(Math.abs(point.y - 300) < 1e-9);
});

test("places independent gnomonic edge fixtures in portrait and landscape views", () => {
  const equatorialView = {
    center: { raDeg: 0, decDeg: 0, frame: "ICRS" },
    fovDeg: 90,
  };
  for (const [width, height] of [
    [390, 844],
    [844, 390],
  ]) {
    const verticalEdgeDeg = Math.atan(height / width) * RAD;
    const fixtures = [
      [{ raDeg: 315, decDeg: 0, frame: "ICRS" }, 0, height / 2],
      [{ raDeg: 45, decDeg: 0, frame: "ICRS" }, width, height / 2],
      [{ raDeg: 0, decDeg: verticalEdgeDeg, frame: "ICRS" }, width / 2, 0],
      [
        { raDeg: 0, decDeg: -verticalEdgeDeg, frame: "ICRS" },
        width / 2,
        height,
      ],
    ];
    for (const [coordinates, expectedX, expectedY] of fixtures) {
      const point = projectEquatorial(
        coordinates,
        equatorialView,
        width,
        height,
      );
      assert.ok(point);
      assert.ok(Math.abs(point.x - expectedX) < 1e-9);
      assert.ok(Math.abs(point.y - expectedY) < 1e-9);
    }
  }
});

test("round trips portrait and landscape projection points", () => {
  for (const [width, height, rotationDeg] of [
    [1000, 600, 0],
    [600, 1000, 37],
    [1000, 600, -112],
  ]) {
    const target = { raDeg: 2, decDeg: 45, frame: "ICRS" };
    const rotatedView = { ...view, rotationDeg };
    const point = projectEquatorial(target, rotatedView, width, height);
    const result = unprojectEquatorial(
      point.x,
      point.y,
      rotatedView,
      width,
      height,
    );
    assert.ok(Math.abs(result.raDeg - target.raDeg) < 1e-9);
    assert.ok(Math.abs(result.decDeg - target.decDeg) < 1e-9);
  }
});

test("keeps projection round trips finite near both celestial poles", () => {
  const cases = [
    {
      view: {
        center: { raDeg: 359.9, decDeg: 89.8, frame: "ICRS" },
        fovDeg: 20,
        rotationDeg: 37,
      },
      target: { raDeg: 0.2, decDeg: 89.6, frame: "ICRS" },
    },
    {
      view: {
        center: { raDeg: 0.1, decDeg: -89.8, frame: "ICRS" },
        fovDeg: 20,
        rotationDeg: -112,
      },
      target: { raDeg: 359.8, decDeg: -89.6, frame: "ICRS" },
    },
  ];
  for (const { view: polarView, target } of cases) {
    for (const [width, height] of [
      [390, 844],
      [844, 390],
    ]) {
      const point = projectEquatorial(target, polarView, width, height);
      assert.ok(point);
      assert.ok(Number.isFinite(point.x));
      assert.ok(Number.isFinite(point.y));

      const result = unprojectEquatorial(
        point.x,
        point.y,
        polarView,
        width,
        height,
      );
      assert.ok(Number.isFinite(result.raDeg));
      assert.ok(Number.isFinite(result.decDeg));
      assertAngleClose(result.raDeg, target.raDeg, 1e-8);
      assert.ok(Math.abs(result.decDeg - target.decDeg) < 1e-8);
      assert.equal(result.frame, target.frame);
    }
  }
});

test("rejects points behind the projection plane", () => {
  assert.equal(
    projectEquatorial({ raDeg: 179, decDeg: -30 }, view, 1000, 600),
    null,
  );
});

test("aligns local altitude vertically and azimuth horizontally", () => {
  for (const { observer, timestampUtcMs, horizontal } of [
    {
      observer: { latitudeDeg: 52.52, longitudeDeg: 13.405, elevationM: 34 },
      timestampUtcMs: Date.UTC(2026, 6, 12, 20),
      horizontal: { azimuthDeg: 183, altitudeDeg: 27 },
    },
    {
      observer: {
        latitudeDeg: -33.8688,
        longitudeDeg: 151.2093,
        elevationM: 58,
      },
      timestampUtcMs: Date.UTC(2026, 0, 15, 8),
      horizontal: { azimuthDeg: 42, altitudeDeg: 89.2 },
    },
  ]) {
    const center = horizontalToEquatorial(
      horizontal,
      observer,
      timestampUtcMs,
      "ICRS",
    );
    const aligned = alignViewToHorizon(
      { center, fovDeg: 60 },
      observer,
      timestampUtcMs,
    );
    const upward = projectEquatorial(
      horizontalToEquatorial(
        { ...horizontal, altitudeDeg: horizontal.altitudeDeg + 0.05 },
        observer,
        timestampUtcMs,
        "ICRS",
      ),
      aligned,
      800,
      600,
    );
    const across = projectEquatorial(
      horizontalToEquatorial(
        { ...horizontal, azimuthDeg: horizontal.azimuthDeg + 0.05 },
        observer,
        timestampUtcMs,
        "ICRS",
      ),
      aligned,
      800,
      600,
    );
    assert.ok(Math.abs(upward.x - 400) < 1e-6);
    assert.ok(upward.y < 300);
    assert.ok(Math.abs(across.y - 300) < 1e-3);
    assert.ok(Math.abs(across.x - 400) > 0.001);
  }
});
