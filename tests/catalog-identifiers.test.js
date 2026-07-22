import test from "node:test";
import assert from "node:assert/strict";
import {
  createCatalogSearchIndex,
  deepSkyObjectLabel,
  messierDesignation,
  normalizeCatalogIdentifier,
  searchCatalogIndex,
} from "../src/core/catalog-identifiers.js";

test("keeps Messier designations visible beside common names", () => {
  assert.equal(messierDesignation({ id: "M081" }), "M81");
  assert.equal(
    deepSkyObjectLabel({ id: "M81", name: "Bode's Galaxy" }),
    "M81 · Bode's Galaxy",
  );
  assert.equal(
    deepSkyObjectLabel({
      primaryName: "M42",
      commonName: "Great Orion Nebula",
    }),
    "M42 · Great Orion Nebula",
  );
  assert.equal(
    deepSkyObjectLabel({ id: "NGC 7000", name: "North America Nebula" }),
    "North America Nebula",
  );
});

test("normalizes case, compatibility forms, accents, spaces, and punctuation", () => {
  assert.equal(normalizeCatalogIdentifier("Sh 2-101"), "sh2101");
  assert.equal(normalizeCatalogIdentifier("ＣＡＦÉ 42"), "cafe42");
  assert.equal(normalizeCatalogIdentifier(null), "");
});

test("ranks exact, prefix, and substring catalogue matches", () => {
  const substring = { id: "X", aliases: ["Great Sh2-101 region"] };
  const prefix = { id: "Sh2-101A" };
  const exact = { id: "VII/20:101", aliases: ["Sh 2 101"] };
  const index = createCatalogSearchIndex([substring, prefix, exact]);

  assert.deepEqual(searchCatalogIndex(index, "sh2-101"), [
    exact,
    prefix,
    substring,
  ]);
});

test("indexes primary names and returns each object only once", () => {
  const object = {
    id: "LDN 123",
    primaryName: "LDN-123",
    aliases: ["LDN 123", "Barnard 7"],
  };
  const index = createCatalogSearchIndex([object]);
  assert.deepEqual(searchCatalogIndex(index, "ldn123", 20), [object]);
  assert.deepEqual(searchCatalogIndex(index, "barnard-7", 0), []);
});
