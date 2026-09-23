import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import westernConstellations from "../data/western-constellations.json" with { type: "json" };
import { clipConstellationSegment, compileConstellationSegments } from "../src/core/constellations.js";

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
      assert.ok(point.raDeg >= 0 && point.raDeg < 360);
      assert.ok(point.decDeg >= -90 && point.decDeg <= 90);
      assert.equal(point.frame, "ICRS");
    }
});

test("standalone and package constellation assets contain identical figures", async () => {
  const script = await readFile(new URL("../western-constellations.js", import.meta.url), "utf8");
  const payload = JSON.parse(script.slice(script.indexOf("=") + 1).trim().replace(/;$/, ""));
  assert.deepEqual(payload, westernConstellations);
});

test("constellation segments remain visible up to the horizon", () => {
  const west = { raDeg: 350, decDeg: -10, frame: "ICRS" };
  const east = { raDeg: 10, decDeg: 10, frame: "ICRS" };
  const above = ({ decDeg }) => decDeg >= 0;
  const visible = clipConstellationSegment(west, east, above);
  assert.ok(visible);
  assert.equal(visible[1], east);
  assert.ok(visible[0].decDeg >= 0 && visible[0].decDeg < 0.01);
  assert.ok(visible[0].raDeg < 0.01 || visible[0].raDeg > 359.99);
  assert.deepEqual(clipConstellationSegment(east, west, above).map(({ raDeg }) => raDeg), [east.raDeg, visible[0].raDeg]);
  assert.deepEqual(clipConstellationSegment(east, east, above), [east, east]);
  assert.equal(clipConstellationSegment(west, west, above), null);
});
