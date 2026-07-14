import {
  calculateCameraFieldOfView,
  combineCatalogLayers,
  createCelestiaAtlasViewer,
  equatorialToHorizontal,
  horizontalToEquatorial,
} from "./src/index.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const uniqueStrings = (values) => [
  ...new Set(
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  ),
];

function sourceCatalogueName(source) {
  if (typeof source === "string") return source;
  return (
    source?.catalogueGroup ||
    source?.catalogue ||
    source?.catalogueName ||
    source?.catalogName ||
    source?.sourceCatalogue ||
    source?.sourceName ||
    source?.name ||
    source?.group
  );
}

function catalogueGroupsFor(object) {
  const canonicalGroups = (values) =>
    uniqueStrings(values).map((value) => value.toLowerCase());
  const explicitGroups = canonicalGroups(
    object.catalogueGroups ?? object.catalogGroups ?? [],
  );
  if (explicitGroups.length) return explicitGroups;
  const sources = Array.isArray(object.sources)
    ? object.sources
    : object.sources
      ? [object.sources]
      : [];
  return canonicalGroups([
    sources.map(sourceCatalogueName),
    object.catalogueSource,
    object.catalogSource,
  ]);
}

const layeredCatalog = combineCatalogLayers(
  globalThis.DSO_DATA ?? [],
  globalThis.STELLARIUM_DSO_SUPPLEMENT_DATA ?? [],
  globalThis.DSO_CATALOG_META ?? globalThis.OPENNGC_CATALOG_META ?? {},
  globalThis.STELLARIUM_DSO_SUPPLEMENT_META ?? {},
);
globalThis.DSO_DATA = layeredCatalog.objects;
globalThis.DSO_CATALOG_META = layeredCatalog.meta;

const stars = (globalThis.STAR_DATA ?? []).map((star) => ({
  ...star,
  id: star.name,
  aliases: [star.alias].filter(Boolean),
  raDeg: star.ra * 15,
  decDeg: star.dec,
  frame: "ICRS",
  type: "Star",
}));
const catalog = layeredCatalog.objects.map((object) => {
  const raDeg = Number.isFinite(object.raDeg)
    ? object.raDeg
    : Number.isFinite(object.coordinates?.raDeg)
      ? object.coordinates.raDeg
      : object.ra * 15;
  const decDeg = Number.isFinite(object.decDeg)
    ? object.decDeg
    : Number.isFinite(object.coordinates?.decDeg)
      ? object.coordinates.decDeg
      : object.dec;
  return {
    ...object,
    name: object.name || object.primaryName || object.id,
    raDeg,
    decDeg,
    frame: object.frame || object.coordinates?.frame || "ICRS",
    typeCode: object.typeCode || object.objectType || object.type,
    catalogueGroups: catalogueGroupsFor(object),
    angularSizeArcMin: object.angularSizeArcMin ?? {
      major: object.major,
      minor: object.minor,
    },
  };
});
const constellations = globalThis.CONSTELLATION_LINES ?? {};
const catalogMeta = layeredCatalog.meta;
const catalogVersion =
  catalogMeta.version ||
  catalogMeta.generatedAt ||
  `schema ${catalogMeta.schemaVersion ?? 1}`;
const availableObjectTypes = uniqueStrings(
  catalog.map((object) => object.typeCode),
).sort((left, right) => left.localeCompare(right));
const availableCatalogueGroups = uniqueStrings(
  catalog.map((object) => object.catalogueGroups),
).sort((left, right) => left.localeCompare(right));
const objectTypeLabels = new Map(
  catalog.map((object) => [
    object.typeCode,
    object.objectType || object.type || object.typeCode,
  ]),
);
const catalogueGroupLabels = new Map([
  ["openngc", "OpenNGC"],
  ["ldn", "LDN"],
  ["barnard", "Barnard"],
  ["lbn", "LBN"],
  ["sharpless", "Sharpless 2"],
  ["vdb", "vdB"],
  ["rcw", "RCW"],
  ["dcld", "Southern Dark Clouds"],
  ["feitzinger", "Feitzinger-Stuewe"],
]);

const state = {
  mode: "horizontal",
  observer: { latitudeDeg: 52.52, longitudeDeg: 13.405, elevationM: 0 },
  grid: true,
  constellations: true,
  deepSkyObjects: true,
  labels: true,
  milkyWay: true,
  cardinals: true,
  ecliptic: false,
  meridian: false,
  atmosphere: true,
  landscape: true,
  hideBelowHorizon:
    localStorage.getItem("celestia-atlas.hide-below-horizon") !== "false",
  nightMode: false,
  starMagnitudeLimit: 5.5,
  galaxyMagnitudeLimit: 30,
  deepSkyMagnitudeLimit: 30,
  deepSkyObjectTypes: availableObjectTypes.length
    ? [...availableObjectTypes]
    : null,
  deepSkyCatalogueGroups: availableCatalogueGroups.length
    ? [...availableCatalogueGroups]
    : null,
  starScale: 1,
  dsoImages: true,
  timeRate: 0,
  fieldOfView: false,
};

let viewer;
let currentView = {
  center: horizontalToEquatorial(
    { azimuthDeg: 180, altitudeDeg: 35 },
    state.observer,
    Date.now(),
  ),
  fovDeg: 70,
};
let selectedTarget = null;
let searchResults = [];
let toastTimer;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function formatRa(raDeg) {
  const hours = (((raDeg / 15) % 24) + 24) % 24;
  const h = Math.floor(hours);
  const minutes = (hours - h) * 60;
  const m = Math.floor(minutes);
  const s = (minutes - m) * 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${s.toFixed(1).padStart(4, "0")}s`;
}

function formatDec(decDeg) {
  const sign = decDeg < 0 ? "−" : "+";
  const absolute = Math.abs(decDeg);
  const degrees = Math.floor(absolute);
  const minutes = Math.floor((absolute - degrees) * 60);
  return `${sign}${String(degrees).padStart(2, "0")}° ${String(minutes).padStart(2, "0")}′`;
}

function normalizeTarget(object) {
  const coordinates = object.coordinates ?? {
    raDeg: object.raDeg,
    decDeg: object.decDeg,
    frame: object.frame || "ICRS",
  };
  return {
    ...object,
    id: object.id || object.name,
    name: object.name || object.primaryName || object.id,
    objectType: object.objectType || object.type,
    typeCode: object.typeCode || object.objectType || object.type,
    magnitude: object.magnitude ?? object.mag,
    catalogueSource: object.catalogueSource || object.catalogSource,
    catalogueGroups: catalogueGroupsFor(object),
    aliases: uniqueStrings([
      object.aliases ?? [],
      object.id,
      object.primaryName || object.name,
    ]),
    coordinates,
  };
}

function imageKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function showObjectImage(target) {
  const image = $("#objectImage");
  const caption = $("#objectImageCaption");
  const sketch = $("#objectSketch");
  image.hidden = true;
  caption.hidden = true;
  sketch.hidden = false;
  const context = sketch.getContext("2d");
  context.clearRect(0, 0, sketch.width, sketch.height);
  context.fillStyle = state.nightMode ? "#ff584f" : "#80bfff";
  context.beginPath();
  context.arc(sketch.width / 2, sketch.height / 2, 24, 0, Math.PI * 2);
  context.fill();
  if (!state.dsoImages) return;
  const keys = [target.id, target.name, ...(target.aliases ?? [])].map(
    imageKey,
  );
  const entry = keys.flatMap(
    (key) => globalThis.DSO_IMAGE_INDEX?.[key] ?? [],
  )[0];
  if (!entry) return;
  image.onload = () => {
    sketch.hidden = true;
    image.hidden = false;
    caption.textContent = [entry.title, entry.credit, entry.license]
      .filter(Boolean)
      .join(" · ");
    caption.hidden = !caption.textContent;
  };
  image.onerror = () => {
    image.hidden = true;
    sketch.hidden = false;
  };
  image.alt = entry.alt || `Astronomical image of ${target.name}`;
  image.src = entry.src;
}

function detailCell(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function detailList(label, values) {
  const items = uniqueStrings(values);
  if (!items.length) return "";
  return `<section class="detail-section"><h3>${escapeHtml(label)}</h3><ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul></section>`;
}

function sourceIdentifiers(source) {
  if (!source || typeof source === "string") return [];
  return uniqueStrings([
    source.identifier,
    source.originalIdentifier,
    source.catalogueId,
    source.catalogId,
    source.objectId,
    source.recordId,
    source.sourceId,
    source.id,
  ]);
}

function sourceDescriptions(target) {
  const sources = Array.isArray(target.sources)
    ? target.sources
    : target.sources
      ? [target.sources]
      : [];
  const descriptions = sources.map((source) => {
    if (typeof source === "string") return source;
    const catalogue = uniqueStrings([
      sourceCatalogueName(source),
      source.vizierId,
      source.table,
    ]).join(" / ");
    const identifiers = sourceIdentifiers(source).join(", ");
    if (catalogue && identifiers) return `${catalogue} — ${identifiers}`;
    return catalogue || identifiers;
  });
  const legacyCatalogue = target.catalogueSource;
  const legacyIdentifier = target.catalogueId;
  if (!descriptions.some(Boolean)) {
    if (legacyCatalogue && legacyIdentifier)
      descriptions.push(`${legacyCatalogue} — ${legacyIdentifier}`);
    else descriptions.push(legacyCatalogue, legacyIdentifier);
  }
  if (!descriptions.some(Boolean)) descriptions.push(target.catalogueGroups ?? []);
  return uniqueStrings(descriptions);
}

function sourcePropertyConflictDescriptions(properties) {
  const conflicts = properties?.sourcePropertyConflicts;
  if (!conflicts || typeof conflicts !== "object") return [];
  const descriptions = [];
  for (const [source, values] of Object.entries(conflicts)) {
    if (!values || typeof values !== "object") continue;
    if (values.brightnessClass != null) {
      const scale = values.brightnessScale
        ? `; ${values.brightnessScale}`
        : "";
      descriptions.push(
        `${source}: brightness class ${values.brightnessClass}${scale}`,
      );
    }
    for (const [key, value] of Object.entries(values)) {
      if (
        value == null ||
        key === "brightnessClass" ||
        key === "brightnessScale"
      )
        continue;
      descriptions.push(`${source}: ${key} = ${String(value)}`);
    }
  }
  return descriptions;
}

function formatArcminutes(value) {
  if (!Number.isFinite(value)) return undefined;
  return `${Number(value.toFixed(2))}′`;
}

function shapeDetails(target) {
  const shape = target.shape ?? {};
  const major =
    shape.majorArcmin ?? target.angularSizeArcMin?.major ?? target.major;
  const minor =
    shape.minorArcmin ?? target.angularSizeArcMin?.minor ?? target.minor;
  const majorText = formatArcminutes(major);
  const minorText = formatArcminutes(minor);
  let dimensions;
  if (majorText && minorText) dimensions = `${majorText} × ${minorText}`;
  else if (majorText)
    dimensions = shape.kind === "circle" ? `${majorText} diameter` : majorText;
  else if (typeof target.size === "string" && target.size !== "Not available")
    dimensions = target.size;
  if (dimensions && shape.approximate === true)
    dimensions = `${dimensions} (approximate)`;
  return {
    kind: shape.kind,
    dimensions,
    approximate:
      typeof shape.approximate === "boolean"
        ? shape.approximate
          ? "Yes"
          : "No"
        : undefined,
    positionAngleDeg: shape.positionAngleDeg ?? target.positionAngle,
  };
}

function aliasMarkup(target) {
  const aliases = uniqueStrings(target.aliases ?? []).filter(
    (alias) => alias !== target.name,
  );
  if (!aliases.length) return "";
  return `<div class="object-aliases" aria-label="Aliases">${aliases
    .map((alias) => `<span>${escapeHtml(alias)}</span>`)
    .join("")}</div>`;
}

function showDetails(value) {
  const target = normalizeTarget(value);
  selectedTarget = target;
  const { raDeg, decDeg } = target.coordinates;
  const horizontal = equatorialToHorizontal(
    target.coordinates,
    state.observer,
    viewer.getTime(),
  );
  const shape = shapeDetails(target);
  const properties = target.properties ?? {};
  const opacity =
    properties.opacity ??
    properties.opacityClass ??
    target.opacity ??
    target.opacityClass;
  const brightness =
    properties.brightness ??
    properties.brightnessClass ??
    target.brightness ??
    target.brightnessClass;
  const brightnessScale =
    properties.brightnessScale ?? target.brightnessScale;
  const density = properties.densityClass ?? target.densityClass;
  const densityScale = properties.densityScale ?? target.densityScale;
  const colorClass = properties.colorClass ?? target.colorClass;
  const areaSquareDeg = properties.areaSquareDeg ?? target.areaSquareDeg;
  const notes = uniqueStrings([properties.notes, target.description]);
  $("#detailsContent").innerHTML = `
    <p class="object-kicker">${escapeHtml(target.objectType || target.typeCode || "Sky object")}</p>
    <h2 class="object-title">${escapeHtml(target.name)}</h2>
    ${aliasMarkup(target)}
    <div class="detail-grid">
      ${detailCell("Right ascension", formatRa(raDeg))}
      ${detailCell("Declination", formatDec(decDeg))}
      ${detailCell("Altitude now", `${horizontal.altitudeDeg.toFixed(1)}°`)}
      ${detailCell("Magnitude", Number.isFinite(target.magnitude) ? target.magnitude.toFixed(2) : "Not available")}
      ${detailCell("Dimensions", shape.dimensions)}
      ${detailCell("Shape", shape.kind)}
      ${detailCell("Position angle", Number.isFinite(shape.positionAngleDeg) ? `${Number(shape.positionAngleDeg.toFixed(1))}°` : undefined)}
      ${detailCell("Approximate geometry", shape.approximate)}
      ${detailCell("Opacity", opacity)}
      ${detailCell("Brightness class", brightness)}
      ${detailCell("Brightness scale", brightnessScale)}
      ${detailCell("Density class", density)}
      ${detailCell("Density scale", densityScale)}
      ${detailCell("Colour class", colorClass)}
      ${detailCell("Area", Number.isFinite(areaSquareDeg) ? `${Number(areaSquareDeg.toFixed(3))} deg²` : undefined)}
    </div>
    ${detailList("Source catalogues and identifiers", sourceDescriptions(target))}
    ${detailList("Source-specific property values", sourcePropertyConflictDescriptions(properties))}
    ${notes.map((note) => `<p class="object-description">${escapeHtml(note)}</p>`).join("")}
    <div class="detail-actions"><button id="centerObjectButton">Centre and zoom</button><button id="closeDetailsButton">Close</button></div>`;
  $("#detailsPanel").classList.add("open");
  $("#detailsPanel").classList.remove("closed");
  $("#detailsPanel").setAttribute("aria-hidden", "false");
  $("#detailsPanel").inert = false;
  showObjectImage(target);
  $("#centerObjectButton").onclick = () => viewer.focusTarget(target);
  $("#closeDetailsButton").onclick = () => closePanel("detailsPanel");
}

function closePanel(id) {
  if (id === "controlPanel") {
    setControlPanelOpen(false);
    return;
  }
  const panel = $(`#${id}`);
  if (panel.contains(document.activeElement)) {
    const returnFocus =
      id === "detailsPanel" ? $("#searchInput") : $("#aboutButton");
    returnFocus?.focus({ preventScroll: true });
  }
  panel.classList.remove("open");
  panel.classList.add("closed");
  panel.setAttribute("aria-hidden", "true");
  panel.inert = true;
}

function setControlPanelOpen(open) {
  const panel = $("#controlPanel");
  if (!open && panel.contains(document.activeElement))
    $("#controlsButton")?.focus({ preventScroll: true });
  panel.classList.toggle("closed", !open);
  panel.setAttribute("aria-hidden", String(!open));
  panel.inert = !open;
  for (const button of [$("#controlsButton"), $("#timeButton")])
    button?.setAttribute("aria-expanded", String(open));
  $("#controlsButton")?.classList.toggle("active", open);
}

function applyDisplayOptions() {
  viewer.setCoordinateMode(state.mode);
  viewer.setDisplayOptions({
    grid: state.grid && state.mode === "equatorial",
    azimuthalGrid: state.grid && state.mode === "horizontal",
    meridian: state.meridian,
    ecliptic: state.ecliptic,
    atmosphere: state.atmosphere,
    milkyWay: state.milkyWay,
    cardinals: state.cardinals && state.mode === "horizontal",
    constellations: state.constellations,
    labels: state.labels,
    deepSkyObjects: state.deepSkyObjects,
    solarSystem: true,
    comets: true,
    horizon: state.landscape,
    hideBelowHorizon: state.hideBelowHorizon,
    nightMode: state.nightMode,
    starMagnitudeLimit: state.starMagnitudeLimit,
    galaxyMagnitudeLimit: state.galaxyMagnitudeLimit,
    deepSkyMagnitudeLimit: state.deepSkyMagnitudeLimit,
    deepSkyObjectTypes: state.deepSkyObjectTypes,
    deepSkyCatalogueGroups: state.deepSkyCatalogueGroups,
    starScale: state.starScale,
  });
  document.body.classList.toggle("night", state.nightMode);
}

async function applyLandscape() {
  if (!state.landscape) {
    await viewer.setLandscape(null);
    return;
  }
  await viewer.setLandscape({
    url: new URL("./assets/landscapes/guereins", location.href).href,
    key: "guereins",
  });
}

function applyFieldOfView() {
  const readout = $("#fovOpticsReadout");
  const apertureValue = $("#apertureInput").value.trim();
  let optics;
  try {
    optics = calculateCameraFieldOfView({
      sensorWidthPx: Number($("#sensorWidthInput").value),
      sensorHeightPx: Number($("#sensorHeightInput").value),
      pixelSizeMicrons: Number($("#pixelSizeInput").value),
      focalLengthMm: Number($("#focalLengthInput").value),
      apertureMm: apertureValue ? Number(apertureValue) : undefined,
    });
    const focalRatio = Number.isFinite(optics.focalRatio)
      ? ` \u00b7 f/${optics.focalRatio.toFixed(1)}`
      : "";
    readout.textContent =
      `${optics.sensorWidthMm.toFixed(2)} \u00d7 ${optics.sensorHeightMm.toFixed(2)} mm sensor` +
      ` \u00b7 FoV ${optics.widthDeg.toFixed(3)}\u00b0 \u00d7 ${optics.heightDeg.toFixed(3)}\u00b0` +
      ` \u00b7 ${optics.pixelScaleArcsecPerPixel.toFixed(2)}\u2033/px${focalRatio}`;
    readout.classList.remove("invalid");
  } catch (error) {
    readout.textContent = error.message;
    readout.classList.add("invalid");
    viewer.setFieldOfView(null);
    return;
  }
  if (!state.fieldOfView) {
    viewer.setFieldOfView(null);
    return;
  }
  const rotationDeg = Number($("#fovRotationInput").value);
  const columns = Number($("#mosaicColumnsInput").value);
  const rows = Number($("#mosaicRowsInput").value);
  const overlapPercent = Number($("#mosaicOverlapInput").value);
  try {
    viewer.setFieldOfView({
      widthDeg: optics.widthDeg,
      heightDeg: optics.heightDeg,
      rotationDeg,
      rotationConvention: "clockwise-from-celestial-north",
      mosaic:
        columns > 1 || rows > 1 ? { columns, rows, overlapPercent } : undefined,
    });
  } catch (error) {
    showToast(error.message);
  }
}

function updateStatus() {
  const time = viewer.getTime();
  if (state.timeRate) viewer.setTime(time);
  const horizontal = equatorialToHorizontal(
    currentView.center,
    state.observer,
    time,
  );
  $("#coordReadout").textContent =
    state.mode === "horizontal"
      ? `Az ${horizontal.azimuthDeg.toFixed(1)}° · Alt ${horizontal.altitudeDeg.toFixed(1)}°`
      : `RA ${formatRa(currentView.center.raDeg)} · Dec ${formatDec(currentView.center.decDeg)}`;
  $("#fovReadout").textContent =
    `FoV ${currentView.fovDeg.toFixed(currentView.fovDeg < 10 ? 1 : 0)}°`;
  $("#dateTimeValue").textContent = new Date(time).toLocaleString();
  $("#clockLabel").textContent = new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function saveHash() {
  const params = new URLSearchParams({
    mode: state.mode,
    ra: currentView.center.raDeg.toFixed(5),
    dec: currentView.center.decDeg.toFixed(5),
    fov: currentView.fovDeg.toFixed(3),
    lat: state.observer.latitudeDeg.toFixed(5),
    lon: state.observer.longitudeDeg.toFixed(5),
  });
  history.replaceState(null, "", `#${params}`);
}

function loadHash() {
  if (!location.hash) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const raDeg = Number(params.get("ra"));
  const decDeg = Number(params.get("dec"));
  const fovDeg = Number(params.get("fov"));
  const latitudeDeg = Number(params.get("lat"));
  const longitudeDeg = Number(params.get("lon"));
  if (params.get("mode") === "equatorial") state.mode = "equatorial";
  if (Number.isFinite(latitudeDeg) && latitudeDeg >= -90 && latitudeDeg <= 90)
    state.observer.latitudeDeg = latitudeDeg;
  if (Number.isFinite(longitudeDeg)) state.observer.longitudeDeg = longitudeDeg;
  if (
    Number.isFinite(raDeg) &&
    Number.isFinite(decDeg) &&
    decDeg >= -90 &&
    decDeg <= 90 &&
    Number.isFinite(fovDeg)
  )
    currentView = {
      center: { raDeg, decDeg, frame: "ICRS" },
      fovDeg: clamp(fovDeg, 0.05, 130),
    };
}

function updateToggle(button, enabled) {
  button?.classList.toggle("active", enabled);
  button?.setAttribute("aria-pressed", String(enabled));
}

const catalogueFilterConfigs = {
  types: {
    containerId: "dsoTypeFilters",
    summaryId: "dsoTypeFilterSummary",
    stateKey: "deepSkyObjectTypes",
    values: availableObjectTypes,
    label: (value) => objectTypeLabels.get(value) || value,
  },
  sources: {
    containerId: "dsoSourceFilters",
    summaryId: "dsoSourceFilterSummary",
    stateKey: "deepSkyCatalogueGroups",
    values: availableCatalogueGroups,
    label: (value) => catalogueGroupLabels.get(value.toLowerCase()) || value,
  },
};

function renderCatalogueFilter(kind) {
  const config = catalogueFilterConfigs[kind];
  const container = $(`#${config.containerId}`);
  const selected = new Set(state[config.stateKey] ?? config.values);
  const summary = $(`#${config.summaryId}`);
  summary.textContent = config.values.length
    ? `${selected.size} of ${config.values.length}`
    : "Not available";
  container.replaceChildren();
  if (!config.values.length) {
    const empty = document.createElement("p");
    empty.className = "catalog-filter-empty";
    empty.textContent = "No catalogue metadata is included in this build.";
    container.append(empty);
    return;
  }
  for (const value of config.values) {
    const option = document.createElement("label");
    option.className = "catalog-filter-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(value);
    checkbox.value = value;
    checkbox.onchange = () => {
      const next = new Set(state[config.stateKey] ?? config.values);
      if (checkbox.checked) next.add(value);
      else next.delete(value);
      state[config.stateKey] = config.values.filter((item) => next.has(item));
      updateCatalogueFilterSummary(kind);
      applyDisplayOptions();
    };
    const label = document.createElement("span");
    label.textContent = config.label(value);
    if (config.label(value) !== value) label.title = value;
    option.append(checkbox, label);
    container.append(option);
  }
}

function updateCatalogueFilterSummary(kind) {
  const config = catalogueFilterConfigs[kind];
  const selected = new Set(state[config.stateKey] ?? config.values);
  const summary = $(`#${config.summaryId}`);
  summary.textContent = config.values.length
    ? `${selected.size} of ${config.values.length}`
    : "Not available";
}

function initializeCatalogueFilters() {
  for (const kind of Object.keys(catalogueFilterConfigs))
    renderCatalogueFilter(kind);
  $$('[data-catalog-filter-action]').forEach((button) => {
    const config = catalogueFilterConfigs[button.dataset.catalogFilterKind];
    button.disabled = !config.values.length;
    button.onclick = () => {
      state[config.stateKey] =
        button.dataset.catalogFilterAction === "all" ? [...config.values] : [];
      const selected = new Set(state[config.stateKey]);
      $$(`#${config.containerId} input[type="checkbox"]`).forEach(
        (checkbox) => (checkbox.checked = selected.has(checkbox.value)),
      );
      updateCatalogueFilterSummary(button.dataset.catalogFilterKind);
      applyDisplayOptions();
    };
  });
}

function setMode(mode) {
  state.mode = mode;
  $$("#modeSelect button").forEach((button) =>
    button.classList.toggle("active", button.dataset.mode === mode),
  );
  updateToggle($("#modeButton"), mode === "equatorial");
  applyDisplayOptions();
  updateStatus();
  saveHash();
}

function selectObject(object) {
  const target = normalizeTarget(object);
  viewer.focusTarget(target);
  viewer.select(target);
}

function renderSearchResults(items) {
  const box = $("#searchResults");
  box.replaceChildren();
  for (const [index, object] of items.entries()) {
    const button = document.createElement("button");
    button.className = `search-result${index === 0 ? " active" : ""}`;
    button.type = "button";
    const name = document.createElement("strong");
    name.textContent = object.name || object.id;
    const type = document.createElement("span");
    type.textContent = object.objectType || object.type || "Sky object";
    button.append(name, type);
    button.onclick = () => {
      selectObject(object);
      box.classList.remove("open");
    };
    box.append(button);
  }
  box.classList.toggle("open", items.length > 0);
}

function resetView() {
  const center =
    state.mode === "horizontal"
      ? horizontalToEquatorial(
          { azimuthDeg: 180, altitudeDeg: 35 },
          state.observer,
          viewer.getTime(),
        )
      : { raDeg: 0, decDeg: 0, frame: "ICRS" };
  viewer.setView({ center, fovDeg: 70 });
}

function installControls() {
  const toggleControlPanel = () =>
    setControlPanelOpen($("#controlPanel").classList.contains("closed"));
  $("#controlsButton").onclick = toggleControlPanel;
  $("#timeButton").onclick = toggleControlPanel;
  $("#modeButton").onclick = () =>
    setMode(state.mode === "horizontal" ? "equatorial" : "horizontal");
  $$("#modeSelect button").forEach(
    (button) => (button.onclick = () => setMode(button.dataset.mode)),
  );
  for (const [id, key] of [
    ["gridButton", "grid"],
    ["constellationButton", "constellations"],
    ["dsoButton", "deepSkyObjects"],
    ["labelsButton", "labels"],
    ["nightButton", "nightMode"],
  ]) {
    $(`#${id}`).onclick = () => {
      state[key] = !state[key];
      updateToggle($(`#${id}`), state[key]);
      applyDisplayOptions();
    };
  }
  $("#resetButton").onclick = resetView;
  $(".brand").onclick = (event) => {
    event.preventDefault();
    resetView();
  };
  $("#aboutButton").onclick = () => {
    const panel = $("#aboutPanel");
    panel.classList.add("open");
    panel.classList.remove("closed");
    panel.setAttribute("aria-hidden", "false");
    panel.inert = false;
  };
  $$("[data-close]").forEach(
    (button) => (button.onclick = () => closePanel(button.dataset.close)),
  );
  $("#searchInput").oninput = (event) => {
    searchResults = viewer.search(event.target.value);
    renderSearchResults(searchResults);
  };
  $("#searchForm").onsubmit = (event) => {
    event.preventDefault();
    if (searchResults[0]) selectObject(searchResults[0]);
    $("#searchResults").classList.remove("open");
  };
  $("#magLimit").oninput = (event) => {
    state.starMagnitudeLimit = Number(event.target.value);
    $("#magValue").textContent = state.starMagnitudeLimit.toFixed(1);
    applyDisplayOptions();
  };
  $("#galaxyMagLimit").oninput = (event) => {
    state.galaxyMagnitudeLimit = Number(event.target.value);
    $("#galaxyMagValue").textContent = state.galaxyMagnitudeLimit.toFixed(1);
    applyDisplayOptions();
  };
  $("#dsoMagLimit").oninput = (event) => {
    state.deepSkyMagnitudeLimit = Number(event.target.value);
    $("#dsoMagValue").textContent = state.deepSkyMagnitudeLimit.toFixed(1);
    applyDisplayOptions();
  };
  $("#starScale").oninput = (event) => {
    state.starScale = Number(event.target.value) / 100;
    $("#scaleValue").textContent = `${event.target.value}%`;
    applyDisplayOptions();
  };
  $$("[data-time]").forEach(
    (button) =>
      (button.onclick = () =>
        viewer.setTime(viewer.getTime() + Number(button.dataset.time))),
  );
  $("#nowButton").onclick = () => viewer.setTime(Date.now());
  $("#playButton").onclick = () => {
    state.timeRate = state.timeRate ? 0 : 120;
    viewer.setTimeRate(state.timeRate);
    $("#playButton").textContent = state.timeRate ? "Ⅱ Pause" : "▶ Play 120×";
  };
  $("#applyLocationButton").onclick = () => {
    state.observer.latitudeDeg = Number($("#latitudeInput").value);
    state.observer.longitudeDeg = Number($("#longitudeInput").value);
    viewer.setObserver(state.observer);
    saveHash();
  };
  $("#locateButton").onclick = () =>
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => {
        state.observer = {
          latitudeDeg: coords.latitude,
          longitudeDeg: coords.longitude,
          elevationM: coords.altitude || 0,
        };
        $("#latitudeInput").value = coords.latitude.toFixed(4);
        $("#longitudeInput").value = coords.longitude.toFixed(4);
        viewer.setObserver(state.observer);
        showToast("Observer location updated");
      },
      () => showToast("Location permission was unavailable"),
    );
  for (const [id, key] of [
    ["milkyWaySwitch", "milkyWay"],
    ["cardinalSwitch", "cardinals"],
    ["eclipticSwitch", "ecliptic"],
    ["meridianSwitch", "meridian"],
    ["atmosphereSwitch", "atmosphere"],
  ])
    $(`#${id}`).onchange = (event) => {
      state[key] = event.target.checked;
      applyDisplayOptions();
    };
  $("#dsoImageSwitch").onchange = (event) => {
    state.dsoImages = event.target.checked;
    if (selectedTarget) showObjectImage(selectedTarget);
  };
  $("#horizonSwitch").onchange = (event) => {
    state.landscape = event.target.checked;
    applyDisplayOptions();
    void applyLandscape();
  };
  $("#hideBelowHorizonSwitch").checked = state.hideBelowHorizon;
  $("#hideBelowHorizonSwitch").onchange = (event) => {
    state.hideBelowHorizon = event.target.checked;
    localStorage.setItem(
      "celestia-atlas.hide-below-horizon",
      String(state.hideBelowHorizon),
    );
    applyDisplayOptions();
  };
  $("#fovOverlaySwitch").onchange = (event) => {
    state.fieldOfView = event.target.checked;
    applyFieldOfView();
  };
  for (const id of [
    "sensorWidthInput",
    "sensorHeightInput",
    "pixelSizeInput",
    "focalLengthInput",
    "apertureInput",
    "fovRotationInput",
    "mosaicColumnsInput",
    "mosaicRowsInput",
    "mosaicOverlapInput",
  ])
    $(`#${id}`).oninput = applyFieldOfView;
  $("#shareButton").onclick = async () => {
    saveHash();
    await navigator.clipboard?.writeText(location.href);
    showToast("Current view link copied");
  };
  $("#fullscreenButton").onclick = () =>
    document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
  document.addEventListener("visibilitychange", () =>
    document.hidden ? viewer.pause() : viewer.resume(),
  );
  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input")) return;
    const key = event.key.toLowerCase();
    if (key === "/") {
      event.preventDefault();
      $("#searchInput").focus();
    } else if (key === "g") $("#gridButton").click();
    else if (key === "c") $("#constellationButton").click();
    else if (key === "d") $("#dsoButton").click();
    else if (key === "l") $("#labelsButton").click();
    else if (key === "h") $("#modeButton").click();
    else if (key === "n") $("#nightButton").click();
    else if (key === "r") resetView();
    else if (key === "f") $("#fullscreenButton").click();
  });
}

function initializeTour() {
  const tour = $("#quickTour");
  for (const name of [
    "M31",
    "M42",
    "M45",
    "M13",
    "M51",
    "Jupiter",
    "Moon",
    "12P",
  ]) {
    const button = document.createElement("button");
    button.className = "tour-chip";
    button.textContent = name;
    button.onclick = () => {
      const result = viewer.search(name)[0];
      if (result) selectObject(result);
    };
    tour.append(button);
  }
}

function initialize() {
  loadHash();
  viewer = createCelestiaAtlasViewer({
    container: $("#viewerHost"),
    catalog,
    stars,
    constellations,
    observer: state.observer,
    utcMs: Date.now(),
    onSelect: showDetails,
    onViewChange: (view) => {
      currentView = view;
      updateStatus();
      saveHash();
    },
    onError: (error) => showToast(error.message),
  });
  viewer.setView(currentView);
  initializeCatalogueFilters();
  applyDisplayOptions();
  void applyLandscape();
  viewer.resume();
  installControls();
  applyFieldOfView();
  initializeTour();
  $("#latitudeInput").value = state.observer.latitudeDeg.toFixed(4);
  $("#longitudeInput").value = state.observer.longitudeDeg.toFixed(4);
  $("#starCount").textContent = stars.length.toLocaleString();
  $("#dsoCount").textContent = catalog.length.toLocaleString();
  $("#constCount").textContent =
    Object.keys(constellations).length.toLocaleString();
  $("#catalogReadout").textContent =
    `${catalogVersion} · ${catalog.length.toLocaleString()} DSOs`;
  $("#statusText").textContent = "Shared offline viewer ready";
  setMode(state.mode);
  updateStatus();
  setInterval(updateStatus, 1000);
  setTimeout(() => $("#loadingScreen").classList.add("hidden"), 300);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http"))
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

initialize();
