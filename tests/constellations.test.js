import test from "node:test";
import assert from "node:assert/strict";
import westernConstellations from "../data/western-constellations.json" with { type: "json" };
import { compileConstellationSegments } from "../src/core/constellations.js";

test("Western catalogue contains complete image-free IAU line figures", () => {
  assert.equal(westernConstellations.meta.constellationCount, 88);
  assert.equal(westernConstellations.constellations.length, 88);
  assert.equal(new Set(westernConstellations.constellations.map(({ iau }) => iau)).size, 88);
  assert.equal(Object.keys(westernConstellations.vertices).length, 691);
  assert.equal(westernConstellations.meta.segmentCount, 674);
  for (const constellation of westernConstellations.constellations) {
    assert.deepEqual(Object.keys(constellation).sort(), ["iau", "lines", "name"]);
    assert.doesNotMatch(JSON.stringify(constellation), /\.webp|illustrations\//i);
  }
});

test("landmark Western figures retain their canonical HIP paths", () => {
  const byIau = new Map(westernConstellations.constellations.map((entry) => [entry.iau, entry]));
  assert.deepEqual(byIau.get("Cas").lines, [[8886, 6686, 4427, 3179, 746]]);
  assert.ok(byIau.get("Ori").lines.some((path) => path.join() === "26727,26311,25930"));
  assert.ok(byIau.get("UMa").lines.some((path) => path.includes(67301) && path.includes(59774)));
  assert.ok(byIau.get("Cyg").lines.some((path) => path.includes(100453) && path.includes(107310)));
});

test("native paths compile to finite fixed-sky segments", () => {
  const segments = compileConstellationSegments(westernConstellations);
  assert.equal(segments.length, 674);
  for (const segment of segments)
    for (const point of segment) {
      assert.ok(Number.isFinite(point.raDeg));
      assert.ok(Number.isFinite(point.decDeg));
      assert.equal(point.frame, "ICRS");
    }
});
