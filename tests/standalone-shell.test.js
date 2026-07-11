import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("standalone shell boots the shared public viewer", async () => {
  const [html, application, publicApi, types] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../standalone-app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/public-api.js", import.meta.url), "utf8"),
    readFile(new URL("../src/index.d.ts", import.meta.url), "utf8"),
  ]);
  assert.match(html, /type="module" src="standalone-app\.js"/);
  assert.doesNotMatch(html, /app-v8\.js|standalone-engine-bridge\.js/);
  assert.match(application, /createCelestiaAtlasViewer/);
  assert.match(application, /viewer\.setLandscape/);
  assert.match(application, /viewer\.setFieldOfView/);
  assert.match(application, /viewer\.setDisplayOptions/);
  assert.match(publicApi, /assets\/milky-way\.webp/);
  assert.match(publicApi, /drawDsoGlyph/);
  const landscapeDraw = publicApi.indexOf(
    "    drawLandscape(width, height, projectionView, referenceUtcMs);",
  );
  const horizontalGridDraw = publicApi.indexOf("    if (display.azimuthalGrid)");
  assert.ok(landscapeDraw > 0);
  assert.ok(landscapeDraw < horizontalGridDraw);
  assert.match(types, /milkyWayPanoramaUrl\?: string/);
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
