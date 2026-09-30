import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeVariableStars } from "../src/core/variable-stars.js";
import { createCatalogSearchIndex, searchCatalogIndex } from "../src/core/catalog-identifiers.js";

const data = JSON.parse(readFileSync(new URL("../data/gcvs-variable-stars.json", import.meta.url)));
const stars = decodeVariableStars(data);
const index = createCatalogSearchIndex(stars);
const search = (query) => searchCatalogIndex(index, query);

test("the pinned GCVS catalogue has one positioned, searchable row per designation", () => {
  assert.equal(data.meta.sourceRows, 63473);
  assert.equal(stars.length, 63291);
  assert.equal(new Set(stars.map((star) => star.id)).size, stars.length);
  assert.ok(stars.every((star) => star.searchOnly && star.frame === "J2000"));
  assert.ok(stars.every((star) => Number.isFinite(star.raDeg) && Number.isFinite(star.decDeg)));
});

test("variable designations, GCVS IDs and matched proper names lead to GCVS metadata", () => {
  for (const [query, expectedName] of [
    ["RR Lyr", "RR Lyr"],
    ["GCVS 219015", "omi Cet"],
    ["Mira", "omi Cet"],
    ["Algol", "bet Per"],
    ["Betelgeuse", "alf Ori"],
    ["V663 Car", "V663 Car"],
  ]) {
    assert.equal(search(query)[0]?.name, expectedName, query);
  }
  const mira = search("Mira")[0];
  assert.equal(mira.variabilityType, "M");
  assert.equal(mira.periodDays, 328.8);
  assert.equal(mira.maxMagnitude, 1.9);
  assert.equal(mira.minMagnitude, 10.4);
});

test("the compact decoder rejects malformed coordinates", () => {
  assert.throws(() => decodeVariableStars({ rows: [["123456", "X", 360, 0]] }), TypeError);
  assert.deepEqual(decodeVariableStars(null), []);
});
