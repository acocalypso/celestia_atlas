function limitingMagnitude(value, name) {
  if (!Number.isFinite(value) || value < -2 || value > 30)
    throw new TypeError(`Invalid ${name} magnitude limit`);
  return value;
}

/** Returns true for galaxies, galaxy pairs/groups and galaxy clusters. */
export function isGalaxyObject(object) {
  return String(object?.type ?? object?.objectType ?? "")
    .toLowerCase()
    .includes("galaxy");
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
