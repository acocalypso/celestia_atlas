import {
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

const stars = (globalThis.STAR_DATA ?? []).map((star) => ({
  ...star,
  id: star.name,
  aliases: [star.alias].filter(Boolean),
  raDeg: star.ra * 15,
  decDeg: star.dec,
  frame: "ICRS",
  type: "Star",
}));
const catalog = (globalThis.DSO_DATA ?? []).map((object) => ({
  ...object,
  name: object.name || object.id,
  raDeg: object.ra * 15,
  decDeg: object.dec,
  frame: "ICRS",
  angularSizeArcMin: { major: object.major, minor: object.minor },
}));
const constellations = globalThis.CONSTELLATION_LINES ?? {};
const catalogMeta = globalThis.OPENNGC_CATALOG_META ?? {
  version: "local",
  objectCount: catalog.length,
};

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
  nightMode: false,
  starMagnitudeLimit: 5.5,
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
    name: object.name || object.id,
    objectType: object.objectType || object.type,
    magnitude: object.magnitude ?? object.mag,
    catalogueSource: object.catalogueSource || object.catalogSource,
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

function showDetails(value) {
  const target = normalizeTarget(value);
  selectedTarget = target;
  const { raDeg, decDeg } = target.coordinates;
  const horizontal = equatorialToHorizontal(
    target.coordinates,
    state.observer,
    viewer.getTime(),
  );
  $("#detailsContent").innerHTML = `
    <p class="object-kicker">${escapeHtml(target.objectType || "Sky object")}</p>
    <h2 class="object-title">${escapeHtml(target.name)}</h2>
    <p class="object-aliases">${escapeHtml((target.aliases ?? []).slice(0, 8).join(" · "))}</p>
    <div class="detail-grid">
      ${detailCell("Right ascension", formatRa(raDeg))}
      ${detailCell("Declination", formatDec(decDeg))}
      ${detailCell("Altitude now", `${horizontal.altitudeDeg.toFixed(1)}°`)}
      ${detailCell("Magnitude", Number.isFinite(target.magnitude) ? target.magnitude.toFixed(2) : "Not available")}
      ${detailCell("Catalogue", target.catalogueSource || "Local offline pack")}
    </div>
    <div class="detail-actions"><button id="centerObjectButton">Centre and zoom</button><button id="closeDetailsButton">Close</button></div>`;
  $("#detailsPanel").classList.add("open");
  $("#detailsPanel").setAttribute("aria-hidden", "false");
  showObjectImage(target);
  $("#centerObjectButton").onclick = () => viewer.focusTarget(target);
  $("#closeDetailsButton").onclick = () => closePanel("detailsPanel");
}

function closePanel(id) {
  const panel = $(`#${id}`);
  panel.classList.remove("open");
  panel.classList.add("closed");
  panel.setAttribute("aria-hidden", "true");
}

function applyDisplayOptions() {
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
    nightMode: state.nightMode,
    starMagnitudeLimit: state.starMagnitudeLimit,
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
  if (!state.fieldOfView) {
    viewer.setFieldOfView(null);
    return;
  }
  const widthDeg = Number($("#fovWidthInput").value);
  const heightDeg = Number($("#fovHeightInput").value);
  const rotationDeg = Number($("#fovRotationInput").value);
  const columns = Number($("#mosaicColumnsInput").value);
  const rows = Number($("#mosaicRowsInput").value);
  const overlapPercent = Number($("#mosaicOverlapInput").value);
  try {
    viewer.setFieldOfView({
      widthDeg,
      heightDeg,
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
      fovDeg: clamp(fovDeg, 0.05, 180),
    };
}

function updateToggle(button, enabled) {
  button?.classList.toggle("active", enabled);
  button?.setAttribute("aria-pressed", String(enabled));
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
  $("#controlsButton").onclick = () =>
    $("#controlPanel").classList.toggle("closed");
  $("#timeButton").onclick = () =>
    $("#controlPanel").classList.toggle("closed");
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
    $("#aboutPanel").classList.add("open");
    $("#aboutPanel").classList.remove("closed");
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
  $("#fovOverlaySwitch").onchange = (event) => {
    state.fieldOfView = event.target.checked;
    applyFieldOfView();
  };
  for (const id of [
    "fovWidthInput",
    "fovHeightInput",
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
  applyDisplayOptions();
  void applyLandscape();
  viewer.resume();
  installControls();
  initializeTour();
  $("#latitudeInput").value = state.observer.latitudeDeg.toFixed(4);
  $("#longitudeInput").value = state.observer.longitudeDeg.toFixed(4);
  $("#starCount").textContent = stars.length.toLocaleString();
  $("#dsoCount").textContent = catalog.length.toLocaleString();
  $("#constCount").textContent =
    Object.keys(constellations).length.toLocaleString();
  $("#catalogReadout").textContent =
    `${catalogMeta.version} · ${catalog.length.toLocaleString()} DSOs`;
  $("#statusText").textContent = "Shared offline viewer ready";
  setMode(state.mode);
  updateStatus();
  setInterval(updateStatus, 1000);
  setTimeout(() => $("#loadingScreen").classList.add("hidden"), 300);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http"))
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

initialize();
