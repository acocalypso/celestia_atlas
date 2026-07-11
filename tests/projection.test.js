import test from "node:test";
import assert from "node:assert/strict";
import {
  projectEquatorial,
  unprojectEquatorial,
} from "../src/core/projection.js";

const view = { center: { raDeg: 359, decDeg: 30, frame: "ICRS" }, fovDeg: 60 };

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
