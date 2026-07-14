import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { combineCatalogLayers } from "../src/core/catalog-layers.js";
import {
  createCatalogSearchIndex,
  searchCatalogIndex,
} from "../src/core/catalog-identifiers.js";

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

test("public Stellarium layer exposes searchable LDN records without mixing assets", async () => {
  const [curatedScript, baseScript, supplementScript, supplementJson, metaJson] =
    await Promise.all([
      readFile(new URL("../catalog.js", import.meta.url), "utf8"),
      readFile(new URL("../dso-catalog.js", import.meta.url), "utf8"),
      readFile(new URL("../stellarium-supplement.js", import.meta.url), "utf8"),
      readFile(dataUrl("stellarium-dso-supplement.json"), "utf8"),
      readFile(dataUrl("stellarium-supplement-meta.json"), "utf8"),
    ]);
  const payload = JSON.parse(supplementJson);
  const metadata = JSON.parse(metaJson);

  assert.equal(payload.objects.length, 3409);
  assert.equal(payload.meta.objectCount, 3409);
  assert.deepEqual(payload.meta, metadata);
  assert.equal(metadata.license, "GPL-2.0-or-later");
  assert.deepEqual(metadata.catalogueGroups, [
    "barnard",
    "lbn",
    "ldn",
    "rcw",
    "sharpless",
    "vdb",
  ]);

  const context = vm.createContext({ window: {} });
  vm.runInContext(curatedScript, context, { filename: "catalog.js" });
  vm.runInContext(baseScript, context, { filename: "dso-catalog.js" });
  const baseObjects = context.window.DSO_DATA;
  const baseMetadata = context.window.DSO_CATALOG_META;
  vm.runInContext(supplementScript, context, {
    filename: "stellarium-supplement.js",
  });

  assert.equal(
    context.window.DSO_DATA,
    baseObjects,
    "the separately licensed asset must not rewrite the OpenNGC layer",
  );
  assert.equal(context.window.DSO_DATA.length, 12578);
  assert.equal(context.window.STELLARIUM_DSO_SUPPLEMENT_DATA.length, 3409);

  const layered = combineCatalogLayers(
    baseObjects,
    context.window.STELLARIUM_DSO_SUPPLEMENT_DATA,
    baseMetadata,
    context.window.STELLARIUM_DSO_SUPPLEMENT_META,
  );
  assert.equal(layered.objects.length, 15860);
  assert.equal(layered.meta.objectCount, 15860);
  assert.equal(layered.meta.supplementAttachmentPositionConflicts, 4);
  assert.deepEqual(layered.meta.catalogueGroups, [
    "barnard",
    "lbn",
    "ldn",
    "openngc",
    "rcw",
    "sharpless",
    "vdb",
  ]);

  const results = searchCatalogIndex(
    createCatalogSearchIndex(layered.objects),
    "LDN 1",
    5,
  );
  assert.equal(results[0].id, "LDN 1");
  assert.equal(results[0].catalogSource, "LDN via Stellarium");
  assert.equal(results[0].mag, undefined);
  assert.equal(results[0].properties.opacityClass, 3);
  assert.equal(results[0].properties.stellariumType, "DN");
  assert.ok(Number.isFinite(results[0].raDeg));
  assert.ok(Number.isFinite(results[0].decDeg));
});
