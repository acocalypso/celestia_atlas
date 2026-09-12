import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import { composeStarCatalog } from "../src/core/star-catalog-layers.js";
import { createCatalogSearchIndex, searchCatalogIndex } from "../src/core/catalog-identifiers.js";

test("pinned stellar release contains real HD, SAO and WR targets with consistent browser assets", async () => {
  const context = vm.createContext({ window: {} });
  for (const file of ["catalog.js", "hyg-star-catalog.js", "sao-star-crossids.js", "wr-star-catalog.js"])
    vm.runInContext(await readFile(new URL(`../${file}`, import.meta.url), "utf8"), context);
  const d = context.window;
  const stars = composeStarCatalog({ curated: d.STAR_DATA, hyg: d.HYG_STAR_DATA,
    curatedCrossIds: d.HYG_CURATED_STAR_CROSSIDS, hygSearch: d.HYG_SEARCH_STAR_DATA,
    sao: d.SAO_STAR_CROSSIDS, wr: d.WR_STAR_DATA });
  const index = createCatalogSearchIndex(stars);
  for (const query of ["HD 48915", "HD48915", "hd-48915", "SAO 151881", "SAO151881", "HIP32349", "Sirius"])
    assert.deepEqual(searchCatalogIndex(index, query).map((star) => star.name), ["Sirius"], query);
  const [wr] = searchCatalogIndex(index, "WR104");
  assert.equal(wr.id, "WR 104");
  assert.equal(wr.mag, 13.155);
  assert.equal(wr.searchOnly, false);
  assert.ok(Number.isFinite(wr.raDeg) && Number.isFinite(wr.decDeg));
  assert.equal(d.WR_STAR_DATA.length, 518);
  assert.equal(d.WR_STAR_DATA.filter((star) => Number.isFinite(star.mag)).length, 230);
  assert.equal(d.HYG_STAR_DATA.filter((star) => Number.isInteger(star.hd)).length, 8758);
  assert.equal(d.SAO_STAR_CROSSIDS.length, 8850);
  assert.equal(stars.length, 9437);
  assert.ok(stars.filter((star) => !star.searchOnly).length < 9200);
  for (const star of d.WR_STAR_DATA)
    assert.equal(star.searchOnly, !Number.isFinite(star.mag));
  const hyg = JSON.parse(await readFile(new URL("../data/hyg-star-catalog.json", import.meta.url), "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(d.HYG_CURATED_STAR_CROSSIDS)), hyg.curatedCrossIds);
  assert.deepEqual(JSON.parse(JSON.stringify(d.HYG_SEARCH_STAR_DATA)), hyg.searchStars);
  for (const [meta, path] of [
    [d.SAO_STAR_CROSSIDS_META, "sao-hd-crossids-2026-09-12.tsv"],
    [d.WR_STAR_CATALOG_META, "wr-stars-vmag-2026-09-12.tsv"],
  ]) {
    const source = await readFile(new URL(`../data/sources/simbad/${path}`, import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"), meta.sourceSha256);
    assert.equal(meta.license, "ODbL-1.0");
    const query = (await readFile(new URL(`../${meta.query}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
    assert.equal(createHash("sha256").update(query).digest("hex"), meta.querySha256);
  }
});
