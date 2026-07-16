import {
  createEquatorialToHorizontalVectorTransform,
  horizonAltitudeAtAzimuth,
  normalizeDegrees,
  transformEquatorialVectorFrame,
  validateEquatorialCoordinates,
} from "./coordinates.js";

const DEG = Math.PI / 180;
const HALF_PI = Math.PI / 2;

export function landscapeRasterWidth(
  cssWidth,
  devicePixelRatio,
  interactive,
  coarsePointer = false,
) {
  if (
    !Number.isFinite(cssWidth) ||
    cssWidth <= 0 ||
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0
  )
    throw new TypeError(
      "Landscape raster geometry must be positive and finite",
    );
  if (coarsePointer)
    return Math.min(interactive ? 64 : 768, Math.ceil(cssWidth));
  return Math.min(
    interactive ? 384 : 1024,
    Math.ceil(cssWidth * devicePixelRatio),
  );
}

/** Maps a local spherical direction to an order-0 HiPS tile and source pixel. */
export function horizontalToHealpixPixel(
  azimuthDeg,
  altitudeDeg,
  tileWidth = 512,
) {
  if (
    !Number.isInteger(tileWidth) ||
    tileWidth < 2 ||
    tileWidth & (tileWidth - 1)
  )
    throw new TypeError("HEALPix tile width must be a power of two");
  if (!Number.isFinite(azimuthDeg) || !Number.isFinite(altitudeDeg))
    throw new TypeError("HEALPix direction must be finite");
  const z = Math.sin(
    (Math.max(-90, Math.min(90, altitudeDeg)) * Math.PI) / 180,
  );
  const za = Math.abs(z);
  // Stellarium landscape HiPS tiles are mirrored around the north/south axis
  // when rendered in the observed frame. Preserve that established dataset
  // convention: local azimuth increases eastward, while tile longitude runs
  // westward.
  const tt = normalizeDegrees(-azimuthDeg) / 90;
  let face;
  let ix;
  let iy;
  if (za <= 2 / 3) {
    const temp1 = tileWidth * (0.5 + tt);
    const temp2 = tileWidth * z * 0.75;
    const ascending = Math.floor(temp1 - temp2);
    const descending = Math.floor(temp1 + temp2);
    const ascendingFace = Math.floor(ascending / tileWidth);
    const descendingFace = Math.floor(descending / tileWidth);
    if (ascendingFace === descendingFace) face = (ascendingFace & 3) + 4;
    else if (ascendingFace < descendingFace) face = ascendingFace & 3;
    else face = (descendingFace & 3) + 8;
    ix = descending & (tileWidth - 1);
    iy = tileWidth - (ascending & (tileWidth - 1)) - 1;
  } else {
    const quadrant = Math.min(3, Math.floor(tt));
    const withinQuadrant = tt - quadrant;
    const radius = tileWidth * Math.sqrt(3 * (1 - za));
    const ascending = Math.min(
      tileWidth - 1,
      Math.floor(withinQuadrant * radius),
    );
    const descending = Math.min(
      tileWidth - 1,
      Math.floor((1 - withinQuadrant) * radius),
    );
    if (z >= 0) {
      face = quadrant;
      ix = tileWidth - descending - 1;
      iy = tileWidth - ascending - 1;
    } else {
      face = quadrant + 8;
      ix = ascending;
      iy = descending;
    }
  }
  // Stellarium's HiPS renderer swaps the nested HEALPix axes (`uv_swap`)
  // before sampling the image tile. Landscape datasets depend on that
  // convention to join continuously across face boundaries.
  return { face, x: iy, y: ix };
}

function horizontalVectorToHealpixPosition(
  east,
  north,
  up,
  inverseLength,
  tileWidth,
  output,
) {
  const z = Math.max(-1, Math.min(1, up * inverseLength));
  const za = Math.abs(z);
  let tt = -Math.atan2(east, north) / HALF_PI;
  if (tt < 0) tt += 4;
  else if (tt >= 4) tt -= 4;
  let face;
  let x;
  let y;
  if (za <= 2 / 3) {
    const ascendingValue = tileWidth * (0.5 + tt - z * 0.75);
    const descendingValue = tileWidth * (0.5 + tt + z * 0.75);
    const ascending = Math.floor(ascendingValue);
    const descending = Math.floor(descendingValue);
    const ascendingFace = Math.floor(ascending / tileWidth);
    const descendingFace = Math.floor(descending / tileWidth);
    if (ascendingFace === descendingFace) face = (ascendingFace & 3) + 4;
    else if (ascendingFace < descendingFace) face = ascendingFace & 3;
    else face = (descendingFace & 3) + 8;
    const u = ((descendingValue % tileWidth) + tileWidth) % tileWidth;
    const v =
      tileWidth - (((ascendingValue % tileWidth) + tileWidth) % tileWidth);
    x = v - 0.5;
    y = u - 0.5;
  } else {
    const quadrant = Math.min(3, Math.floor(tt));
    const withinQuadrant = tt - quadrant;
    const radius = tileWidth * Math.sqrt(3 * (1 - za));
    const ascending = withinQuadrant * radius;
    const descending = (1 - withinQuadrant) * radius;
    if (z >= 0) {
      face = quadrant;
      x = tileWidth - ascending - 0.5;
      y = tileWidth - descending - 0.5;
    } else {
      face = quadrant + 8;
      x = descending - 0.5;
      y = ascending - 0.5;
    }
  }
  output.face = face;
  output.x = Math.max(0, Math.min(tileWidth - 1, x));
  output.y = Math.max(0, Math.min(tileWidth - 1, y));
}

export function createEquatorialRayGeometry({
  view,
  canvasWidth,
  canvasHeight,
  rasterWidth,
  rasterHeight,
}) {
  const center = validateEquatorialCoordinates(view?.center);
  if (
    !Number.isFinite(view?.fovDeg) ||
    view.fovDeg <= 0 ||
    view.fovDeg >= 180 ||
    (view.rotationDeg !== undefined && !Number.isFinite(view.rotationDeg))
  )
    throw new TypeError("Raster view geometry must be finite");

  const centerRa = center.raDeg * DEG;
  const centerDec = center.decDeg * DEG;
  const sinRa = Math.sin(centerRa);
  const cosRa = Math.cos(centerRa);
  const sinDec = Math.sin(centerDec);
  const cosDec = Math.cos(centerDec);
  const centerVector = {
    x: cosDec * cosRa,
    y: cosDec * sinRa,
    z: sinDec,
  };
  const eastVector = { x: -sinRa, y: cosRa, z: 0 };
  const northVector = {
    x: -sinDec * cosRa,
    y: -sinDec * sinRa,
    z: cosDec,
  };
  const focal = canvasWidth / (2 * Math.tan((view.fovDeg * DEG) / 2));
  const rotation = (view.rotationDeg ?? 0) * DEG;
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  const screenHandedness = view.mirrorX ? -1 : 1;
  const screenX =
    (screenHandedness *
      ((0.5 / rasterWidth) * canvasWidth - canvasWidth / 2)) /
    focal;
  const screenY =
    (canvasHeight / 2 - (0.5 / rasterHeight) * canvasHeight) / focal;
  const screenXStep =
    (screenHandedness * canvasWidth) / rasterWidth / focal;
  const screenYStep = -canvasHeight / rasterHeight / focal;
  const planeX = screenX * cosRotation + screenY * sinRotation;
  const planeY = -screenX * sinRotation + screenY * cosRotation;
  const planeXAcross = screenXStep * cosRotation;
  const planeYAcross = -screenXStep * sinRotation;
  const planeXDown = screenYStep * sinRotation;
  const planeYDown = screenYStep * cosRotation;

  return {
    first: {
      x: centerVector.x + planeX * eastVector.x + planeY * northVector.x,
      y: centerVector.y + planeX * eastVector.y + planeY * northVector.y,
      z: centerVector.z + planeX * eastVector.z + planeY * northVector.z,
    },
    across: {
      x: planeXAcross * eastVector.x + planeYAcross * northVector.x,
      y: planeXAcross * eastVector.y + planeYAcross * northVector.y,
      z: planeXAcross * eastVector.z + planeYAcross * northVector.z,
    },
    down: {
      x: planeXDown * eastVector.x + planeYDown * northVector.x,
      y: planeXDown * eastVector.y + planeYDown * northVector.y,
      z: planeXDown * eastVector.z + planeYDown * northVector.z,
    },
  };
}

export function equatorialRayGeometryToHorizontal(
  equatorial,
  observer,
  timestampUtcMs,
  frame,
) {
  const transform = createEquatorialToHorizontalVectorTransform(
    observer,
    timestampUtcMs,
    frame,
  );
  return {
    first: transform(equatorial.first),
    across: transform(equatorial.across),
    down: transform(equatorial.down),
  };
}

function createHorizontalRayGeometry(options) {
  return equatorialRayGeometryToHorizontal(
    createEquatorialRayGeometry(options),
    options.observer,
    options.timestampUtcMs,
    options.view.center.frame,
  );
}

function equatorialRayGeometryToGalactic(equatorial, inputFrame) {
  const transform = (vector) => {
    // The standard Galactic rotation is defined from FK5/J2000 axes. Views
    // may instead be expressed in ICRS, so apply the same frame bias used by
    // the sky-survey mapper before rotating into Galactic coordinates.
    const { x, y, z } = transformEquatorialVectorFrame(
      vector,
      inputFrame,
      "J2000",
    );
    return {
      x: -0.0548755604 * x - 0.8734370902 * y - 0.4838350155 * z,
      y: 0.4941094279 * x - 0.44482963 * y + 0.7469822445 * z,
      z: -0.867666149 * x - 0.1980763734 * y + 0.4559837762 * z,
    };
  };
  return {
    first: transform(equatorial.first),
    across: transform(equatorial.across),
    down: transform(equatorial.down),
  };
}

export function sampleTileBilinear(
  tile,
  tileWidth,
  x,
  y,
  output,
  targetIndex,
) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(tileWidth - 1, x0 + 1);
  const y1 = Math.min(tileWidth - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const weight00 = (1 - fx) * (1 - fy);
  const weight10 = fx * (1 - fy);
  const weight01 = (1 - fx) * fy;
  const weight11 = fx * fy;
  const index00 = (y0 * tileWidth + x0) * 4;
  const index10 = (y0 * tileWidth + x1) * 4;
  const index01 = (y1 * tileWidth + x0) * 4;
  const index11 = (y1 * tileWidth + x1) * 4;
  const alpha00 = tile[index00 + 3];
  const alpha10 = tile[index10 + 3];
  const alpha01 = tile[index01 + 3];
  const alpha11 = tile[index11 + 3];
  if ((alpha00 | alpha10 | alpha01 | alpha11) === 0) return;
  if ((alpha00 & alpha10 & alpha01 & alpha11) === 255) {
    output[targetIndex] = Math.round(
      tile[index00] * weight00 +
        tile[index10] * weight10 +
        tile[index01] * weight01 +
        tile[index11] * weight11,
    );
    output[targetIndex + 1] = Math.round(
      tile[index00 + 1] * weight00 +
        tile[index10 + 1] * weight10 +
        tile[index01 + 1] * weight01 +
        tile[index11 + 1] * weight11,
    );
    output[targetIndex + 2] = Math.round(
      tile[index00 + 2] * weight00 +
        tile[index10 + 2] * weight10 +
        tile[index01 + 2] * weight01 +
        tile[index11 + 2] * weight11,
    );
    output[targetIndex + 3] = 255;
    return;
  }
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  let sourceIndex = index00;
  let sampleAlpha = (alpha00 / 255) * weight00;
  alpha += sampleAlpha;
  red += tile[sourceIndex] * sampleAlpha;
  green += tile[sourceIndex + 1] * sampleAlpha;
  blue += tile[sourceIndex + 2] * sampleAlpha;
  sourceIndex = index10;
  sampleAlpha = (alpha10 / 255) * weight10;
  alpha += sampleAlpha;
  red += tile[sourceIndex] * sampleAlpha;
  green += tile[sourceIndex + 1] * sampleAlpha;
  blue += tile[sourceIndex + 2] * sampleAlpha;
  sourceIndex = index01;
  sampleAlpha = (alpha01 / 255) * weight01;
  alpha += sampleAlpha;
  red += tile[sourceIndex] * sampleAlpha;
  green += tile[sourceIndex + 1] * sampleAlpha;
  blue += tile[sourceIndex + 2] * sampleAlpha;
  sourceIndex = index11;
  sampleAlpha = (alpha11 / 255) * weight11;
  alpha += sampleAlpha;
  red += tile[sourceIndex] * sampleAlpha;
  green += tile[sourceIndex + 1] * sampleAlpha;
  blue += tile[sourceIndex + 2] * sampleAlpha;
  output[targetIndex] = alpha ? Math.round(red / alpha) : 0;
  output[targetIndex + 1] = alpha ? Math.round(green / alpha) : 0;
  output[targetIndex + 2] = alpha ? Math.round(blue / alpha) : 0;
  output[targetIndex + 3] = Math.round(alpha * 255);
}

export function rasterizeHealpixLandscape({
  tiles,
  view,
  observer,
  timestampUtcMs,
  canvasWidth,
  canvasHeight,
  outputWidth = Math.min(512, canvasWidth),
}) {
  if (!Array.isArray(tiles) || tiles.length !== 12)
    throw new TypeError("A landscape requires twelve order-0 HEALPix tiles");
  const tileWidth = tiles[0]?.width;
  if (
    !tiles.every(
      (tile) => tile.width === tileWidth && tile.height === tileWidth,
    )
  )
    throw new TypeError("Landscape tiles must be equally sized squares");
  if (
    !Number.isFinite(canvasWidth) ||
    canvasWidth <= 0 ||
    !Number.isFinite(canvasHeight) ||
    canvasHeight <= 0 ||
    !Number.isFinite(outputWidth) ||
    outputWidth <= 0
  )
    throw new TypeError(
      "Landscape raster dimensions must be positive and finite",
    );
  const width = Math.max(1, Math.round(outputWidth));
  const height = Math.max(1, Math.round((canvasHeight / canvasWidth) * width));
  const data = new Uint8ClampedArray(width * height * 4);
  const ray = createHorizontalRayGeometry({
    view,
    observer,
    timestampUtcMs,
    canvasWidth,
    canvasHeight,
    rasterWidth: width,
    rasterHeight: height,
  });
  const source = { face: 0, x: 0, y: 0 };
  for (let y = 0; y < height; y += 1) {
    let east = ray.first.east + y * ray.down.east;
    let north = ray.first.north + y * ray.down.north;
    let up = ray.first.up + y * ray.down.up;
    for (let x = 0; x < width; x += 1) {
      const inverseLength =
        1 / Math.sqrt(east * east + north * north + up * up);
      horizontalVectorToHealpixPosition(
        east,
        north,
        up,
        inverseLength,
        tileWidth,
        source,
      );
      const targetIndex = (y * width + x) * 4;
      const tile = tiles[source.face].data;
      sampleTileBilinear(
        tile,
        tileWidth,
        source.x,
        source.y,
        data,
        targetIndex,
      );
      east += ray.across.east;
      north += ray.across.north;
      up += ray.across.up;
    }
  }
  return { width, height, data };
}

/** Projects an equirectangular Galactic panorama into the current sky view. */
export function rasterizeMilkyWayPanorama({
  panorama,
  view,
  observer,
  timestampUtcMs,
  canvasWidth,
  canvasHeight,
  outputWidth = Math.min(512, canvasWidth),
  hideBelowHorizon = true,
  horizon = [],
}) {
  const sourceWidth = panorama?.width;
  const sourceHeight = panorama?.height;
  const sourceData = panorama?.data;
  if (
    !Number.isInteger(sourceWidth) ||
    sourceWidth <= 0 ||
    !Number.isInteger(sourceHeight) ||
    sourceHeight <= 0 ||
    !sourceData ||
    sourceData.length < sourceWidth * sourceHeight * 4
  )
    throw new TypeError("Milky Way panorama must contain RGBA pixels");
  if (
    !Number.isFinite(canvasWidth) ||
    canvasWidth <= 0 ||
    !Number.isFinite(canvasHeight) ||
    canvasHeight <= 0 ||
    !Number.isFinite(outputWidth) ||
    outputWidth <= 0
  )
    throw new TypeError(
      "Milky Way raster dimensions must be positive and finite",
    );
  if (!Array.isArray(horizon))
    throw new TypeError("Milky Way horizon must be an array");

  const width = Math.max(1, Math.round(outputWidth));
  const height = Math.max(1, Math.round((canvasHeight / canvasWidth) * width));
  const data = new Uint8ClampedArray(width * height * 4);
  const equatorialRay = createEquatorialRayGeometry({
    view,
    canvasWidth,
    canvasHeight,
    rasterWidth: width,
    rasterHeight: height,
  });
  const galacticRay = equatorialRayGeometryToGalactic(
    equatorialRay,
    view.center.frame,
  );
  const horizontalRay = hideBelowHorizon
    ? equatorialRayGeometryToHorizontal(
        equatorialRay,
        observer,
        timestampUtcMs,
        view.center.frame,
      )
    : null;
  const customHorizon = hideBelowHorizon && horizon.length >= 2;
  const twoPi = Math.PI * 2;

  for (let y = 0; y < height; y += 1) {
    let equatorialX = equatorialRay.first.x + y * equatorialRay.down.x;
    let equatorialY = equatorialRay.first.y + y * equatorialRay.down.y;
    let equatorialZ = equatorialRay.first.z + y * equatorialRay.down.z;
    let galacticX = galacticRay.first.x + y * galacticRay.down.x;
    let galacticY = galacticRay.first.y + y * galacticRay.down.y;
    let galacticZ = galacticRay.first.z + y * galacticRay.down.z;
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
      const inverseLength =
        1 /
        Math.sqrt(
          equatorialX * equatorialX +
            equatorialY * equatorialY +
            equatorialZ * equatorialZ,
        );
      let visible = true;
      if (hideBelowHorizon) {
        if (customHorizon) {
          let azimuthDeg = Math.atan2(horizontalEast, horizontalNorth) / DEG;
          if (azimuthDeg < 0) azimuthDeg += 360;
          const altitudeDeg =
            Math.asin(Math.max(-1, Math.min(1, horizontalUp * inverseLength))) /
            DEG;
          visible =
            altitudeDeg >= horizonAltitudeAtAzimuth(horizon, azimuthDeg, 0);
        } else {
          visible = horizontalUp >= 0;
        }
      }
      if (visible) {
        let u = 0.5 + Math.atan2(galacticY, galacticX) / twoPi;
        u -= Math.floor(u);
        const sourceX = Math.min(sourceWidth - 1, Math.floor(u * sourceWidth));
        const sourceY = Math.max(
          0,
          Math.min(
            sourceHeight - 1,
            Math.floor(
              (0.5 -
                Math.asin(
                  Math.max(-1, Math.min(1, galacticZ * inverseLength)),
                ) /
                  Math.PI) *
                sourceHeight,
            ),
          ),
        );
        const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
        const targetIndex = (y * width + x) * 4;
        data[targetIndex] = sourceData[sourceIndex];
        data[targetIndex + 1] = sourceData[sourceIndex + 1];
        data[targetIndex + 2] = sourceData[sourceIndex + 2];
        data[targetIndex + 3] = Math.round(
          (sourceData[sourceIndex + 3] / 255) * 145,
        );
      }
      equatorialX += equatorialRay.across.x;
      equatorialY += equatorialRay.across.y;
      equatorialZ += equatorialRay.across.z;
      galacticX += galacticRay.across.x;
      galacticY += galacticRay.across.y;
      galacticZ += galacticRay.across.z;
      if (hideBelowHorizon) {
        horizontalEast += horizontalRay.across.east;
        horizontalNorth += horizontalRay.across.north;
        horizontalUp += horizontalRay.across.up;
      }
    }
  }
  return { width, height, data };
}
