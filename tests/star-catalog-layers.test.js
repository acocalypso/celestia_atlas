import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { composeStarCatalog, STAR_CATALOGUE_BITS, starCatalogueMask } from "../src/core/star-catalog-layers.js";
import { createCatalogSearchIndex, searchCatalogIndex } from "../src/core/catalog-identifiers.js";

const sirius = { name: "Sirius", ra: 6.7525, dec: -16.7161, mag: -1.46 };
const crossIds = { curatedName: "Sirius", aliases: ["HD 48915", "HIP 32349", "HYG 32263"] };
const wr = { uid: "simbad-wr:42", id: "WR 104", name: "WR 104", aliases: ["HD 164270"],
  raDeg: 273, decDeg: -23, frame: "ICRS", searchOnly: true };
const search = (stars, query) => searchCatalogIndex(createCatalogSearchIndex(stars), query);

test("stellar visibility groups retain overlapping catalogue identities", () => {
  const bits = STAR_CATALOGUE_BITS;
  const [target] = composeStarCatalog({ curated: [sirius], curatedCrossIds: [crossIds],
    sao: [{ hd: 48915, saos: [151881] }] });
  assert.equal(starCatalogueMask(target), bits.curated | bits.hyg | bits.hd | bits.sao);
  assert.equal(starCatalogueMask({ uid: "hyg:1", id: "HIP 1", hd: 2 }), bits.hyg | bits.hd);
  assert.equal(starCatalogueMask({ ...wr, catalogSource: "SIMBAD WR" }), bits.wr | bits.hd);
  assert.equal(starCatalogueMask({ ...wr, catalogSource: "SIMBAD WR", aliases: [] }), bits.wr);
});

test("cross-identifiers find one curated target after reordering without mutating source layers", () => {
  const options = { curated: [{ name: "Other", ra: 0, dec: 0 }, sirius],
    curatedCrossIds: [crossIds], sao: [{ hd: 48915, saos: [151881, 151882] }], wr: [wr] };
  const before = structuredClone(options);
  const stars = composeStarCatalog(options);
  for (const query of ["HD 48915", "HD48915", "hd-48915", "SAO 151881", "SAO151881", "sao.151881",
    "SAO 151882", "HIP 32349", "HIP32349", "Sirius"]) {
    assert.deepEqual(search(stars, query).map((star) => star.name), ["Sirius"], query);
  }
  const [target] = search(stars, "WR 104");
  assert.equal(target.id, "WR 104");
  assert.equal(search(stars, "wr-104")[0], target);
  assert.ok(Number.isFinite(target.raDeg) && Number.isFinite(target.decDeg));
  assert.equal(target.searchOnly, true);
  assert.equal(target.mag, undefined);
  assert.deepEqual(options, before);
});

test("WR merges only a unique exact catalogue identity; positions never create a match", () => {
  const hyg = { id: "HIP 1", name: "Example", hd: 164270, ra: 18.2, dec: -23, mag: 5 };
  const stars = composeStarCatalog({ hyg: [hyg], wr: [wr] });
  assert.equal(stars.length, 1);
  assert.equal(search(stars, "WR104")[0].mag, 5);
  assert.deepEqual(stars[0].crossIdSources, ["SIMBAD WR"]);
  assert.equal(composeStarCatalog({ hyg: [{ ...hyg, hd: 99 }], wr: [wr] }).length, 2);
  assert.equal(composeStarCatalog({ hyg: [hyg, { ...hyg, id: "HIP 2" }], wr: [wr] }).length, 3);
  assert.equal(composeStarCatalog({ hyg: [hyg], wr: [wr, { ...wr, uid: "simbad-wr:43", id: "WR 105" }] }).length, 3);
  assert.equal(composeStarCatalog({ hyg: [{ ...hyg, hd: 99, id: "WR 201" }],
    wr: [{ ...wr, id: "WR 20-1", name: "WR 20-1", aliases: [] }] }).length, 2);
});

test("SAO preserves multiple aliases but refuses conflicting source and target identities", () => {
  const options = { hyg: [{ id: "HIP 1", hd: 1 }, { id: "HIP 2", hd: 2 }],
    sao: [{ hd: 1, saos: [10, 11] }, { hd: 2, saos: [10] }] };
  assert.equal(search(composeStarCatalog(options), "SAO10").length, 0);
  assert.equal(search(composeStarCatalog(options), "SAO11").length, 1);
  options.sao[0].ambiguous = true;
  assert.equal(search(composeStarCatalog(options), "SAO11").length, 0);
});

test("shipped stellar layers preserve existing HIP, proper-name and generic DSO lookup", async () => {
  const context = vm.createContext({ window: {} });
  for (const file of ["catalog.js", "hyg-star-catalog.js", "sao-star-crossids.js", "wr-star-catalog.js"])
    vm.runInContext(await readFile(new URL(`../${file}`, import.meta.url), "utf8"), context);
  const data = context.window;
  const stars = composeStarCatalog({ curated: data.STAR_DATA, hyg: data.HYG_STAR_DATA,
    curatedCrossIds: data.HYG_CURATED_STAR_CROSSIDS, hygSearch: data.HYG_SEARCH_STAR_DATA,
    sao: data.SAO_STAR_CROSSIDS, wr: data.WR_STAR_DATA });
  assert.equal(search(stars, "Sirius")[0].name, "Sirius");
  const hip = data.HYG_STAR_DATA.find((star) => star.id.startsWith("HIP "));
  assert.equal(search(stars, hip.id.replaceAll(" ", ""))[0].id, hip.id);
  const dso = JSON.parse(await readFile(new URL("../data/dso-catalog.json", import.meta.url), "utf8"));
  for (const query of ["M31", "M 31", "NGC224", "NGC 224"])
    assert.ok(search([...stars, ...dso.objects], query).length > 0, query);
  for (const [file, global] of [["sao-star-crossids", "SAO_STAR_CROSSIDS"], ["wr-star-catalog", "WR_STAR_DATA"]]) {
    const payload = JSON.parse(await readFile(new URL(`../data/${file}.json`, import.meta.url), "utf8"));
    assert.deepEqual(JSON.parse(JSON.stringify(data[global])), payload.crossIds ?? payload.stars);
    assert.equal(payload.meta.objectCount, data[global].length);
  }
});
