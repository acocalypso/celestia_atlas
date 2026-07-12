import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("standalone shell boots the shared public viewer", async () => {
  const [html, application, publicApi, types, serviceWorker] =
    await Promise.all([
      readFile(new URL("../index.html", import.meta.url), "utf8"),
      readFile(new URL("../standalone-app.js", import.meta.url), "utf8"),
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
  assert.match(
    html,
    /id="controlPanel"[\s\S]*class="floating-panel control-panel glass closed"[\s\S]*aria-hidden="true"/,
  );
  assert.match(html, /id="hideBelowHorizonSwitch" type="checkbox" checked/);
  assert.match(application, /hideBelowHorizon: state\.hideBelowHorizon/);
  assert.match(types, /hideBelowHorizon: boolean/);
  assert.match(publicApi, /assets\/milky-way\.webp/);
  assert.match(publicApi, /drawDsoGlyph/);
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
  assert.match(serviceWorker, /\.\/src\/core\/optics\.js/);
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
  const publicApi = await readFile(
    new URL("../src/public-api.js", import.meta.url),
    "utf8",
  );
  assert.match(publicApi, /landscapeRasterWidth\([\s\S]*coarsePointer/);
  assert.match(publicApi, /if \(canvas\.width !== backingWidth\)/);
  assert.match(publicApi, /if \(canvas\.height !== backingHeight\)/);
  assert.match(publicApi, /landscapeUploadKey !== landscapeRasterCache\.key/);
  assert.match(publicApi, /milkyWayUploadKey !== milkyWayRasterCache\.key/);
  assert.match(publicApi, /currentSolarSystemObjects/);
  assert.match(publicApi, /interactionViewChangePending = true/);
  assert.match(publicApi, /addEventListener\("contextlost"/);
  assert.match(publicApi, /removeEventListener\("contextrestored"/);

  const dsoLoop = publicApi.slice(
    publicApi.indexOf("for (const object of catalog)"),
    publicApi.indexOf("if (display.solarSystem)"),
  );
  assert.ok(dsoLoop.indexOf("const point = project(object)") > 0);
  assert.ok(
    dsoLoop.indexOf("const point = project(object)") <
      dsoLoop.indexOf("if (!isAboveHorizon(object))"),
  );
});
