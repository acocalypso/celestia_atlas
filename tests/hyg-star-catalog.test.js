import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const rootUrl = new URL("../", import.meta.url);

function angularDot(left, right) {
  const leftRa = (left.ra * 15 * Math.PI) / 180;
  const leftDec = (left.dec * Math.PI) / 180;
  const rightRa = (right.ra * 15 * Math.PI) / 180;
  const rightDec = (right.dec * Math.PI) / 180;
  return (
    Math.sin(leftDec) * Math.sin(rightDec) +
    Math.cos(leftDec) * Math.cos(rightDec) * Math.cos(leftRa - rightRa)
  );
}

test("generated HYG layer is complete, compact, and independently licensed", async () => {
  const [jsonText, script, fileInfo] = await Promise.all([
    readFile(new URL("data/hyg-star-catalog.json", rootUrl), "utf8"),
    readFile(new URL("hyg-star-catalog.js", rootUrl), "utf8"),
    stat(new URL("hyg-star-catalog.js", rootUrl)),
  ]);
  const payload = JSON.parse(jsonText);
  const context = vm.createContext({ window: {} });
  vm.runInContext(script, context, { filename: "hyg-star-catalog.js" });

  assert.equal(payload.meta.version, "v4.1");
  assert.equal(payload.meta.license, "CC-BY-SA-4.0");
  assert.equal(
    payload.meta.sourceSha256,
    "d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd",
  );
  assert.equal(payload.meta.sourceRecordCount, 119_626);
  assert.equal(payload.meta.eligibleRecordCount, 8_920);
  assert.equal(payload.meta.curatedExcludedCount, 140);
  assert.equal(payload.meta.objectCount, 8_780);
  assert.equal(payload.stars.length, 8_780);
  assert.equal(context.window.HYG_STAR_DATA.length, payload.stars.length);
  assert.equal(context.window.HYG_STAR_CATALOG_META.objectCount, 8_780);
  assert.match(script, /SPDX-License-Identifier: CC-BY-SA-4\.0/);
  assert.doesNotMatch(script, /window\.STAR_DATA\s*=/);
  assert.ok(fileInfo.size < 1_500_000, `HYG browser layer is ${fileInfo.size} bytes`);

  const uids = new Set();
  const ids = new Set();
  for (const star of payload.stars) {
    assert.match(star.uid, /^hyg:\d+$/);
    assert.equal(star.catalogSource, "HYG");
    assert.ok(Number.isFinite(star.ra) && star.ra >= 0 && star.ra < 24);
    assert.ok(Number.isFinite(star.dec) && star.dec >= -90 && star.dec <= 90);
    assert.ok(Number.isFinite(star.mag) && star.mag <= 6.5);
    if (Object.hasOwn(star, "bv")) assert.ok(Number.isFinite(star.bv));
    if (star.named === true) assert.notEqual(star.name, star.id);
    else {
      assert.equal(star.name, star.id);
      assert.equal(Object.hasOwn(star, "named"), false);
    }
    assert.equal(uids.has(star.uid), false, `duplicate UID ${star.uid}`);
    assert.equal(ids.has(star.id), false, `duplicate identifier ${star.id}`);
    uids.add(star.uid);
    ids.add(star.id);
  }
  assert.ok(
    payload.stars.some(
      (star) => star.name === "Larawag" && star.named === true && star.mag === 2.29,
    ),
    "bright non-curated proper-named star is missing",
  );
});

test("generated HYG layer has no positional duplicates of curated STAR_DATA", async () => {
  const [jsonText, curatedScript] = await Promise.all([
    readFile(new URL("data/hyg-star-catalog.json", rootUrl), "utf8"),
    readFile(new URL("catalog.js", rootUrl), "utf8"),
  ]);
  const payload = JSON.parse(jsonText);
  const context = vm.createContext({ window: {} });
  vm.runInContext(curatedScript, context, { filename: "catalog.js" });
  const threshold = Math.cos((2 / 60 / 180) * Math.PI);

  for (const star of payload.stars) {
    for (const curated of context.window.STAR_DATA) {
      assert.ok(
        angularDot(star, curated) < threshold,
        `${star.uid} overlaps curated star ${curated.name}`,
      );
    }
  }
});
