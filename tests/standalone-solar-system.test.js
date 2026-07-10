import test from "node:test";
import assert from "node:assert/strict";
import { getCometObjects, getSolarSystemObjects } from "../src/index.js";
import "../standalone-engine-bridge.js";

test("standalone solar-system adapter matches the embeddable engine", () => {
  const timestampUtcMs = Date.parse("2024-02-29T00:00:00Z");
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const standalone = globalThis.CelestiaAtlasSolarSystem.getObjects(
    timestampUtcMs,
    observer,
  );
  const embedded = getSolarSystemObjects(timestampUtcMs, observer);

  assert.equal(standalone.length, embedded.length);
  for (let index = 0; index < embedded.length; index += 1) {
    assert.equal(standalone[index].name, embedded[index].name);
    assert.ok(Math.abs(standalone[index].ra * 15 - embedded[index].raDeg) < 1e-12);
    assert.ok(Math.abs(standalone[index].dec - embedded[index].decDeg) < 1e-12);
    assert.equal(standalone[index].mag, embedded[index].magnitude);
  }
});

test("standalone comet adapter uses the embeddable comet engine", () => {
  const timestampUtcMs = Date.parse("2024-04-01T00:00:00Z");
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const standalone = globalThis.CelestiaAtlasComets.getObjects(
    timestampUtcMs,
    observer,
  );
  const embedded = getCometObjects(timestampUtcMs, observer);
  assert.equal(standalone.length, 1214);
  assert.equal(standalone[0].id, embedded[0].id);
  assert.equal(standalone[0].ra * 15, embedded[0].raDeg);
  assert.equal(standalone[0].dec, embedded[0].decDeg);
});
