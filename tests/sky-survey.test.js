import test from "node:test";
import assert from "node:assert/strict";

import {
  discoverVisibleSkySurveyTiles,
  equatorialToHipsTile,
  fitSkySurveyOrderToTileBudget,
  rasterizeSkySurvey,
  rasterizeSkySurveyAsync,
  selectSkySurveyOrder,
  skySurveyBlendOpacity,
  skySurveyAllskyTileKey,
  skySurveyPixelAngularSizeDeg,
  skySurveyTileKey,
  skySurveyTilePath,
  skySurveyTileUrl,
  validateSkySurveyConfig,
} from "../src/core/sky-survey.js";
import {
  equatorialToHorizontal,
  horizontalToEquatorial,
  transformEquatorialVectorFrame,
} from "../src/core/coordinates.js";
import { unprojectEquatorial } from "../src/core/projection.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function fixtureSurvey(overrides = {}) {
  return {
    key: "synthetic",
    url: "/fixtures/hips/",
    frame: "equatorial",
    minOrder: 0,
    maxOrder: 8,
    tileWidth: 4,
    format: "png",
    ...overrides,
  };
}

function rasterGeometry(canvasWidth, canvasHeight, outputWidth) {
  const width = Math.round(outputWidth);
  return {
    width,
    height: Math.max(1, Math.round((canvasHeight / canvasWidth) * width)),
  };
}

function expectedMappings({
  survey,
  order,
  view,
  canvasWidth,
  canvasHeight,
  outputWidth,
}) {
  const { width, height } = rasterGeometry(
    canvasWidth,
    canvasHeight,
    outputWidth,
  );
  const mappings = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const equatorial = unprojectEquatorial(
        ((x + 0.5) / width) * canvasWidth,
        ((y + 0.5) / height) * canvasHeight,
        view,
        canvasWidth,
        canvasHeight,
      );
      mappings.push(equatorialToHipsTile(equatorial, survey, order));
    }
  }
  return { width, height, mappings };
}

function tileColor(tileIndex) {
  return [
    (tileIndex * 29 + 17) % 251,
    (tileIndex * 47 + 31) % 251,
    (tileIndex * 71 + 43) % 251,
    255,
  ];
}

function coordinatesToVector({ raDeg, decDeg }) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return {
    x: Math.cos(dec) * Math.cos(ra),
    y: Math.cos(dec) * Math.sin(ra),
    z: Math.sin(dec),
  };
}

function vectorToCoordinates({ x, y, z }, frame) {
  return {
    raDeg: (((Math.atan2(y, x) * RAD) % 360) + 360) % 360,
    decDeg: Math.atan2(z, Math.hypot(x, y)) * RAD,
    frame,
  };
}

function constantTile(tileWidth, color) {
  const data = new Uint8ClampedArray(tileWidth * tileWidth * 4);
  for (let index = 0; index < data.length; index += 4) data.set(color, index);
  return { width: tileWidth, height: tileWidth, data };
}

function allOrderTiles(survey, order, keyed = false) {
  const tiles = new Map();
  for (let tileIndex = 0; tileIndex < 12 * 4 ** order; tileIndex += 1) {
    const key = keyed ? skySurveyTileKey(order, tileIndex) : tileIndex;
    tiles.set(key, constantTile(survey.tileWidth, tileColor(tileIndex)));
  }
  return tiles;
}

test("validates and normalizes image HiPS configuration", () => {
  assert.deepEqual(
    validateSkySurveyConfig({
      key: " DSS ",
      url: "https://example.test/hips///",
      frame: "J2000",
      maxOrder: 9,
      tileWidth: 512,
      format: "JPEG",
    }),
    {
      key: "DSS",
      url: "https://example.test/hips",
      frame: "ICRS",
      minOrder: 0,
      maxOrder: 9,
      tileWidth: 512,
      format: "jpg",
    },
  );
  assert.equal(
    validateSkySurveyConfig({
      key: "galactic",
      url: "/hips",
      frame: "galactic",
      minOrder: 2,
      maxOrder: 5,
      format: "webp",
    }).frame,
    "GALACTIC",
  );
  assert.throws(() => validateSkySurveyConfig({}), /key/);
  assert.throws(
    () =>
      validateSkySurveyConfig({
        key: "x",
        url: "/x",
        maxOrder: 3,
        tileWidth: 3,
      }),
    /power of two/,
  );
  assert.throws(
    () =>
      validateSkySurveyConfig({
        key: "x",
        url: "/x",
        maxOrder: 3,
        tileWidth: 4096,
      }),
    /between 2 and 2048/,
  );
  assert.throws(
    () =>
      validateSkySurveyConfig({
        key: "x",
        url: "/x",
        minOrder: 4,
        maxOrder: 3,
      }),
    /cannot exceed/,
  );
  assert.throws(
    () =>
      validateSkySurveyConfig({
        key: "x",
        url: "/x",
        maxOrder: 3,
        frame: "ecliptic",
      }),
    /frame/,
  );
  assert.throws(
    () =>
      validateSkySurveyConfig({
        key: "x",
        url: "/x",
        maxOrder: 3,
        format: "fits",
      }),
    /format/,
  );
});

test("normalizes HiPS identifiers independently of the browser locale", () => {
  const localeLowerCase = String.prototype.toLocaleLowerCase;
  String.prototype.toLocaleLowerCase = () => {
    throw new Error("locale-sensitive case conversion was used");
  };
  try {
    assert.deepEqual(
      validateSkySurveyConfig({
        key: "default",
        url: "/hips",
        frame: "ICRS",
        maxOrder: 9,
        format: "JPEG",
      }),
      {
        key: "default",
        url: "/hips",
        frame: "ICRS",
        minOrder: 0,
        maxOrder: 9,
        tileWidth: 512,
        format: "jpg",
      },
    );
  } finally {
    String.prototype.toLocaleLowerCase = localeLowerCase;
  }
});

test("selects the first HiPS order fine enough for a gnomonic view pixel", () => {
  const survey = fixtureSurvey({
    minOrder: 1,
    maxOrder: 7,
    tileWidth: 512,
  });
  const width = 1024;
  const orderFourPixelDeg = skySurveyPixelAngularSizeDeg(4, 512);
  const exactBoundaryFov =
    2 * Math.atan((width * Math.tan(orderFourPixelDeg * DEG)) / 2) * RAD;
  assert.equal(selectSkySurveyOrder(survey, exactBoundaryFov, width), 4);
  assert.equal(selectSkySurveyOrder(survey, exactBoundaryFov * 0.99, width), 5);
  assert.equal(selectSkySurveyOrder(survey, exactBoundaryFov * 2.01, width), 3);
  assert.equal(selectSkySurveyOrder(survey, 130, 64), 1);
  assert.equal(selectSkySurveyOrder(survey, 0.001, 4096), 7);
  assert.throws(
    () => selectSkySurveyOrder(survey, 180, width),
    /field of view/,
  );
});

test("reduces survey detail until the complete field fits decoded memory", () => {
  const survey = fixtureSurvey({
    minOrder: 3,
    maxOrder: 4,
    tileWidth: 512,
  });
  const portraitCounts = new Map([
    [3, 16],
    [4, 46],
  ]);
  assert.deepEqual(
    fitSkySurveyOrderToTileBudget(survey, 4, 43, (order) =>
      portraitCounts.get(order),
    ),
    {
      targetOrder: 3,
      previewOrder: 3,
      requiredTileCount: 16,
    },
  );
  assert.deepEqual(
    fitSkySurveyOrderToTileBudget(survey, 4, 64, (order) =>
      portraitCounts.get(order),
    ),
    {
      targetOrder: 4,
      previewOrder: 3,
      requiredTileCount: 62,
    },
  );
  assert.deepEqual(
    fitSkySurveyOrderToTileBudget(
      survey,
      4,
      46,
      (order) => portraitCounts.get(order),
      { includePreview: false },
    ),
    {
      targetOrder: 4,
      previewOrder: 3,
      requiredTileCount: 46,
    },
  );
  assert.deepEqual(
    fitSkySurveyOrderToTileBudget(survey, 3, 8, () => 16),
    {
      targetOrder: 3,
      previewOrder: 3,
      requiredTileCount: 16,
    },
  );
});

test("smoothly fades survey imagery in between wide and detailed fields", () => {
  assert.equal(skySurveyBlendOpacity(25), 0);
  assert.equal(skySurveyBlendOpacity(20), 0);
  assert.equal(skySurveyBlendOpacity(15), 0.5);
  assert.equal(skySurveyBlendOpacity(10), 1);
  assert.equal(skySurveyBlendOpacity(2), 1);
  const samples = Array.from({ length: 21 }, (_, index) =>
    skySurveyBlendOpacity(20 - index / 2),
  );
  for (let index = 1; index < samples.length; index += 1)
    assert.ok(samples[index] >= samples[index - 1]);
  assert.ok(skySurveyBlendOpacity(19.999) < 1e-6);
  assert.ok(1 - skySurveyBlendOpacity(10.001) < 1e-6);
  assert.throws(() => skySurveyBlendOpacity(15, 10, 20), /full FOV/);
});

test("maps ICRS directions to standard NESTED HiPS tiles and uv-swapped image axes", () => {
  const survey = fixtureSurvey({ tileWidth: 4 });
  // These order-5 NESTED HEALPix values were independently generated with
  // astropy-healpix 2.0.0. A 4px tile shifts two orders, leaving tile order 3.
  const cases = [
    [12.3, -17.2, 4209, 263, 0, 1],
    [123.4, 56.7, 1835, 114, 3, 1],
    [359.999, -20, 4159, 259, 3, 3],
    [217.42, -13.81, 11189, 699, 0, 3],
    [83.82, -5.39, 5359, 334, 3, 3],
  ];
  for (const [raDeg, decDeg, nestedPixel, tileIndex, column, row] of cases) {
    const mapping = equatorialToHipsTile(
      { raDeg, decDeg, frame: "ICRS" },
      survey,
      3,
    );
    assert.equal(mapping.tileIndex, tileIndex);
    assert.equal(mapping.pixelColumn, column);
    assert.equal(mapping.pixelRow, row);
    assert.equal(Math.floor(nestedPixel / 16), mapping.tileIndex);
    assert.ok(mapping.pixelX >= 0 && mapping.pixelX <= 3);
    assert.ok(mapping.pixelY >= 0 && mapping.pixelY <= 3);
  }
});

test("maps ICRS through the FK5 frame bias into Galactic HiPS fixtures", () => {
  const survey = fixtureSurvey({
    frame: "GALACTIC",
    tileWidth: 4,
  });
  // Astropy 7.2 / astropy-healpix 2.0.0 ICRS->Galactic NESTED order-5
  // fixtures. A 4px tile leaves tile order 3 and applies the HiPS uv_swap.
  for (const [raDeg, decDeg, tileIndex, column, row] of [
    [12.3, -17.2, 578, 0, 2],
    [123.4, 56.7, 83, 0, 2],
    [274.733, -13.835, 281, 2, 2],
    [217.42, -13.81, 217, 0, 3],
  ]) {
    const mapping = equatorialToHipsTile(
      { raDeg, decDeg, frame: "ICRS" },
      survey,
      3,
    );
    assert.equal(mapping.tileIndex, tileIndex);
    assert.equal(mapping.pixelColumn, column);
    assert.equal(mapping.pixelRow, row);
  }
});

test("maps equivalent ICRS and J2000 directions to identical survey pixels", () => {
  const icrs = {
    raDeg: 51.88825,
    decDeg: 20.1681389,
    frame: "ICRS",
  };
  const j2000 = vectorToCoordinates(
    transformEquatorialVectorFrame(coordinatesToVector(icrs), "ICRS", "J2000"),
    "J2000",
  );
  for (const frame of ["ICRS", "GALACTIC"]) {
    const survey = fixtureSurvey({
      frame,
      tileWidth: 512,
      maxOrder: 9,
    });
    const left = equatorialToHipsTile(icrs, survey, 9);
    const right = equatorialToHipsTile(j2000, survey, 9);
    assert.equal(left.tileIndex, right.tileIndex);
    assert.ok(Math.abs(left.pixelX - right.pixelX) < 1e-7);
    assert.ok(Math.abs(left.pixelY - right.pixelY) < 1e-7);
  }
});

test("preserves NESTED parentage while crossing tile boundaries", () => {
  const survey = fixtureSurvey({ tileWidth: 4 });
  let previous = equatorialToHipsTile(
    { raDeg: 10, decDeg: -17.2, frame: "ICRS" },
    survey,
    4,
  );
  let boundary = null;
  for (let raDeg = 10.01; raDeg <= 80; raDeg += 0.01) {
    const current = equatorialToHipsTile(
      { raDeg, decDeg: -17.2, frame: "ICRS" },
      survey,
      4,
    );
    if (current.tileIndex !== previous.tileIndex) {
      boundary = { previous, current, raDeg };
      break;
    }
    previous = current;
  }
  assert.ok(boundary, "expected the scan to cross a HiPS tile boundary");
  for (const side of [boundary.previous, boundary.current]) {
    assert.ok(side.pixelColumn >= 0 && side.pixelColumn < 4);
    assert.ok(side.pixelRow >= 0 && side.pixelRow < 4);
  }
  const parent = equatorialToHipsTile(
    {
      raDeg: boundary.raDeg,
      decDeg: -17.2,
      frame: "ICRS",
    },
    survey,
    3,
  );
  assert.equal(Math.floor(boundary.current.tileIndex / 4), parent.tileIndex);
});

test("constructs canonical HiPS tile keys, paths, and URLs", () => {
  const survey = fixtureSurvey({
    url: "https://example.test/dss/",
    format: "jpeg",
  });
  assert.equal(skySurveyTileKey(6, 10302), "6:10302");
  assert.equal(
    skySurveyTilePath(6, 10302, "jpeg"),
    "Norder6/Dir10000/Npix10302.jpg",
  );
  assert.equal(
    skySurveyTileUrl(survey, 6, 10302),
    "https://example.test/dss/Norder6/Dir10000/Npix10302.jpg",
  );
  assert.throws(() => skySurveyTilePath(2, 192, "png"), /outside/);
});

test("discovers every raster-touched tile in portrait and landscape views", () => {
  const survey = fixtureSurvey();
  const cases = [
    {
      canvasWidth: 390,
      canvasHeight: 844,
      outputWidth: 31,
      order: 3,
      view: {
        center: {
          raDeg: 217.42,
          decDeg: -13.81,
          frame: "ICRS",
        },
        fovDeg: 32,
        rotationDeg: 27,
      },
    },
    {
      canvasWidth: 844,
      canvasHeight: 390,
      outputWidth: 47,
      order: 4,
      view: {
        center: {
          raDeg: 12.3,
          decDeg: 47.5,
          frame: "ICRS",
        },
        fovDeg: 58,
        rotationDeg: -41,
      },
    },
  ];
  for (const geometry of cases) {
    const expected = expectedMappings({
      survey,
      ...geometry,
    });
    const expectedTiles = [
      ...new Set(expected.mappings.map((mapping) => mapping.tileIndex)),
    ].sort((left, right) => left - right);
    assert.deepEqual(
      discoverVisibleSkySurveyTiles({
        survey,
        ...geometry,
      }),
      expectedTiles,
    );
  }
});

test("clips visible-tile discovery in the view frame before Galactic mapping", () => {
  const survey = fixtureSurvey({ frame: "GALACTIC" });
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const timestampUtcMs = Date.UTC(2026, 6, 15, 21, 0, 0);
  const geometry = {
    survey,
    order: 3,
    canvasWidth: 360,
    canvasHeight: 240,
    outputWidth: 45,
    observer,
    timestampUtcMs,
    hideBelowHorizon: true,
  };
  const cases = [
    {
      centerAltitudeDeg: 0,
      horizon: [],
      threshold: 0,
    },
    {
      centerAltitudeDeg: 12,
      horizon: [
        { azimuthDeg: 0, altitudeDeg: 12 },
        { azimuthDeg: 90, altitudeDeg: 12 },
        { azimuthDeg: 180, altitudeDeg: 12 },
        { azimuthDeg: 270, altitudeDeg: 12 },
      ],
      threshold: 12,
    },
  ];
  for (const item of cases) {
    const view = {
      center: horizontalToEquatorial(
        {
          azimuthDeg: 180,
          altitudeDeg: item.centerAltitudeDeg,
        },
        observer,
        timestampUtcMs,
        "J2000",
      ),
      fovDeg: 48,
      rotationDeg: 23,
    };
    const expected = expectedMappings({
      ...geometry,
      view,
    });
    const expectedTiles = new Set();
    let visibleSamples = 0;
    for (let index = 0; index < expected.mappings.length; index += 1) {
      const x = index % expected.width;
      const y = Math.floor(index / expected.width);
      const equatorial = unprojectEquatorial(
        ((x + 0.5) / expected.width) * geometry.canvasWidth,
        ((y + 0.5) / expected.height) * geometry.canvasHeight,
        view,
        geometry.canvasWidth,
        geometry.canvasHeight,
      );
      const horizontal = equatorialToHorizontal(
        equatorial,
        observer,
        timestampUtcMs,
      );
      if (horizontal.altitudeDeg >= item.threshold) {
        visibleSamples += 1;
        expectedTiles.add(expected.mappings[index].tileIndex);
      }
    }
    assert.ok(visibleSamples > 0);
    assert.ok(visibleSamples < expected.mappings.length);
    assert.deepEqual(
      discoverVisibleSkySurveyTiles({
        ...geometry,
        view,
        horizon: item.horizon,
      }),
      [...expectedTiles].sort((left, right) => left - right),
    );
  }
});

test("does not plan survey tiles for views fully below the active horizon", () => {
  const survey = fixtureSurvey();
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const timestampUtcMs = Date.UTC(2026, 6, 15, 21, 0, 0);
  const geometry = {
    survey,
    order: 3,
    canvasWidth: 360,
    canvasHeight: 240,
    outputWidth: 45,
    observer,
    timestampUtcMs,
  };
  const geometricView = {
    center: horizontalToEquatorial(
      { azimuthDeg: 180, altitudeDeg: -35 },
      observer,
      timestampUtcMs,
      "ICRS",
    ),
    fovDeg: 8,
    rotationDeg: 17,
  };
  assert.ok(
    discoverVisibleSkySurveyTiles({
      ...geometry,
      view: geometricView,
    }).length > 0,
  );
  assert.deepEqual(
    discoverVisibleSkySurveyTiles({
      ...geometry,
      view: geometricView,
      hideBelowHorizon: true,
    }),
    [],
  );

  const customView = {
    center: horizontalToEquatorial(
      { azimuthDeg: 180, altitudeDeg: 5 },
      observer,
      timestampUtcMs,
      "ICRS",
    ),
    fovDeg: 8,
    rotationDeg: -11,
  };
  assert.deepEqual(
    discoverVisibleSkySurveyTiles({
      ...geometry,
      view: customView,
      hideBelowHorizon: true,
      horizon: [
        { azimuthDeg: 0, altitudeDeg: 15 },
        { azimuthDeg: 90, altitudeDeg: 15 },
        { azimuthDeg: 180, altitudeDeg: 15 },
        { azimuthDeg: 270, altitudeDeg: 15 },
      ],
    }),
    [],
  );
});

test("rasterizes loaded tiles with the exact portrait/landscape view rotation", () => {
  const survey = fixtureSurvey();
  const cases = [
    {
      canvasWidth: 390,
      canvasHeight: 844,
      outputWidth: 29,
      order: 2,
      view: {
        center: {
          raDeg: 83.82,
          decDeg: -5.39,
          frame: "ICRS",
        },
        fovDeg: 40,
        rotationDeg: 33,
      },
    },
    {
      canvasWidth: 844,
      canvasHeight: 390,
      outputWidth: 43,
      order: 3,
      view: {
        center: {
          raDeg: 217.42,
          decDeg: -13.81,
          frame: "ICRS",
        },
        fovDeg: 54,
        rotationDeg: -22,
      },
    },
    {
      canvasWidth: 1000,
      canvasHeight: 600,
      outputWidth: 47,
      order: 3,
      view: {
        center: {
          raDeg: 310.3575,
          decDeg: 45.2803,
          frame: "ICRS",
        },
        fovDeg: 66.8,
        rotationDeg: -41.4,
        mirrorX: true,
      },
    },
  ];
  for (const geometry of cases) {
    const expected = expectedMappings({
      survey,
      ...geometry,
    });
    const tiles = new Map();
    for (const tileIndex of new Set(
      expected.mappings.map((mapping) => mapping.tileIndex),
    ))
      tiles.set(
        skySurveyTileKey(geometry.order, tileIndex),
        constantTile(survey.tileWidth, tileColor(tileIndex)),
      );
    const actual = rasterizeSkySurvey({
      survey,
      tiles,
      ...geometry,
    });
    assert.equal(actual.width, expected.width);
    assert.equal(actual.height, expected.height);
    for (const [index, mapping] of expected.mappings.entries()) {
      assert.deepEqual(
        [...actual.data.slice(index * 4, index * 4 + 4)],
        tileColor(mapping.tileIndex),
      );
    }
    assert.deepEqual(actual.missingTileIndices, []);
    assert.deepEqual(
      actual.usedTileIndices,
      [...new Set(expected.mappings.map((mapping) => mapping.tileIndex))].sort(
        (left, right) => left - right,
      ),
    );
  }
});

test("chunked survey rasterization is byte-identical to the synchronous path", async () => {
  const survey = fixtureSurvey({ frame: "GALACTIC" });
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const timestampUtcMs = Date.UTC(2026, 6, 15, 21, 0, 0);
  const view = {
    center: horizontalToEquatorial(
      { azimuthDeg: 180, altitudeDeg: 8 },
      observer,
      timestampUtcMs,
      "J2000",
    ),
    fovDeg: 36,
    rotationDeg: 19,
  };
  const geometry = {
    survey,
    order: 2,
    fallbackMinOrder: 1,
    view,
    observer,
    timestampUtcMs,
    canvasWidth: 360,
    canvasHeight: 240,
    outputWidth: 41,
    hideBelowHorizon: true,
    horizon: [
      { azimuthDeg: 0, altitudeDeg: 5 },
      { azimuthDeg: 90, altitudeDeg: 5 },
      { azimuthDeg: 180, altitudeDeg: 5 },
      { azimuthDeg: 270, altitudeDeg: 5 },
    ],
  };
  const visibleTargets = discoverVisibleSkySurveyTiles(geometry);
  assert.ok(visibleTargets.length > 0);
  const tiles = allOrderTiles(survey, 1, true);
  tiles.set(
    skySurveyTileKey(2, visibleTargets[0]),
    constantTile(survey.tileWidth, [220, 40, 30, 255]),
  );
  const options = { ...geometry, tiles };
  const expected = rasterizeSkySurvey(options);
  const actual = await rasterizeSkySurveyAsync({
    ...options,
    rowsPerChunk: 3,
  });
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual.usedOrders, [1, 2]);
});

test("chunked survey rasterization yields to an event-loop turn", async () => {
  const survey = fixtureSurvey({
    minOrder: 0,
    maxOrder: 0,
    tileWidth: 2,
  });
  const eventOrder = [];
  setTimeout(() => eventOrder.push("timer"), 0);
  const actual = await rasterizeSkySurveyAsync({
    survey,
    order: 0,
    tiles: allOrderTiles(survey, 0, true),
    view: {
      center: {
        raDeg: 83.82,
        decDeg: -5.39,
        frame: "ICRS",
      },
      fovDeg: 40,
      rotationDeg: 12,
    },
    canvasWidth: 80,
    canvasHeight: 80,
    outputWidth: 40,
  });
  eventOrder.push("complete");
  assert.equal(actual.height, 40);
  assert.deepEqual(eventOrder, ["timer", "complete"]);
});

test("chunked survey rasterization rejects cancellation without publishing", async () => {
  const survey = fixtureSurvey({
    minOrder: 0,
    maxOrder: 0,
    tileWidth: 2,
  });
  let cancelled = false;
  let published = false;
  let cancellationChecks = 0;
  setTimeout(() => {
    cancelled = true;
  }, 0);
  const promise = rasterizeSkySurveyAsync({
    survey,
    order: 0,
    tiles: allOrderTiles(survey, 0, true),
    view: {
      center: {
        raDeg: 217.42,
        decDeg: -13.81,
        frame: "ICRS",
      },
      fovDeg: 50,
      rotationDeg: -17,
    },
    canvasWidth: 96,
    canvasHeight: 96,
    outputWidth: 64,
    rowsPerChunk: 1,
    isCancelled: () => {
      cancellationChecks += 1;
      return cancelled;
    },
  }).then((result) => {
    published = true;
    return result;
  });
  await assert.rejects(
    promise,
    (error) => error?.name === "AbortError" && /cancelled/.test(error.message),
  );
  assert.equal(published, false);
  assert.ok(cancellationChecks >= 2);
});

test("reports absent tiles and leaves their raster pixels transparent", () => {
  const survey = fixtureSurvey();
  const geometry = {
    canvasWidth: 320,
    canvasHeight: 180,
    outputWidth: 35,
    order: 3,
    view: {
      center: { raDeg: 123.4, decDeg: 56.7, frame: "ICRS" },
      fovDeg: 35,
      rotationDeg: 18,
    },
  };
  const expected = expectedMappings({
    survey,
    ...geometry,
  });
  const expectedTileIndices = [
    ...new Set(expected.mappings.map((mapping) => mapping.tileIndex)),
  ].sort((left, right) => left - right);
  const missing =
    expectedTileIndices[Math.floor(expectedTileIndices.length / 2)];
  const tiles = new Map();
  for (const tileIndex of expectedTileIndices)
    if (tileIndex !== missing)
      tiles.set(
        tileIndex,
        constantTile(survey.tileWidth, tileColor(tileIndex)),
      );
  const actual = rasterizeSkySurvey({
    survey,
    tiles,
    ...geometry,
  });
  assert.deepEqual(actual.missingTileIndices, [missing]);
  for (const [index, mapping] of expected.mappings.entries())
    assert.equal(
      actual.data[index * 4 + 3],
      mapping.tileIndex === missing ? 0 : 255,
    );
});

test("fills missing target tiles from the highest available parent order", () => {
  const survey = fixtureSurvey();
  const geometry = {
    canvasWidth: 320,
    canvasHeight: 180,
    outputWidth: 35,
    order: 3,
    view: {
      center: { raDeg: 123.4, decDeg: 56.7, frame: "ICRS" },
      fovDeg: 35,
      rotationDeg: 18,
    },
  };
  const target = expectedMappings({ survey, ...geometry });
  const parents = expectedMappings({
    survey,
    ...geometry,
    order: 2,
  });
  const selectedTargetTile = target.mappings[0].tileIndex;
  const targetColor = [220, 40, 30, 255];
  const parentColor = [20, 90, 180, 255];
  const tiles = new Map([
    [
      skySurveyTileKey(3, selectedTargetTile),
      constantTile(survey.tileWidth, targetColor),
    ],
  ]);
  for (const tileIndex of new Set(
    parents.mappings.map((mapping) => mapping.tileIndex),
  ))
    tiles.set(
      skySurveyTileKey(2, tileIndex),
      constantTile(survey.tileWidth, parentColor),
    );
  const actual = rasterizeSkySurvey({
    survey,
    tiles,
    fallbackMinOrder: 2,
    ...geometry,
  });
  assert.ok(actual.missingTileIndices.length > 0);
  assert.equal(actual.missingTileIndices.includes(selectedTargetTile), false);
  assert.deepEqual(actual.usedOrders, [2, 3]);
  for (const [index, mapping] of target.mappings.entries())
    assert.deepEqual(
      [...actual.data.slice(index * 4, index * 4 + 4)],
      mapping.tileIndex === selectedTargetTile ? targetColor : parentColor,
    );
});

test("uses strided Allsky thumbnails as immutable low-resolution fallback", () => {
  const survey = fixtureSurvey({
    minOrder: 0,
    maxOrder: 0,
    tileWidth: 4,
  });
  const geometry = {
    canvasWidth: 160,
    canvasHeight: 100,
    outputWidth: 40,
    order: 0,
    view: {
      center: { raDeg: 123.4, decDeg: 20, frame: "ICRS" },
      fovDeg: 35,
    },
  };
  const expected = expectedMappings({
    survey,
    ...geometry,
  });
  const visible = new Set(
    expected.mappings.map((mapping) => mapping.tileIndex),
  );
  const tiles = new Map();
  for (const tileIndex of visible) {
    const color = tileColor(tileIndex);
    const master = constantTile(4, color);
    const cacheKey = skySurveyAllskyTileKey(0, tileIndex);
    tiles.set(cacheKey, {
      width: 2,
      height: 2,
      data: master.data,
      dataWidth: 4,
      offsetX: 1,
      offsetY: 1,
      cacheKey,
    });
  }
  const actual = rasterizeSkySurvey({
    survey,
    tiles,
    ...geometry,
  });
  assert.deepEqual(actual.usedOrders, [0]);
  assert.deepEqual(
    actual.missingTileIndices,
    [...visible].sort((a, b) => a - b),
  );
  assert.ok(actual.usedTileKeys.every((key) => key.startsWith("allsky:")));
  for (const [index, mapping] of expected.mappings.entries())
    assert.deepEqual(
      [...actual.data.slice(index * 4, index * 4 + 4)],
      tileColor(mapping.tileIndex),
    );
});

test("reports sampled target-tile gaps even when a parent paints them", () => {
  const survey = fixtureSurvey({
    minOrder: 0,
    maxOrder: 2,
  });
  const geometry = {
    survey,
    order: 2,
    view: {
      center: { raDeg: 315.144, decDeg: 21, frame: "ICRS" },
      fovDeg: 5,
      rotationDeg: 198,
    },
    canvasWidth: 160,
    canvasHeight: 100,
    outputWidth: 100,
  };
  const sampledTargets = discoverVisibleSkySurveyTiles({
    ...geometry,
    sampleStep: 4,
  });
  const exactTargets = discoverVisibleSkySurveyTiles({
    ...geometry,
    sampleStep: 1,
  });
  assert.deepEqual(sampledTargets, [49, 50, 51]);
  assert.deepEqual(exactTargets, [48, 49, 50, 51]);

  const tiles = new Map();
  for (const tileIndex of sampledTargets)
    tiles.set(
      skySurveyTileKey(2, tileIndex),
      constantTile(survey.tileWidth, tileColor(tileIndex)),
    );
  tiles.set(
    skySurveyTileKey(1, 12),
    constantTile(survey.tileWidth, [20, 90, 180, 255]),
  );
  const actual = rasterizeSkySurvey({
    ...geometry,
    tiles,
    fallbackMinOrder: 1,
  });

  assert.deepEqual(actual.usedOrders, [1, 2]);
  assert.deepEqual(actual.missingTileIndices, [48]);
});

test("does not reinterpret legacy numeric target keys as parent-order tiles", () => {
  const survey = fixtureSurvey();
  const geometry = {
    canvasWidth: 320,
    canvasHeight: 180,
    outputWidth: 35,
    order: 3,
    view: {
      center: { raDeg: 123.4, decDeg: 56.7, frame: "ICRS" },
      fovDeg: 35,
      rotationDeg: 18,
    },
  };
  const target = expectedMappings({ survey, ...geometry });
  const targetTileIndex = target.mappings[0].tileIndex;
  const numericParentIndex = Math.floor(targetTileIndex / 4);
  assert.notEqual(numericParentIndex, targetTileIndex);

  const actual = rasterizeSkySurvey({
    survey,
    tiles: new Map([
      [numericParentIndex, constantTile(survey.tileWidth, [20, 90, 180, 255])],
    ]),
    fallbackMinOrder: 2,
    ...geometry,
  });

  assert.equal(actual.usedOrders.includes(2), false);
  assert.ok(actual.missingTileIndices.includes(targetTileIndex));
});

test("keeps mixed numeric target keys out of keyed parent fallback", () => {
  const survey = fixtureSurvey({
    minOrder: 0,
    maxOrder: 3,
    tileWidth: 2,
  });
  const targetColor = [220, 40, 30, 255];
  const unrelatedParentColor = [20, 90, 180, 255];
  const actual = rasterizeSkySurvey({
    survey,
    order: 3,
    fallbackMinOrder: 2,
    tiles: new Map([
      // Numeric keys are supported only as legacy target-order keys. Tile 1
      // must not be mistaken for order-2 parent 1 of target tile 4.
      [1, constantTile(survey.tileWidth, targetColor)],
      [
        skySurveyTileKey(2, 0),
        constantTile(survey.tileWidth, unrelatedParentColor),
      ],
    ]),
    view: {
      center: { raDeg: 55, decDeg: 15, frame: "ICRS" },
      fovDeg: 5,
      rotationDeg: 0,
    },
    canvasWidth: 100,
    canvasHeight: 100,
    outputWidth: 1,
  });

  assert.deepEqual(actual.usedOrders, []);
  assert.deepEqual(actual.missingTileIndices, [4]);
  assert.deepEqual([...actual.data], [0, 0, 0, 0]);
});

test("clips survey imagery against geometric and custom horizons", () => {
  const survey = fixtureSurvey({
    minOrder: 0,
    maxOrder: 0,
    tileWidth: 2,
  });
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const timestampUtcMs = Date.UTC(2026, 6, 15, 21, 0, 0);
  const canvasWidth = 360;
  const canvasHeight = 240;
  const outputWidth = 45;
  const order = 0;
  const tiles = allOrderTiles(survey, order, true);
  const cases = [
    {
      centerAltitudeDeg: 0,
      horizon: [],
      threshold: () => 0,
    },
    {
      centerAltitudeDeg: 12,
      horizon: [
        { azimuthDeg: 0, altitudeDeg: 12 },
        { azimuthDeg: 90, altitudeDeg: 12 },
        { azimuthDeg: 180, altitudeDeg: 12 },
        { azimuthDeg: 270, altitudeDeg: 12 },
      ],
      threshold: () => 12,
    },
  ];
  for (const item of cases) {
    const view = {
      center: horizontalToEquatorial(
        {
          azimuthDeg: 180,
          altitudeDeg: item.centerAltitudeDeg,
        },
        observer,
        timestampUtcMs,
        "ICRS",
      ),
      fovDeg: 48,
      rotationDeg: 23,
    };
    const actual = rasterizeSkySurvey({
      survey,
      order,
      tiles,
      view,
      observer,
      timestampUtcMs,
      canvasWidth,
      canvasHeight,
      outputWidth,
      hideBelowHorizon: true,
      horizon: item.horizon,
    });
    let visibleCount = 0;
    let clippedCount = 0;
    for (let y = 0; y < actual.height; y += 1) {
      for (let x = 0; x < actual.width; x += 1) {
        const equatorial = unprojectEquatorial(
          ((x + 0.5) / actual.width) * canvasWidth,
          ((y + 0.5) / actual.height) * canvasHeight,
          view,
          canvasWidth,
          canvasHeight,
        );
        const horizontal = equatorialToHorizontal(
          equatorial,
          observer,
          timestampUtcMs,
        );
        const expectedVisible =
          horizontal.altitudeDeg >= item.threshold(horizontal.azimuthDeg);
        const alpha = actual.data[(y * actual.width + x) * 4 + 3];
        assert.equal(alpha > 0, expectedVisible);
        if (alpha) visibleCount += 1;
        else clippedCount += 1;
      }
    }
    assert.ok(visibleCount > 0);
    assert.ok(clippedCount > 0);
  }
});
