function finiteCoordinate(value, label) {
  const raDeg = Number(Array.isArray(value) ? value[0] : value?.raDeg);
  const decDeg = Number(Array.isArray(value) ? value[1] : value?.decDeg);
  if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg)) {
    throw new TypeError(`${label} must contain finite ICRS coordinates`);
  }
  return Object.freeze({ raDeg, decDeg, frame: "ICRS" });
}

/** Compile native HIP paths or the legacy named-pair format for rendering. */
export function compileConstellationSegments(value, starsByName = new Map()) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.constellations) && value.vertices) {
    const vertices = new Map(
      Object.entries(value.vertices).map(([hip, coordinate]) => [
        String(hip),
        finiteCoordinate(coordinate, `HIP ${hip}`),
      ]),
    );
    return value.constellations.flatMap((constellation) => {
      if (!Array.isArray(constellation.lines)) return [];
      return constellation.lines.flatMap((path) => {
        if (!Array.isArray(path)) return [];
        const segments = [];
        for (let index = 1; index < path.length; index += 1) {
          const start = vertices.get(String(path[index - 1]));
          const end = vertices.get(String(path[index]));
          if (start && end) segments.push([start, end]);
        }
        return segments;
      });
    });
  }
  return Object.values(value).flatMap((lines) =>
    Array.isArray(lines)
      ? lines.flatMap(([startName, endName]) => {
          const start = starsByName.get(String(startName).toLocaleLowerCase());
          const end = starsByName.get(String(endName).toLocaleLowerCase());
          return start && end ? [[start, end]] : [];
        })
      : [],
  );
}
