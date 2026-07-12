import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("packages a compact degree-based catalogue for embedded viewers", async () => {
  const [sourceText, viewerText] = await Promise.all([
    readFile(new URL("../data/openngc-catalog.json", import.meta.url), "utf8"),
    readFile(
      new URL("../data/openngc-viewer-catalog.json", import.meta.url),
      "utf8",
    ),
  ]);
  const viewer = JSON.parse(viewerText);
  assert.equal(viewer.meta.objectCount, 12578);
  assert.equal(viewer.meta.coordinateFrame, "ICRS");
  assert.equal(viewer.meta.rightAscensionUnit, "degrees");
  assert.ok(viewerText.length < sourceText.length * 0.55);
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
  assert.ok(Math.abs(andromeda.raDeg - 10.684791) < 1e-12);
  assert.equal(andromeda.decDeg, 41.2690556);
});
