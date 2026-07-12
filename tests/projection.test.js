import test from "node:test";
import assert from "node:assert/strict";
import {
  alignViewToHorizon,
  projectAngularExtent,
  projectEquatorial,
  unprojectEquatorial,
} from "../src/core/projection.js";
import { horizontalToEquatorial } from "../src/core/coordinates.js";

const view = { center: { raDeg: 359, decDeg: 30, frame: "ICRS" }, fovDeg: 60 };

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

test("projects the view center to the canvas center across RA wrap", () => {
  const point = projectEquatorial(view.center, view, 1000, 600);
  assert.ok(Math.abs(point.x - 500) < 1e-9);
  assert.ok(Math.abs(point.y - 300) < 1e-9);
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
