import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { combineCatalogLayers } from "../src/core/catalog-layers.js";


const rootUrl = new URL("../", import.meta.url);

function searchKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function exactSearch(objects, query) {
  const queryKey = searchKey(query);
  return objects.filter((object) =>
    [object.id, object.name, ...(object.aliases ?? [])].some(
      (value) => searchKey(value) === queryKey,
    ),
  );
}

test("generated A66 layer is complete, pinned, and independently licensed", async () => {
  const [jsonText, script, fileInfo] = await Promise.all([
    readFile(new URL("data/abell-pn-catalog.json", rootUrl), "utf8"),
    readFile(new URL("abell-pn-catalog.js", rootUrl), "utf8"),
    stat(new URL("abell-pn-catalog.js", rootUrl)),
  ]);
  const payload = JSON.parse(jsonText);
  const context = vm.createContext({ window: {} });
  vm.runInContext(script, context, { filename: "abell-pn-catalog.js" });

  assert.equal(payload.meta.version, "2026-07-15");
  assert.equal(payload.meta.versionLabel, "SIMBAD A66");
  assert.equal(payload.meta.serviceRelease, "SIMBAD4 1.8 - 2026-06");
  assert.equal(payload.meta.retrievedAt, "2026-07-15");
  assert.equal(payload.meta.license, "ODbL-1.0");
  assert.equal(
    payload.meta.sourceSha256,
    "1aac0fb91c4ae39581b86a6bf1e8cc2fbdeaa93d0460762f73df59dd7e501348",
  );
  assert.equal(
    payload.meta.querySha256,
    "ab2fe86d5c84e6d027bcb363c9d775b428d11eb003ec3fbf426331b64751e639",
  );
  assert.equal(payload.meta.sourceRecordCount, 1_152);
  assert.equal(payload.meta.sourceIdentifierCount, 1_152);
  assert.equal(payload.meta.objectCount, 86);
  assert.equal(payload.meta.mergeKeyCount, 4);
  assert.deepEqual(payload.meta.simbadObjectTypeCounts, {
    "?": 1,
    "AG?": 1,
    EmG: 1,
    G: 1,
    HII: 1,
    PN: 78,
    "PN?": 2,
    SNR: 1,
  });
  assert.equal(payload.objects.length, 86);
  assert.equal(context.window.ABELL_PN_CATALOG_DATA.length, 86);
  assert.equal(context.window.ABELL_PN_CATALOG_META.objectCount, 86);
  assert.equal(context.window.STELLARIUM_DSO_SUPPLEMENT_DATA, undefined);
  assert.match(script, /SPDX-License-Identifier: ODbL-1\.0/);
  assert.doesNotMatch(script, /window\.STELLARIUM_DSO/);
  assert.ok(fileInfo.size < 100_000, `A66 browser layer is ${fileInfo.size} bytes`);

  const uids = new Set();
  for (let number = 1; number <= 86; number += 1) {
    const object = payload.objects[number - 1];
    assert.equal(object.uid, `simbad-a66:${number}`);
    assert.equal(object.id, `Abell PN ${number}`);
    assert.deepEqual(object.catalogueGroups, ["abell-pn"]);
    assert.equal(object.catalogSource, "SIMBAD A66");
    assert.equal(object.frame, "ICRS");
    assert.ok(Number.isFinite(object.raDeg) && object.raDeg >= 0 && object.raDeg < 360);
    assert.ok(Number.isFinite(object.decDeg) && object.decDeg >= -90 && object.decDeg <= 90);
    for (const alias of [
      `Abell ${number}`,
      `Abell${number}`,
      `A66 ${number}`,
      `A66-${number}`,
      `PN A66 ${number}`,
    ]) {
      assert.ok(object.aliases.includes(alias), `${object.id} lacks ${alias}`);
    }
    assert.ok(object.crossIdentifiers.includes(`PN A66 ${number}`));
    assert.equal(object.properties.simbadIdentifierCount, object.crossIdentifiers.length);
    assert.ok(object.properties.simbadMainId.length > 0);
    assert.ok(object.properties.simbadOtype.length > 0);
    assert.equal(uids.has(object.uid), false, `duplicate UID ${object.uid}`);
    uids.add(object.uid);
  }

  const abell39 = payload.objects.find((object) => object.id === "Abell PN 39");
  assert.equal(abell39.typeCode, "PN");
  assert.equal(abell39.properties.simbadMainId, "PN A66 39");
  assert.equal(abell39.properties.simbadOtype, "PN");
  assert.ok(Math.abs(abell39.raDeg - 246.89049967631996) < 1e-12);
  assert.ok(Math.abs(abell39.decDeg - 27.909297605660004) < 1e-12);
  assert.ok(abell39.crossIdentifiers.includes("PK 047+42 1"));
  assert.ok(abell39.crossIdentifiers.includes("PN G047.0+42.4"));
  assert.equal(exactSearch(payload.objects, "Abell 1656").length, 0);

  assert.deepEqual(
    payload.objects
      .filter((object) => object.mergeKeys)
      .map((object) => [object.id, object.mergeKeys]),
    [
      ["Abell PN 37", ["ic:972"]],
      ["Abell PN 50", ["ngc:6742"]],
      ["Abell PN 75", ["ngc:7076"]],
      ["Abell PN 81", ["ic:1454"]],
    ],
  );
});

test("A66-before-Stellarium layering resolves the two Abell namespaces", async () => {
  const [baseText, a66Text, stellariumText] = await Promise.all([
    readFile(new URL("data/openngc-viewer-catalog.json", rootUrl), "utf8"),
    readFile(new URL("data/abell-pn-catalog.json", rootUrl), "utf8"),
    readFile(new URL("data/stellarium-dso-supplement.json", rootUrl), "utf8"),
  ]);
  const base = JSON.parse(baseText);
  const a66 = JSON.parse(a66Text);
  const stellarium = JSON.parse(stellariumText);

  const withA66 = combineCatalogLayers(
    base.objects,
    a66.objects,
    base.meta,
    a66.meta,
  );
  assert.equal(withA66.objects.length, 12_660);
  assert.equal(withA66.meta.supplementAttachmentPositionConflicts, 0);
  assert.equal(
    withA66.objects.filter((object) =>
      object.catalogueGroups?.includes("abell-pn"),
    ).length,
    86,
  );

  const layered = combineCatalogLayers(
    withA66.objects,
    stellarium.objects,
    withA66.meta,
    stellarium.meta,
  );
  assert.equal(layered.objects.length, 21_191);
  assert.equal(layered.meta.supplementAttachmentPositionConflicts, 4);
  assert.ok(layered.meta.catalogueGroups.includes("abell-pn"));
  assert.ok(layered.meta.catalogueGroups.includes("abell"));

  const abell39 = exactSearch(layered.objects, "Abell 39");
  assert.ok(abell39.length >= 2, "A66 PN and ACO cluster should both remain searchable");
  assert.equal(abell39[0].id, "Abell PN 39");
  assert.equal(abell39[0].typeCode, "PN");
  assert.ok(abell39[0].catalogueGroups.includes("abell-pn"));

  const abell1656 = exactSearch(layered.objects, "Abell 1656");
  assert.equal(abell1656.length, 1);
  assert.equal(abell1656[0].typeCode, "GCluster");
  assert.ok(abell1656[0].catalogueGroups.includes("abell"));
  assert.equal(abell1656[0].catalogueGroups.includes("abell-pn"), false);
});
