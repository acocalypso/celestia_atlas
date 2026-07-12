import {
  equatorialToHorizontal,
  horizonAltitudeAtAzimuth,
  validateEquatorialCoordinates,
  horizontalToEquatorial,
  panHorizontalView,
  pinchZoomFov,
  validateObserver,
} from "./core/coordinates.js";
import { projectAngularExtent, projectEquatorial } from "./core/projection.js";
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

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const MAX_FOV_DEG = 130;
const DEFAULT_MILKY_WAY_URL = new URL(
  "../assets/milky-way.webp",
  import.meta.url,
).href;

export function createCelestiaAtlasViewer(options) {
  const coarsePointer = Boolean(
    globalThis.matchMedia?.("(pointer: coarse)")?.matches,
  );
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
  } = options ?? {};
  if (!(container instanceof HTMLElement))
    throw new TypeError("container must be an HTMLElement");

  const canvas = document.createElement("canvas");
  canvas.className = "celestia-atlas-canvas";
  canvas.style.cssText =
    "display:block;width:100%;height:100%;touch-action:none";
  canvas.setAttribute("aria-label", "Interactive offline sky atlas");
  container.append(canvas);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D rendering is unavailable");
  const landscapeCanvas = document.createElement("canvas");
  const landscapeContext = landscapeCanvas.getContext("2d");
  const milkyWayCanvas = document.createElement("canvas");
  const milkyWayContext = milkyWayCanvas.getContext("2d");

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
  let display = {
    grid: true,
    azimuthalGrid: false,
    meridian: false,
    ecliptic: false,
    atmosphere: true,
    milkyWay: true,
    cardinals: false,
    constellations: true,
    labels: true,
    starMagnitudeLimit: 6.5,
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
  const searchableObjects = [...stars, ...catalog];
  const starsByName = new Map();
  for (const star of stars) {
    starsByName.set(String(star.name).toLocaleLowerCase(), star);
    if (star.alias)
      starsByName.set(String(star.alias).toLocaleLowerCase(), star);
  }

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
  const loadImagePixels = async (url) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () =>
        reject(new Error(`Unable to load landscape tile: ${url}`));
      image.src = url;
    });
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = image.naturalWidth;
    tileCanvas.height = image.naturalHeight;
    const tileContext = tileCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!tileContext) throw new Error("Landscape tile decoding is unavailable");
    tileContext.drawImage(image, 0, 0);
    return {
      width: tileCanvas.width,
      height: tileCanvas.height,
      data: tileContext.getImageData(0, 0, tileCanvas.width, tileCanvas.height)
        .data,
    };
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
  const drawDsoGlyph = (object, x, y, size, selected) => {
    const type = String(object.type ?? object.objectType ?? "").toLowerCase();
    const color = type.includes("galaxy")
      ? "#aa91ff"
      : type.includes("cluster")
        ? "#62d8ff"
        : "#f6c978";
    context.save();
    context.translate(x, y);
    context.strokeStyle = selected ? "#fff1bd" : color;
    context.fillStyle = context.strokeStyle;
    context.lineWidth = selected ? 1.4 : 1;
    if (type.includes("galaxy")) {
      context.rotate(((object.positionAngle ?? -20) * Math.PI) / 180);
      context.beginPath();
      context.ellipse(0, 0, size * 1.45, size * 0.55, 0, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, Math.max(1.1, size * 0.18), 0, Math.PI * 2);
      context.fill();
    } else if (type.includes("globular")) {
      context.beginPath();
      context.arc(0, 0, size, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(-size, 0);
      context.lineTo(size, 0);
      context.moveTo(0, -size);
      context.lineTo(0, size);
      context.stroke();
    } else if (type.includes("open cluster") || type.includes("association")) {
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
    } else if (type.includes("nebula") || type.includes("remnant")) {
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
  const rasterOutputWidth = (width, dpr) => {
    return landscapeRasterWidth(
      width,
      dpr,
      performance.now() < lowQualityUntil,
      coarsePointer,
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
  const shouldDrawDso = (object) => {
    if (selected?.id && selected.id === object.id) return true;
    if (Number.isFinite(object.mag ?? object.magnitude))
      return (object.mag ?? object.magnitude) <= dsoMagnitudeLimit();
    return view.fovDeg < 18;
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
    if (!display.azimuthalGrid) return view;
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
    for (const star of stars) {
      if ((star.mag ?? 99) > display.starMagnitudeLimit) continue;
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
      const radius =
        Math.max(0.7, Math.min(4, 3.5 - (star.mag ?? 4) * 0.45)) *
        display.starScale;
      context.fillStyle = display.nightMode ? "#ff584f" : "#edf5ff";
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      hitTargets.push({ x: point.x, y: point.y, object: star });
      if (display.labels && (star.mag < 1.5 || view.fovDeg < 25)) {
        context.font = "10px system-ui";
        context.fillText(star.name, point.x + radius + 3, point.y - 3);
      }
    }
    if (display.deepSkyObjects)
      for (const object of catalog) {
        if (!shouldDrawDso(object)) continue;
        if (!Number.isFinite(object.raDeg) || !Number.isFinite(object.decDeg))
          continue;
        const point = project(object);
        if (!point) continue;
        const { x, y } = point;
        if (x < 0 || x > width || y < 0 || y > height) continue;
        if (!isAboveHorizon(object)) continue;
        const isSelected = selected?.id === object.id;
        const glyphSize = Math.max(3.7, Math.min(10, 3.2 + 70 / view.fovDeg));
        drawDsoGlyph(object, x, y, glyphSize, isSelected);
        hitTargets.push({ x, y, object });
        if (display.labels && (isSelected || view.fovDeg < 20)) {
          context.font = "11px system-ui";
          context.fillStyle = display.nightMode ? "#ff8178" : "#dbe8f7";
          context.fillText(object.id || object.name, x + 6, y - 4);
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
        const isSelected = selected?.id === object.id;
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
        const isSelected = selected?.id === object.id;
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
      const direction =
        fieldOfView.rotationConvention === "clockwise-from-celestial-north"
          ? 1
          : -1;
      context.rotate((direction * fieldOfView.rotationDeg * Math.PI) / 180);
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
      const horizonUtcMs = currentUtcMs();
      for (let index = 0; index < horizon.length; index += 1) {
        const point = horizon[index];
        const projected = project(
          horizontalToEquatorial(
            point,
            observer,
            horizonUtcMs,
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
      panHorizontalView(drag.horizontalCenter, dx, dy, view.fovDeg, height),
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
        selected = hit.object;
        onSelect?.({
          id: hit.object.id,
          name: hit.object.name || hit.object.id,
          aliases: hit.object.aliases,
          objectType: hit.object.type,
          parentBody: hit.object.parentBody,
          magnitude: hit.object.mag,
          catalogueSource: hit.object.catalogSource,
          coordinates: validateEquatorialCoordinates({
            raDeg: hit.object.raDeg,
            decDeg: hit.object.decDeg,
            frame: hit.object.frame || "ICRS",
          }),
        });
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
      if (
        value.starMagnitudeLimit !== undefined &&
        (!Number.isFinite(value.starMagnitudeLimit) ||
          value.starMagnitudeLimit < -2 ||
          value.starMagnitudeLimit > 30)
      )
        throw new TypeError("Invalid star magnitude limit");
      if (
        value.starScale !== undefined &&
        (!Number.isFinite(value.starScale) ||
          value.starScale < 0.25 ||
          value.starScale > 4)
      )
        throw new TypeError("Invalid star scale");
      display = { ...display, ...value };
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
      selected = target.id ? { ...target, id: target.id } : null;
      onViewChange?.(structuredClone(view));
      invalidate();
    },
    select(value) {
      assertAlive();
      const coordinates = validateEquatorialCoordinates(value.coordinates);
      selected = value.id ? { ...value, id: value.id } : null;
      onSelect?.({ ...value, coordinates });
      invalidate();
    },
    search(query) {
      assertAlive();
      const needle = String(query).trim().toLocaleLowerCase();
      if (!needle) return [];
      const solarSystemObjects = display.solarSystem
        ? [
            ...getSolarSystemObjects(currentUtcMs(), observer),
            ...getJupiterMoonObjects(currentUtcMs(), observer),
          ]
        : [];
      const comets = display.comets ? currentComets() : [];
      return [...solarSystemObjects, ...comets, ...searchableObjects]
        .filter((item) =>
          [item.name, item.id, ...(item.aliases ?? [])].some((text) =>
            String(text ?? "")
              .toLocaleLowerCase()
              .includes(needle),
          ),
        )
        .slice(0, 20);
    },
    getState() {
      assertAlive();
      return structuredClone({
        observer,
        utcMs: currentUtcMs(),
        timeRate,
        view,
        paused,
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      landscapeLoadToken += 1;
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
      cancelActiveInteraction();
      canvas.remove();
      frameId = null;
      clockTimer = null;
      qualityRefinementTimer = null;
    },
  });
}
