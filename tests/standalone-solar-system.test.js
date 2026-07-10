import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { getSolarSystemObjects } from "../src/index.js";

test("standalone solar-system adapter matches the embeddable engine", () => {
  const context = { console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync("vendor/astronomy-engine-2.1.19.min.js", "utf8"),
    context,
  );
  vm.runInContext(
    fs.readFileSync("solar-system-standalone.js", "utf8"),
    context,
  );

  const timestampUtcMs = Date.parse("2024-02-29T00:00:00Z");
  const observer = {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 40,
  };
  const standalone = context.CelestiaAtlasSolarSystem.getObjects(
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
