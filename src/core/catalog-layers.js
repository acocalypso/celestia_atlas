// SPDX-License-Identifier: MIT

const NGC_IC_IDENTITY = /^(ngc|ic)\s*:?\s*0*(\d+)\s*([a-z]?)$/i;

function canonicalNgcIcIdentity(value) {
  const match = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .match(NGC_IC_IDENTITY);
  if (!match) return "";
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number < 1) return "";
  return `${match[1].toLowerCase()}:${number}${match[3].toLowerCase()}`;
}

function identityValues(item) {
  return [
    item?.id,
    item?.catalogId,
    item?.name,
    item?.primaryName,
    ...(Array.isArray(item?.aliases) ? item.aliases : []),
  ];
}

function withoutMergeKeys(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  if (!Object.prototype.hasOwnProperty.call(item, "mergeKeys")) return item;
  const { mergeKeys: _mergeKeys, ...copy } = item;
  return copy;
}

function equatorialPosition(item) {
  const raDeg = item?.raDeg ?? item?.coordinates?.raDeg;
  const decDeg = item?.decDeg ?? item?.coordinates?.decDeg;
  if (
    !Number.isFinite(raDeg) ||
    !Number.isFinite(decDeg) ||
    decDeg < -90 ||
    decDeg > 90
  )
    return null;
  return { raDeg, decDeg };
}

function greatCircleSeparationArcmin(left, right) {
  const radians = Math.PI / 180;
  const leftRa = left.raDeg * radians;
  const rightRa = right.raDeg * radians;
  const leftDec = left.decDeg * radians;
  const rightDec = right.decDeg * radians;
  const haversine =
    Math.sin((rightDec - leftDec) / 2) ** 2 +
    Math.cos(leftDec) *
      Math.cos(rightDec) *
      Math.sin((rightRa - leftRa) / 2) ** 2;
  return (
    (2 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, haversine))))) /
    radians *
    60
  );
}

function majorAxisArcmin(item) {
  const value = item?.shape?.majorArcmin ?? item?.major;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function positionsPermitAttachment(base, supplement) {
  const basePosition = equatorialPosition(base);
  const supplementPosition = equatorialPosition(supplement);
  // Missing geometry cannot create or reject an identity relationship.
  if (!basePosition || !supplementPosition) return true;
  const separationArcmin = greatCircleSeparationArcmin(
    basePosition,
    supplementPosition,
  );
  const footprintAllowanceArcmin =
    1.1 *
    (majorAxisArcmin(base) / 2 + majorAxisArcmin(supplement) / 2);
  return separationArcmin <= Math.max(30, footprintAllowanceArcmin);
}

function uniqueValues(values, keyFor = (value) => String(value).toLowerCase()) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const key = keyFor(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function aliasKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function sourceKey(source) {
  if (!source || typeof source !== "object") return String(source ?? "");
  const ordered = Object.keys(source)
    .sort()
    .map((key) => [key, source[key]]);
  return JSON.stringify(ordered);
}

function sourceList(item) {
  if (Array.isArray(item?.sources)) return item.sources;
  if (item?.sources) return [item.sources];
  if (!item?.catalogSource) return [];
  return [{ catalogue: item.catalogSource, identifier: item.id }];
}

function catalogueGroups(item, fallback = []) {
  const groups = item?.catalogueGroups ?? item?.catalogGroups;
  return Array.isArray(groups) && groups.length > 0 ? groups : fallback;
}

function mergeCatalogueObjects(base, supplement) {
  const merged = { ...base };

  const aliases = uniqueValues(
    [
      ...(Array.isArray(base?.aliases) ? base.aliases : []),
      supplement?.id,
      ...(Array.isArray(supplement?.aliases) ? supplement.aliases : []),
    ],
    aliasKey,
  );
  if (aliases.length > 0) merged.aliases = aliases;

  const groups = uniqueValues(
    [
      ...catalogueGroups(base, ["openngc"]),
      ...catalogueGroups(supplement),
    ],
    (value) => String(value).toLowerCase(),
  );
  if (groups.length > 0) merged.catalogueGroups = groups;

  const catalogSources = uniqueValues(
    [base?.catalogSource, supplement?.catalogSource],
    (value) => String(value).toLowerCase(),
  );
  if (catalogSources.length > 0)
    merged.catalogSource = catalogSources.join(" + ");

  const sources = uniqueValues(
    [...sourceList(base), ...sourceList(supplement)],
    sourceKey,
  );
  if (sources.length > 0) merged.sources = sources;

  if (!base?.shape && !Number.isFinite(base?.major) && supplement?.shape)
    merged.shape = supplement.shape;
  if (base?.mag == null && supplement?.mag != null)
    merged.mag = supplement.mag;

  const supplementProperties =
    supplement?.properties && typeof supplement.properties === "object"
      ? supplement.properties
      : {};
  const baseProperties =
    base?.properties && typeof base.properties === "object"
      ? base.properties
      : {};
  if (
    Object.keys(supplementProperties).length > 0 ||
    Object.keys(baseProperties).length > 0
  ) {
    merged.properties = { ...supplementProperties, ...baseProperties };
  }

  return merged;
}

function metadataGroups(baseMeta, supplementMeta) {
  const baseGroups = Array.isArray(baseMeta?.catalogueGroups)
    ? baseMeta.catalogueGroups
    : ["openngc"];
  const supplementGroups = Array.isArray(supplementMeta?.catalogueGroups)
    ? supplementMeta.catalogueGroups
    : [];
  return uniqueValues([...baseGroups, ...supplementGroups], (value) =>
    String(value).toLowerCase(),
  ).sort((left, right) =>
    String(left).localeCompare(String(right), undefined, {
      sensitivity: "base",
    }),
  );
}

function metadataVersionLabel(metadata) {
  const explicit = String(metadata?.versionLabel ?? "").trim();
  if (explicit) return explicit;
  const name = String(metadata?.name ?? "").trim();
  if (/stellarium/i.test(name)) return "Stellarium";
  return name || "Supplement";
}

/**
 * Combines a base catalogue with a separately distributed supplement.
 *
 * A supplement row is attached only when its explicit NGC/IC merge key and
 * the base catalogue form a reciprocal one-to-one match. Ambiguous and
 * unmatched rows remain independent objects. Sky position is never identity
 * evidence; after an exact reciprocal match, it can only veto an attachment
 * whose published centres and angular footprints grossly conflict. Inputs are
 * not mutated.
 */
export function combineCatalogLayers(
  baseObjects,
  supplementObjects,
  baseMeta = {},
  supplementMeta = {},
) {
  if (!Array.isArray(baseObjects))
    throw new TypeError("Base catalogue objects must be an array");
  if (!Array.isArray(supplementObjects))
    throw new TypeError("Supplement catalogue objects must be an array");

  const baseIndicesByKey = new Map();
  for (let index = 0; index < baseObjects.length; index += 1) {
    for (const value of identityValues(baseObjects[index])) {
      const key = canonicalNgcIcIdentity(value);
      if (!key) continue;
      if (!baseIndicesByKey.has(key)) baseIndicesByKey.set(key, new Set());
      baseIndicesByKey.get(key).add(index);
    }
  }

  const candidateSets = supplementObjects.map((record) => {
    const candidates = new Set();
    const mergeKeys = Array.isArray(record?.mergeKeys) ? record.mergeKeys : [];
    for (const value of mergeKeys) {
      const key = canonicalNgcIcIdentity(value);
      if (!key) continue;
      for (const index of baseIndicesByKey.get(key) ?? [])
        candidates.add(index);
    }
    return candidates;
  });

  const supplementIndicesByBase = new Map();
  for (let index = 0; index < candidateSets.length; index += 1) {
    const candidates = candidateSets[index];
    if (candidates.size !== 1) continue;
    const baseIndex = candidates.values().next().value;
    if (!supplementIndicesByBase.has(baseIndex))
      supplementIndicesByBase.set(baseIndex, []);
    supplementIndicesByBase.get(baseIndex).push(index);
  }

  const objects = baseObjects.map(withoutMergeKeys);
  let attachmentPositionConflictCount = 0;
  for (let index = 0; index < supplementObjects.length; index += 1) {
    const cleanSupplement = withoutMergeKeys(supplementObjects[index]);
    const candidates = candidateSets[index];
    const baseIndex =
      candidates.size === 1 ? candidates.values().next().value : undefined;
    const reciprocal =
      baseIndex !== undefined &&
      supplementIndicesByBase.get(baseIndex)?.length === 1;
    const positionConflict =
      reciprocal &&
      !positionsPermitAttachment(objects[baseIndex], cleanSupplement);
    if (!reciprocal || positionConflict) {
      if (positionConflict) attachmentPositionConflictCount += 1;
      objects.push(cleanSupplement);
      continue;
    }
    objects[baseIndex] = mergeCatalogueObjects(
      objects[baseIndex],
      cleanSupplement,
    );
  }

  const baseVersion = baseMeta?.version || "OpenNGC";
  const supplementVersion = supplementMeta?.version || "unknown";
  const supplementVersionLabel = metadataVersionLabel(supplementMeta);
  const existingSupplements = Array.isArray(baseMeta?.supplements)
    ? baseMeta.supplements
    : [];
  const existingPositionConflictCount = Number.isFinite(
    baseMeta?.supplementAttachmentPositionConflicts,
  )
    ? baseMeta.supplementAttachmentPositionConflicts
    : 0;
  const meta = {
    ...baseMeta,
    name: "Celestia Atlas offline DSO catalogue",
    version: `${baseVersion} + ${supplementVersionLabel} ${supplementVersion}`,
    objectCount: objects.length,
    catalogueGroups: metadataGroups(baseMeta, supplementMeta),
    supplements: [...existingSupplements, supplementMeta],
    supplementAttachmentPositionConflicts:
      existingPositionConflictCount + attachmentPositionConflictCount,
  };

  return { objects, meta };
}
