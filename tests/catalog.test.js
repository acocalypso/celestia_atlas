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

  for (const payload of [rich, viewer]) {
    assert.equal(payload.meta.objectCount, 12579);
    assert.equal(payload.objects.length, 12579);
    assert.ok(payload.meta.catalogueGroups.includes("messier"));
    assert.equal(
      payload.objects.filter((object) =>
        object.catalogueGroups?.includes("messier"),
      ).length,
      110,
    );
    const designations = new Set(
      payload.objects
        .filter((object) => object.catalogueGroups?.includes("messier"))
        .flatMap((object) => [
          object.id,
          object.primaryName,
          ...(object.aliases ?? []),
        ])
        .map((value) => String(value).match(/^M\s*0*(\d+)$/i))
        .filter(Boolean)
        .map((match) => Number(match[1])),
    );
    assert.deepEqual(
      [...designations].sort((left, right) => left - right),
      [...Array.from({ length: 110 }, (_, index) => index + 1)],
    );
  }
  for (const payload of [legacy, legacyViewer]) {
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
  assert.equal(sources.messierCompletion.catalogueSize, 110);
  assert.equal(sources.messierCompletion.addedObject, "M40 / Winnecke 4");
  assert.match(sources.messierCompletion.m40Source, /simbad/i);
  assert.match(sources.messierCompletion.m102ConventionSource, /nasa\.gov/i);
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
        ["OpenNGC", "SIMBAD"].includes(object.catalogSource) &&
        !("ra" in object) &&
        !("dec" in object),
    ),
  );

  const andromeda = viewer.objects.find((object) => object.id === "M31");
  assert.equal(andromeda.name, "Andromeda Galaxy");
  assert.ok(Math.abs(andromeda.raDeg - 10.684791666666664) < 1e-10);
  assert.ok(Math.abs(andromeda.decDeg - 41.26905555555555) < 1e-10);
  const m40 = viewer.objects.find((object) => object.id === "M40");
  assert.equal(m40.name, "Winnecke 4");
  assert.equal(m40.type, "Double star");
  assert.deepEqual(m40.catalogueGroups, ["messier"]);
  const m102 = viewer.objects.find((object) => object.id === "M102");
  assert.equal(m102.name, "Spindle Galaxy");
  assert.ok(m102.aliases.includes("NGC 5866"));
});

test("browser bundle keeps normalized coordinates and curated descriptions", async () => {
  const [curatedScript, generatedScript] = await Promise.all([
    readFile(new URL("../catalog.js", import.meta.url), "utf8"),
    readFile(new URL("../dso-catalog.js", import.meta.url), "utf8"),
  ]);
  const context = vm.createContext({ window: {} });
  vm.runInContext(curatedScript, context, { filename: "catalog.js" });
  vm.runInContext(generatedScript, context, { filename: "dso-catalog.js" });

  assert.equal(context.window.DSO_CATALOG_DATA.length, 12579);
  const andromeda = context.window.DSO_DATA.find(
    (object) => object.id === "M31",
  );
  assert.equal(andromeda.name, "Andromeda Galaxy");
  assert.match(andromeda.description, /nearest large spiral galaxy/i);
  assert.ok(Math.abs(andromeda.raDeg - 10.684791666666664) < 1e-10);
  assert.equal(andromeda.frame, "ICRS");
});

test("public Stellarium layer exposes searchable LDN and Abell records without mixing assets", async () => {
  const [
    curatedScript,
    baseScript,
    supplementScript,
    supplementJson,
    metaJson,
  ] = await Promise.all([
    readFile(new URL("../catalog.js", import.meta.url), "utf8"),
    readFile(new URL("../dso-catalog.js", import.meta.url), "utf8"),
    readFile(new URL("../stellarium-supplement.js", import.meta.url), "utf8"),
    readFile(dataUrl("stellarium-dso-supplement.json"), "utf8"),
    readFile(dataUrl("stellarium-supplement-meta.json"), "utf8"),
  ]);
  const payload = JSON.parse(supplementJson);
  const metadata = JSON.parse(metaJson);

  assert.equal(payload.objects.length, 8658);
  assert.equal(payload.meta.objectCount, 8658);
  assert.deepEqual(payload.meta, metadata);
  assert.equal(metadata.license, "GPL-2.0-or-later");
  assert.deepEqual(metadata.catalogueGroups, [
    "abell",
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
  assert.equal(context.window.DSO_DATA.length, 12579);
  assert.equal(context.window.STELLARIUM_DSO_SUPPLEMENT_DATA.length, 8658);

  const layered = combineCatalogLayers(
    baseObjects,
    context.window.STELLARIUM_DSO_SUPPLEMENT_DATA,
    baseMetadata,
    context.window.STELLARIUM_DSO_SUPPLEMENT_META,
  );
  assert.equal(layered.objects.length, 21110);
  assert.equal(layered.meta.objectCount, 21110);
  assert.equal(layered.meta.supplementAttachmentPositionConflicts, 4);
  assert.deepEqual(layered.meta.catalogueGroups, [
    "abell",
    "barnard",
    "lbn",
    "ldn",
    "messier",
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

  const abellResults = searchCatalogIndex(
    createCatalogSearchIndex(layered.objects),
    "ACO S1",
    5,
  );
  assert.equal(abellResults[0].id, "Abell S1");
  assert.equal(abellResults[0].catalogSource, "Abell via Stellarium");
  assert.equal(abellResults[0].typeCode, "GCluster");
  assert.equal(abellResults[0].type, "Galaxy cluster");
});
