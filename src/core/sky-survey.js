import {
  horizonAltitudeAtAzimuth,
  transformEquatorialVectorFrame,
  validateEquatorialCoordinates,
} from "./coordinates.js";
import {
  createEquatorialRayGeometry,
  equatorialRayGeometryToHorizontal,
  sampleTileBilinear,
} from "./landscape.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const HALF_PI = Math.PI / 2;
const HIPS_BASE_CELL_RESOLUTION_DEG = Math.sqrt(Math.PI / 3) * RAD;
const MAX_SAFE_HIPS_ORDER = 24;
const SUPPORTED_FORMATS = new Set(["jpg", "png", "webp"]);
const FRAME_ALIASES = new Map([
  ["equatorial", "ICRS"],
  ["icrs", "ICRS"],
  ["j2000", "ICRS"],
  ["galactic", "GALACTIC"],
]);

function isPowerOfTwo(value) {
  return (
    Number.isInteger(value) && value > 0 && Number.isInteger(Math.log2(value))
  );
}

function positiveModulo(value, modulus) {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

function validateOrder(order, label = "HiPS order") {
  if (!Number.isInteger(order) || order < 0 || order > MAX_SAFE_HIPS_ORDER)
    throw new RangeError(
      `${label} must be an integer between 0 and ${MAX_SAFE_HIPS_ORDER}`,
    );
  return order;
}

function normalizeFormat(value) {
  const format = String(value ?? "jpg")
    .trim()
    .toLowerCase()
    .replace(/^jpeg$/, "jpg");
  if (!SUPPORTED_FORMATS.has(format))
    throw new TypeError("Sky survey format must be jpg, png, or webp");
  return format;
}

/** Validate and normalize the browser-decodable subset of an image HiPS. */
export function validateSkySurveyConfig(value) {
  if (!value || typeof value !== "object")
    throw new TypeError("Sky survey configuration must be an object");
  if (typeof value.key !== "string" || !value.key.trim())
    throw new TypeError("Sky survey key must be a non-empty string");
  if (typeof value.url !== "string" || !value.url.trim())
    throw new TypeError("Sky survey URL must be a non-empty string");

  const minOrder = value.minOrder === undefined ? 0 : value.minOrder;
  const maxOrder = value.maxOrder;
  validateOrder(minOrder, "Minimum HiPS order");
  validateOrder(maxOrder, "Maximum HiPS order");
  if (minOrder > maxOrder)
    throw new RangeError("Minimum HiPS order cannot exceed maximum HiPS order");

  const tileWidth = value.tileWidth ?? 512;
  if (!isPowerOfTwo(tileWidth) || tileWidth < 2 || tileWidth > 2048)
    throw new RangeError(
      "Sky survey tile width must be a power of two between 2 and 2048",
    );

  const frameKey = String(value.frame ?? "ICRS")
    .trim()
    .toLowerCase();
  const frame = FRAME_ALIASES.get(frameKey);
  if (!frame)
    throw new TypeError("Sky survey frame must be ICRS/equatorial or Galactic");

  const blendStartFovDeg = value.blendStartFovDeg ?? 20;
  const blendFullFovDeg = value.blendFullFovDeg ?? 10;
  if (![blendStartFovDeg, blendFullFovDeg].every(Number.isFinite))
    throw new TypeError("Survey blend fields of view must be finite");
  if (
    blendFullFovDeg < 0 ||
    blendStartFovDeg >= 180 ||
    blendStartFovDeg <= blendFullFovDeg
  )
    throw new RangeError(
      "Survey blend requires a non-negative full FOV below a start FOV under 180 degrees",
    );

  return Object.freeze({
    key: value.key.trim(),
    url: value.url.trim().replace(/\/+$/, ""),
    frame,
    minOrder,
    maxOrder,
    tileWidth,
    format: normalizeFormat(value.format),
    blendStartFovDeg,
    blendFullFovDeg,
  });
}

export function skySurveyPixelAngularSizeDeg(order, tileWidth = 512) {
  validateOrder(order);
  if (!isPowerOfTwo(tileWidth) || tileWidth < 2 || tileWidth > 2048)
    throw new RangeError(
      "Sky survey tile width must be a power of two between 2 and 2048",
    );
  return HIPS_BASE_CELL_RESOLUTION_DEG / (tileWidth * 2 ** order);
}

/** Smoothly replace the wide-field background as a real survey becomes useful. */
export function skySurveyBlendOpacity(
  fovDeg,
  startFovDeg = 20,
  fullFovDeg = 10,
) {
  if (![fovDeg, startFovDeg, fullFovDeg].every(Number.isFinite))
    throw new TypeError("Survey blend fields of view must be finite");
  if (fullFovDeg < 0 || startFovDeg <= fullFovDeg)
    throw new RangeError(
      "Survey blend requires a non-negative full FOV below the start FOV",
    );
  const progress = Math.max(
    0,
    Math.min(1, (startFovDeg - fovDeg) / (startFovDeg - fullFovDeg)),
  );
  return progress * progress * (3 - 2 * progress);
}

/** Select the first order whose survey pixel is no larger than a view pixel. */
export function selectSkySurveyOrder(surveyValue, fovDeg, viewportWidthPixels) {
  const survey = validateSkySurveyConfig(surveyValue);
  if (!Number.isFinite(fovDeg) || fovDeg <= 0 || fovDeg >= 180)
    throw new RangeError("Survey field of view must be in (0, 180) degrees");
  if (!Number.isFinite(viewportWidthPixels) || viewportWidthPixels <= 0)
    throw new RangeError("Survey viewport width must be positive and finite");

  const planeStep = (2 * Math.tan((fovDeg * DEG) / 2)) / viewportWidthPixels;
  const viewPixelDeg = Math.atan(planeStep) * RAD;
  const exactOrder = Math.log2(
    HIPS_BASE_CELL_RESOLUTION_DEG /
      (survey.tileWidth * Math.max(Number.EPSILON, viewPixelDeg)),
  );
  // Remove floating-point noise when the requested scale lies exactly on an
  // order boundary, then choose the finer order for all other fractional cases.
  const selected = Math.ceil(exactOrder - 1e-12);
  return Math.max(survey.minOrder, Math.min(survey.maxOrder, selected));
}

function interleaveNestedCoordinates(xValue, yValue, order) {
  let x = xValue;
  let y = yValue;
  let result = 0;
  let place = 1;
  for (let bit = 0; bit < order; bit += 1) {
    result += (x % 2) * place;
    result += (y % 2) * place * 2;
    x = Math.floor(x / 2);
    y = Math.floor(y / 2);
    place *= 4;
  }
  return result;
}

function vectorToNestedFacePosition(xValue, yValue, zValue, order, output) {
  const inverseLength = 1 / Math.hypot(xValue, yValue, zValue);
  const x = xValue * inverseLength;
  const y = yValue * inverseLength;
  const z = Math.max(-1, Math.min(1, zValue * inverseLength));
  const absoluteZ = Math.abs(z);
  const nside = 2 ** order;
  let longitudeQuarterTurns = Math.atan2(y, x) / HALF_PI;
  if (longitudeQuarterTurns < 0) longitudeQuarterTurns += 4;
  else if (longitudeQuarterTurns >= 4) longitudeQuarterTurns -= 4;

  let face;
  let ix;
  let iy;
  let naturalX;
  let naturalY;
  if (absoluteZ <= 2 / 3) {
    const ascendingValue = nside * (0.5 + longitudeQuarterTurns - z * 0.75);
    const descendingValue = nside * (0.5 + longitudeQuarterTurns + z * 0.75);
    const ascending = Math.floor(ascendingValue);
    const descending = Math.floor(descendingValue);
    const ascendingFace = Math.floor(ascending / nside);
    const descendingFace = Math.floor(descending / nside);
    if (ascendingFace === descendingFace)
      face = (positiveModulo(ascendingFace, 4) + 4) % 8;
    else if (ascendingFace < descendingFace)
      face = positiveModulo(ascendingFace, 4);
    else face = positiveModulo(descendingFace, 4) + 8;
    ix = positiveModulo(descending, nside);
    iy = nside - positiveModulo(ascending, nside) - 1;
    naturalX = positiveModulo(descendingValue, nside) - 0.5;
    naturalY = nside - positiveModulo(ascendingValue, nside) - 0.5;
  } else {
    const quadrant = Math.min(3, Math.floor(longitudeQuarterTurns));
    const withinQuadrant = longitudeQuarterTurns - quadrant;
    const radius = nside * Math.sqrt(3 * (1 - absoluteZ));
    const ascendingValue = withinQuadrant * radius;
    const descendingValue = (1 - withinQuadrant) * radius;
    const ascending = Math.min(nside - 1, Math.floor(ascendingValue));
    const descending = Math.min(nside - 1, Math.floor(descendingValue));
    if (z >= 0) {
      face = quadrant;
      ix = nside - descending - 1;
      iy = nside - ascending - 1;
      naturalX = nside - descendingValue - 0.5;
      naturalY = nside - ascendingValue - 0.5;
    } else {
      face = quadrant + 8;
      ix = ascending;
      iy = descending;
      naturalX = ascendingValue - 0.5;
      naturalY = descendingValue - 0.5;
    }
  }

  output.face = face;
  output.ix = Math.max(0, Math.min(nside - 1, ix));
  output.iy = Math.max(0, Math.min(nside - 1, iy));
  output.naturalX = Math.max(-0.5, Math.min(nside - 0.5, naturalX));
  output.naturalY = Math.max(-0.5, Math.min(nside - 0.5, naturalY));
  return output;
}

function equatorialVectorToSurveyFrame(
  x,
  y,
  z,
  inputFrame,
  surveyFrame,
  output,
) {
  const input = { x, y, z };
  if (surveyFrame === "GALACTIC") {
    const j2000 = transformEquatorialVectorFrame(input, inputFrame, "J2000");
    output.x =
      -0.0548755604 * j2000.x - 0.8734370902 * j2000.y - 0.4838350155 * j2000.z;
    output.y =
      0.4941094279 * j2000.x - 0.44482963 * j2000.y + 0.7469822445 * j2000.z;
    output.z =
      -0.867666149 * j2000.x - 0.1980763734 * j2000.y + 0.4559837762 * j2000.z;
  } else
    Object.assign(
      output,
      transformEquatorialVectorFrame(input, inputFrame, "ICRS"),
    );
  return output;
}

function mapSurveyFrameVector(survey, order, x, y, z, output) {
  const shiftOrder = Math.log2(survey.tileWidth);
  vectorToNestedFacePosition(x, y, z, order + shiftOrder, output);
  const tileX = Math.floor(output.ix / survey.tileWidth);
  const tileY = Math.floor(output.iy / survey.tileWidth);
  const tileIndex =
    output.face * 4 ** order + interleaveNestedCoordinates(tileX, tileY, order);
  output.tileIndex = tileIndex;
  output.tileX = tileX;
  output.tileY = tileY;
  // HiPS raster tiles apply the HEALPix `uv_swap`: nested y is the image
  // column and nested x is the top-to-bottom image row. This is neither an
  // ordinary Cartesian x/y layout nor a JPEG-style vertical flip. The swap is
  // required for neighboring Npix tiles to join continuously.
  output.pixelColumn = output.iy % survey.tileWidth;
  output.pixelRow = output.ix % survey.tileWidth;
  output.pixelX = Math.max(
    0,
    Math.min(survey.tileWidth - 1, output.naturalY - tileY * survey.tileWidth),
  );
  output.pixelY = Math.max(
    0,
    Math.min(survey.tileWidth - 1, output.naturalX - tileX * survey.tileWidth),
  );
  return output;
}

function mapSurveyVector(survey, order, x, y, z, inputFrame, output, scratch) {
  equatorialVectorToSurveyFrame(x, y, z, inputFrame, survey.frame, scratch);
  return mapSurveyFrameVector(
    survey,
    order,
    scratch.x,
    scratch.y,
    scratch.z,
    output,
  );
}

/** Map an equatorial direction to its NESTED HiPS tile and browser pixel. */
export function equatorialToHipsTile(coordinates, surveyValue, order) {
  const survey = validateSkySurveyConfig(surveyValue);
  validateOrder(order);
  if (order < survey.minOrder || order > survey.maxOrder)
    throw new RangeError("Requested HiPS order is outside the survey range");
  const equatorial = validateEquatorialCoordinates(coordinates);
  const ra = equatorial.raDeg * DEG;
  const dec = equatorial.decDeg * DEG;
  const cosDec = Math.cos(dec);
  return mapSurveyVector(
    survey,
    order,
    cosDec * Math.cos(ra),
    cosDec * Math.sin(ra),
    Math.sin(dec),
    equatorial.frame,
    {},
    {},
  );
}

export function skySurveyTileKey(order, tileIndex) {
  validateOrder(order);
  if (
    !Number.isSafeInteger(tileIndex) ||
    tileIndex < 0 ||
    tileIndex >= 12 * 4 ** order
  )
    throw new RangeError("HiPS tile index is outside the requested order");
  return `${order}:${tileIndex}`;
}

export function skySurveyAllskyTileKey(order, tileIndex) {
  return `allsky:${skySurveyTileKey(order, tileIndex)}`;
}

/** Reduce detail order until the complete visible field fits decoded memory. */
export function fitSkySurveyOrderToTileBudget(
  surveyValue,
  preferredOrder,
  maxDecodedTiles,
  visibleTileCountForOrder,
  { includePreview = true } = {},
) {
  const survey = validateSkySurveyConfig(surveyValue);
  validateSurveyOrder(survey, preferredOrder);
  if (!Number.isInteger(maxDecodedTiles) || maxDecodedTiles < 1)
    throw new RangeError(
      "Decoded survey tile budget must be a positive integer",
    );
  if (typeof visibleTileCountForOrder !== "function")
    throw new TypeError("Visible survey tile counter must be a function");
  for (let targetOrder = preferredOrder; ; targetOrder -= 1) {
    const previewOrder = Math.max(survey.minOrder, targetOrder - 1);
    const targetCount = visibleTileCountForOrder(targetOrder);
    const previewCount =
      !includePreview || previewOrder === targetOrder
        ? 0
        : visibleTileCountForOrder(previewOrder);
    if (
      ![targetCount, previewCount].every(
        (count) => Number.isSafeInteger(count) && count >= 0,
      )
    )
      throw new TypeError("Visible survey tile counts must be safe integers");
    const requiredTileCount = targetCount + previewCount;
    if (requiredTileCount <= maxDecodedTiles || targetOrder === survey.minOrder)
      return {
        targetOrder,
        previewOrder,
        requiredTileCount,
      };
  }
}

export function skySurveyTilePath(order, tileIndex, format = "jpg") {
  skySurveyTileKey(order, tileIndex);
  const extension = normalizeFormat(format);
  const directory = Math.floor(tileIndex / 10000) * 10000;
  return `Norder${order}/Dir${directory}/Npix${tileIndex}.${extension}`;
}

export function skySurveyTileUrl(surveyValue, order, tileIndex) {
  const survey = validateSkySurveyConfig(surveyValue);
  if (order < survey.minOrder || order > survey.maxOrder)
    throw new RangeError("Requested HiPS order is outside the survey range");
  return `${survey.url}/${skySurveyTilePath(order, tileIndex, survey.format)}`;
}

function rasterDimensions(canvasWidth, canvasHeight, outputWidth) {
  if (
    !Number.isFinite(canvasWidth) ||
    canvasWidth <= 0 ||
    !Number.isFinite(canvasHeight) ||
    canvasHeight <= 0 ||
    !Number.isFinite(outputWidth) ||
    outputWidth <= 0
  )
    throw new TypeError("Survey raster dimensions must be positive and finite");
  const width = Math.max(1, Math.round(outputWidth));
  const height = Math.max(1, Math.round((canvasHeight / canvasWidth) * width));
  return { width, height };
}

function validateSurveyOrder(survey, order) {
  validateOrder(order);
  if (order < survey.minOrder || order > survey.maxOrder)
    throw new RangeError("Requested HiPS order is outside the survey range");
}

function surveyFrameRay(equatorialRay, inputFrame, surveyFrame) {
  if (inputFrame === surveyFrame) return equatorialRay;
  const transform = ({ x, y, z }) => {
    const output = {};
    return equatorialVectorToSurveyFrame(
      x,
      y,
      z,
      inputFrame,
      surveyFrame,
      output,
    );
  };
  return {
    first: transform(equatorialRay.first),
    across: transform(equatorialRay.across),
    down: transform(equatorialRay.down),
  };
}

function samplePositions(length, step) {
  const positions = [];
  for (let value = 0; value < length; value += step) positions.push(value);
  if (positions.at(-1) !== length - 1) positions.push(length - 1);
  return positions;
}

function horizontalVectorIsVisible(east, north, up, horizon) {
  if (horizon.length < 2) return up >= 0;
  let azimuthDeg = Math.atan2(east, north) / DEG;
  if (azimuthDeg < 0) azimuthDeg += 360;
  const inverseLength = 1 / Math.hypot(east, north, up);
  const altitudeDeg =
    Math.asin(Math.max(-1, Math.min(1, up * inverseLength))) / DEG;
  return altitudeDeg >= horizonAltitudeAtAzimuth(horizon, azimuthDeg, 0);
}

/**
 * Discover every tile touched by the sampled output raster. `sampleStep=1` is
 * exact for that raster; larger values provide a bounded interaction preview.
 */
export function discoverVisibleSkySurveyTiles({
  survey: surveyValue,
  order,
  view,
  canvasWidth,
  canvasHeight,
  outputWidth = Math.min(512, canvasWidth),
  sampleStep = 1,
  observer,
  timestampUtcMs,
  hideBelowHorizon = false,
  horizon = [],
}) {
  const survey = validateSkySurveyConfig(surveyValue);
  validateSurveyOrder(survey, order);
  if (!Number.isInteger(sampleStep) || sampleStep < 1)
    throw new RangeError(
      "Survey discovery sample step must be a positive integer",
    );
  if (!Array.isArray(horizon))
    throw new TypeError("Survey horizon must be an array");
  const { width, height } = rasterDimensions(
    canvasWidth,
    canvasHeight,
    outputWidth,
  );
  const equatorialRay = createEquatorialRayGeometry({
    view,
    canvasWidth,
    canvasHeight,
    rasterWidth: width,
    rasterHeight: height,
  });
  const ray = surveyFrameRay(equatorialRay, view.center.frame, survey.frame);
  const horizontalRay = hideBelowHorizon
    ? equatorialRayGeometryToHorizontal(
        equatorialRay,
        observer,
        timestampUtcMs,
        view.center.frame,
      )
    : null;
  const mapping = {};
  const tileIndices = new Set();
  const xs = samplePositions(width, sampleStep);
  const ys = samplePositions(height, sampleStep);
  for (const y of ys) {
    for (const x of xs) {
      if (
        hideBelowHorizon &&
        !horizontalVectorIsVisible(
          horizontalRay.first.east +
            y * horizontalRay.down.east +
            x * horizontalRay.across.east,
          horizontalRay.first.north +
            y * horizontalRay.down.north +
            x * horizontalRay.across.north,
          horizontalRay.first.up +
            y * horizontalRay.down.up +
            x * horizontalRay.across.up,
          horizon,
        )
      )
        continue;
      mapSurveyFrameVector(
        survey,
        order,
        ray.first.x + y * ray.down.x + x * ray.across.x,
        ray.first.y + y * ray.down.y + x * ray.across.y,
        ray.first.z + y * ray.down.z + x * ray.across.z,
        mapping,
      );
      tileIndices.add(mapping.tileIndex);
    }
  }
  return [...tileIndices].sort((left, right) => left - right);
}

function validateTile(tile, tileWidth) {
  if (
    !tile ||
    !isPowerOfTwo(tile.width) ||
    tile.width > tileWidth ||
    tile.height !== tile.width ||
    tileWidth % tile.width !== 0 ||
    !tile.data ||
    !Number.isInteger(tile.dataWidth ?? tile.width) ||
    !Number.isInteger(tile.offsetX ?? 0) ||
    (tile.offsetX ?? 0) < 0 ||
    !Number.isInteger(tile.offsetY ?? 0) ||
    (tile.offsetY ?? 0) < 0 ||
    (tile.dataWidth ?? tile.width) < (tile.offsetX ?? 0) + tile.width ||
    tile.data.length <
      ((tile.offsetY ?? 0) + tile.height) * (tile.dataWidth ?? tile.width) * 4
  )
    throw new TypeError(
      `Survey tiles must contain a square power-of-two RGBA preview no larger than ${tileWidth} pixels`,
    );
}

function mapTile(tiles, order, tileIndex, allowNumericKey = false) {
  const keyed = tiles.get(skySurveyTileKey(order, tileIndex));
  return (
    keyed ??
    tiles.get(skySurveyAllskyTileKey(order, tileIndex)) ??
    (allowNumericKey ? tiles.get(tileIndex) : undefined)
  );
}

function parentSurveyMapping(
  mapping,
  survey,
  sourceOrder,
  parentOrder,
  output,
) {
  const factor = 2 ** (sourceOrder - parentOrder);
  const tileX = Math.floor(mapping.tileX / factor);
  const tileY = Math.floor(mapping.tileY / factor);
  const naturalX = (mapping.naturalX + 0.5) / factor - 0.5;
  const naturalY = (mapping.naturalY + 0.5) / factor - 0.5;
  output.tileIndex = Math.floor(
    mapping.tileIndex / 4 ** (sourceOrder - parentOrder),
  );
  output.pixelX = Math.max(
    0,
    Math.min(survey.tileWidth - 1, naturalY - tileY * survey.tileWidth),
  );
  output.pixelY = Math.max(
    0,
    Math.min(survey.tileWidth - 1, naturalX - tileX * survey.tileWidth),
  );
  return output;
}

const DEFAULT_SKY_SURVEY_ROWS_PER_CHUNK = 8;

function createSkySurveyRasterState({
  survey: surveyValue,
  order,
  tiles,
  view,
  observer,
  timestampUtcMs,
  canvasWidth,
  canvasHeight,
  outputWidth = Math.min(512, canvasWidth),
  fallbackMinOrder = order,
  hideBelowHorizon = false,
  horizon = [],
}) {
  const survey = validateSkySurveyConfig(surveyValue);
  validateSurveyOrder(survey, order);
  validateSurveyOrder(survey, fallbackMinOrder);
  if (fallbackMinOrder > order)
    throw new RangeError(
      "Survey fallback order cannot exceed the target order",
    );
  if (!(tiles instanceof Map))
    throw new TypeError("Survey tiles must be supplied in a Map");
  if (!Array.isArray(horizon))
    throw new TypeError("Survey horizon must be an array");
  const { width, height } = rasterDimensions(
    canvasWidth,
    canvasHeight,
    outputWidth,
  );
  const data = new Uint8ClampedArray(width * height * 4);
  const equatorialRay = createEquatorialRayGeometry({
    view,
    canvasWidth,
    canvasHeight,
    rasterWidth: width,
    rasterHeight: height,
  });
  const ray = surveyFrameRay(equatorialRay, view.center.frame, survey.frame);
  const horizontalRay = hideBelowHorizon
    ? equatorialRayGeometryToHorizontal(
        equatorialRay,
        observer,
        timestampUtcMs,
        view.center.frame,
      )
    : null;
  const mapping = {};
  const parentMapping = {};
  const usedTileIndices = new Set();
  const usedTileKeys = new Set();
  const usedOrders = new Set();
  const missingTileIndices = new Set();
  const validatedTiles = new Set();
  const keyedOrders = new Set();
  let hasNumericTileKeys = false;
  for (const key of tiles.keys()) {
    if (typeof key === "number") {
      hasNumericTileKeys = true;
      continue;
    }
    const match = /^(?:allsky:)?(\d+):\d+$/.exec(key);
    if (match) keyedOrders.add(Number(match[1]));
  }
  const fallbackOrders = [];
  for (
    let candidateOrder = order;
    candidateOrder >= fallbackMinOrder;
    candidateOrder -= 1
  )
    if (
      (candidateOrder === order && hasNumericTileKeys) ||
      keyedOrders.has(candidateOrder)
    )
      fallbackOrders.push(candidateOrder);

  return {
    survey,
    order,
    tiles,
    hideBelowHorizon,
    horizon,
    width,
    height,
    data,
    ray,
    horizontalRay,
    mapping,
    parentMapping,
    usedTileIndices,
    usedTileKeys,
    usedOrders,
    missingTileIndices,
    validatedTiles,
    fallbackOrders,
  };
}

function rasterizeSkySurveyRows(state, startRow, endRow) {
  const {
    survey,
    order,
    tiles,
    hideBelowHorizon,
    horizon,
    width,
    data,
    ray,
    horizontalRay,
    mapping,
    parentMapping,
    usedTileIndices,
    usedTileKeys,
    usedOrders,
    missingTileIndices,
    validatedTiles,
    fallbackOrders,
  } = state;

  for (let y = startRow; y < endRow; y += 1) {
    let surveyX = ray.first.x + y * ray.down.x;
    let surveyY = ray.first.y + y * ray.down.y;
    let surveyZ = ray.first.z + y * ray.down.z;
    let horizontalEast = hideBelowHorizon
      ? horizontalRay.first.east + y * horizontalRay.down.east
      : 0;
    let horizontalNorth = hideBelowHorizon
      ? horizontalRay.first.north + y * horizontalRay.down.north
      : 0;
    let horizontalUp = hideBelowHorizon
      ? horizontalRay.first.up + y * horizontalRay.down.up
      : 0;
    for (let x = 0; x < width; x += 1) {
      let visible = true;
      if (hideBelowHorizon)
        visible = horizontalVectorIsVisible(
          horizontalEast,
          horizontalNorth,
          horizontalUp,
          horizon,
        );
      if (visible) {
        mapSurveyFrameVector(survey, order, surveyX, surveyY, surveyZ, mapping);
        // Keep refinement demand separate from visible fallback coverage. A
        // cached parent may paint this pixel, but the absent target tile still
        // has to be reported so the loader can fetch it at full resolution.
        if (
          !tiles.get(skySurveyTileKey(order, mapping.tileIndex)) &&
          !tiles.get(mapping.tileIndex)
        )
          missingTileIndices.add(mapping.tileIndex);
        let sampleOrder = order;
        let sampleMapping = mapping;
        let tile = null;
        for (const candidateOrder of fallbackOrders) {
          sampleOrder = candidateOrder;
          sampleMapping =
            sampleOrder === order
              ? mapping
              : parentSurveyMapping(
                  mapping,
                  survey,
                  order,
                  sampleOrder,
                  parentMapping,
                );
          tile = mapTile(
            tiles,
            sampleOrder,
            sampleMapping.tileIndex,
            sampleOrder === order,
          );
          if (tile) break;
        }
        if (tile) {
          if (!validatedTiles.has(tile)) {
            validateTile(tile, survey.tileWidth);
            validatedTiles.add(tile);
          }
          usedTileIndices.add(sampleMapping.tileIndex);
          usedTileKeys.add(
            tile.cacheKey ??
              skySurveyTileKey(sampleOrder, sampleMapping.tileIndex),
          );
          usedOrders.add(sampleOrder);
          const sampleScale = tile.width / survey.tileWidth;
          sampleTileBilinear(
            tile.data,
            tile.width,
            Math.max(
              0,
              Math.min(
                tile.width - 1,
                (sampleMapping.pixelX + 0.5) * sampleScale - 0.5,
              ),
            ),
            Math.max(
              0,
              Math.min(
                tile.width - 1,
                (sampleMapping.pixelY + 0.5) * sampleScale - 0.5,
              ),
            ),
            data,
            (y * width + x) * 4,
            tile.dataWidth ?? tile.width,
            tile.offsetX ?? 0,
            tile.offsetY ?? 0,
          );
        }
      }
      surveyX += ray.across.x;
      surveyY += ray.across.y;
      surveyZ += ray.across.z;
      if (hideBelowHorizon) {
        horizontalEast += horizontalRay.across.east;
        horizontalNorth += horizontalRay.across.north;
        horizontalUp += horizontalRay.across.up;
      }
    }
  }
}

function finishSkySurveyRaster(state) {
  const {
    width,
    height,
    data,
    usedTileIndices,
    usedTileKeys,
    usedOrders,
    missingTileIndices,
  } = state;
  return {
    width,
    height,
    data,
    usedTileIndices: [...usedTileIndices].sort((left, right) => left - right),
    usedTileKeys: [...usedTileKeys].sort(),
    usedOrders: [...usedOrders].sort((left, right) => left - right),
    missingTileIndices: [...missingTileIndices].sort(
      (left, right) => left - right,
    ),
  };
}

function skySurveyRasterAbortError() {
  if (typeof DOMException === "function")
    return new DOMException("Sky survey rasterization cancelled", "AbortError");
  const error = new Error("Sky survey rasterization cancelled");
  error.name = "AbortError";
  return error;
}

function throwIfSkySurveyRasterCancelled(isCancelled) {
  if (isCancelled()) throw skySurveyRasterAbortError();
}

function yieldSkySurveyRasterWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Reproject loaded RGBA HiPS tiles into the viewer's exact gnomonic raster. */
export function rasterizeSkySurvey(options) {
  const state = createSkySurveyRasterState(options);
  rasterizeSkySurveyRows(state, 0, state.height);
  return finishSkySurveyRaster(state);
}

/**
 * Reproject HiPS tiles without monopolizing the browser's main event loop.
 * Cancellation rejects with an AbortError; the incomplete raster is never
 * returned to the caller.
 */
export async function rasterizeSkySurveyAsync(options) {
  const rowsPerChunk =
    options?.rowsPerChunk ?? DEFAULT_SKY_SURVEY_ROWS_PER_CHUNK;
  const isCancelled = options?.isCancelled ?? (() => false);
  if (!Number.isInteger(rowsPerChunk) || rowsPerChunk < 1)
    throw new RangeError(
      "Survey raster rows per chunk must be a positive integer",
    );
  if (typeof isCancelled !== "function")
    throw new TypeError("Survey raster cancellation check must be a function");

  const state = createSkySurveyRasterState(options);
  throwIfSkySurveyRasterCancelled(isCancelled);
  for (let startRow = 0; startRow < state.height; startRow += rowsPerChunk) {
    const endRow = Math.min(state.height, startRow + rowsPerChunk);
    rasterizeSkySurveyRows(state, startRow, endRow);
    throwIfSkySurveyRasterCancelled(isCancelled);
    if (endRow < state.height) {
      await yieldSkySurveyRasterWork();
      throwIfSkySurveyRasterCancelled(isCancelled);
    }
  }
  throwIfSkySurveyRasterCancelled(isCancelled);
  return finishSkySurveyRaster(state);
}
