import test from "node:test";
import assert from "node:assert/strict";
import {
  equatorialToHorizontal,
  horizonAltitudeAtAzimuth,
  horizontalToEquatorial,
  horizontalToHealpixPixel,
  landscapeRasterWidth,
  rasterizeHealpixLandscape,
  unprojectEquatorial,
} from "../src/index.js";
import { rasterizeMilkyWayPanorama } from "../src/core/landscape.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function referenceMilkyWayRaster({
  panorama,
  view,
  observer,
  timestampUtcMs,
  canvasWidth,
  canvasHeight,
  outputWidth,
  hideBelowHorizon,
  horizon,
}) {
  const width = Math.max(1, Math.round(outputWidth));
  const height = Math.max(1, Math.round((canvasHeight / canvasWidth) * width));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const equatorial = unprojectEquatorial(
        ((x + 0.5) / width) * canvasWidth,
        ((y + 0.5) / height) * canvasHeight,
        view,
        canvasWidth,
        canvasHeight,
      );
      const targetIndex = (y * width + x) * 4;
      if (hideBelowHorizon) {
        const horizontal = equatorialToHorizontal(
          equatorial,
          observer,
          timestampUtcMs,
        );
        if (
          horizontal.altitudeDeg <
          horizonAltitudeAtAzimuth(horizon, horizontal.azimuthDeg, 0)
        )
          continue;
      }
      const ra = equatorial.raDeg * DEG;
      const dec = equatorial.decDeg * DEG;
      const cosDec = Math.cos(dec);
      const equatorialX = cosDec * Math.cos(ra);
      const equatorialY = cosDec * Math.sin(ra);
      const equatorialZ = Math.sin(dec);
      const galacticX =
        -0.0548755604 * equatorialX -
        0.8734370902 * equatorialY -
        0.4838350155 * equatorialZ;
      const galacticY =
        0.4941094279 * equatorialX -
        0.44482963 * equatorialY +
        0.7469822445 * equatorialZ;
      const galacticZ =
        -0.867666149 * equatorialX -
        0.1980763734 * equatorialY +
        0.4559837762 * equatorialZ;
      const longitudeDeg =
        (((Math.atan2(galacticY, galacticX) * RAD) % 360) + 360) % 360;
      const latitudeDeg = Math.asin(Math.max(-1, Math.min(1, galacticZ))) * RAD;
      const u = (((0.5 - longitudeDeg / 360) % 1) + 1) % 1;
      const sourceX = Math.min(
        panorama.width - 1,
        Math.floor(u * panorama.width),
      );
      const sourceY = Math.max(
        0,
        Math.min(
          panorama.height - 1,
          Math.floor((0.5 - latitudeDeg / 180) * panorama.height),
        ),
      );
      const sourceIndex = (sourceY * panorama.width + sourceX) * 4;
      data[targetIndex] = panorama.data[sourceIndex];
      data[targetIndex + 1] = panorama.data[sourceIndex + 1];
      data[targetIndex + 2] = panorama.data[sourceIndex + 2];
      data[targetIndex + 3] = Math.round(
        (panorama.data[sourceIndex + 3] / 255) * 145,
      );
    }
  }
  return { width, height, data };
}

function createCoordinatePanorama(width = 73, height = 37) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = (x * 7 + y * 3) % 256;
      data[index + 1] = (x * 2 + y * 11) % 256;
      data[index + 2] = (x + y * 5) % 256;
      data[index + 3] = (x * 13 + y * 17) % 256;
    }
  }
  return { width, height, data };
}

test("uses device-aware landscape resolution with an interaction budget", () => {
  assert.equal(landscapeRasterWidth(800, 1, false), 800);
  assert.equal(landscapeRasterWidth(1200, 2, false), 1024);
  assert.equal(landscapeRasterWidth(1200, 2, true), 384);
  assert.equal(landscapeRasterWidth(390, 3, true, true), 64);
  assert.equal(landscapeRasterWidth(390, 3, false, true), 390);
  assert.equal(landscapeRasterWidth(1200, 3, false, true), 768);
});

test("matches the reference projection across portrait and landscape views", () => {
  const tileWidth = 64;
  const coordinateScale = 4;
  const tiles = Array.from({ length: 12 }, (_, face) => {
    const data = new Uint8ClampedArray(tileWidth * tileWidth * 4);
    for (let y = 0; y < tileWidth; y += 1) {
      for (let x = 0; x < tileWidth; x += 1) {
        const index = (y * tileWidth + x) * 4;
        data[index] = face * 20;
        data[index + 1] = x * coordinateScale;
        data[index + 2] = y * coordinateScale;
        data[index + 3] = 255;
      }
    }
    return { width: tileWidth, height: tileWidth, data };
  });
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const timestampUtcMs = Date.UTC(2026, 6, 12, 20, 0, 0);
  const cases = [
    {
      canvasWidth: 390,
      canvasHeight: 844,
      view: {
        center: { raDeg: 102.25, decDeg: -18.75, frame: "ICRS" },
        fovDeg: 70,
        rotationDeg: 17,
      },
    },
    {
      canvasWidth: 844,
      canvasHeight: 390,
      view: {
        center: { raDeg: 287.5, decDeg: 42.125, frame: "J2000" },
        fovDeg: 105,
        rotationDeg: -31,
      },
    },
  ];

  for (const geometry of cases) {
    const result = rasterizeHealpixLandscape({
      tiles,
      view: geometry.view,
      observer,
      timestampUtcMs,
      canvasWidth: geometry.canvasWidth,
      canvasHeight: geometry.canvasHeight,
      outputWidth: 19,
    });
    for (let y = 0; y < result.height; y += 1) {
      for (let x = 0; x < result.width; x += 1) {
        const equatorial = unprojectEquatorial(
          ((x + 0.5) / result.width) * geometry.canvasWidth,
          ((y + 0.5) / result.height) * geometry.canvasHeight,
          geometry.view,
          geometry.canvasWidth,
          geometry.canvasHeight,
        );
        const horizontal = equatorialToHorizontal(
          equatorial,
          observer,
          timestampUtcMs,
        );
        const expected = horizontalToHealpixPixel(
          horizontal.azimuthDeg,
          horizontal.altitudeDeg,
          tileWidth,
        );
        const targetIndex = (y * result.width + x) * 4;
        assert.equal(result.data[targetIndex], expected.face * 20);
        assert.ok(
          Math.abs(
            result.data[targetIndex + 1] - expected.x * coordinateScale,
          ) <= coordinateScale,
        );
        assert.ok(
          Math.abs(
            result.data[targetIndex + 2] - expected.y * coordinateScale,
          ) <= coordinateScale,
        );
        assert.equal(result.data[targetIndex + 3], 255);
      }
    }
  }
});

test("matches the Milky Way reference raster in portrait and landscape views", () => {
  const panorama = createCoordinatePanorama();
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const timestampUtcMs = Date.UTC(2026, 6, 12, 20, 0, 0);
  const cases = [
    {
      canvasWidth: 390,
      canvasHeight: 844,
      outputWidth: 29,
      view: {
        center: { raDeg: 102.25, decDeg: -18.75, frame: "ICRS" },
        fovDeg: 70,
        rotationDeg: 17,
      },
    },
    {
      canvasWidth: 844,
      canvasHeight: 390,
      outputWidth: 37,
      view: {
        center: { raDeg: 287.5, decDeg: 42.125, frame: "J2000" },
        fovDeg: 105,
        rotationDeg: -31,
      },
    },
  ];

  for (const geometry of cases) {
    const options = {
      panorama,
      observer,
      timestampUtcMs,
      hideBelowHorizon: false,
      horizon: [],
      ...geometry,
    };
    const expected = referenceMilkyWayRaster(options);
    const actual = rasterizeMilkyWayPanorama(options);
    assert.equal(actual.width, expected.width);
    assert.equal(actual.height, expected.height);
    assert.deepEqual(actual.data, expected.data);
  }
});

test("matches geometric and custom-horizon Milky Way clipping", () => {
  const panorama = createCoordinatePanorama();
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const timestampUtcMs = Date.UTC(2026, 6, 12, 20, 0, 0);
  const view = {
    center: horizontalToEquatorial(
      { azimuthDeg: 355, altitudeDeg: 3 },
      observer,
      timestampUtcMs,
    ),
    fovDeg: 58,
    rotationDeg: 9,
  };
  const horizons = [
    [],
    [
      { azimuthDeg: 0, altitudeDeg: 8 },
      { azimuthDeg: 90, altitudeDeg: 4 },
      { azimuthDeg: 180, altitudeDeg: -3 },
      { azimuthDeg: 270, altitudeDeg: 12 },
    ],
  ];

  for (const horizon of horizons) {
    const options = {
      panorama,
      view,
      observer,
      timestampUtcMs,
      canvasWidth: 420,
      canvasHeight: 260,
      outputWidth: 53,
      hideBelowHorizon: true,
      horizon,
    };
    const expected = referenceMilkyWayRaster(options);
    const actual = rasterizeMilkyWayPanorama(options);
    assert.deepEqual(actual.data, expected.data);
    const alphas = actual.data.filter((_, index) => index % 4 === 3);
    assert.ok(alphas.some((alpha) => alpha === 0));
    assert.ok(alphas.some((alpha) => alpha > 0));
  }
});

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
    y: 256,
  });
  assert.equal(horizontalToHealpixPixel(90, 0, 512).face, 7);
  assert.equal(horizontalToHealpixPixel(270, 0, 512).face, 5);
  assert.deepEqual(horizontalToHealpixPixel(180, 35, 512), {
    face: 6,
    x: 476,
    y: 476,
  });
  assert.deepEqual(horizontalToHealpixPixel(22.5, 60, 512), {
    face: 3,
    x: 268,
    y: 430,
  });
  assert.deepEqual(horizontalToHealpixPixel(22.5, -60, 512), {
    face: 11,
    x: 81,
    y: 243,
  });
});

test("keeps swapped HiPS axes when bilinear-sampling polar faces", () => {
  const tileWidth = 8;
  const tiles = Array.from({ length: 12 }, () => {
    const data = new Uint8ClampedArray(tileWidth * tileWidth * 4);
    for (let y = 0; y < tileWidth; y += 1) {
      for (let x = 0; x < tileWidth; x += 1) {
        const index = (y * tileWidth + x) * 4;
        data[index] = x * 30;
        data[index + 1] = y * 30;
        data[index + 3] = 255;
      }
    }
    return { width: tileWidth, height: tileWidth, data };
  });
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const timestampUtcMs = Date.UTC(2026, 6, 12, 20, 0, 0);
  const center = horizontalToEquatorial(
    { azimuthDeg: 22.5, altitudeDeg: 60 },
    observer,
    timestampUtcMs,
  );
  const result = rasterizeHealpixLandscape({
    tiles,
    view: { center, fovDeg: 10 },
    observer,
    timestampUtcMs,
    canvasWidth: 1,
    canvasHeight: 1,
    outputWidth: 1,
  });
  assert.ok(result.data[0] < result.data[1]);
  assert.equal(result.data[3], 255);
});

test("rasterizes transparent RGBA HiPS tiles into a projected view", () => {
  const tiles = Array.from({ length: 12 }, (_, face) => ({
    width: 2,
    height: 2,
    data: new Uint8ClampedArray(
      Array.from({ length: 4 }, () => [
        face * 20,
        255 - face * 20,
        face,
        255,
      ]).flat(),
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
  assert.ok(
    result.data.every((value, index) => index % 4 !== 3 || value === 255),
  );
  assert.ok(
    new Set(result.data.filter((_, index) => index % 4 === 0)).size > 1,
  );
});
