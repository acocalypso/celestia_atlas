import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("standalone shell boots the shared public viewer", async () => {
  const [html, application, styles, publicApi, types, serviceWorker] =
    await Promise.all([
      readFile(new URL("../index.html", import.meta.url), "utf8"),
      readFile(new URL("../standalone-app.js", import.meta.url), "utf8"),
      readFile(new URL("../styles.css", import.meta.url), "utf8"),
      readFile(new URL("../src/public-api.js", import.meta.url), "utf8"),
      readFile(new URL("../src/index.d.ts", import.meta.url), "utf8"),
      readFile(new URL("../service-worker.js", import.meta.url), "utf8"),
    ]);
  assert.match(html, /type="module" src="standalone-app\.js"/);
  assert.doesNotMatch(html, /app-v8\.js|standalone-engine-bridge\.js/);
  assert.match(application, /createCelestiaAtlasViewer/);
  assert.match(application, /viewer\.setLandscape/);
  assert.match(application, /viewer\.setFieldOfView/);
  assert.match(application, /calculateCameraFieldOfView/);
  assert.match(html, /id="sensorWidthInput"/);
  assert.match(html, /id="sensorHeightInput"/);
  assert.match(html, /id="pixelSizeInput"/);
  assert.match(html, /id="focalLengthInput"/);
  assert.match(html, /id="apertureInput"/);
  assert.match(html, /id="fovOpticsReadout"/);
  assert.doesNotMatch(html, /id="fov(?:Width|Height)Input"/);
  assert.match(application, /viewer\.setDisplayOptions/);
  assert.match(application, /viewer\.setCoordinateMode\(state\.mode\)/);
  assert.match(
    html,
    /id="controlPanel"[\s\S]*class="floating-panel control-panel glass closed"[\s\S]*aria-hidden="true"/,
  );
  assert.match(html, /id="hideBelowHorizonSwitch" type="checkbox" checked/);
  assert.match(application, /hideBelowHorizon: state\.hideBelowHorizon/);
  assert.match(html, /id="galaxyMagLimit"/);
  assert.match(html, /id="dsoMagLimit"/);
  assert.match(
    application,
    /galaxyMagnitudeLimit: state\.galaxyMagnitudeLimit/,
  );
  assert.match(
    application,
    /deepSkyMagnitudeLimit: state\.deepSkyMagnitudeLimit/,
  );
  assert.match(html, /id="dsoTypeFilters"/);
  assert.match(html, /id="dsoSourceFilters"/);
  assert.match(html, /data-catalog-filter-action="all"/);
  assert.match(html, /data-catalog-filter-action="none"/);
  assert.match(
    application,
    /deepSkyObjectTypes: state\.deepSkyObjectTypes/,
  );
  assert.match(
    application,
    /deepSkyCatalogueGroups: state\.deepSkyCatalogueGroups/,
  );
  assert.match(application, /Number\.isFinite\(object\.raDeg\)/);
  assert.match(application, /globalThis\.DSO_CATALOG_META/);
  assert.match(application, /object\.primaryName \|\| object\.name/);
  assert.match(application, /Source catalogues and identifiers/);
  assert.match(application, /Source-specific property values/);
  assert.match(application, /sourcePropertyConflicts/);
  assert.match(application, /source\.vizierId/);
  assert.match(application, /source\.originalIdentifier/);
  assert.match(application, /Approximate geometry/);
  assert.match(application, /properties\.opacity/);
  assert.doesNotMatch(application, /aliases \?\? \[\]\)\.slice/);
  assert.match(styles, /\.catalog-filter-options/);
  assert.match(
    styles,
    /@media\(max-width:560px\)\{\.catalog-filter-options\{grid-template-columns:1fr/,
  );
  assert.match(types, /hideBelowHorizon: boolean/);
  assert.match(types, /setCoordinateMode\(value: CoordinateMode\)/);
  assert.match(types, /galaxyMagnitudeLimit: number/);
  assert.match(types, /deepSkyMagnitudeLimit: number/);
  assert.match(publicApi, /assets\/milky-way\.webp/);
  assert.match(publicApi, /drawDsoGlyph/);
  assert.doesNotMatch(publicApi, /if \(!display\.azimuthalGrid\) return view/);
  const landscapeDraw = publicApi.indexOf(
    "    drawLandscape(width, height, projectionView, referenceUtcMs, dpr);",
  );
  const horizontalGridDraw = publicApi.indexOf(
    "    if (display.azimuthalGrid)",
  );
  assert.ok(landscapeDraw > 0);
  assert.ok(landscapeDraw < horizontalGridDraw);
  assert.match(types, /milkyWayPanoramaUrl\?: string/);
  assert.match(types, /calculateCameraFieldOfView/);
  assert.match(types, /cameraFrameScreenRotationDeg/);
  assert.match(
    publicApi,
    /cameraFrameScreenRotationDeg\(\s*projectionView\.rotationDeg \?\? 0,/,
  );
  assert.match(serviceWorker, /\.\/src\/core\/optics\.js/);
  assert.match(serviceWorker, /\.\/src\/core\/catalog-filters\.js/);
});

test("standalone package contains all twelve offline landscape faces", async () => {
  await access(
    new URL("../assets/landscapes/guereins/properties", import.meta.url),
  );
  await Promise.all(
    Array.from({ length: 12 }, (_, face) =>
      access(
        new URL(
          `../assets/landscapes/guereins/Norder0/Dir0/Npix${face}.webp`,
          import.meta.url,
        ),
      ),
    ),
  );
});

test("mobile renderer keeps expensive work inside bounded frame contracts", async () => {
  const [publicApi, coordinates, landscape] = await Promise.all([
    readFile(new URL("../src/public-api.js", import.meta.url), "utf8"),
    readFile(new URL("../src/core/coordinates.js", import.meta.url), "utf8"),
    readFile(new URL("../src/core/landscape.js", import.meta.url), "utf8"),
  ]);
  assert.match(publicApi, /landscapeRasterWidth\([\s\S]*coarsePointer/);
  assert.match(publicApi, /if \(canvas\.width !== backingWidth\)/);
  assert.match(publicApi, /if \(canvas\.height !== backingHeight\)/);
  assert.match(publicApi, /landscapeUploadKey !== landscapeRasterCache\.key/);
  assert.match(publicApi, /milkyWayUploadKey !== milkyWayRasterCache\.key/);
  assert.match(publicApi, /currentSolarSystemObjects/);
  assert.match(publicApi, /interactionViewChangePending = true/);
  assert.match(publicApi, /const dsoLabelBudget/);
  assert.match(publicApi, /placedDsoLabelBoxes\.some/);
  assert.match(publicApi, /addEventListener\("contextlost"/);
  assert.match(publicApi, /removeEventListener\("contextrestored"/);
  assert.match(coordinates, /let observedFrameCache = null/);
  assert.match(landscape, /createEquatorialToHorizontalVectorTransform/);
  assert.doesNotMatch(landscape, /localSiderealDegrees/);

  const dsoLoopStart = publicApi.indexOf("let catalogIndex = 0;");
  const dsoLoopEnd = publicApi.indexOf("if (display.solarSystem)");
  assert.ok(dsoLoopStart > 0 && dsoLoopEnd > dsoLoopStart);
  const dsoLoop = publicApi.slice(dsoLoopStart, dsoLoopEnd);
  assert.ok(dsoLoop.indexOf("const point = project(object)") > 0);
  assert.ok(
    dsoLoop.indexOf("const point = project(object)") <
      dsoLoop.indexOf("if (!isAboveHorizon(object))"),
  );
});
