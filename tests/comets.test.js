import test from "node:test";
import assert from "node:assert/strict";
import cometCatalog from "../data/comets.js";
import { getCometObjects, propagateComet } from "../src/index.js";

const BERLIN = {
  latitudeDeg: 52.52,
  longitudeDeg: 13.405,
  elevationM: 40,
};

function angularSeparationDeg(a, b) {
  const radians = Math.PI / 180;
  const decA = a.decDeg * radians;
  const decB = b.decDeg * radians;
  const deltaRa = (a.raDeg - b.raDeg) * radians;
  return (
    Math.acos(
      Math.min(
        1,
        Math.max(
          -1,
          Math.sin(decA) * Math.sin(decB) +
            Math.cos(decA) * Math.cos(decB) * Math.cos(deltaRa),
        ),
      ),
    ) / radians
  );
}

test("packages the complete pinned MPC comet catalogue", () => {
  assert.equal(cometCatalog.meta.objectCount, 1214);
  assert.equal(
    cometCatalog.meta.sourceSha256,
    "8e7bb528fac5c5e8f0f11c72f4fa1102ee50220bab8654a4fedba1a558e68a8f",
  );
  assert.ok(cometCatalog.objects.some((object) => object.name === "1P/Halley"));
  assert.ok(
    cometCatalog.objects.some((object) => object.name === "12P/Pons-Brooks"),
  );
});

test("universal propagation handles elliptic, parabolic, and hyperbolic orbits", () => {
  for (const eccentricity of [0.5, 1, 1.5]) {
    const elements = { qAu: 0.75, eccentricity, perihelionTt: 100 };
    assert.deepEqual(propagateComet(elements, 100), {
      x: 0.75,
      y: 0,
      distanceAu: 0.75,
    });
    const before = propagateComet(elements, 50);
    const after = propagateComet(elements, 150);
    assert.ok(Math.abs(before.x - after.x) < 1e-11);
    assert.ok(Math.abs(before.y + after.y) < 1e-11);
    assert.ok(Math.abs(before.distanceAu - after.distanceAu) < 1e-11);
  }
});

test("matches a topocentric JPL Horizons 12P fixture within one arcminute", () => {
  const ponsBrooksElements = cometCatalog.objects.filter(
    (object) => object.name === "12P/Pons-Brooks",
  );
  const [ponsBrooks] = getCometObjects(
    Date.parse("2024-04-01T00:00:00Z"),
    BERLIN,
    ponsBrooksElements,
  );
  // JPL Horizons record 90000224, coord@399 Berlin, ICRF/J2000:
  // 2024-Apr-01 00:00 UTC: RA 02 09 13.75, Dec +23 03 34.9.
  const horizons = {
    raDeg: 15 * (2 + 9 / 60 + 13.75 / 3600),
    decDeg: 23 + 3 / 60 + 34.9 / 3600,
  };
  assert.ok(angularSeparationDeg(ponsBrooks, horizons) < 1 / 60);
});

test("returns searchable topocentric J2000 comet targets", () => {
  const objects = getCometObjects(
    Date.parse("2024-04-01T00:00:00Z"),
    BERLIN,
  );
  assert.equal(objects.length, cometCatalog.meta.objectCount);
  for (const object of objects.slice(0, 25)) {
    assert.equal(object.objectType, "comet");
    assert.equal(object.frame, "J2000");
    assert.ok(object.raDeg >= 0 && object.raDeg < 360);
    assert.ok(object.decDeg >= -90 && object.decDeg <= 90);
    assert.ok(object.distanceAu > 0);
  }
});
