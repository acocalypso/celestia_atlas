import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);

test("packages matching rich, compact, legacy, and source-manifest catalogues", async () => {
  const [richText, viewerText, legacyText, legacyViewerText, sourceText] =
    await Promise.all([
      readFile(dataUrl("dso-catalog.json"), "utf8"),
      readFile(dataUrl("dso-viewer-catalog.json"), "utf8"),
      readFile(dataUrl("openngc-catalog.json"), "utf8"),
      readFile(dataUrl("openngc-viewer-catalog.json"), "utf8"),
      readFile(dataUrl("catalog-sources.json"), "utf8"),
    ]);
  const rich = JSON.parse(richText);
  const viewer = JSON.parse(viewerText);
  const legacy = JSON.parse(legacyText);
  const legacyViewer = JSON.parse(legacyViewerText);
  const sources = JSON.parse(sourceText);

  for (const payload of [rich, viewer, legacy, legacyViewer]) {
    assert.equal(payload.meta.objectCount, 12578);
    assert.equal(payload.objects.length, 12578);
    assert.equal(payload.meta.coordinateFrame, "ICRS");
    assert.equal(payload.meta.rightAscensionUnit, "degrees");
  }
  assert.equal(rich.meta.version, "v20260501");
  assert.deepEqual(Object.keys(sources.catalogues), ["openngc"]);
  assert.equal(
    sources.catalogues.openngc.rightsStatus,
    "redistribution-permitted-with-attribution-and-share-alike",
  );
  assert.ok(viewerText.length < richText.length);
  assert.ok(legacyViewerText.length < legacyText.length * 0.7);

  assert.ok(
    rich.objects.every(
      (object) =>
        Number.isFinite(object.coordinates?.raDeg) &&
        Number.isFinite(object.coordinates?.decDeg) &&
        object.coordinates.frame === "ICRS" &&
        object.sources?.length,
    ),
  );
  assert.ok(
    viewer.objects.every(
      (object) =>
        Number.isFinite(object.raDeg) &&
        Number.isFinite(object.decDeg) &&
        object.frame === "ICRS" &&
        object.catalogSource === "OpenNGC" &&
        !("ra" in object) &&
        !("dec" in object),
    ),
  );

  const andromeda = viewer.objects.find((object) => object.id === "M31");
  assert.equal(andromeda.name, "Andromeda Galaxy");
  assert.ok(Math.abs(andromeda.raDeg - 10.684791666666664) < 1e-10);
  assert.ok(Math.abs(andromeda.decDeg - 41.26905555555555) < 1e-10);
});

test("browser bundle keeps normalized coordinates and curated descriptions", async () => {
  const [curatedScript, generatedScript] = await Promise.all([
    readFile(new URL("../catalog.js", import.meta.url), "utf8"),
    readFile(new URL("../dso-catalog.js", import.meta.url), "utf8"),
  ]);
  const context = vm.createContext({ window: {} });
  vm.runInContext(curatedScript, context, { filename: "catalog.js" });
  vm.runInContext(generatedScript, context, { filename: "dso-catalog.js" });

  assert.equal(context.window.DSO_CATALOG_DATA.length, 12578);
  const andromeda = context.window.DSO_DATA.find((object) => object.id === "M31");
  assert.equal(andromeda.name, "Andromeda Galaxy");
  assert.match(andromeda.description, /nearest large spiral galaxy/i);
  assert.ok(Math.abs(andromeda.raDeg - 10.684791666666664) < 1e-10);
  assert.equal(andromeda.frame, "ICRS");
});
