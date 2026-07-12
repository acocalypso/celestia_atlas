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
    x: width / 2 + focal * rotatedX,
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
  const point = projectEquatorial(reference, view, 2, 2);
  let x = point.x - 1;
  let y = 1 - point.y;
  if (!towardZenith) {
    x = -x;
    y = -y;
  }
  return { ...view, rotationDeg: Math.atan2(x, y) * RAD };
}

export function unprojectEquatorial(x, y, view, width, height) {
  const centerRa = view.center.raDeg * DEG;
  const centerDec = view.center.decDeg * DEG;
  const focal = width / (2 * Math.tan((view.fovDeg * DEG) / 2));
  const rotatedX = (x - width / 2) / focal;
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
