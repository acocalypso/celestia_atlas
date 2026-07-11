import test from "node:test";
import assert from "node:assert/strict";
import {
  horizontalToHealpixPixel,
  rasterizeHealpixLandscape,
} from "../src/index.js";

test("maps the local sphere across all twelve order-0 HEALPix faces", () => {
  const faces = new Set();
  for (let altitude = -85; altitude <= 85; altitude += 5) {
    for (let azimuth = 0; azimuth < 360; azimuth += 5) {
      const pixel = horizontalToHealpixPixel(azimuth, altitude, 512);
      assert.ok(pixel.face >= 0 && pixel.face < 12);
      assert.ok(pixel.x >= 0 && pixel.x < 512);
      assert.ok(pixel.y >= 0 && pixel.y < 512);
      faces.add(pixel.face);
    }
  }
  assert.equal(faces.size, 12);
  assert.deepEqual(horizontalToHealpixPixel(0, 0, 512), {
    face: 4,
    x: 255,
    y: 255,
  });
  assert.equal(horizontalToHealpixPixel(90, 0, 512).face, 7);
  assert.equal(horizontalToHealpixPixel(270, 0, 512).face, 5);
});

test("rasterizes transparent RGBA HiPS tiles into a projected view", () => {
  const tiles = Array.from({ length: 12 }, (_, face) => ({
    width: 2,
    height: 2,
    data: new Uint8ClampedArray(
      Array.from({ length: 4 }, () => [face * 20, 255 - face * 20, face, 255]).flat(),
    ),
  }));
  const result = rasterizeHealpixLandscape({
    tiles,
    view: {
      center: { raDeg: 180, decDeg: 0, frame: "J2000" },
      fovDeg: 70,
    },
    observer: { latitudeDeg: 52.52, longitudeDeg: 13.405, elevationM: 40 },
    timestampUtcMs: Date.parse("2024-02-29T00:00:00Z"),
    canvasWidth: 320,
    canvasHeight: 180,
    outputWidth: 32,
  });
  assert.equal(result.width, 32);
  assert.equal(result.height, 18);
  assert.ok(result.data.every((value, index) => index % 4 !== 3 || value === 255));
  assert.ok(new Set(result.data.filter((_, index) => index % 4 === 0)).size > 1);
});
