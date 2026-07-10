import { normalizeDegrees } from "./coordinates.js";

const DEG = Math.PI / 180;

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
  const focal = width / (2 * Math.tan((view.fovDeg * DEG) / 2));
  return { x: width / 2 + focal * xPlane, y: height / 2 - focal * yPlane };
}

export function unprojectEquatorial(x, y, view, width, height) {
  const centerRa = view.center.raDeg * DEG;
  const centerDec = view.center.decDeg * DEG;
  const focal = width / (2 * Math.tan((view.fovDeg * DEG) / 2));
  const xPlane = (x - width / 2) / focal;
  const yPlane = (height / 2 - y) / focal;
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
