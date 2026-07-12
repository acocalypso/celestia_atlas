const RADIANS_TO_DEGREES = 180 / Math.PI;
const RADIANS_TO_ARCSECONDS = RADIANS_TO_DEGREES * 3600;

function requirePositiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${label} must be a finite positive number`);
  return value;
}

function requirePositiveInteger(value, label) {
  requirePositiveFinite(value, label);
  if (!Number.isInteger(value))
    throw new RangeError(`${label} must be a positive integer`);
  return value;
}

/**
 * Derive a rectangular camera field of view from physical imaging-train data.
 * Sensor dimensions are pixel counts, pixel size is microns, and telescope
 * dimensions are millimetres. Aperture affects focal ratio, not angular FOV.
 */
export function calculateCameraFieldOfView({
  sensorWidthPx,
  sensorHeightPx,
  pixelSizeMicrons,
  focalLengthMm,
  apertureMm,
}) {
  requirePositiveInteger(sensorWidthPx, "Sensor width");
  requirePositiveInteger(sensorHeightPx, "Sensor height");
  requirePositiveFinite(pixelSizeMicrons, "Pixel size");
  requirePositiveFinite(focalLengthMm, "Focal length");
  if (apertureMm !== undefined && apertureMm !== null)
    requirePositiveFinite(apertureMm, "Aperture");

  const pixelSizeMm = pixelSizeMicrons / 1000;
  const sensorWidthMm = sensorWidthPx * pixelSizeMm;
  const sensorHeightMm = sensorHeightPx * pixelSizeMm;
  const sensorDiagonalMm = Math.hypot(sensorWidthMm, sensorHeightMm);
  const angularExtent = (sizeMm) =>
    2 * Math.atan(sizeMm / (2 * focalLengthMm)) * RADIANS_TO_DEGREES;

  return {
    sensorWidthMm,
    sensorHeightMm,
    widthDeg: angularExtent(sensorWidthMm),
    heightDeg: angularExtent(sensorHeightMm),
    diagonalDeg: angularExtent(sensorDiagonalMm),
    pixelScaleArcsecPerPixel:
      2 * Math.atan(pixelSizeMm / (2 * focalLengthMm)) * RADIANS_TO_ARCSECONDS,
    focalRatio:
      apertureMm === undefined || apertureMm === null
        ? null
        : focalLengthMm / apertureMm,
  };
}
