import {
  equatorialToHorizontal,
  horizonAltitudeAtAzimuth,
  validateEquatorialCoordinates,
  horizontalToEquatorial,
  panHorizontalView,
  pinchZoomFov,
  validateObserver,
} from "./core/coordinates.js";
import {
  alignViewToHorizon,
  cameraFrameScreenRotationDeg,
  celestialPositionAngleCanvasRotationDeg,
  projectAngularExtent,
  projectEquatorial,
} from "./core/projection.js";
import {
  getJupiterMoonObjects,
  getSolarSystemObjects,
} from "./core/solar-system.js";
import { getCometObjects } from "./core/comets.js";
import {
  eclipticToEquatorial,
  galacticToEquatorial,
} from "./core/reference-lines.js";
import {
  landscapeRasterWidth,
  rasterizeHealpixLandscape,
  rasterizeMilkyWayPanorama,
} from "./core/landscape.js";
import {
  discoverVisibleSkySurveyTiles,
  rasterizeSkySurvey,
  rasterizeSkySurveyAsync,
  selectSkySurveyOrder,
  skySurveyBlendOpacity,
  skySurveyTileKey,
  skySurveyTileUrl,
  validateSkySurveyConfig,
} from "./core/sky-survey.js";
import {
  classifyDeepSkyObject,
  deepSkyCatalogueGroupKeys,
  deepSkyObjectTypeKey,
  deepSkyUnknownMagnitudeFovLimit,
  hasApproximateCatalogShape,
  isGalaxyObject,
} from "./core/catalog-filters.js";
import {
  createCatalogSearchIndex,
  normalizeCatalogIdentifier,
  searchCatalogIndex,
} from "./core/catalog-identifiers.js";

const DEG = Math.PI / 180;
const MAX_FOV_DEG = 130;
const STAR_COLOR_STOPS = [
  [-0.4, [155, 190, 255]],
  [0, [202, 218, 255]],
  [0.4, [248, 247, 255]],
  [0.8, [255, 238, 205]],
  [1.4, [255, 197, 128]],
  [2, [255, 151, 80]],
];
const DEFAULT_MILKY_WAY_URL = new URL(
  "../assets/milky-way.webp",
  import.meta.url,
).href;
// This schema version is intentionally independent from the app-shell cache.
// Core deployments must not evict valid viewed survey fields on every release.
const SKY_SURVEY_PERSISTENT_CACHE = "celestia-atlas-survey-v1";
const SKY_SURVEY_PERSISTENT_CACHE_LIMIT = 96;
export const DEFAULT_DSS_SKY_SURVEY_SOURCE = Object.freeze({
  key: "dss2-color",
  label: "DSS2 Color",
  url: "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/DSSColor",
  frame: "ICRS",
  minOrder: 0,
  maxOrder: 9,
  tileWidth: 512,
  format: "jpg",
  creditLabel:
    "Digitized Sky Survey — STScI/NASA; colored and HiPS-processed by CDS (CNRS/Unistra).",
  attribution:
    "Digitized Sky Survey — STScI/NASA; colored and HiPS-processed by CDS (CNRS/Unistra).",
  attributionUrl:
    "https://alasky.cds.unistra.fr/MocServer/query?ID=CDS%2FP%2FDSS2%2Fcolor&fmt=html&get=record",
  rightsUrl:
    "https://outerspace.stsci.edu/spaces/MASTDATA/pages/176435492/Photographic+Sky+Surveys",
});

function normalizeSkySurveySource(
  value,
  decodedTileByteBudget = Number.POSITIVE_INFINITY,
) {
  const config = validateSkySurveyConfig(value);
  if (config.tileWidth * config.tileWidth * 4 > decodedTileByteBudget)
    throw new RangeError(
      "Sky survey tile dimensions exceed this device's decoded-memory budget",
    );
  return Object.freeze({
    ...config,
    label: String(value.label ?? value.key).trim(),
    creditLabel: String(value.creditLabel ?? value.label ?? value.key).trim(),
    attribution: String(value.attribution ?? "").trim(),
    attributionUrl: String(value.attributionUrl ?? "").trim(),
    rightsUrl: String(value.rightsUrl ?? "").trim(),
  });
}

function starColorFromBv(value) {
  if (!Number.isFinite(value)) return "rgb(237 245 255)";
  const bv = Math.max(
    STAR_COLOR_STOPS[0][0],
    Math.min(STAR_COLOR_STOPS.at(-1)[0], value),
  );
  let upperIndex = STAR_COLOR_STOPS.findIndex(([stop]) => stop >= bv);
  if (upperIndex <= 0) upperIndex = 1;
  const [lowerStop, lowerColor] = STAR_COLOR_STOPS[upperIndex - 1];
  const [upperStop, upperColor] = STAR_COLOR_STOPS[upperIndex];
  const mix = (bv - lowerStop) / (upperStop - lowerStop || 1);
  const color = lowerColor.map((channel, index) =>
    Math.round(channel + (upperColor[index] - channel) * mix),
  );
  return `rgb(${color.join(" ")})`;
}

export function createCelestiaAtlasViewer(options) {
  const coarsePointer = Boolean(
    globalThis.matchMedia?.("(pointer: coarse)")?.matches,
  );
  const skySurveyDecodedByteBudget =
    (coarsePointer ? 24 : 64) * 1024 * 1024;
  const {
    container,
    catalog = [],
    stars = [],
    constellations = {},
    onSelect,
    onViewChange,
    onError,
    devicePixelRatioCap = coarsePointer ? 1.25 : 2,
    milkyWayPanoramaUrl = DEFAULT_MILKY_WAY_URL,
    skySurveySource = DEFAULT_DSS_SKY_SURVEY_SOURCE,
  } = options ?? {};
  if (!(container instanceof HTMLElement))
    throw new TypeError("container must be an HTMLElement");
  const originalContainerPosition = container.style.position;
  const positionedContainer = getComputedStyle(container).position === "static";
  if (positionedContainer) container.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.className = "celestia-atlas-canvas";
  canvas.style.cssText =
    "display:block;width:100%;height:100%;touch-action:none";
  canvas.setAttribute(
    "aria-label",
    "Interactive sky atlas with an offline catalogue and background",
  );
  container.append(canvas);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D rendering is unavailable");
  const landscapeCanvas = document.createElement("canvas");
  const landscapeContext = landscapeCanvas.getContext("2d");
  const milkyWayCanvas = document.createElement("canvas");
  const milkyWayContext = milkyWayCanvas.getContext("2d");
  const skySurveyCanvas = document.createElement("canvas");
  const skySurveyContext = skySurveyCanvas.getContext("2d");
  const surveyCredit = document.createElement("a");
  surveyCredit.className = "celestia-atlas-survey-credit";
  surveyCredit.target = "_blank";
  surveyCredit.rel = "noopener noreferrer";
  surveyCredit.hidden = true;
  surveyCredit.style.cssText =
    "position:absolute;right:max(.45rem,env(safe-area-inset-right,0px));bottom:max(.4rem,env(safe-area-inset-bottom,0px));z-index:2;display:none;max-width:min(34rem,calc(100% - 1rem));padding:.2rem .38rem;border:1px solid rgba(150,190,225,.24);border-radius:.35rem;background:rgba(3,9,17,.76);color:#a9bdd2;font:500 9px/1.25 system-ui,sans-serif;text-align:right;text-decoration:none;white-space:normal;backdrop-filter:blur(5px)";
  surveyCredit.setAttribute("aria-label", "Photographic sky survey attribution");
  container.append(surveyCredit);

  let destroyed = false;
  let paused = true;
  let renderingContextLost = false;
  let observer = validateObserver(
    options.observer ?? { latitudeDeg: 0, longitudeDeg: 0, elevationM: 0 },
  );
  let utcMs = Number.isFinite(options.utcMs) ? options.utcMs : Date.now();
  let clockSetAt = performance.now();
  let timeRate = 1;
  let view = { center: { raDeg: 0, decDeg: 0, frame: "ICRS" }, fovDeg: 70 };
  let coordinateMode = "horizontal";
  let mount = null;
  let mountFollow = false;
  let fieldOfView = null;
  let horizon = [];
  let hitTargets = [];
  let selected = null;
  let landscape = null;
  let landscapeLoadToken = 0;
  let landscapeRasterCache = { key: "", raster: null };
  let landscapeUploadKey = "";
  let milkyWay = null;
  let milkyWayRasterCache = { key: "", raster: null };
  let milkyWayUploadKey = "";
  let skySurvey =
    skySurveySource === null
      ? null
      : normalizeSkySurveySource(
          skySurveySource,
          skySurveyDecodedByteBudget,
        );
  let skySurveySourceToken = 1;
  let skySurveyRasterCache = { key: "", raster: null };
  let skySurveyUploadKey = "";
  let skySurveyRasterJob = null;
  const skySurveyTiles = new Map();
  const skySurveyPending = new Set();
  const skySurveyFailures = new Map();
  const skySurveyCacheProbeMisses = new Map();
  const skySurveyActiveRequests = new Map();
  let skySurveyQueue = [];
  let skySurveyActiveLoads = 0;
  let skySurveyWantedSignature = "";
  let skySurveyWantedRequests = new Set();
  let skySurveyDecodedBytes = 0;
  let skySurveyRuntime = {
    active: false,
    opacity: 0,
    targetOrder: null,
    renderedOrder: null,
    loadedTiles: 0,
    pendingTiles: 0,
    failedTiles: 0,
    lastError: null,
  };
  const skySurveyCacheLimit = coarsePointer ? 24 : 64;
  const skySurveyLoadConcurrency = coarsePointer ? 2 : 4;
  let skySurveyPersistentTrim = Promise.resolve();
  let display = {
    grid: true,
    azimuthalGrid: false,
    meridian: false,
    ecliptic: false,
    atmosphere: true,
    milkyWay: true,
    skySurvey: true,
    cardinals: false,
    constellations: true,
    labels: true,
    starMagnitudeLimit: 6.5,
    galaxyMagnitudeLimit: 30,
    deepSkyMagnitudeLimit: 30,
    deepSkyObjectTypes: null,
    deepSkyCatalogueGroups: null,
    starScale: 1,
    deepSkyObjects: true,
    solarSystem: true,
    comets: true,
    horizon: true,
    hideBelowHorizon: true,
    nightMode: false,
  };
  let drag = null;
  const activePointers = new Map();
  let pinch = null;
  let lowQualityUntil = 0;
  let qualityRefinementTimer = null;
  let interactionViewChangePending = false;
  let frameId = null;
  let clockTimer = null;
  let cometCache = { key: "", objects: [] };
  let solarSystemCache = { key: "", objects: [] };
  const renderStars = stars
    .map((star) => ({
      star,
      magnitude: star.mag ?? star.magnitude,
      color: starColorFromBv(star.bv ?? star.colorIndex),
    }))
    .sort((left, right) => {
      const leftMagnitude = Number.isFinite(left.magnitude)
        ? left.magnitude
        : Number.POSITIVE_INFINITY;
      const rightMagnitude = Number.isFinite(right.magnitude)
        ? right.magnitude
        : Number.POSITIVE_INFINITY;
      return leftMagnitude - rightMagnitude;
    });
  const searchableObjects = [...stars, ...catalog];
  const searchableObjectIndex = createCatalogSearchIndex(searchableObjects);
  const galaxyCatalogFlags = Uint8Array.from(catalog, (object) =>
    isGalaxyObject(object) ? 1 : 0,
  );
  const catalogTypeKeys = catalog.map(deepSkyObjectTypeKey);
  const catalogGroupKeys = catalog.map(deepSkyCatalogueGroupKeys);
  const catalogVisualKinds = catalog.map(classifyDeepSkyObject);
  const catalogApproximateShapeFlags = Uint8Array.from(catalog, (object) =>
    hasApproximateCatalogShape(object) ? 1 : 0,
  );
  const catalogUnknownMagnitudeFovLimits = Float32Array.from(
    catalog,
    deepSkyUnknownMagnitudeFovLimit,
  );
  let deepSkyObjectTypeAllowlist = null;
  let deepSkyCatalogueGroupAllowlist = null;
  const objectIdentity = (object) => object?.uid ?? object?.id;
  const starIdentityKeys = new Set(
    stars.map(objectIdentity).filter((value) => value !== undefined),
  );
  const hasSameObjectIdentity = (left, right) => {
    if (!left || !right) return false;
    if (left.uid != null && right.uid != null) return left.uid === right.uid;
    return left.id != null && right.id != null && left.id === right.id;
  };
  const isSelectedObject = (object) =>
    hasSameObjectIdentity(selected, object);
  const starsByName = new Map();
  for (const star of stars) {
    starsByName.set(String(star.name).toLocaleLowerCase(), star);
    for (const alias of [
      ...(Array.isArray(star.aliases) ? star.aliases : []),
      star.alias,
    ]) {
      if (alias) starsByName.set(String(alias).toLocaleLowerCase(), star);
    }
  }

  const selectedTargetPayload = (object) => {
    const suppliedCoordinates = object?.coordinates;
    const coordinates = validateEquatorialCoordinates(
      suppliedCoordinates &&
        Number.isFinite(suppliedCoordinates.raDeg) &&
        Number.isFinite(suppliedCoordinates.decDeg)
        ? {
            ...suppliedCoordinates,
            frame: suppliedCoordinates.frame || object?.frame || "ICRS",
          }
        : {
            raDeg: object?.raDeg,
            decDeg: object?.decDeg,
            frame: object?.frame || "ICRS",
          },
    );
    return {
      ...object,
      name: object?.name ?? object?.primaryName ?? object?.id ?? "",
      objectType: object?.objectType ?? object?.type,
      magnitude: object?.magnitude ?? object?.mag,
      catalogueSource: object?.catalogueSource ?? object?.catalogSource,
      coordinates,
    };
  };

  const assertAlive = () => {
    if (destroyed) throw new Error("Celestia Atlas viewer has been destroyed");
  };
  const cancelActiveInteraction = () => {
    for (const pointerId of activePointers.keys()) {
      try {
        if (canvas.hasPointerCapture?.(pointerId))
          canvas.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already be gone during lifecycle interruption.
      }
    }
    activePointers.clear();
    pinch = null;
    drag = null;
  };
  const currentUtcMs = () =>
    utcMs + (performance.now() - clockSetAt) * timeRate;
  const currentComets = () => {
    const timestamp = currentUtcMs();
    const key = `${Math.floor(timestamp / 60000)}:${observer.latitudeDeg}:${observer.longitudeDeg}:${observer.elevationM}`;
    if (cometCache.key !== key)
      cometCache = { key, objects: getCometObjects(timestamp, observer) };
    return cometCache.objects;
  };
  const currentSolarSystemObjects = (timestamp) => {
    const key = `${Math.floor(timestamp / 1000)}:${observer.latitudeDeg}:${observer.longitudeDeg}:${observer.elevationM}`;
    if (solarSystemCache.key !== key)
      solarSystemCache = {
        key,
        objects: [
          ...getSolarSystemObjects(timestamp, observer),
          ...getJupiterMoonObjects(timestamp, observer),
        ],
      };
    return solarSystemCache.objects;
  };
  const uploadRaster = (targetCanvas, targetContext, raster) => {
    if (targetCanvas.width !== raster.width) targetCanvas.width = raster.width;
    if (targetCanvas.height !== raster.height)
      targetCanvas.height = raster.height;
    targetContext.putImageData(
      new ImageData(raster.data, raster.width, raster.height),
      0,
      0,
    );
  };
  const loadImagePixels = async (url, label = "image") => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () =>
        reject(new Error(`Unable to load ${label}: ${url}`));
      image.src = url;
    });
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = image.naturalWidth;
    tileCanvas.height = image.naturalHeight;
    const tileContext = tileCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!tileContext) throw new Error(`${label} decoding is unavailable`);
    tileContext.drawImage(image, 0, 0);
    return {
      width: tileCanvas.width,
      height: tileCanvas.height,
      data: tileContext.getImageData(0, 0, tileCanvas.width, tileCanvas.height)
        .data,
    };
  };
  const cachedSkySurveyResponse = async (url) => {
    try {
      const response = await globalThis.caches?.match(url);
      return response?.ok ? response : null;
    } catch {
      return null;
    }
  };
  const persistedSkySurveyResponse = async (url) => {
    try {
      const cache = await globalThis.caches?.open(
        SKY_SURVEY_PERSISTENT_CACHE,
      );
      const response = await cache?.match(url);
      return response?.ok ? response : null;
    } catch {
      return null;
    }
  };
  const deleteCachedSkySurveyResponse = async (url) => {
    try {
      const cache = await globalThis.caches?.open(
        SKY_SURVEY_PERSISTENT_CACHE,
      );
      await cache?.delete(url);
    } catch {
      // A corrupt entry can still be bypassed when cache storage is unavailable.
    }
  };
  const persistSkySurveyResponse = async (url, response) => {
    if (!globalThis.caches) return;
    try {
      const cache = await globalThis.caches.open(SKY_SURVEY_PERSISTENT_CACHE);
      await cache.put(url, response);
      skySurveyPersistentTrim = skySurveyPersistentTrim
        .catch(() => {})
        .then(async () => {
          const keys = await cache.keys();
          const excess = keys.length - SKY_SURVEY_PERSISTENT_CACHE_LIMIT;
          if (excess > 0)
            await Promise.all(
              keys.slice(0, excess).map((request) => cache.delete(request)),
            );
        });
      await skySurveyPersistentTrim;
    } catch {
      // Quota and private-mode failures leave the live in-memory tile usable.
    }
  };
  const decodeSkySurveyResponse = async (response) => {
    const objectUrl = URL.createObjectURL(await response.blob());
    try {
      return await loadImagePixels(objectUrl, "cached sky survey tile");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
  const validateSkySurveyPixels = (tile, expectedWidth) => {
    if (
      !tile ||
      tile.width !== expectedWidth ||
      tile.height !== expectedWidth ||
      !tile.data ||
      tile.data.length < expectedWidth * expectedWidth * 4
    )
      throw new TypeError(
        `Sky survey tile must contain ${expectedWidth} x ${expectedWidth} RGBA pixels`,
      );
    return tile;
  };
  const loadSkySurveyPixels = async (
    url,
    { signal, expectedWidth, shouldPersist, cacheOnly = false },
  ) => {
    const cached = await cachedSkySurveyResponse(url);
    if (cached) {
      try {
        const tile = validateSkySurveyPixels(
          await decodeSkySurveyResponse(cached),
          expectedWidth,
        );
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        return tile;
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        await deleteCachedSkySurveyResponse(url);
      }
    }
    if (cacheOnly) {
      const error = new Error("Sky survey parent tile is not cached");
      error.name = "CacheMissError";
      throw error;
    }
    if (navigator.onLine === false)
      throw new Error("Sky survey tile is not available in the offline cache");
    const response = await fetch(url, {
      cache: "default",
      credentials: "omit",
      mode: "cors",
      signal,
    });
    if (!response.ok)
      throw new Error(`Unable to load sky survey tile: ${url}`);
    const persistentResponse = response.clone();
    const tile = validateSkySurveyPixels(
      await decodeSkySurveyResponse(response),
      expectedWidth,
    );
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (shouldPersist()) {
      // The standalone service worker uses this same cache. Avoid a second put
      // and serialized trim when it already persisted the network response.
      const alreadyPersisted = await persistedSkySurveyResponse(url);
      if (!alreadyPersisted)
        await persistSkySurveyResponse(url, persistentResponse);
    }
    return tile;
  };
  const loadMilkyWay = async (url) => {
    if (!url) return;
    try {
      const image = await loadImagePixels(url);
      if (destroyed) return;
      milkyWay = image;
      milkyWayRasterCache = { key: "", raster: null };
      milkyWayUploadKey = "";
      invalidate();
    } catch (error) {
      if (!destroyed) onError?.(error);
    }
  };
  const updateSurveyCredit = (visible) => {
    const show = Boolean(visible && skySurvey?.attribution);
    surveyCredit.hidden = !show;
    surveyCredit.style.display = show ? "block" : "none";
    if (!show) return;
    if (skySurvey.attributionUrl) surveyCredit.href = skySurvey.attributionUrl;
    else surveyCredit.removeAttribute("href");
    surveyCredit.title = skySurvey.attribution;
    surveyCredit.textContent = skySurvey.creditLabel;
  };
  const cancelSkySurveyRasterJob = () => {
    if (skySurveyRasterJob) skySurveyRasterJob.cancelled = true;
    skySurveyRasterJob = null;
  };
  const resetSkySurveyRaster = () => {
    cancelSkySurveyRasterJob();
    skySurveyRasterCache = { key: "", raster: null };
    skySurveyUploadKey = "";
  };
  const abortSkySurveyRequests = (predicate = () => true) => {
    for (const { controller, request } of skySurveyActiveRequests.values())
      if (predicate(request)) controller.abort();
  };
  const clearSkySurveyTiles = () => {
    skySurveyTiles.clear();
    skySurveyDecodedBytes = 0;
  };
  const resetSkySurveyRuntime = ({ clearTiles = false } = {}) => {
    skySurveySourceToken += 1;
    abortSkySurveyRequests();
    skySurveyQueue = [];
    skySurveyPending.clear();
    skySurveyFailures.clear();
    skySurveyCacheProbeMisses.clear();
    skySurveyWantedSignature = "";
    skySurveyWantedRequests = new Set();
    if (clearTiles) clearSkySurveyTiles();
    resetSkySurveyRaster();
    skySurveyRuntime = {
      active: false,
      opacity: 0,
      targetOrder: null,
      renderedOrder: null,
      loadedTiles: skySurveyTiles.size,
      pendingTiles: 0,
      failedTiles: 0,
      lastError: null,
    };
    updateSurveyCredit(false);
  };
  const touchSkySurveyTile = (key) => {
    const tile = skySurveyTiles.get(key);
    if (!tile) return null;
    skySurveyTiles.delete(key);
    skySurveyTiles.set(key, tile);
    return tile;
  };
  const trimSkySurveyTiles = () => {
    while (
      skySurveyTiles.size > 1 &&
      (skySurveyTiles.size > skySurveyCacheLimit ||
        skySurveyDecodedBytes > skySurveyDecodedByteBudget)
    ) {
      const oldestKey = skySurveyTiles.keys().next().value;
      if (oldestKey === undefined) break;
      skySurveyDecodedBytes -=
        skySurveyTiles.get(oldestKey)?.data?.byteLength ?? 0;
      skySurveyTiles.delete(oldestKey);
    }
  };
  const processSkySurveyQueue = () => {
    while (
      !destroyed &&
      !paused &&
      skySurveyActiveLoads < skySurveyLoadConcurrency &&
      skySurveyQueue.length
    ) {
      const request = skySurveyQueue.shift();
      if (request.sourceToken !== skySurveySourceToken) {
        skySurveyPending.delete(request.requestKey);
        continue;
      }
      skySurveyActiveLoads += 1;
      const controller = new AbortController();
      skySurveyActiveRequests.set(request.requestKey, {
        controller,
        request,
      });
      void loadSkySurveyPixels(request.url, {
        signal: controller.signal,
        expectedWidth: request.tileWidth,
        cacheOnly: request.cacheOnly,
        shouldPersist: () =>
          !destroyed &&
          !paused &&
          request.sourceToken === skySurveySourceToken &&
          skySurveyWantedRequests.has(request.requestKey),
      })
        .then((tile) => {
          if (
            destroyed ||
            paused ||
            request.sourceToken !== skySurveySourceToken ||
            !skySurvey ||
            !skySurveyWantedRequests.has(request.requestKey)
          )
            return;
          skySurveyDecodedBytes -=
            skySurveyTiles.get(request.tileKey)?.data?.byteLength ?? 0;
          skySurveyTiles.delete(request.tileKey);
          skySurveyTiles.set(request.tileKey, tile);
          skySurveyDecodedBytes += tile.data.byteLength;
          skySurveyFailures.delete(request.tileKey);
          skySurveyCacheProbeMisses.delete(request.tileKey);
          trimSkySurveyTiles();
          resetSkySurveyRaster();
          skySurveyRuntime.lastError = null;
        })
        .catch((error) => {
          if (destroyed || request.sourceToken !== skySurveySourceToken) return;
          if (error?.name === "AbortError" || paused) return;
          if (error?.name === "CacheMissError") {
            skySurveyCacheProbeMisses.set(
              request.tileKey,
              performance.now() + 30000,
            );
            while (skySurveyCacheProbeMisses.size > 256)
              skySurveyCacheProbeMisses.delete(
                skySurveyCacheProbeMisses.keys().next().value,
              );
            return;
          }
          skySurveyFailures.set(request.tileKey, performance.now() + 30000);
          while (skySurveyFailures.size > 256)
            skySurveyFailures.delete(skySurveyFailures.keys().next().value);
          skySurveyRuntime.lastError =
            "Photographic survey unavailable; using the offline sky background.";
        })
        .finally(() => {
          skySurveyActiveRequests.delete(request.requestKey);
          skySurveyPending.delete(request.requestKey);
          skySurveyActiveLoads = Math.max(0, skySurveyActiveLoads - 1);
          skySurveyRuntime.loadedTiles = skySurveyTiles.size;
          skySurveyRuntime.pendingTiles = skySurveyPending.size;
          skySurveyRuntime.failedTiles = skySurveyFailures.size;
          invalidate();
          processSkySurveyQueue();
        });
    }
  };
  const queueSkySurveyTiles = (plans) => {
    const sourceToken = skySurveySourceToken;
    const wanted = new Set();
    for (const plan of plans)
      for (const tileIndex of plan.tileIndices)
        wanted.add(
          `${sourceToken}:${plan.cacheOnly ? "cache" : "network"}:${skySurveyTileKey(plan.order, tileIndex)}`,
        );
    const signature = [...wanted].sort().join(",");
    if (signature !== skySurveyWantedSignature) {
      skySurveyWantedSignature = signature;
      skySurveyWantedRequests = wanted;
      skySurveyQueue = skySurveyQueue.filter((request) => {
        const keep = wanted.has(request.requestKey);
        if (!keep) skySurveyPending.delete(request.requestKey);
        return keep;
      });
      abortSkySurveyRequests(
        (request) =>
          request.sourceToken === sourceToken &&
          !wanted.has(request.requestKey),
      );
    }
    const now = performance.now();
    for (const plan of plans) {
      for (const tileIndex of plan.tileIndices) {
        const tileKey = skySurveyTileKey(plan.order, tileIndex);
        const requestKey = `${sourceToken}:${plan.cacheOnly ? "cache" : "network"}:${tileKey}`;
        if (skySurveyTiles.has(tileKey) || skySurveyPending.has(requestKey))
          continue;
        const failures = plan.cacheOnly
          ? skySurveyCacheProbeMisses
          : skySurveyFailures;
        const retryAt = failures.get(tileKey);
        if (retryAt && retryAt > now) continue;
        if (retryAt) failures.delete(tileKey);
        skySurveyPending.add(requestKey);
        skySurveyQueue.push({
          requestKey,
          tileKey,
          cacheOnly: Boolean(plan.cacheOnly),
          sourceToken,
          tileWidth: skySurvey.tileWidth,
          url: skySurveyTileUrl(skySurvey, plan.order, tileIndex),
        });
      }
    }
    skySurveyRuntime.pendingTiles = skySurveyPending.size;
    processSkySurveyQueue();
  };
  const isHorizontalVisible = (horizontal) =>
    !display.hideBelowHorizon ||
    horizontal.altitudeDeg >=
      horizonAltitudeAtAzimuth(horizon, horizontal.azimuthDeg, 0);
  const drawObjectBox = (x, y, size, color) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.strokeRect(x - size, y - size, size * 2, size * 2);
    context.restore();
  };
  const drawDsoGlyph = (
    object,
    x,
    y,
    size,
    selected,
    visualKind = classifyDeepSkyObject(object),
    approximateShape = hasApproximateCatalogShape(object),
  ) => {
    const color =
      visualKind === "galaxy"
        ? "#aa91ff"
        : visualKind === "globular-cluster" || visualKind === "open-cluster"
          ? "#62d8ff"
          : visualKind === "dark-nebula"
            ? "#8796ac"
            : visualKind === "reflection-nebula"
              ? "#75d7ff"
              : visualKind === "emission-nebula"
                ? "#ff8c92"
                : "#f6c978";
    context.save();
    context.translate(x, y);
    context.strokeStyle = selected ? "#fff1bd" : color;
    context.fillStyle = context.strokeStyle;
    context.lineWidth = selected ? 1.4 : 1;
    if (approximateShape) context.setLineDash?.([2, 2]);
    if (visualKind === "galaxy") {
      context.rotate(
        ((object.shape?.positionAngleDeg ?? object.positionAngle ?? -20) *
          Math.PI) /
          180,
      );
      context.beginPath();
      context.ellipse(0, 0, size * 1.45, size * 0.55, 0, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, Math.max(1.1, size * 0.18), 0, Math.PI * 2);
      context.fill();
    } else if (visualKind === "globular-cluster") {
      context.beginPath();
      context.arc(0, 0, size, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(-size, 0);
      context.lineTo(size, 0);
      context.moveTo(0, -size);
      context.lineTo(0, size);
      context.stroke();
    } else if (visualKind === "open-cluster") {
      for (let index = 0; index < 7; index += 1) {
        const angle = index * 2.399;
        const radius = size * (0.25 + (0.65 * ((index * 37) % 10)) / 10);
        context.fillRect(
          Math.cos(angle) * radius - 1,
          Math.sin(angle) * radius - 1,
          2,
          2,
        );
      }
    } else if (visualKind === "dark-nebula") {
      context.beginPath();
      context.arc(0, 0, size * 0.9, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(-size * 0.55, size * 0.45);
      context.lineTo(size * 0.55, -size * 0.45);
      context.moveTo(-size * 0.45, -size * 0.55);
      context.lineTo(size * 0.45, size * 0.55);
      context.stroke();
    } else if (visualKind === "reflection-nebula") {
      context.beginPath();
      context.moveTo(0, -size);
      context.lineTo(size, 0);
      context.lineTo(0, size);
      context.lineTo(-size, 0);
      context.closePath();
      context.stroke();
      context.beginPath();
      context.arc(0, 0, Math.max(1.2, size * 0.2), 0, Math.PI * 2);
      context.fill();
    } else if (visualKind === "emission-nebula") {
      context.beginPath();
      for (let index = 0; index < 12; index += 1) {
        const angle = (index * Math.PI) / 6;
        const radius = size * (index % 2 ? 0.5 : 1);
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (index) context.lineTo(px, py);
        else context.moveTo(px, py);
      }
      context.closePath();
      context.stroke();
      context.beginPath();
      context.arc(0, 0, Math.max(1.1, size * 0.18), 0, Math.PI * 2);
      context.fill();
    } else if (visualKind === "nebula") {
      context.beginPath();
      for (let index = 0; index < 8; index += 1) {
        const angle = (index * Math.PI * 2) / 8;
        const radius = size * (index % 2 ? 1 : 0.68);
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (index) context.lineTo(px, py);
        else context.moveTo(px, py);
      }
      context.closePath();
      context.stroke();
    } else {
      context.beginPath();
      context.rect(-size * 0.65, -size * 0.65, size * 1.3, size * 1.3);
      context.stroke();
    }
    context.restore();
    if (selected) drawObjectBox(x, y, size + 5, "#fff1bd");
  };
  const drawDsoFootprint = (
    object,
    x,
    y,
    scale,
    projectionRotationDeg,
    projectionMirrorX,
    visualKind,
    approximateShape,
  ) => {
    if (view.fovDeg > 55) return;
    const majorArcmin = object.shape?.majorArcmin ?? object.major;
    const minorArcmin =
      object.shape?.minorArcmin ?? object.minor ?? majorArcmin;
    if (
      !Number.isFinite(majorArcmin) ||
      majorArcmin <= 0 ||
      !Number.isFinite(minorArcmin) ||
      minorArcmin <= 0
    )
      return;
    const majorPixels = projectAngularExtent(
      Math.min(majorArcmin / 60, 179),
      scale,
    );
    const minorPixels = projectAngularExtent(
      Math.min(minorArcmin / 60, 179),
      scale,
    );
    if (majorPixels < 6 || minorPixels < 2) return;
    const colors = {
      galaxy: ["rgba(170,145,255,.09)", "rgba(189,171,255,.38)"],
      "dark-nebula": ["rgba(0,0,0,.28)", "rgba(135,150,172,.34)"],
      "reflection-nebula": ["rgba(117,215,255,.07)", "rgba(117,215,255,.34)"],
      "emission-nebula": ["rgba(255,100,120,.07)", "rgba(255,140,146,.34)"],
      nebula: ["rgba(246,201,120,.06)", "rgba(246,201,120,.3)"],
    };
    const [fill, stroke] = colors[visualKind] ?? [];
    if (!fill || !stroke) return;
    const positionAngleDeg =
      object.shape?.positionAngleDeg ?? object.positionAngle ?? 0;
    const rotationDeg = celestialPositionAngleCanvasRotationDeg(
      projectionRotationDeg,
      positionAngleDeg,
      projectionMirrorX,
    );
    context.save();
    context.translate(x, y);
    context.rotate((rotationDeg * Math.PI) / 180);
    context.fillStyle = display.nightMode ? "rgba(95,0,0,.12)" : fill;
    context.strokeStyle = display.nightMode ? "rgba(255,88,79,.3)" : stroke;
    context.lineWidth = 0.8;
    if (approximateShape) context.setLineDash?.([3, 3]);
    context.beginPath();
    context.ellipse(
      0,
      0,
      Math.min(canvas.clientWidth * 0.75, majorPixels / 2),
      Math.min(canvas.clientHeight * 0.75, minorPixels / 2),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.stroke();
    context.restore();
  };
  const rasterOutputWidth = (width, dpr) => {
    return landscapeRasterWidth(
      width,
      dpr,
      performance.now() < lowQualityUntil,
      coarsePointer,
    );
  };
  const skySurveyOutputWidth = (width, height, dpr) => {
    const interactive = performance.now() < lowQualityUntil;
    const baseWidth = rasterOutputWidth(width, dpr);
    if (interactive) return Math.min(baseWidth, coarsePointer ? 64 : 128);
    const maxPixels = coarsePointer
      ? 240000
      : 450000;
    return Math.max(
      1,
      Math.min(
        baseWidth,
        Math.floor(Math.sqrt((maxPixels * width) / Math.max(1, height))),
      ),
    );
  };
  const dsoMagnitudeLimit = () => {
    if (view.fovDeg > 120) return 6.5;
    if (view.fovDeg > 85) return 8;
    if (view.fovDeg > 55) return 10;
    if (view.fovDeg > 30) return 12;
    if (view.fovDeg > 15) return 14.5;
    return 99;
  };
  const shouldDrawDso = (object, catalogIndex) => {
    if (isSelectedObject(object)) return true;
    if (
      deepSkyObjectTypeAllowlist !== null &&
      !deepSkyObjectTypeAllowlist.has(catalogTypeKeys[catalogIndex])
    )
      return false;
    if (
      deepSkyCatalogueGroupAllowlist !== null &&
      !catalogGroupKeys[catalogIndex].some((group) =>
        deepSkyCatalogueGroupAllowlist.has(group),
      )
    )
      return false;
    const magnitude = object.mag ?? object.magnitude;
    const categoryLimit = galaxyCatalogFlags[catalogIndex]
      ? display.galaxyMagnitudeLimit
      : display.deepSkyMagnitudeLimit;
    if (Number.isFinite(magnitude)) {
      return magnitude <= Math.min(categoryLimit, dsoMagnitudeLimit());
    }
    return (
      categoryLimit === 30 &&
      view.fovDeg < catalogUnknownMagnitudeFovLimits[catalogIndex]
    );
  };
  const drawGridLabel = (text, x, y) => {
    context.save();
    context.font = "600 10px system-ui";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const paddingX = 4;
    const metrics = context.measureText(text);
    context.fillStyle = display.nightMode
      ? "rgba(18,0,0,.72)"
      : "rgba(3,8,16,.72)";
    context.fillRect(
      x - metrics.width / 2 - paddingX,
      y - 7,
      metrics.width + paddingX * 2,
      14,
    );
    context.fillStyle = display.nightMode ? "#ff8d85" : "#8ee9ff";
    context.fillText(text, x, y);
    context.restore();
  };
  const horizontalProjectionView = (timestampUtcMs) => {
    return coordinateMode === "horizontal"
      ? alignViewToHorizon(view, observer, timestampUtcMs)
      : view;
  };
  const drawLandscape = (width, height, projectionView, landscapeTime, dpr) => {
    if (!display.horizon || !landscape?.tiles || !landscapeContext) return;
    const outputWidth = rasterOutputWidth(width, dpr);
    const rasterKey = [
      width,
      height,
      outputWidth,
      view.center.raDeg.toFixed(4),
      view.center.decDeg.toFixed(4),
      view.fovDeg.toFixed(3),
      (projectionView.rotationDeg ?? 0).toFixed(4),
      Boolean(projectionView.mirrorX),
      observer.latitudeDeg,
      observer.longitudeDeg,
      Math.floor(landscapeTime / 60000),
      landscape.source.key,
      landscape.source.url,
    ].join(":");
    if (landscapeRasterCache.key !== rasterKey) {
      landscapeRasterCache = {
        key: rasterKey,
        raster: rasterizeHealpixLandscape({
          tiles: landscape.tiles,
          view: projectionView,
          observer,
          timestampUtcMs: landscapeTime,
          canvasWidth: width,
          canvasHeight: height,
          outputWidth,
        }),
      };
    }
    const raster = landscapeRasterCache.raster;
    if (landscapeUploadKey !== landscapeRasterCache.key) {
      uploadRaster(landscapeCanvas, landscapeContext, raster);
      landscapeUploadKey = landscapeRasterCache.key;
    }
    context.save();
    context.globalAlpha = display.nightMode ? 0.32 : 0.82;
    context.imageSmoothingEnabled = true;
    context.drawImage(landscapeCanvas, 0, 0, width, height);
    context.restore();
  };
  const drawMilkyWayPanorama = (
    width,
    height,
    projectionView,
    timestampUtcMs,
    dpr,
  ) => {
    if (!display.milkyWay || !milkyWay || !milkyWayContext) return false;
    const outputWidth = rasterOutputWidth(width, dpr);
    const rasterKey = [
      width,
      height,
      outputWidth,
      view.center.raDeg.toFixed(4),
      view.center.decDeg.toFixed(4),
      view.fovDeg.toFixed(3),
      (projectionView.rotationDeg ?? 0).toFixed(4),
      Boolean(projectionView.mirrorX),
      display.hideBelowHorizon,
      observer.latitudeDeg,
      observer.longitudeDeg,
      Math.floor(timestampUtcMs / 60000),
      milkyWay.width,
      milkyWay.height,
    ].join(":");
    if (milkyWayRasterCache.key !== rasterKey) {
      milkyWayRasterCache = {
        key: rasterKey,
        raster: rasterizeMilkyWayPanorama({
          panorama: milkyWay,
          view: projectionView,
          observer,
          timestampUtcMs,
          canvasWidth: width,
          canvasHeight: height,
          outputWidth,
          hideBelowHorizon: display.hideBelowHorizon,
          horizon,
        }),
      };
    }
    const raster = milkyWayRasterCache.raster;
    if (milkyWayUploadKey !== milkyWayRasterCache.key) {
      uploadRaster(milkyWayCanvas, milkyWayContext, raster);
      milkyWayUploadKey = milkyWayRasterCache.key;
    }
    context.save();
    context.globalCompositeOperation = "screen";
    context.imageSmoothingEnabled = true;
    context.drawImage(milkyWayCanvas, 0, 0, width, height);
    context.restore();
    return true;
  };
  const drawSkySurvey = (
    width,
    height,
    projectionView,
    timestampUtcMs,
    dpr,
  ) => {
    const opacity =
      display.skySurvey && skySurvey
        ? skySurveyBlendOpacity(view.fovDeg)
        : 0;
    if (!opacity || !skySurveyContext) {
      cancelSkySurveyRasterJob();
      queueSkySurveyTiles([]);
      skySurveyRuntime = {
        ...skySurveyRuntime,
        active: false,
        opacity: 0,
        targetOrder: null,
        renderedOrder: null,
        loadedTiles: skySurveyTiles.size,
        pendingTiles: skySurveyPending.size,
        failedTiles: skySurveyFailures.size,
      };
      canvas.dataset.skySurveyActive = "false";
      delete canvas.dataset.skySurveyOrder;
      delete canvas.dataset.skySurveyTargetOrder;
      updateSurveyCredit(false);
      return false;
    }

    const outputWidth = skySurveyOutputWidth(width, height, dpr);
    const selectionWidth = landscapeRasterWidth(
      width,
      dpr,
      false,
      coarsePointer,
    );
    let targetOrder = selectSkySurveyOrder(
      skySurvey,
      view.fovDeg,
      selectionWidth,
    );
    if (navigator.connection?.saveData)
      targetOrder = Math.min(targetOrder, Math.max(skySurvey.minOrder, 6));
    const previewOrder = Math.max(skySurvey.minOrder, targetOrder - 1);
    const interactive = performance.now() < lowQualityUntil;
    const offline = navigator.onLine === false;
    const tileIndicesByOrder = new Map();
    for (const order of new Set([previewOrder, targetOrder]))
      tileIndicesByOrder.set(
        order,
        discoverVisibleSkySurveyTiles({
          survey: skySurvey,
          order,
          view: projectionView,
          canvasWidth: width,
          canvasHeight: height,
          outputWidth,
          sampleStep: interactive ? 8 : 4,
          observer,
          timestampUtcMs,
          hideBelowHorizon: display.hideBelowHorizon,
          horizon,
        }),
      );
    const primaryLoadOrders = offline
      ? Array.from(
          { length: targetOrder - skySurvey.minOrder + 1 },
          (_, index) => targetOrder - index,
        )
      : interactive
        ? [previewOrder]
        : [...new Set([previewOrder, targetOrder])];
    // Probe lower cached parents even when navigator.onLine remains true. A
    // captive portal, isolated LAN, or failed survey host can otherwise leave
    // viewed fallback imagery unreachable despite a healthy local connection.
    const cachedAncestorOrders = offline
      ? []
      : Array.from(
          { length: Math.max(0, targetOrder - skySurvey.minOrder - 1) },
          (_, index) => targetOrder - index - 2,
        );
    const targetTileIndices = tileIndicesByOrder.get(targetOrder);
    for (const order of new Set([
      ...primaryLoadOrders,
      ...cachedAncestorOrders,
    ])) {
      if (tileIndicesByOrder.has(order)) continue;
      const divisor = 4 ** (targetOrder - order);
      tileIndicesByOrder.set(
        order,
        [
          ...new Set(
            targetTileIndices.map((tileIndex) =>
              Math.floor(tileIndex / divisor),
            ),
          ),
        ],
      );
    }
    const cachedAncestorPlans = cachedAncestorOrders.map((order) => ({
      order,
      tileIndices: tileIndicesByOrder.get(order),
      cacheOnly: true,
    }));
    const primaryLoadPlans = primaryLoadOrders.map((order) => ({
      order,
      tileIndices: tileIndicesByOrder.get(order),
      cacheOnly: offline,
    }));
    const loadPlans = [...cachedAncestorPlans, ...primaryLoadPlans];
    queueSkySurveyTiles(loadPlans);
    if (!skySurveyTiles.size) {
      skySurveyRuntime = {
        ...skySurveyRuntime,
        active: false,
        opacity: 0,
        targetOrder,
        renderedOrder: null,
        loadedTiles: 0,
        pendingTiles: skySurveyPending.size,
        failedTiles: skySurveyFailures.size,
      };
      canvas.dataset.skySurveyActive = "false";
      delete canvas.dataset.skySurveyOrder;
      canvas.dataset.skySurveyTargetOrder = String(targetOrder);
      updateSurveyCredit(false);
      return false;
    }

    const rasterKey = [
      width,
      height,
      outputWidth,
      projectionView.center.raDeg.toFixed(5),
      projectionView.center.decDeg.toFixed(5),
      view.fovDeg.toFixed(4),
      // A tenth of a degree moves an edge pixel by less than one pixel while
      // avoiding self-cancellation from continuous sidereal sub-pixel drift.
      (projectionView.rotationDeg ?? 0).toFixed(1),
      Boolean(projectionView.mirrorX),
      coordinateMode,
      display.hideBelowHorizon,
      observer.latitudeDeg,
      observer.longitudeDeg,
      Math.floor(timestampUtcMs / 60000),
      skySurvey.key,
      skySurveySourceToken,
      targetOrder,
    ].join(":");
    const rasterOptions = {
      survey: skySurvey,
      order: targetOrder,
      tiles: skySurveyTiles,
      view: projectionView,
      observer,
      timestampUtcMs,
      canvasWidth: width,
      canvasHeight: height,
      outputWidth,
      fallbackMinOrder: skySurvey.minOrder,
      hideBelowHorizon: display.hideBelowHorizon,
      horizon,
    };
    if (skySurveyRasterCache.key !== rasterKey) {
      if (!interactive) {
        if (skySurveyRasterJob?.key !== rasterKey) {
          cancelSkySurveyRasterJob();
          const job = { key: rasterKey, cancelled: false };
          skySurveyRasterJob = job;
          void rasterizeSkySurveyAsync({
            ...rasterOptions,
            rowsPerChunk: coarsePointer ? 6 : 8,
            isCancelled: () =>
              job.cancelled ||
              destroyed ||
              paused ||
              skySurveyRasterJob !== job,
          })
            .then((raster) => {
              if (
                job.cancelled ||
                destroyed ||
                paused ||
                skySurveyRasterJob !== job
              )
                return;
              if (raster.missingTileIndices.length) {
                const missingPlans = [];
                for (
                  let order = targetOrder;
                  order >= skySurvey.minOrder;
                  order -= 1
                ) {
                  const divisor = 4 ** (targetOrder - order);
                  missingPlans.push({
                    order,
                    tileIndices: [
                      ...new Set(
                        raster.missingTileIndices.map((tileIndex) =>
                          Math.floor(tileIndex / divisor),
                        ),
                      ),
                    ],
                    // Online requests refine the target and preview orders;
                    // still lower parents are cache-only fallback probes.
                    cacheOnly: offline || order < previewOrder,
                  });
                }
                queueSkySurveyTiles([
                  ...loadPlans,
                  ...missingPlans,
                ]);
              }
              canvas.dataset.skySurveyRasterUsedOrders =
                raster.usedOrders.join(",");
              canvas.dataset.skySurveyRasterMissingTiles = String(
                raster.missingTileIndices.length,
              );
              skySurveyRasterCache = { key: rasterKey, raster };
              skySurveyRasterJob = null;
              invalidate();
            })
            .catch((error) => {
              if (skySurveyRasterJob !== job) return;
              skySurveyRasterJob = null;
              if (error?.name !== "AbortError")
                skySurveyRuntime.lastError =
                  "Photographic survey could not be rendered; using the offline sky background.";
            });
        }
        skySurveyRuntime = {
          ...skySurveyRuntime,
          active: false,
          opacity: 0,
          targetOrder,
          renderedOrder: null,
          loadedTiles: skySurveyTiles.size,
          pendingTiles: skySurveyPending.size,
          failedTiles: skySurveyFailures.size,
        };
        canvas.dataset.skySurveyActive = "false";
        delete canvas.dataset.skySurveyOrder;
        canvas.dataset.skySurveyTargetOrder = String(targetOrder);
        updateSurveyCredit(false);
        return false;
      }
      const raster = rasterizeSkySurvey(rasterOptions);
      if (raster.missingTileIndices.length) {
        const missingPlans = [];
        for (
          let order = targetOrder;
          order >= skySurvey.minOrder;
          order -= 1
        ) {
          const divisor = 4 ** (targetOrder - order);
          missingPlans.push({
            order,
            tileIndices: [
              ...new Set(
                raster.missingTileIndices.map((tileIndex) =>
                  Math.floor(tileIndex / divisor),
                ),
              ),
            ],
            cacheOnly: offline || order < previewOrder,
          });
        }
        queueSkySurveyTiles([...loadPlans, ...missingPlans]);
      }
      canvas.dataset.skySurveyRasterUsedOrders = raster.usedOrders.join(",");
      canvas.dataset.skySurveyRasterMissingTiles = String(
        raster.missingTileIndices.length,
      );
      skySurveyRasterCache = { key: rasterKey, raster };
    }
    const raster = skySurveyRasterCache.raster;
    if (!raster.usedOrders.length) {
      skySurveyRuntime = {
        ...skySurveyRuntime,
        active: false,
        opacity: 0,
        targetOrder,
        renderedOrder: null,
        loadedTiles: skySurveyTiles.size,
        pendingTiles: skySurveyPending.size,
        failedTiles: skySurveyFailures.size,
      };
      canvas.dataset.skySurveyActive = "false";
      delete canvas.dataset.skySurveyOrder;
      canvas.dataset.skySurveyTargetOrder = String(targetOrder);
      updateSurveyCredit(false);
      return false;
    }
    const renderedOrder = Math.max(...raster.usedOrders);
    for (const tileKey of raster.usedTileKeys) touchSkySurveyTile(tileKey);
    if (skySurveyUploadKey !== skySurveyRasterCache.key) {
      uploadRaster(skySurveyCanvas, skySurveyContext, raster);
      skySurveyUploadKey = skySurveyRasterCache.key;
    }
    context.save();
    context.globalAlpha = opacity;
    context.imageSmoothingEnabled = true;
    context.drawImage(skySurveyCanvas, 0, 0, width, height);
    context.restore();
    skySurveyRuntime = {
      ...skySurveyRuntime,
      active: true,
      opacity,
      targetOrder,
      renderedOrder,
      loadedTiles: skySurveyTiles.size,
      pendingTiles: skySurveyPending.size,
      failedTiles: skySurveyFailures.size,
    };
    canvas.dataset.skySurveyActive = "true";
    canvas.dataset.skySurveyOrder = String(renderedOrder);
    canvas.dataset.skySurveyTargetOrder = String(targetOrder);
    canvas.dataset.skySurveyLoadedTiles = String(skySurveyTiles.size);
    updateSurveyCredit(true);
    return true;
  };
  void loadMilkyWay(milkyWayPanoramaUrl);

  const loadLandscape = async (source, token) => {
    const baseUrl = source.url.replace(/\/+$/, "");
    let tileFormat = "webp";
    try {
      const response = await fetch(`${baseUrl}/properties`);
      if (response.ok) {
        const properties = await response.text();
        const match = properties.match(/^hips_tile_format\s*=\s*([^\s#]+)/im);
        if (match) tileFormat = match[1].split(/[ ,]/)[0].toLocaleLowerCase();
      }
    } catch {
      // Legacy local landscape folders may omit or block the properties file.
    }
    if (!/^(webp|png|jpe?g)$/.test(tileFormat))
      throw new Error(`Unsupported landscape tile format: ${tileFormat}`);
    const tiles = await Promise.all(
      Array.from({ length: 12 }, (_, face) =>
        loadImagePixels(`${baseUrl}/Norder0/Dir0/Npix${face}.${tileFormat}`),
      ),
    );
    if (destroyed || token !== landscapeLoadToken) return;
    landscape = { source: structuredClone(source), tiles };
    landscapeRasterCache = { key: "", raster: null };
    landscapeUploadKey = "";
    invalidate();
  };
  const draw = () => {
    frameId = null;
    if (destroyed || paused || renderingContextLost) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatioCap, window.devicePixelRatio || 1);
    const backingWidth = Math.max(1, Math.round(width * dpr));
    const backingHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = display.nightMode ? "#080000" : "#03060d";
    context.fillRect(0, 0, width, height);
    const scale = width / (2 * Math.tan((view.fovDeg * Math.PI) / 360));
    const referenceUtcMs = currentUtcMs();
    const projectionView = horizontalProjectionView(referenceUtcMs);
    const isAboveHorizon = (coordinates) => {
      if (!display.hideBelowHorizon) return true;
      return isHorizontalVisible(
        equatorialToHorizontal(
          {
            ...coordinates,
            frame: coordinates.frame || view.center.frame,
          },
          observer,
          referenceUtcMs,
        ),
      );
    };
    const project = (coordinates) =>
      projectEquatorial(coordinates, projectionView, width, height);
    const strokeCurve = (coordinates) => {
      context.beginPath();
      let drawing = false;
      let previous = null;
      for (const coordinate of coordinates) {
        if (!isAboveHorizon(coordinate)) {
          drawing = false;
          previous = null;
          continue;
        }
        const point = project(coordinate);
        if (
          !point ||
          point.x < -width ||
          point.x > width * 2 ||
          point.y < -height ||
          point.y > height * 2
        ) {
          drawing = false;
          previous = null;
          continue;
        }
        if (
          drawing &&
          previous &&
          Math.hypot(point.x - previous.x, point.y - previous.y) <= width
        )
          context.lineTo(point.x, point.y);
        else {
          context.moveTo(point.x, point.y);
          drawing = true;
        }
        previous = point;
      }
      context.stroke();
    };
    const horizontalCurve = (azimuthDeg, altitudes) =>
      altitudes.map((altitudeDeg) =>
        horizontalToEquatorial(
          { azimuthDeg, altitudeDeg },
          observer,
          referenceUtcMs,
          view.center.frame,
        ),
      );
    const altitudeCircle = (altitudeDeg) =>
      Array.from({ length: 73 }, (_, index) =>
        horizontalToEquatorial(
          { azimuthDeg: index * 5, altitudeDeg },
          observer,
          referenceUtcMs,
          view.center.frame,
        ),
      );
    const drewMilkyWayPanorama = drawMilkyWayPanorama(
      width,
      height,
      projectionView,
      referenceUtcMs,
      dpr,
    );
    if (display.milkyWay && !drewMilkyWayPanorama) {
      context.save();
      context.globalCompositeOperation = "screen";
      for (let latitude = -12; latitude <= 12; latitude += 4) {
        const strength = 1 - Math.abs(latitude) / 16;
        context.strokeStyle = display.nightMode
          ? `rgba(120,15,12,${0.025 * strength})`
          : `rgba(76,112,155,${0.035 * strength})`;
        context.lineWidth = Math.max(2, 9 - Math.abs(latitude) * 0.45);
        strokeCurve(
          Array.from({ length: 181 }, (_, index) =>
            galacticToEquatorial(index * 2, latitude),
          ),
        );
      }
      context.restore();
    }
    drawSkySurvey(width, height, projectionView, referenceUtcMs, dpr);
    drawLandscape(width, height, projectionView, referenceUtcMs, dpr);
    if (display.atmosphere) {
      context.save();
      context.strokeStyle = display.nightMode
        ? "rgba(100,8,5,.13)"
        : "rgba(80,120,155,.12)";
      context.lineWidth = 18;
      context.shadowColor = display.nightMode ? "#5a0906" : "#456d8d";
      context.shadowBlur = 22;
      strokeCurve(altitudeCircle(0));
      context.restore();
    }
    if (display.azimuthalGrid) {
      context.strokeStyle = display.nightMode
        ? "rgba(255,80,70,.17)"
        : "rgba(91,174,174,.17)";
      context.lineWidth = 0.8;
      const altitudes = Array.from({ length: 19 }, (_, index) => index * 5);
      for (let azimuth = 0; azimuth < 360; azimuth += 15)
        strokeCurve(horizontalCurve(azimuth, altitudes));
      for (let altitude = 10; altitude <= 80; altitude += 10)
        strokeCurve(altitudeCircle(altitude));
      if (display.labels) {
        for (let altitude = 0; altitude <= 80; altitude += 10) {
          const targetX = width * 0.78;
          const point = Array.from({ length: 24 }, (_, index) => {
            const coordinate = horizontalToEquatorial(
              { azimuthDeg: index * 15, altitudeDeg: altitude },
              observer,
              referenceUtcMs,
              view.center.frame,
            );
            return project(coordinate);
          })
            .filter(
              (candidate) =>
                candidate &&
                candidate.x >= 20 &&
                candidate.x <= width - 20 &&
                candidate.y >= 20 &&
                candidate.y <= height - 20,
            )
            .sort(
              (left, right) =>
                Math.abs(left.x - targetX) - Math.abs(right.x - targetX),
            )[0];
          if (point) drawGridLabel(`${altitude}°`, point.x, point.y);
        }
      }
    }
    if (display.meridian) {
      context.strokeStyle = display.nightMode
        ? "rgba(255,90,75,.48)"
        : "rgba(246,201,120,.48)";
      context.lineWidth = 1.2;
      const north = horizontalCurve(
        0,
        Array.from({ length: 19 }, (_, index) => index * 5),
      );
      const south = horizontalCurve(
        180,
        Array.from({ length: 19 }, (_, index) => 90 - index * 5),
      );
      strokeCurve([...north, ...south]);
    }
    if (display.ecliptic) {
      context.strokeStyle = display.nightMode
        ? "rgba(255,100,70,.55)"
        : "rgba(238,178,75,.55)";
      context.lineWidth = 1.2;
      strokeCurve(
        Array.from({ length: 181 }, (_, index) =>
          eclipticToEquatorial(index * 2),
        ),
      );
    }
    if (display.grid) {
      context.strokeStyle = display.nightMode
        ? "rgba(255,80,70,.2)"
        : "rgba(119,158,194,.2)";
      context.lineWidth = 1;
      for (let ra = 0; ra < 360; ra += 15) {
        strokeCurve(
          Array.from({ length: 37 }, (_, index) => ({
            raDeg: ra,
            decDeg: -90 + index * 5,
          })),
        );
      }
      for (let dec = -75; dec <= 75; dec += 15) {
        strokeCurve(
          Array.from({ length: 73 }, (_, index) => ({
            raDeg: index * 5,
            decDeg: dec,
          })),
        );
      }
    }
    hitTargets = [];
    context.strokeStyle = display.nightMode
      ? "rgba(255,80,70,.32)"
      : "rgba(125,151,255,.32)";
    if (display.constellations)
      for (const lines of Object.values(constellations)) {
        for (const [startName, endName] of lines) {
          const start = starsByName.get(String(startName).toLocaleLowerCase());
          const end = starsByName.get(String(endName).toLocaleLowerCase());
          if (!start || !end) continue;
          if (!isAboveHorizon(start) || !isAboveHorizon(end)) continue;
          const startPoint = start && project(start);
          const endPoint = end && project(end);
          if (!startPoint || !endPoint) continue;
          if (
            Math.hypot(startPoint.x - endPoint.x, startPoint.y - endPoint.y) >
            width
          )
            continue;
          context.beginPath();
          context.moveTo(startPoint.x, startPoint.y);
          context.lineTo(endPoint.x, endPoint.y);
          context.stroke();
        }
      }
    const interactionStarMagnitudeLimit = Math.min(
      display.starMagnitudeLimit,
      performance.now() < lowQualityUntil ? (coarsePointer ? 5 : 5.7) : 30,
    );
    let pendingSelectedStar = starIdentityKeys.has(objectIdentity(selected));
    for (const entry of renderStars) {
      const { star, magnitude: starMagnitude } = entry;
      const isSelectedStar = isSelectedObject(star);
      if (isSelectedStar) pendingSelectedStar = false;
      if (
        !isSelectedStar &&
        (!Number.isFinite(starMagnitude) ||
          starMagnitude > interactionStarMagnitudeLimit)
      ) {
        if (!pendingSelectedStar) break;
        continue;
      }
      const point = project(star);
      if (
        !point ||
        point.x < 0 ||
        point.x > width ||
        point.y < 0 ||
        point.y > height
      )
        continue;
      if (!isAboveHorizon(star)) continue;
      const drawMagnitude = Number.isFinite(starMagnitude) ? starMagnitude : 4;
      const radius =
        Math.max(0.7, Math.min(4, 3.5 - drawMagnitude * 0.45)) *
        display.starScale;
      context.fillStyle = display.nightMode ? "#ff584f" : entry.color;
      if (radius > 1.8) {
        context.save();
        context.globalAlpha = display.nightMode ? 0.16 : 0.22;
        context.beginPath();
        context.arc(point.x, point.y, radius * 2.4, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      hitTargets.push({ x: point.x, y: point.y, object: star });
      const hasDisplayName =
        star.named === true || !String(star.uid ?? "").startsWith("hyg:");
      if (
        display.labels &&
        hasDisplayName &&
        (starMagnitude < 1.5 || view.fovDeg < 25)
      ) {
        context.font = "10px system-ui";
        context.fillText(star.name, point.x + radius + 3, point.y - 3);
      }
    }
    const dsoLabelCandidates = [];
    if (display.deepSkyObjects) {
      for (
        let catalogIndex = 0;
        catalogIndex < catalog.length;
        catalogIndex += 1
      ) {
        const object = catalog[catalogIndex];
        if (!shouldDrawDso(object, catalogIndex)) continue;
        if (!Number.isFinite(object.raDeg) || !Number.isFinite(object.decDeg))
          continue;
        const point = project(object);
        if (!point) continue;
        const { x, y } = point;
        if (x < 0 || x > width || y < 0 || y > height) continue;
        if (!isAboveHorizon(object)) continue;
        const isSelected = isSelectedObject(object);
        const glyphSize = Math.max(3.7, Math.min(10, 3.2 + 70 / view.fovDeg));
        drawDsoFootprint(
          object,
          x,
          y,
          scale,
          projectionView.rotationDeg ?? 0,
          Boolean(projectionView.mirrorX),
          catalogVisualKinds[catalogIndex],
          Boolean(catalogApproximateShapeFlags[catalogIndex]),
        );
        drawDsoGlyph(
          object,
          x,
          y,
          glyphSize,
          isSelected,
          catalogVisualKinds[catalogIndex],
          Boolean(catalogApproximateShapeFlags[catalogIndex]),
        );
        hitTargets.push({ x, y, object });
        if (display.labels && (isSelected || view.fovDeg < 20))
          dsoLabelCandidates.push({ object, x, y, isSelected });
      }
    }
    if (dsoLabelCandidates.length) {
      dsoLabelCandidates.sort((left, right) => {
        if (left.isSelected !== right.isSelected)
          return left.isSelected ? -1 : 1;
        const leftMagnitude = left.object.mag ?? left.object.magnitude;
        const rightMagnitude = right.object.mag ?? right.object.magnitude;
        const leftRank = Number.isFinite(leftMagnitude)
          ? leftMagnitude
          : Number.POSITIVE_INFINITY;
        const rightRank = Number.isFinite(rightMagnitude)
          ? rightMagnitude
          : Number.POSITIVE_INFINITY;
        if (leftRank !== rightRank) return leftRank - rightRank;
        const leftExtent =
          left.object.shape?.majorArcmin ?? left.object.major ?? 0;
        const rightExtent =
          right.object.shape?.majorArcmin ?? right.object.major ?? 0;
        return rightExtent - leftExtent;
      });
      const dsoLabelBudget = Math.min(
        coarsePointer ? 36 : 72,
        Math.max(
          12,
          Math.floor(
            (width * height) / (coarsePointer ? 22000 : 18000),
          ),
        ),
      );
      const placedDsoLabelBoxes = [];
      let placedDsoLabels = 0;
      context.font = "11px system-ui";
      context.fillStyle = display.nightMode ? "#ff8178" : "#dbe8f7";
      for (const candidate of dsoLabelCandidates) {
        if (!candidate.isSelected && placedDsoLabels >= dsoLabelBudget) break;
        const text =
          candidate.object.primaryName ||
          candidate.object.name ||
          candidate.object.id;
        const left = candidate.x + 6;
        const labelWidth = context.measureText(text).width;
        const box = {
          left: left - 2,
          right: left + labelWidth + 2,
          top: candidate.y - 16,
          bottom: candidate.y,
        };
        const collides = placedDsoLabelBoxes.some(
          (placed) =>
            box.left < placed.right + 3 &&
            box.right + 3 > placed.left &&
            box.top < placed.bottom + 3 &&
            box.bottom + 3 > placed.top,
        );
        if (!candidate.isSelected && collides) continue;
        context.fillText(text, left, candidate.y - 4);
        placedDsoLabelBoxes.push(box);
        placedDsoLabels += 1;
      }
    }
    if (display.solarSystem) {
      const timestamp = currentUtcMs();
      const solarObjects = currentSolarSystemObjects(timestamp);
      for (const object of solarObjects) {
        const point = project(object);
        if (!point) continue;
        const { x, y } = point;
        if (x < 0 || x > width || y < 0 || y > height) continue;
        if (!isAboveHorizon(object)) continue;
        const isSelected = isSelectedObject(object);
        const radius = isSelected
          ? 7
          : Math.max(3, Math.min(6, 5 - (object.mag ?? 5) * 0.18));
        context.fillStyle = display.nightMode ? "#ff584f" : "#f6c978";
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        if (isSelected) {
          context.strokeStyle = display.nightMode ? "#ffaaa4" : "#fff1bd";
          context.beginPath();
          context.arc(x, y, radius + 3, 0, Math.PI * 2);
          context.stroke();
        }
        hitTargets.push({ x, y, object });
        if (
          display.labels &&
          (!object.parentBody || isSelected || view.fovDeg < 2)
        ) {
          context.font = "11px system-ui";
          context.fillText(object.name, x + radius + 4, y - 4);
        }
      }
    }
    if (display.comets) {
      const magnitudeLimit = view.fovDeg > 55 ? 8 : view.fovDeg > 25 ? 12 : 18;
      for (const object of currentComets()) {
        const isSelected = isSelectedObject(object);
        if (
          !isSelected &&
          (!Number.isFinite(object.mag) || object.mag > magnitudeLimit)
        )
          continue;
        const point = project(object);
        if (!point) continue;
        const { x, y } = point;
        if (x < 0 || x > width || y < 0 || y > height) continue;
        if (!isAboveHorizon(object)) continue;
        const radius = isSelected ? 6 : 3.5;
        context.save();
        context.fillStyle = display.nightMode ? "#ff584f" : "#80e2c2";
        context.shadowColor = context.fillStyle;
        context.shadowBlur = 6;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = context.fillStyle;
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(x + radius + 8, y + 4);
        context.stroke();
        if (isSelected) {
          context.strokeStyle = "#fff1bd";
          context.beginPath();
          context.arc(x, y, radius + 3, 0, Math.PI * 2);
          context.stroke();
        }
        drawObjectBox(
          x,
          y,
          radius + 6,
          isSelected ? "#fff1bd" : context.fillStyle,
        );
        context.restore();
        hitTargets.push({ x, y, object });
        if (
          display.labels &&
          (isSelected || object.mag <= 10 || view.fovDeg < 20)
        ) {
          context.font = "10px system-ui";
          context.fillStyle = display.nightMode ? "#ff8178" : "#a7f3dc";
          context.fillText(object.name, x + radius + 5, y - 4);
        }
      }
    }
    if (display.cardinals && display.labels) {
      context.save();
      context.font = "600 11px system-ui";
      context.textAlign = "center";
      context.textBaseline = "bottom";
      for (const [label, azimuthDeg] of [
        ["N", 0],
        ["E", 90],
        ["S", 180],
        ["W", 270],
      ]) {
        const point = project(
          horizontalToEquatorial(
            { azimuthDeg, altitudeDeg: 0 },
            observer,
            referenceUtcMs,
            view.center.frame,
          ),
        );
        if (!point) continue;
        context.fillStyle = display.nightMode ? "#ff6b62" : "#f6c978";
        context.fillText(label, point.x, point.y - 5);
      }
      context.restore();
    }
    if (mount?.connected) {
      const point = isAboveHorizon(mount.coordinates)
        ? project(mount.coordinates)
        : null;
      if (point) {
        const { x, y } = point;
        context.strokeStyle = mount.stale ? "#f6c978" : "#62d8ff";
        context.beginPath();
        context.arc(x, y, 8, 0, Math.PI * 2);
        context.moveTo(x - 12, y);
        context.lineTo(x + 12, y);
        context.moveTo(x, y - 12);
        context.lineTo(x, y + 12);
        context.stroke();
      }
    }
    if (fieldOfView) {
      const panelWidth = projectAngularExtent(fieldOfView.widthDeg, scale);
      const panelHeight = projectAngularExtent(fieldOfView.heightDeg, scale);
      context.save();
      context.translate(width / 2, height / 2);
      const screenRotationDeg = cameraFrameScreenRotationDeg(
        projectionView.rotationDeg ?? 0,
        fieldOfView.rotationDeg,
        fieldOfView.rotationConvention,
        Boolean(projectionView.mirrorX),
      );
      context.rotate((screenRotationDeg * Math.PI) / 180);
      context.strokeStyle = "#64e39c";
      const mosaic = fieldOfView.mosaic;
      if (mosaic) {
        const overlap = mosaic.overlapPercent / 100;
        const stepX = panelWidth * (1 - overlap);
        const stepY = panelHeight * (1 - overlap);
        for (let row = 0; row < mosaic.rows; row += 1) {
          for (let column = 0; column < mosaic.columns; column += 1) {
            const x = (column - (mosaic.columns - 1) / 2) * stepX;
            const y = (row - (mosaic.rows - 1) / 2) * stepY;
            context.strokeRect(
              x - panelWidth / 2,
              y - panelHeight / 2,
              panelWidth,
              panelHeight,
            );
          }
        }
      } else {
        context.strokeRect(
          -panelWidth / 2,
          -panelHeight / 2,
          panelWidth,
          panelHeight,
        );
      }
      context.restore();
    }
    if (display.horizon && horizon.length > 1) {
      context.strokeStyle = "#f6c978";
      context.beginPath();
      let drawing = false;
      for (let index = 0; index < horizon.length; index += 1) {
        const point = horizon[index];
        const projected = project(
          horizontalToEquatorial(
            point,
            observer,
            referenceUtcMs,
            view.center.frame,
          ),
        );
        if (!projected) {
          drawing = false;
          continue;
        }
        if (drawing) context.lineTo(projected.x, projected.y);
        else {
          context.moveTo(projected.x, projected.y);
          drawing = true;
        }
      }
      context.stroke();
    }
    if (interactionViewChangePending) {
      interactionViewChangePending = false;
      onViewChange?.(structuredClone(view));
    }
  };
  const invalidate = () => {
    if (!destroyed && !paused && frameId === null)
      frameId = requestAnimationFrame(draw);
  };
  const handleOnline = () => {
    if (destroyed) return;
    skySurveyFailures.clear();
    skySurveyRuntime.failedTiles = 0;
    skySurveyRuntime.lastError = null;
    resetSkySurveyRaster();
    invalidate();
  };
  globalThis.addEventListener?.("online", handleOnline);
  const resizeObserver = new ResizeObserver(invalidate);
  resizeObserver.observe(container);
  const handleContextLost = (event) => {
    event.preventDefault();
    renderingContextLost = true;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    cancelActiveInteraction();
  };
  const handleContextRestored = () => {
    renderingContextLost = false;
    invalidate();
  };

  const pointerDown = (event) => {
    if (
      destroyed ||
      paused ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic tests and some embedded webviews can reject pointer capture.
    }
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (activePointers.size >= 2) {
      const [first, second] = [...activePointers.values()];
      pinch = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        fovDeg: view.fovDeg,
      };
      drag = null;
      return;
    }
    if (!event.isPrimary) return;
    const timestampUtcMs = currentUtcMs();
    const center = view.center;
    const horizontalCenter = equatorialToHorizontal(
      center,
      observer,
      timestampUtcMs,
    );
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      center,
      horizontalCenter,
      timestampUtcMs,
      moved: false,
    };
  };
  const pointerMove = (event) => {
    if (activePointers.has(event.pointerId))
      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    if (pinch && activePointers.size >= 2) {
      event.preventDefault();
      const [first, second] = [...activePointers.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      view = {
        ...view,
        fovDeg: pinchZoomFov(pinch.fovDeg, pinch.distance, distance),
      };
      lowQualityUntil = performance.now() + 180;
      interactionViewChangePending = true;
      invalidate();
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3)
      drag.moved = true;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const next = horizontalToEquatorial(
      panHorizontalView(
        drag.horizontalCenter,
        coordinateMode === "horizontal" ? dx : -dx,
        dy,
        view.fovDeg,
        height,
      ),
      observer,
      drag.timestampUtcMs,
      drag.center.frame,
    );
    view = { ...view, center: next };
    lowQualityUntil = performance.now() + 180;
    interactionViewChangePending = true;
    invalidate();
  };
  const finishPointer = (event) => {
    event?.preventDefault?.();
    if (event?.pointerId !== undefined) activePointers.delete(event.pointerId);
    if (pinch) {
      const pointerId = event?.pointerId;
      pinch = null;
      drag = null;
      try {
        if (pointerId !== undefined && canvas.hasPointerCapture?.(pointerId))
          canvas.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already be gone after cancellation.
      }
      lowQualityUntil = performance.now();
      invalidate();
      return;
    }
    if (
      !drag ||
      (event?.pointerId !== undefined && drag.pointerId !== event.pointerId)
    )
      return;
    const completed = drag;
    const pointerId = completed.pointerId;
    drag = null;
    try {
      if (canvas.hasPointerCapture?.(pointerId))
        canvas.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already be gone after cancellation or synthetic input.
    }
    if (
      !completed.moved &&
      event &&
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY)
    ) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = hitTargets
        .filter((target) => Math.hypot(target.x - x, target.y - y) <= 12)
        .sort(
          (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
        )[0];
      if (hit) {
        selected = selectedTargetPayload(hit.object);
        onSelect?.(selected);
        invalidate();
      }
    }
    lowQualityUntil = performance.now();
    invalidate();
  };
  const wheel = (event) => {
    if (destroyed || paused) return;
    event.preventDefault();
    view = {
      ...view,
      fovDeg: Math.max(
        0.05,
        Math.min(MAX_FOV_DEG, view.fovDeg * Math.exp(event.deltaY * 0.001)),
      ),
    };
    lowQualityUntil = performance.now() + 180;
    if (qualityRefinementTimer !== null) clearTimeout(qualityRefinementTimer);
    qualityRefinementTimer = setTimeout(() => {
      qualityRefinementTimer = null;
      lowQualityUntil = performance.now();
      invalidate();
    }, 220);
    interactionViewChangePending = true;
    invalidate();
  };
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", finishPointer);
  canvas.addEventListener("pointercancel", finishPointer);
  canvas.addEventListener("lostpointercapture", finishPointer);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextlost", handleContextLost);
  canvas.addEventListener("contextrestored", handleContextRestored);

  return Object.freeze({
    resume() {
      assertAlive();
      paused = false;
      if (clockTimer === null) clockTimer = setInterval(invalidate, 60000);
      processSkySurveyQueue();
      invalidate();
    },
    pause() {
      assertAlive();
      paused = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      if (clockTimer !== null) clearInterval(clockTimer);
      if (qualityRefinementTimer !== null) clearTimeout(qualityRefinementTimer);
      frameId = null;
      clockTimer = null;
      qualityRefinementTimer = null;
      for (const request of skySurveyQueue)
        skySurveyPending.delete(request.requestKey);
      skySurveyQueue = [];
      skySurveyWantedRequests = new Set();
      skySurveyWantedSignature = "";
      abortSkySurveyRequests();
      cancelSkySurveyRasterJob();
      skySurveyRuntime.pendingTiles = 0;
      cancelActiveInteraction();
      if (interactionViewChangePending) {
        interactionViewChangePending = false;
        onViewChange?.(structuredClone(view));
      }
    },
    resize() {
      assertAlive();
      invalidate();
    },
    setCoordinateMode(value) {
      assertAlive();
      if (value !== "horizontal" && value !== "equatorial")
        throw new TypeError(
          'Coordinate mode must be "horizontal" or "equatorial"',
        );
      coordinateMode = value;
      invalidate();
    },
    setObserver(value) {
      assertAlive();
      observer = validateObserver(value);
      invalidate();
    },
    setTime(value) {
      assertAlive();
      if (!Number.isFinite(value))
        throw new TypeError("UTC time must be milliseconds");
      utcMs = value;
      clockSetAt = performance.now();
      invalidate();
    },
    setTimeRate(value) {
      assertAlive();
      if (!Number.isFinite(value))
        throw new TypeError("Time rate must be finite");
      utcMs = currentUtcMs();
      clockSetAt = performance.now();
      timeRate = value;
      invalidate();
    },
    getTime() {
      assertAlive();
      return currentUtcMs();
    },
    getView() {
      assertAlive();
      return structuredClone(view);
    },
    setView(value) {
      assertAlive();
      const center = validateEquatorialCoordinates(value?.center);
      if (
        !Number.isFinite(value.fovDeg) ||
        value.fovDeg <= 0 ||
        value.fovDeg > 180
      )
        throw new RangeError("fovDeg must be in (0, 180]");
      view = { center, fovDeg: Math.min(MAX_FOV_DEG, value.fovDeg) };
      onViewChange?.(structuredClone(view));
      invalidate();
    },
    setMountPosition(value) {
      assertAlive();
      if (value === null) mount = null;
      else {
        if (
          typeof value.connected !== "boolean" ||
          typeof value.stale !== "boolean" ||
          !Number.isFinite(value.timestampUtcMs)
        )
          throw new TypeError("Invalid mount position");
        mount = {
          ...value,
          coordinates: validateEquatorialCoordinates(value.coordinates),
        };
        if (mountFollow && mount.connected) {
          view = { ...view, center: mount.coordinates };
          onViewChange?.(structuredClone(view));
        }
      }
      invalidate();
    },
    setMountFollow(value) {
      assertAlive();
      mountFollow = Boolean(value);
      if (mountFollow && mount?.connected) {
        view = { ...view, center: mount.coordinates };
        onViewChange?.(structuredClone(view));
      }
      invalidate();
    },
    focusMount() {
      assertAlive();
      if (!mount?.connected) return false;
      view = { ...view, center: mount.coordinates };
      onViewChange?.(structuredClone(view));
      invalidate();
      return true;
    },
    setFieldOfView(value) {
      assertAlive();
      if (value === null) fieldOfView = null;
      else {
        if (
          ![value.widthDeg, value.heightDeg, value.rotationDeg].every(
            Number.isFinite,
          ) ||
          value.widthDeg <= 0 ||
          value.widthDeg >= 180 ||
          value.heightDeg <= 0 ||
          value.heightDeg >= 180
        )
          throw new TypeError("Invalid field-of-view overlay");
        if (
          ![
            "clockwise-from-celestial-north",
            "counterclockwise-from-celestial-north",
          ].includes(value.rotationConvention)
        )
          throw new TypeError("FOV rotation convention is required");
        if (value.mosaic) {
          const { columns, rows, overlapPercent } = value.mosaic;
          if (
            !Number.isInteger(columns) ||
            columns < 1 ||
            !Number.isInteger(rows) ||
            rows < 1 ||
            !Number.isFinite(overlapPercent) ||
            overlapPercent < 0 ||
            overlapPercent >= 100
          )
            throw new TypeError("Invalid mosaic configuration");
        }
        fieldOfView = structuredClone(value);
      }
      invalidate();
    },
    setHorizon(points) {
      assertAlive();
      if (!Array.isArray(points))
        throw new TypeError("Horizon must be an array");
      horizon = points.map((point) => {
        if (
          !Number.isFinite(point.azimuthDeg) ||
          !Number.isFinite(point.altitudeDeg) ||
          point.altitudeDeg < -90 ||
          point.altitudeDeg > 90
        )
          throw new TypeError("Invalid horizon point");
        return {
          azimuthDeg: ((point.azimuthDeg % 360) + 360) % 360,
          altitudeDeg: point.altitudeDeg,
        };
      });
      horizon.sort((left, right) => left.azimuthDeg - right.azimuthDeg);
      milkyWayRasterCache = { key: "", raster: null };
      milkyWayUploadKey = "";
      resetSkySurveyRaster();
      invalidate();
    },
    setSkySurvey(value) {
      assertAlive();
      if (value === null) {
        skySurvey = null;
        resetSkySurveyRuntime({ clearTiles: true });
        invalidate();
        return;
      }
      const source = normalizeSkySurveySource(
        value,
        skySurveyDecodedByteBudget,
      );
      if (
        skySurvey?.key === source.key &&
        skySurvey?.url === source.url &&
        skySurvey?.minOrder === source.minOrder &&
        skySurvey?.maxOrder === source.maxOrder &&
        skySurvey?.tileWidth === source.tileWidth &&
        skySurvey?.format === source.format &&
        skySurvey?.frame === source.frame &&
        skySurvey?.label === source.label &&
        skySurvey?.creditLabel === source.creditLabel &&
        skySurvey?.attribution === source.attribution &&
        skySurvey?.attributionUrl === source.attributionUrl &&
        skySurvey?.rightsUrl === source.rightsUrl
      )
        return;
      skySurvey = source;
      resetSkySurveyRuntime({ clearTiles: true });
      invalidate();
    },
    async setLandscape(value) {
      assertAlive();
      const token = ++landscapeLoadToken;
      if (value === null) {
        landscape = null;
        landscapeRasterCache = { key: "", raster: null };
        landscapeUploadKey = "";
        invalidate();
        return true;
      }
      if (
        !value ||
        typeof value.url !== "string" ||
        !value.url.trim() ||
        typeof value.key !== "string" ||
        !value.key.trim()
      )
        throw new TypeError("Landscape requires non-empty url and key values");
      const source = { url: value.url.trim(), key: value.key.trim() };
      if (
        landscape?.source.url === source.url &&
        landscape?.source.key === source.key
      )
        return true;
      landscape = null;
      landscapeRasterCache = { key: "", raster: null };
      landscapeUploadKey = "";
      invalidate();
      try {
        await loadLandscape(source, token);
        return !destroyed && token === landscapeLoadToken;
      } catch (error) {
        if (!destroyed && token === landscapeLoadToken) onError?.(error);
        return false;
      }
    },
    setDisplayOptions(value) {
      assertAlive();
      const nextDisplay = { ...value };
      if (
        value.starMagnitudeLimit !== undefined &&
        (!Number.isFinite(value.starMagnitudeLimit) ||
          value.starMagnitudeLimit < -2 ||
          value.starMagnitudeLimit > 30)
      )
        throw new TypeError("Invalid star magnitude limit");
      for (const [key, label] of [
        ["galaxyMagnitudeLimit", "galaxy"],
        ["deepSkyMagnitudeLimit", "deep-sky"],
      ])
        if (
          value[key] !== undefined &&
          (!Number.isFinite(value[key]) || value[key] < -2 || value[key] > 30)
        )
          throw new TypeError(`Invalid ${label} magnitude limit`);
      if (
        value.starScale !== undefined &&
        (!Number.isFinite(value.starScale) ||
          value.starScale < 0.25 ||
          value.starScale > 4)
      )
        throw new TypeError("Invalid star scale");
      for (const [key, label] of [
        ["deepSkyObjectTypes", "Deep-sky object types"],
        ["deepSkyCatalogueGroups", "Deep-sky catalogue groups"],
      ]) {
        if (value[key] === undefined) continue;
        if (value[key] === null) {
          nextDisplay[key] = null;
          continue;
        }
        if (!Array.isArray(value[key]))
          throw new TypeError(`${label} must be an array or null`);
        nextDisplay[key] = value[key].map((item) => {
          if (typeof item !== "string" || !item.trim())
            throw new TypeError(`${label} entries must be non-empty strings`);
          return item.trim();
        });
      }
      if (value.deepSkyObjectTypes !== undefined)
        deepSkyObjectTypeAllowlist =
          nextDisplay.deepSkyObjectTypes === null
            ? null
            : new Set(
                nextDisplay.deepSkyObjectTypes.map((item) =>
                  item.toLowerCase(),
                ),
              );
      if (value.deepSkyCatalogueGroups !== undefined)
        deepSkyCatalogueGroupAllowlist =
          nextDisplay.deepSkyCatalogueGroups === null
            ? null
            : new Set(
                nextDisplay.deepSkyCatalogueGroups.map((item) =>
                  item.toLowerCase(),
                ),
              );
      display = { ...display, ...nextDisplay };
      invalidate();
    },
    focusTarget(
      target,
      fovDeg = target.parentBody ? 0.5 : Math.min(view.fovDeg, 15),
    ) {
      assertAlive();
      const center = validateEquatorialCoordinates(
        target.coordinates ?? target,
      );
      view = {
        center,
        fovDeg: Math.max(0.05, Math.min(MAX_FOV_DEG, fovDeg)),
      };
      selected = objectIdentity(target) ? { ...target } : null;
      onViewChange?.(structuredClone(view));
      invalidate();
    },
    select(value) {
      assertAlive();
      const payload = selectedTargetPayload(value);
      selected = objectIdentity(payload) ? payload : null;
      onSelect?.(payload);
      invalidate();
    },
    search(query) {
      assertAlive();
      if (!normalizeCatalogIdentifier(query)) return [];
      const solarSystemObjects = display.solarSystem
        ? [
            ...getSolarSystemObjects(currentUtcMs(), observer),
            ...getJupiterMoonObjects(currentUtcMs(), observer),
          ]
        : [];
      const comets = display.comets ? currentComets() : [];
      const dynamicSearchIndex = createCatalogSearchIndex([
        ...solarSystemObjects,
        ...comets,
      ]);
      return searchCatalogIndex(
        [...dynamicSearchIndex, ...searchableObjectIndex],
        query,
        20,
      );
    },
    getState() {
      assertAlive();
      return structuredClone({
        observer,
        utcMs: currentUtcMs(),
        timeRate,
        view,
        coordinateMode,
        display,
        skySurvey: {
          ...skySurveyRuntime,
          enabled: Boolean(display.skySurvey),
          configured: Boolean(skySurvey),
          source: skySurvey
            ? {
                key: skySurvey.key,
                label: skySurvey.label,
                creditLabel: skySurvey.creditLabel,
                attribution: skySurvey.attribution,
                attributionUrl: skySurvey.attributionUrl,
                rightsUrl: skySurvey.rightsUrl,
              }
            : null,
        },
        paused,
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      landscapeLoadToken += 1;
      skySurveySourceToken += 1;
      abortSkySurveyRequests();
      cancelSkySurveyRasterJob();
      skySurveyQueue = [];
      skySurveyPending.clear();
      clearSkySurveyTiles();
      landscape = null;
      landscapeRasterCache = { key: "", raster: null };
      landscapeUploadKey = "";
      if (frameId !== null) cancelAnimationFrame(frameId);
      if (clockTimer !== null) clearInterval(clockTimer);
      if (qualityRefinementTimer !== null) clearTimeout(qualityRefinementTimer);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", finishPointer);
      canvas.removeEventListener("pointercancel", finishPointer);
      canvas.removeEventListener("lostpointercapture", finishPointer);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextlost", handleContextLost);
      canvas.removeEventListener("contextrestored", handleContextRestored);
      globalThis.removeEventListener?.("online", handleOnline);
      cancelActiveInteraction();
      surveyCredit.remove();
      canvas.remove();
      if (positionedContainer && container.style.position === "relative")
        container.style.position = originalContainerPosition;
      frameId = null;
      clockTimer = null;
      qualityRefinementTimer = null;
    },
  });
}
