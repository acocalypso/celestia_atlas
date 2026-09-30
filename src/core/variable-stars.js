/** Decode the compact, separately attributed GCVS named-variable layer. */
export function decodeVariableStars(data) {
  if (data == null) return [];
  if (!Array.isArray(data.rows))
    throw new TypeError("variableStars must contain compact GCVS rows");
  return data.rows.map((row, index) => {
    if (!Array.isArray(row) || row.length < 4)
      throw new TypeError(`Invalid variable star row ${index}`);
    const [number, name, raDeg, decDeg, variabilityType,
      maximum, minimum, magnitudeBand, periodDays, aliases] = row;
    if (!/^[0-9]{6}[A-Z0-9]?$/.test(String(number)) ||
        typeof name !== "string" || !name ||
        !Number.isFinite(raDeg) || raDeg < 0 || raDeg >= 360 ||
        !Number.isFinite(decDeg) || decDeg < -90 || decDeg > 90)
      throw new TypeError(`Invalid variable star row ${index}`);
    const star = {
      id: `GCVS ${number}`,
      name,
      raDeg,
      decDeg,
      frame: "J2000",
      type: "Variable star",
      catalogueSource: "GCVS 5.1",
      catalogueId: `GCVS ${number}`,
      searchOnly: true,
    };
    if (aliases) {
      const values = Array.isArray(aliases) ? aliases : [aliases];
      star.aliases = values.filter((alias) => typeof alias === "string" && alias !== name);
    }
    if (variabilityType) star.variabilityType = variabilityType;
    if (typeof maximum === "number") star.maxMagnitude = maximum;
    else if (typeof maximum === "string") star.maxMagnitudeText = maximum;
    if (typeof minimum === "number") star.minMagnitude = minimum;
    else if (typeof minimum === "string") star.minMagnitudeText = minimum;
    if (magnitudeBand) star.magnitudeBand = magnitudeBand;
    if (Number.isFinite(periodDays) && periodDays > 0)
      star.periodDays = periodDays;
    return star;
  });
}
