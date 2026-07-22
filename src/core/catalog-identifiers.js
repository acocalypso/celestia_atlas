/**
 * Normalizes catalogue designations for tolerant matching.
 *
 * NFKD keeps compatibility characters predictable, combining marks are
 * removed, and punctuation/spacing is ignored so, for example, `Sh2-101`,
 * `Sh 2 101`, and `sh2 101` share one search key.
 */
export function normalizeCatalogIdentifier(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const MESSIER_DESIGNATION = /^m0*(\d{1,3})$/;

/** Returns the canonical M1-M110 designation carried by a catalogue record. */
export function messierDesignation(item) {
  const values = [
    item?.id,
    item?.primaryName,
    item?.catalogId,
    item?.properties?.catalogId,
    ...(Array.isArray(item?.aliases) ? item.aliases : []),
  ];
  for (const value of values) {
    const match = normalizeCatalogIdentifier(value).match(MESSIER_DESIGNATION);
    if (!match) continue;
    const number = Number(match[1]);
    if (Number.isInteger(number) && number >= 1 && number <= 110)
      return `M${number}`;
  }
  return "";
}

/** Formats a map/detail label without hiding a Messier designation. */
export function deepSkyObjectLabel(item) {
  const designation = messierDesignation(item);
  const preferred = String(
    item?.commonName ?? item?.name ?? item?.primaryName ?? item?.id ?? "",
  ).trim();
  if (!designation) return preferred;
  if (
    !preferred ||
    normalizeCatalogIdentifier(preferred) ===
      normalizeCatalogIdentifier(designation)
  )
    return designation;
  return `${designation} · ${preferred}`;
}

function catalogSearchTerms(item) {
  const aliases = Array.isArray(item?.aliases) ? item.aliases : [];
  const values = [
    item?.primaryName,
    item?.name,
    item?.id,
    item?.uid,
    item?.catalogId,
    item?.alias,
    ...aliases,
  ];
  const seen = new Set();
  const terms = [];
  for (const value of values) {
    const normalized = normalizeCatalogIdentifier(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push(normalized);
  }
  return terms;
}

/**
 * Precomputes normalized search terms while retaining catalogue order as the
 * stable tie-breaker within each relevance tier.
 */
export function createCatalogSearchIndex(items) {
  if (!Array.isArray(items))
    throw new TypeError("Catalogue search items must be an array");
  return items.map((item) =>
    Object.freeze({ item, terms: Object.freeze(catalogSearchTerms(item)) }),
  );
}

/**
 * Returns exact matches first, then prefixes, then substring matches.
 *
 * Each catalogue entry is inspected once. Rank buckets preserve catalogue
 * order without performing three complete passes for every keystroke, which
 * keeps alias-heavy catalogues responsive on mobile devices.
 */
export function searchCatalogIndex(index, query, limit = 20) {
  if (!Array.isArray(index))
    throw new TypeError("Catalogue search index must be an array");
  if (!Number.isInteger(limit) || limit < 0)
    throw new TypeError(
      "Catalogue search limit must be a non-negative integer",
    );
  const needle = normalizeCatalogIdentifier(query);
  if (!needle || limit === 0) return [];

  const buckets = [[], [], []];
  for (const entry of index) {
    let rank = 3;
    for (const term of entry.terms) {
      if (term === needle) {
        rank = 0;
        break;
      }
      if (rank > 1 && term.startsWith(needle)) rank = 1;
      else if (rank > 2 && term.includes(needle)) rank = 2;
    }
    if (rank < 3) buckets[rank].push(entry.item);
  }
  return buckets.flat().slice(0, limit);
}
