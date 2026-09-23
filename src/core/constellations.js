function finiteCoordinate(value, label) {
  const raDeg = Number(Array.isArray(value) ? value[0] : value?.raDeg);
  const decDeg = Number(Array.isArray(value) ? value[1] : value?.decDeg);
  if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg)) {
    throw new TypeError(`${label} must contain finite ICRS coordinates`);
  }
  return Object.freeze({ raDeg, decDeg, frame: "ICRS" });
}

function pointBetween(start, end, fraction) {
  const toVector = ({ raDeg, decDeg }) => {
    const ra = (raDeg * Math.PI) / 180;
    const dec = (decDeg * Math.PI) / 180;
    return [
      Math.cos(dec) * Math.cos(ra),
      Math.cos(dec) * Math.sin(ra),
      Math.sin(dec),
    ];
  };
  const left = toVector(start);
  const right = toVector(end);
  const dot = Math.max(
    -1,
    Math.min(1, left.reduce((sum, value, index) => sum + value * right[index], 0)),
  );
  const angle = Math.acos(dot);
  const sine = Math.sin(angle);
  const leftWeight = sine > 1e-8
    ? Math.sin((1 - fraction) * angle) / sine
    : 1 - fraction;
  const rightWeight = sine > 1e-8 ? Math.sin(fraction * angle) / sine : fraction;
  const [x, y, z] = left.map(
    (value, index) => value * leftWeight + right[index] * rightWeight,
  );
  return {
    raDeg: (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360,
    decDeg: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
    frame: start.frame,
  };
}

/** Keep the visible portion of a constellation line at a geometric or custom horizon. */
export function clipConstellationSegment(start, end, isVisible) {
  const startVisible = isVisible(start);
  const endVisible = isVisible(end);
  if (startVisible && endVisible) return [start, end];
  if (!startVisible && !endVisible) return null;
  let hiddenFraction = startVisible ? 1 : 0;
  let visibleFraction = startVisible ? 0 : 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const middle = (hiddenFraction + visibleFraction) / 2;
    if (isVisible(pointBetween(start, end, middle))) visibleFraction = middle;
    else hiddenFraction = middle;
  }
  const boundary = pointBetween(start, end, visibleFraction);
  return startVisible ? [start, boundary] : [boundary, end];
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
