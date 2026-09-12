import { normalizeCatalogIdentifier } from "./catalog-identifiers.js";

const unique = (values) => [...new Set(values.flat().filter(Boolean))];
const designations = (star) => unique([
  star.id, star.name, star.alias, star.aliases ?? [],
  ...["hd", "hip", "hyg"].map((key) =>
    Number.isSafeInteger(star[key]) && star[key] > 0 ? `${key} ${star[key]}` : ""),
]);
const identityKeys = (star) => designations(star)
  // WR component separators carry identity (WR 20-1 is not WR 201).
  // Tolerant search normalization must not become an identity-merge rule.
  .map((value) => String(value).toLowerCase().replace(/\s/g, ""))
  .filter((key) => /^hd\d+[a-z]*$|^(hip|hyg)\d+$|^wr\d[\da-z-]*$/.test(key));

export const STAR_CATALOGUE_BITS = Object.freeze({ curated: 1, hyg: 2, hd: 4, sao: 8, wr: 16 });

/** Computed once per star; catalogue visibility uses a bit test in the draw loop. */
export function starCatalogueMask(star) {
  const keys = identityKeys(star);
  let mask = !String(star.uid ?? "").startsWith("hyg:") && star.catalogSource !== "SIMBAD WR" ? 1 : 0;
  if (keys.some((key) => /^(hyg|hip)\d+$/.test(key))) mask |= 2;
  if (keys.some((key) => /^hd\d/.test(key))) mask |= 4;
  if (designations(star).some((value) => /^sao\s*\d+$/i.test(value))) mask |= 8;
  if (keys.some((key) => /^wr\d/.test(key))) mask |= 16;
  return mask;
}

/** Compose search metadata once, without modifying separately licensed inputs. */
export function composeStarCatalog({ curated = [], hyg = [], curatedCrossIds = [],
  hygSearch = [], sao = [], wr = [] } = {}) {
  const byName = new Map();
  for (const entry of curatedCrossIds) {
    if (!entry.curatedName) continue;
    const key = normalizeCatalogIdentifier(entry.curatedName);
    // Duplicate mapping keys are ambiguous; never let array order choose one.
    byName.set(key, byName.has(key) ? null : entry);
  }
  const nameCounts = new Map();
  for (const star of curated) {
    const key = normalizeCatalogIdentifier(star.name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const stars = [...curated.map((star) => {
    const key = normalizeCatalogIdentifier(star.name);
    const crossIds = nameCounts.get(key) === 1 ? byName.get(key) : null;
    return { ...star, aliases: unique([designations(star), crossIds?.aliases ?? []]),
      ...(crossIds ? { crossIdSources: unique([star.crossIdSources ?? [], "HYG"]) } : {}) };
  }), ...hyg, ...hygSearch].map((star) => ({
    ...star,
    id: star.id || star.name || star.uid,
    name: star.name || star.id || star.uid,
    aliases: designations(star),
    raDeg: Number.isFinite(star.raDeg) ? star.raDeg : star.ra * 15,
    decDeg: Number.isFinite(star.decDeg) ? star.decDeg : star.dec,
    frame: star.frame || "ICRS",
    type: star.type || "Star",
  }));
  const index = new Map();
  const indexStar = (star) => {
    for (const key of identityKeys(star)) {
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(star);
    }
  };
  stars.forEach(indexStar);
  const wrMatches = wr.map((record) => new Set(identityKeys(record)
    .flatMap((key) => [...(index.get(key) ?? [])])));
  const attachmentCounts = new Map();
  for (const matches of wrMatches) {
    for (const target of matches)
      attachmentCounts.set(target, (attachmentCounts.get(target) ?? 0) + 1);
  }
  for (const [position, record] of wr.entries()) {
    const matches = wrMatches[position];
    if (matches.size === 1 && attachmentCounts.get([...matches][0]) === 1) {
      const [target] = matches;
      target.aliases = unique([target.aliases, designations(record)]);
      target.crossIdSources = unique([target.crossIdSources ?? [], "SIMBAD WR"]);
      indexStar(target);
    } else {
      const star = { ...record, aliases: designations(record),
        searchOnly: record.searchOnly === true || !Number.isFinite(record.mag ?? record.magnitude) };
      stars.push(star);
      indexStar(star);
    }
  }
  // Preserve every published pair. Attach only when the source and target
  // identities are unambiguous, including reverse SAO-to-HD collisions.
  const saoByHd = new Map();
  const blockedHd = new Set();
  for (const entry of sao) {
    const key = Number.isSafeInteger(entry.hd) && entry.hd > 0
      ? `hd${entry.hd}` : String(entry.hdDesignation ?? "").toLowerCase().replace(/\s/g, "");
    if (!/^hd\d+[a-z]*$/.test(key)) continue;
    if (!index.has(key)) continue;
    if (entry.ambiguous) blockedHd.add(key);
    if (!saoByHd.has(key)) saoByHd.set(key, new Set());
    for (const value of entry.saos ?? [entry.sao]) {
      if (Number.isSafeInteger(value) && value > 0) saoByHd.get(key).add(value);
    }
  }
  const targetsBySao = new Map();
  for (const [hd, saos] of saoByHd) {
    const matches = index.get(hd) ?? new Set();
    for (const value of saos) {
      if (!targetsBySao.has(value)) targetsBySao.set(value, new Set());
      const targets = targetsBySao.get(value);
      if (blockedHd.has(hd) || matches.size > 1) targets.add(null);
      for (const star of matches) targets.add(star);
    }
  }
  for (const [value, targets] of targetsBySao) {
    if (targets.size !== 1 || targets.has(null)) continue;
    const [star] = targets;
    star.aliases = unique([star.aliases, `SAO ${value}`]);
    star.crossIdSources = unique([star.crossIdSources ?? [], "SIMBAD SAO"]);
  }
  return stars;
}
