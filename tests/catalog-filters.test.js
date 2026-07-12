import test from "node:test";
import assert from "node:assert/strict";
import {
  isGalaxyObject,
  passesDeepSkyMagnitudeFilter,
} from "../src/core/catalog-filters.js";

test("classifies galaxy families separately from other deep-sky objects", () => {
  assert.equal(isGalaxyObject({ type: "Galaxy" }), true);
  assert.equal(isGalaxyObject({ objectType: "Galaxy pair" }), true);
  assert.equal(isGalaxyObject({ type: "Galaxy cluster" }), true);
  assert.equal(isGalaxyObject({ type: "Planetary nebula" }), false);
});

test("applies independent galaxy and other-DSO limiting magnitudes", () => {
  assert.equal(
    passesDeepSkyMagnitudeFilter({ type: "Galaxy", mag: 12.4 }, 12, 15),
    false,
  );
  assert.equal(
    passesDeepSkyMagnitudeFilter(
      { type: "Planetary nebula", mag: 12.4 },
      12,
      15,
    ),
    true,
  );
  assert.equal(
    passesDeepSkyMagnitudeFilter({ type: "Galaxy", magnitude: 11.8 }, 12, 8),
    true,
  );
  assert.equal(passesDeepSkyMagnitudeFilter({ type: "Galaxy" }, 30, 4), true);
  assert.equal(passesDeepSkyMagnitudeFilter({ type: "Galaxy" }, 12, 30), false);
});

test("rejects invalid DSO limiting magnitudes", () => {
  assert.throws(
    () => passesDeepSkyMagnitudeFilter({ type: "Galaxy", mag: 8 }, NaN, 12),
    /galaxy magnitude limit/,
  );
  assert.throws(
    () => passesDeepSkyMagnitudeFilter({ type: "Nebula", mag: 8 }, 12, 31),
    /deep-sky magnitude limit/,
  );
});
