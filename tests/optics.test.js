import test from "node:test";
import assert from "node:assert/strict";
import { calculateCameraFieldOfView } from "../src/index.js";

const imagingTrain = {
  sensorWidthPx: 6248,
  sensorHeightPx: 4176,
  pixelSizeMicrons: 3.76,
  focalLengthMm: 500,
  apertureMm: 100,
};

test("derives exact camera geometry from physical imaging-train inputs", () => {
  const field = calculateCameraFieldOfView(imagingTrain);
  assert.equal(field.sensorWidthMm, 23.49248);
  assert.ok(Math.abs(field.sensorHeightMm - 15.70176) < 1e-12);
  assert.ok(Math.abs(field.widthDeg - 2.6915448299476017) < 1e-12);
  assert.ok(Math.abs(field.heightDeg - 1.7991413109826193) < 1e-12);
  assert.ok(Math.abs(field.diagonalDeg - 3.2371195380452127) < 1e-12);
  assert.ok(
    Math.abs(field.pixelScaleArcsecPerPixel - 1.551111342970855) < 1e-12,
  );
  assert.equal(field.focalRatio, 5);
});

test("aperture changes focal ratio without changing angular field", () => {
  const first = calculateCameraFieldOfView(imagingTrain);
  const second = calculateCameraFieldOfView({
    ...imagingTrain,
    apertureMm: 125,
  });
  assert.equal(first.widthDeg, second.widthDeg);
  assert.equal(first.heightDeg, second.heightDeg);
  assert.equal(second.focalRatio, 4);
});

test("allows omitted aperture because it is not part of FOV geometry", () => {
  const field = calculateCameraFieldOfView({
    ...imagingTrain,
    apertureMm: undefined,
  });
  assert.equal(field.focalRatio, null);
  assert.ok(field.widthDeg > 0);
});

test("rejects non-positive and non-finite physical inputs", () => {
  for (const [property, value] of [
    ["sensorWidthPx", 0],
    ["sensorWidthPx", 6248.5],
    ["sensorHeightPx", -1],
    ["pixelSizeMicrons", Number.NaN],
    ["focalLengthMm", Number.POSITIVE_INFINITY],
    ["apertureMm", 0],
  ]) {
    assert.throws(
      () => calculateCameraFieldOfView({ ...imagingTrain, [property]: value }),
      RangeError,
    );
  }
});
