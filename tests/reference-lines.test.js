import test from "node:test";
import assert from "node:assert/strict";
import {
  eclipticToEquatorial,
  galacticToEquatorial,
} from "../src/index.js";

function raError(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

test("maps J2000 ecliptic equinoxes and solstices", () => {
  const equinox = eclipticToEquatorial(0);
  assert.ok(raError(equinox.raDeg, 0) < 1e-10);
  assert.ok(Math.abs(equinox.decDeg) < 1e-10);
  const solstice = eclipticToEquatorial(90);
  assert.ok(raError(solstice.raDeg, 90) < 1e-10);
  assert.ok(Math.abs(solstice.decDeg - 23.439291111) < 1e-9);
});

test("maps galactic landmarks into J2000 equatorial coordinates", () => {
  const center = galacticToEquatorial(0, 0);
  assert.ok(raError(center.raDeg, 266.4051) < 2e-4);
  assert.ok(Math.abs(center.decDeg + 28.936175) < 1e-4);
  const northPole = galacticToEquatorial(0, 90);
  assert.ok(raError(northPole.raDeg, 192.85948) < 1e-4);
  assert.ok(Math.abs(northPole.decDeg - 27.12825) < 1e-4);
});
