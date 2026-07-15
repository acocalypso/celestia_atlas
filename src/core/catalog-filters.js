function limitingMagnitude(value, name) {
  if (!Number.isFinite(value) || value < -2 || value > 30)
    throw new TypeError(`Invalid ${name} magnitude limit`);
  return value;
}

function normalizedFacet(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizedAllowlist(value, name) {
  if (value === null || value === undefined) return null;
  if (value instanceof Set) return value;
  if (!Array.isArray(value))
    throw new TypeError(`${name} must be an array or null`);
  const normalized = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !item.trim())
      throw new TypeError(`${name} entries must be non-empty strings`);
    normalized.add(normalizedFacet(item));
  }
  return normalized;
}

/** Returns the preferred type facet used by catalogue filters. */
export function deepSkyObjectTypeKey(object) {
  return normalizedFacet(
    object?.typeCode ?? object?.type ?? object?.objectType ?? "",
  );
}

/** Returns normalized source/group facets, including legacy source fields. */
export function deepSkyCatalogueGroupKeys(object) {
  const explicitGroups = object?.catalogueGroups ?? object?.catalogGroups;
  const values = Array.isArray(explicitGroups)
    ? explicitGroups
    : [object?.catalogSource ?? object?.catalogueSource];
  return [...new Set(values.map(normalizedFacet).filter(Boolean))];
}

/** Returns true for galaxies, galaxy pairs/groups and galaxy clusters. */
export function isGalaxyObject(object) {
  const typeCode = normalizedFacet(object?.typeCode);
  if (["g", "gpair", "gtrpl", "ggroup", "gcluster"].includes(typeCode))
    return true;
  return normalizedFacet(object?.type ?? object?.objectType).includes("galaxy");
}

/**
 * Classifies catalogue records into renderer-level marker families. The
 * catalogue type code is authoritative when present; human labels provide
 * backwards compatibility for older host-supplied records.
 */
export function classifyDeepSkyObject(object) {
  const typeCode = normalizedFacet(object?.typeCode);
  if (typeCode === "drkn") return "dark-nebula";
  if (typeCode === "rfn") return "reflection-nebula";
  if (typeCode === "emn" || typeCode === "hii") return "emission-nebula";
  if (isGalaxyObject(object)) return "galaxy";
  if (typeCode === "gcl") return "globular-cluster";
  if (["ocl", "*ass"].includes(typeCode)) return "open-cluster";

  const type = normalizedFacet(object?.type ?? object?.objectType);
  if (type.includes("dark nebula") || type.includes("dark cloud"))
    return "dark-nebula";
  if (type.includes("reflection")) return "reflection-nebula";
  if (
    type.includes("emission") ||
    type.includes("h ii") ||
    type.includes("hii")
  )
    return "emission-nebula";
  if (type.includes("globular")) return "globular-cluster";
  if (type.includes("open cluster") || type.includes("association"))
    return "open-cluster";
  if (type.includes("nebula") || type.includes("remnant")) return "nebula";
  return "other";
}

/** True when the supplied marker dimensions were derived or approximated. */
export function hasApproximateCatalogShape(object) {
  const shape = object?.shape;
  const properties = object?.properties;
  return Boolean(
    shape?.approximate ??
      shape?.isApproximate ??
      shape?.derivedFromArea ??
      object?.approximateShape ??
      properties?.shapeApproximate ??
      properties?.approximateShape,
  );
}

/**
 * Returns the widest field at which an object without a published magnitude
 * remains useful. OpenNGC retains its legacy 18-degree behavior, optional
 * catalogues get a modestly wider view, and only large area-derived markers
 * are promoted farther out.
 */
export function deepSkyUnknownMagnitudeFovLimit(object) {
  if (deepSkyCatalogueGroupKeys(object).includes("openngc")) return 18;
  const shape = object?.shape ?? {};
  const extentArcmin = Math.max(
    ...[
      shape.majorArcmin,
      shape.minorArcmin,
      shape.diameterArcmin,
      object?.angularSizeArcMin?.major,
      object?.angularSizeArcMin?.minor,
      object?.major,
      object?.minor,
    ].filter(Number.isFinite),
    0,
  );
  if (hasApproximateCatalogShape(object) && extentArcmin >= 180) return 70;
  if (hasApproximateCatalogShape(object) && extentArcmin >= 60) return 45;
  return 25;
}

/**
 * Applies type and catalogue-group allowlists. A null/omitted list means all;
 * an empty list intentionally hides every object in that facet.
 */
export function passesDeepSkyCatalogFilter(
  object,
  deepSkyObjectTypes = null,
  deepSkyCatalogueGroups = null,
) {
  const types = normalizedAllowlist(deepSkyObjectTypes, "Deep-sky object types");
  const groups = normalizedAllowlist(
    deepSkyCatalogueGroups,
    "Deep-sky catalogue groups",
  );
  if (types !== null && !types.has(deepSkyObjectTypeKey(object))) return false;
  if (groups !== null) {
    const objectGroups = deepSkyCatalogueGroupKeys(object);
    if (!objectGroups.some((group) => groups.has(group))) return false;
  }
  return true;
}

/**
 * Applies the user-owned limiting magnitude for the object's DSO category.
 * Objects without a published magnitude remain eligible only when the
 * category uses the compatibility value of 30 (no user cap).
 */
export function passesDeepSkyMagnitudeFilter(
  object,
  galaxyMagnitudeLimit,
  deepSkyMagnitudeLimit,
) {
  const galaxyLimit = limitingMagnitude(galaxyMagnitudeLimit, "galaxy");
  const deepSkyLimit = limitingMagnitude(deepSkyMagnitudeLimit, "deep-sky");
  const magnitude = object?.mag ?? object?.magnitude;
  const limit = isGalaxyObject(object) ? galaxyLimit : deepSkyLimit;
  if (!Number.isFinite(magnitude)) return limit === 30;
  return magnitude <= limit;
}
