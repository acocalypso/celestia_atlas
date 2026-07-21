import {
  equatorialToHorizontal,
  horizontalToEquatorial,
  normalizeDegrees,
} from "./coordinates.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function projectAngularExtent(angularExtentDeg, focalLengthPixels) {
  if (
    !Number.isFinite(angularExtentDeg) ||
    angularExtentDeg <= 0 ||
    angularExtentDeg >= 180
  )
    throw new RangeError("Angular extent must be in (0, 180) degrees");
  if (!Number.isFinite(focalLengthPixels) || focalLengthPixels <= 0)
    throw new RangeError("Projection focal length must be positive and finite");
  return 2 * focalLengthPixels * Math.tan((angularExtentDeg * DEG) / 2);
}

/**
 * Converts a camera position angle measured from celestial north into the
 * clockwise canvas rotation that aligns the camera frame's local up axis.
 */
export function cameraFrameScreenRotationDeg(
  projectionRotationDeg,
  cameraRotationDeg,
  rotationConvention,
  mirrorX = false,
) {
  if (
    !Number.isFinite(projectionRotationDeg) ||
    !Number.isFinite(cameraRotationDeg)
  )
    throw new TypeError("Projection and camera rotations must be finite");
  const northBearingDeg = mirrorX
    ? projectionRotationDeg
    : -projectionRotationDeg;
  if (rotationConvention === "clockwise-from-celestial-north")
    return northBearingDeg + cameraRotationDeg;
  if (rotationConvention === "counterclockwise-from-celestial-north")
    return northBearingDeg - cameraRotationDeg;
  throw new TypeError("Camera rotation convention is required");
}

/**
 * Converts an astronomical position angle measured from celestial north
 * through east into the canvas rotation that aligns a local +X major axis.
 */
export function celestialPositionAngleCanvasRotationDeg(
  projectionRotationDeg,
  positionAngleDeg,
  mirrorX = false,
) {
  return (
    cameraFrameScreenRotationDeg(
      projectionRotationDeg,
      positionAngleDeg,
      mirrorX
        ? "counterclockwise-from-celestial-north"
        : "clockwise-from-celestial-north",
      mirrorX,
    ) - 90
  );
}

function equatorialOffset(coordinates, distanceDeg, bearingDeg) {
  const distance = distanceDeg * DEG;
  const bearing = bearingDeg * DEG;
  const ra = coordinates.raDeg * DEG;
  const dec = coordinates.decDeg * DEG;
  const nextDec = Math.asin(
    Math.sin(dec) * Math.cos(distance) +
      Math.cos(dec) * Math.sin(distance) * Math.cos(bearing),
  );
  const nextRa =
    ra +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distance) * Math.cos(dec),
      Math.cos(distance) - Math.sin(dec) * Math.sin(nextDec),
    );
  return {
    raDeg: normalizeDegrees(nextRa * RAD),
    decDeg: nextDec * RAD,
    frame: coordinates.frame,
  };
}

/**
 * Projects the local major/minor axes of a celestial ellipse at its catalogue
 * position. The returned vectors are canvas-space semi-axes, so the footprint
 * remains attached to the object even where celestial north varies rapidly.
 */
export function projectCelestialEllipseAxes(
  coordinates,
  majorExtentDeg,
  minorExtentDeg,
  positionAngleDeg,
  view,
  width,
  height,
) {
  if (
    !Number.isFinite(majorExtentDeg) ||
    majorExtentDeg <= 0 ||
    majorExtentDeg >= 180 ||
    !Number.isFinite(minorExtentDeg) ||
    minorExtentDeg <= 0 ||
    minorExtentDeg >= 180 ||
    !Number.isFinite(positionAngleDeg)
  )
    throw new RangeError("Celestial ellipse geometry must be finite and positive");

  const center = projectEquatorial(coordinates, view, width, height);
  if (!center) return null;
  const projectAxis = (bearingDeg, extentDeg) => {
    const halfExtentDeg = extentDeg / 2;
    const positive = projectEquatorial(
      equatorialOffset(coordinates, halfExtentDeg, bearingDeg),
      view,
      width,
      height,
    );
    const negative = projectEquatorial(
      equatorialOffset(coordinates, halfExtentDeg, bearingDeg + 180),
      view,
      width,
      height,
    );
    if (!positive || !negative) return null;
    return {
      x: (positive.x - negative.x) / 2,
      y: (positive.y - negative.y) / 2,
    };
  };
  const majorAxis = projectAxis(positionAngleDeg, majorExtentDeg);
  const minorAxis = projectAxis(positionAngleDeg + 90, minorExtentDeg);
  if (!majorAxis || !minorAxis) return null;
  return { center, majorAxis, minorAxis };
}

export function projectEquatorial(coordinates, view, width, height) {
  const ra = coordinates.raDeg * DEG;
  const dec = coordinates.decDeg * DEG;
  const centerRa = view.center.raDeg * DEG;
  const centerDec = view.center.decDeg * DEG;
  const deltaRa = ((ra - centerRa + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const cosDistance =
    Math.sin(centerDec) * Math.sin(dec) +
    Math.cos(centerDec) * Math.cos(dec) * Math.cos(deltaRa);
  if (cosDistance <= 0) return null;
  const xPlane = (Math.cos(dec) * Math.sin(deltaRa)) / cosDistance;
  const yPlane =
    (Math.cos(centerDec) * Math.sin(dec) -
      Math.sin(centerDec) * Math.cos(dec) * Math.cos(deltaRa)) /
    cosDistance;
  const rotation = (view.rotationDeg ?? 0) * DEG;
  const rotatedX = xPlane * Math.cos(rotation) - yPlane * Math.sin(rotation);
  const rotatedY = xPlane * Math.sin(rotation) + yPlane * Math.cos(rotation);
  const focal = width / (2 * Math.tan((view.fovDeg * DEG) / 2));
  return {
    x: width / 2 + (view.mirrorX ? -1 : 1) * focal * rotatedX,
    y: height / 2 - focal * rotatedY,
  };
}

/** Rotates an equatorial projection so local altitude is vertical on screen. */
export function alignViewToHorizon(view, observer, timestampUtcMs) {
  const horizontal = equatorialToHorizontal(
    view.center,
    observer,
    timestampUtcMs,
  );
  const towardZenith = horizontal.altitudeDeg < 89;
  const reference = horizontalToEquatorial(
    {
      azimuthDeg: horizontal.azimuthDeg,
      altitudeDeg: horizontal.altitudeDeg + (towardZenith ? 0.1 : -0.1),
    },
    observer,
    timestampUtcMs,
    view.center.frame,
  );
  const point = projectEquatorial(
    reference,
    { ...view, rotationDeg: 0, mirrorX: true },
    2,
    2,
  );
  let x = point.x - 1;
  let y = 1 - point.y;
  if (!towardZenith) {
    x = -x;
    y = -y;
  }
  return {
    ...view,
    mirrorX: true,
    rotationDeg: -Math.atan2(x, y) * RAD,
  };
}

export function unprojectEquatorial(x, y, view, width, height) {
  const centerRa = view.center.raDeg * DEG;
  const centerDec = view.center.decDeg * DEG;
  const focal = width / (2 * Math.tan((view.fovDeg * DEG) / 2));
  const rotatedX = (view.mirrorX ? -1 : 1) * (x - width / 2) / focal;
  const rotatedY = (height / 2 - y) / focal;
  const rotation = (view.rotationDeg ?? 0) * DEG;
  const xPlane = rotatedX * Math.cos(rotation) + rotatedY * Math.sin(rotation);
  const yPlane = -rotatedX * Math.sin(rotation) + rotatedY * Math.cos(rotation);
  const rho = Math.hypot(xPlane, yPlane);
  if (rho === 0) return { ...view.center };
  const angularDistance = Math.atan(rho);
  const sinC = Math.sin(angularDistance);
  const cosC = Math.cos(angularDistance);
  const dec = Math.asin(
    cosC * Math.sin(centerDec) + (yPlane * sinC * Math.cos(centerDec)) / rho,
  );
  const ra =
    centerRa +
    Math.atan2(
      xPlane * sinC,
      rho * Math.cos(centerDec) * cosC - yPlane * Math.sin(centerDec) * sinC,
    );
  return {
    raDeg: normalizeDegrees(ra / DEG),
    decDeg: dec / DEG,
    frame: view.center.frame,
  };
}
