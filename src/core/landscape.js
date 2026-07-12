import { equatorialToHorizontal, normalizeDegrees } from "./coordinates.js";
import { unprojectEquatorial } from "./projection.js";

export function landscapeRasterWidth(cssWidth, devicePixelRatio, interactive) {
  if (
    !Number.isFinite(cssWidth) ||
    cssWidth <= 0 ||
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0
  )
    throw new TypeError(
      "Landscape raster geometry must be positive and finite",
    );
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

function horizontalToHealpixPosition(azimuthDeg, altitudeDeg, tileWidth) {
  const z = Math.sin(
    (Math.max(-90, Math.min(90, altitudeDeg)) * Math.PI) / 180,
  );
  const za = Math.abs(z);
  const tt = normalizeDegrees(-azimuthDeg) / 90;
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
  return {
    face,
    x: Math.max(0, Math.min(tileWidth - 1, x)),
    y: Math.max(0, Math.min(tileWidth - 1, y)),
  };
}

function sampleTileBilinear(tile, tileWidth, x, y, output, targetIndex) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(tileWidth - 1, x0 + 1);
  const y1 = Math.min(tileWidth - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  let sourceIndex = (y0 * tileWidth + x0) * 4;
  let sampleAlpha = (tile[sourceIndex + 3] / 255) * (1 - fx) * (1 - fy);
  alpha += sampleAlpha;
  red += tile[sourceIndex] * sampleAlpha;
  green += tile[sourceIndex + 1] * sampleAlpha;
  blue += tile[sourceIndex + 2] * sampleAlpha;
  sourceIndex = (y0 * tileWidth + x1) * 4;
  sampleAlpha = (tile[sourceIndex + 3] / 255) * fx * (1 - fy);
  alpha += sampleAlpha;
  red += tile[sourceIndex] * sampleAlpha;
  green += tile[sourceIndex + 1] * sampleAlpha;
  blue += tile[sourceIndex + 2] * sampleAlpha;
  sourceIndex = (y1 * tileWidth + x0) * 4;
  sampleAlpha = (tile[sourceIndex + 3] / 255) * (1 - fx) * fy;
  alpha += sampleAlpha;
  red += tile[sourceIndex] * sampleAlpha;
  green += tile[sourceIndex + 1] * sampleAlpha;
  blue += tile[sourceIndex + 2] * sampleAlpha;
  sourceIndex = (y1 * tileWidth + x1) * 4;
  sampleAlpha = (tile[sourceIndex + 3] / 255) * fx * fy;
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
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const equatorial = unprojectEquatorial(
        ((x + 0.5) / width) * canvasWidth,
        ((y + 0.5) / height) * canvasHeight,
        view,
        canvasWidth,
        canvasHeight,
      );
      const horizontal = equatorialToHorizontal(
        equatorial,
        observer,
        timestampUtcMs,
      );
      const source = horizontalToHealpixPosition(
        horizontal.azimuthDeg,
        horizontal.altitudeDeg,
        tileWidth,
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
    }
  }
  return { width, height, data };
}
