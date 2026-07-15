import test from "node:test";
import assert from "node:assert/strict";
import { combineCatalogLayers } from "../src/core/catalog-layers.js";

const baseMeta = {
  name: "OpenNGC",
  version: "v1",
  catalogueGroups: ["openngc"],
};
const supplementMeta = {
  name: "Stellarium supplement",
  version: "v26.2",
  catalogueGroups: ["LDN", "Barnard"],
};

test("reciprocal NGC/IC matches enrich the base identity without replacing it", () => {
  const base = {
    uid: "openngc:ngc-1976",
    id: "NGC 1976",
    name: "Orion Nebula",
    aliases: ["M 42"],
    raDeg: 83.822,
    decDeg: -5.391,
    frame: "ICRS",
    type: "H II region",
    typeCode: "HII",
    catalogSource: "OpenNGC",
    properties: { authority: "base", shared: "base" },
  };
  const supplement = {
    uid: "stellarium:42",
    id: "LDN 1641",
    aliases: ["NGC1976", "M42"],
    raDeg: 83.9,
    decDeg: -5.4,
    frame: "ICRS",
    type: "Dark nebula",
    typeCode: "DrkN",
    mag: 8.5,
    shape: { majorArcmin: 60 },
    catalogueGroups: ["LDN"],
    catalogSource: "LDN via Stellarium",
    sources: [{ catalogue: "LDN via Stellarium", identifier: "LDN 1641" }],
    properties: { supplementOnly: true, shared: "supplement" },
    mergeKeys: ["ngc:1976", "ldn:1641"],
  };

  const result = combineCatalogLayers(
    [base],
    [supplement],
    baseMeta,
    supplementMeta,
  );

  assert.equal(result.objects.length, 1);
  assert.deepEqual(
    {
      uid: result.objects[0].uid,
      id: result.objects[0].id,
      raDeg: result.objects[0].raDeg,
      decDeg: result.objects[0].decDeg,
      type: result.objects[0].type,
      typeCode: result.objects[0].typeCode,
    },
    {
      uid: base.uid,
      id: base.id,
      raDeg: base.raDeg,
      decDeg: base.decDeg,
      type: base.type,
      typeCode: base.typeCode,
    },
  );
  assert.deepEqual(result.objects[0].aliases, ["M 42", "LDN 1641", "NGC1976"]);
  assert.deepEqual(result.objects[0].catalogueGroups, ["openngc", "LDN"]);
  assert.equal(
    result.objects[0].catalogSource,
    "OpenNGC + LDN via Stellarium",
  );
  assert.deepEqual(result.objects[0].sources, [
    { catalogue: "OpenNGC", identifier: "NGC 1976" },
    { catalogue: "LDN via Stellarium", identifier: "LDN 1641" },
  ]);
  assert.deepEqual(result.objects[0].shape, { majorArcmin: 60 });
  assert.equal(result.objects[0].mag, 8.5);
  assert.deepEqual(result.objects[0].properties, {
    supplementOnly: true,
    shared: "base",
    authority: "base",
  });
  assert.equal("mergeKeys" in result.objects[0], false);
  assert.equal(base.aliases.length, 1, "inputs remain untouched");
  assert.deepEqual(result.meta, {
    name: "Celestia Atlas offline DSO catalogue",
    version: "v1 + Stellarium v26.2",
    catalogueGroups: ["Barnard", "LDN", "openngc"],
    objectCount: 1,
    supplements: [supplementMeta],
    supplementAttachmentPositionConflicts: 0,
  });
});

test("normalized primaryName values participate in exact catalogue attachments", () => {
  const result = combineCatalogLayers(
    [
      {
        uid: "openngc:ic-972",
        primaryName: "IC 972",
        coordinates: { raDeg: 220.9, decDeg: 29.3 },
      },
    ],
    [
      {
        uid: "simbad:a66-37",
        id: "Abell PN 37",
        mergeKeys: ["ic:972"],
        raDeg: 220.9,
        decDeg: 29.3,
      },
    ],
  );

  assert.equal(result.objects.length, 1);
  assert.equal(result.objects[0].primaryName, "IC 972");
  assert.ok(result.objects[0].aliases.includes("Abell PN 37"));
});

test("a base-key collision is ambiguous and leaves the supplement independent", () => {
  const result = combineCatalogLayers(
    [
      { id: "NGC 1", raDeg: 0, decDeg: 0 },
      { id: "other", aliases: ["NGC0001"], raDeg: 1, decDeg: 1 },
    ],
    [{ id: "LDN 1", mergeKeys: ["ngc:1"], raDeg: 2, decDeg: 2 }],
  );
  assert.equal(result.objects.length, 3);
  assert.equal(result.objects[2].id, "LDN 1");
  assert.equal("mergeKeys" in result.objects[2], false);
});

test("two supplement rows targeting one base row are both preserved", () => {
  const result = combineCatalogLayers(
    [{ id: "IC 434", aliases: ["Horsehead region"] }],
    [
      { uid: "stellarium:a", id: "LDN 1630", mergeKeys: ["ic:434"] },
      { uid: "stellarium:b", id: "Barnard 33", mergeKeys: ["IC 0434"] },
    ],
  );
  assert.deepEqual(
    result.objects.map((object) => object.uid ?? object.id),
    ["IC 434", "stellarium:a", "stellarium:b"],
  );
});

test("repeated historical designations remain separate source rows", () => {
  const supplement = [
    { uid: "stellarium:10", id: "LDN 1730", raDeg: 10, decDeg: 20 },
    { uid: "stellarium:11", id: "LDN 1730", raDeg: 11, decDeg: 21 },
  ];
  const result = combineCatalogLayers([], supplement);
  assert.equal(result.objects.length, 2);
  assert.deepEqual(
    result.objects.map((object) => object.uid),
    ["stellarium:10", "stellarium:11"],
  );
});

test("nearby positions and supplement identifiers without mergeKeys never merge", () => {
  const base = [{ id: "NGC 7000", raDeg: 314, decDeg: 44 }];
  const supplement = [
    {
      id: "NGC7000",
      aliases: ["North America Nebula"],
      raDeg: 314.000001,
      decDeg: 44.000001,
    },
    {
      id: "LDN 935",
      raDeg: 314,
      decDeg: 44,
      mergeKeys: ["ldn:935"],
    },
  ];
  const result = combineCatalogLayers(base, supplement);
  assert.equal(result.objects.length, 3);
  assert.deepEqual(
    result.objects.map((object) => object.id),
    ["NGC 7000", "NGC7000", "LDN 935"],
  );
});

test("existing base shape and magnitude win during a valid merge", () => {
  const result = combineCatalogLayers(
    [{ id: "IC 1", major: 2, mag: 11, shape: { majorArcmin: 2 } }],
    [
      {
        id: "LDN 2",
        mergeKeys: ["ic:1"],
        mag: 4,
        shape: { majorArcmin: 99 },
      },
    ],
  );
  assert.equal(result.objects[0].mag, 11);
  assert.deepEqual(result.objects[0].shape, { majorArcmin: 2 });
});

test("a gross position conflict vetoes an otherwise exact attachment", () => {
  const result = combineCatalogLayers(
    [{ id: "NGC 1", raDeg: 0, decDeg: 0, major: 10 }],
    [
      {
        id: "LDN 1",
        raDeg: 1,
        decDeg: 0,
        shape: { majorArcmin: 10 },
        mergeKeys: ["ngc:1"],
      },
    ],
  );
  assert.equal(result.objects.length, 2);
  assert.equal(result.objects[1].id, "LDN 1");
  assert.equal(result.meta.supplementAttachmentPositionConflicts, 1);
});

test("overlapping published footprints permit an exact attachment", () => {
  const result = combineCatalogLayers(
    [{ id: "IC 1", raDeg: 0, decDeg: 0, major: 60 }],
    [
      {
        id: "LBN 1",
        raDeg: 1,
        decDeg: 0,
        shape: { majorArcmin: 60 },
        mergeKeys: ["ic:1"],
      },
    ],
  );
  assert.equal(result.objects.length, 1);
  assert.ok(result.objects[0].aliases.includes("LBN 1"));
  assert.equal(result.meta.supplementAttachmentPositionConflicts, 0);
});

test("untouched base rows retain their references", () => {
  const base = { id: "NGC 1", raDeg: 0, decDeg: 0 };
  const result = combineCatalogLayers([base], []);
  assert.equal(result.objects[0], base);
});

test("sequential layers keep explicit version labels and accumulated conflicts", () => {
  const first = combineCatalogLayers(
    [{ id: "NGC 1", raDeg: 0, decDeg: 0 }],
    [{ id: "Abell PN 1", mergeKeys: ["NGC 1"], raDeg: 90, decDeg: 0 }],
    { version: "base", catalogueGroups: ["openngc"] },
    {
      name: "Abell planetary nebulae",
      versionLabel: "SIMBAD A66",
      version: "2026-07-15",
      catalogueGroups: ["abell-pn"],
    },
  );
  const second = combineCatalogLayers(
    first.objects,
    [],
    first.meta,
    {
      name: "Stellarium supplement",
      version: "v26.2",
      catalogueGroups: ["ldn"],
    },
  );

  assert.equal(
    second.meta.version,
    "base + SIMBAD A66 2026-07-15 + Stellarium v26.2",
  );
  assert.equal(second.meta.supplementAttachmentPositionConflicts, 1);
  assert.deepEqual(second.meta.catalogueGroups, [
    "abell-pn",
    "ldn",
    "openngc",
  ]);
  assert.equal(second.meta.supplements.length, 2);
});
