import test from "node:test";
import assert from "node:assert/strict";
import { createCelestiaAtlasViewer, projectEquatorial, cameraFrameScreenRotationDeg, getCometObjects, unprojectEquatorial, rasterizeSkySurveyAsync } from "../src/index.js";
import cometCatalog from "../data/comets.js";

function harness() {
  const frames = new Map(), intervals = new Map(), images = [], calls = [], requests = [];
  let id = 0;
  const context = new Proxy({}, { get(target, key) {
    if (key === "measureText") return text => ({ width: text.length * 6 });
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} });
    if (key === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
    return target[key] ?? ((...args) => calls.push([key, ...args]));
  } });
  class Element {
    style = {}; dataset = {}; children = []; listeners = new Map();
    clientWidth = 1000; clientHeight = 600;
    append(child) { this.children.push(child); child.parent = this; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    setAttribute() {} removeAttribute() {}
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    removeEventListener(name) { this.listeners.delete(name); }
    getContext(kind) { return kind === "2d" ? context : null; }
    getBoundingClientRect() { return { left: 0, top: 0 }; }
  }
  const originals = new Map();
  const globals = {
    navigator: { onLine: true },
    fetch: (url, options = {}) => new Promise((resolve, reject) => {
      requests.push({ url, ...options });
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
    HTMLElement: Element, getComputedStyle: () => ({ position: "static" }),
    document: { createElement: () => new Element() }, window: { devicePixelRatio: 1 },
    ResizeObserver: class { observe() {} disconnect() {} },
    Image: class { set src(value) { images.push(value); } },
    requestAnimationFrame: cb => { frames.set(++id, cb); return id; },
    cancelAnimationFrame: key => frames.delete(key),
    setInterval: (cb, delay) => { intervals.set(++id, { cb, delay }); return id; },
    clearInterval: key => intervals.delete(key),
  };
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const container = new Element();
  return { container, frames, intervals, images, calls, requests,
    frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb()); },
    restore() { for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    } },
  };
}

test("public entry point retains the asynchronous survey rasterizer", () => {
  assert.equal(typeof rasterizeSkySurveyAsync, "function");
});

test("viewer starts paused, schedules rate-aware ticks, cancels work and destroys idempotently", () => {
  const h = harness(); let viewer;
  try {
    viewer = createCelestiaAtlasViewer({ container: h.container, skySurveySource: null });
    assert.equal(viewer.getState().paused, true);
    assert.equal(h.frames.size, 0);
    assert.equal(h.intervals.size, 0);
    assert.ok(!h.images.some(url => /Allsky/.test(url)));
    viewer.setTimeRate(120); viewer.resume();
    assert.equal(h.intervals.size, 1);
    assert.ok([...h.intervals.values()][0].delay <= 34);
    h.frame();
    viewer.setTimeRate(0);
    assert.equal(h.intervals.size, 0);
    viewer.pause(); assert.equal(h.frames.size, 0);
    viewer.destroy(); viewer.destroy();
    assert.equal(h.container.children.length, 0);
    assert.throws(() => viewer.getState(), /destroyed/);
  } finally { viewer?.destroy(); h.restore(); }
});

test("rejects malformed host data before touching the container", () => {
  const h = harness();
  try {
    for (const options of [{ stars: [null] }, { utcMs: Date.UTC(5000, 0, 1) },
      { skySurveySource: { key: "bad" } }, { observer: { latitudeDeg: 100, longitudeDeg: 0 } }]) {
      assert.throws(() => createCelestiaAtlasViewer({ container: h.container, ...options }));
      assert.equal(h.container.children.length, 0);
      assert.equal(h.container.style.position, undefined);
    }
  } finally { h.restore(); }
});

test("view synchronization is reentrant and host errors reach onError", () => {
  const h = harness(); const errors = []; let viewer; let callbacks = 0;
  try {
    viewer = createCelestiaAtlasViewer({ container: h.container, skySurveySource: null,
      onViewChange(view) { callbacks++; viewer.setView(view); throw new Error("host callback"); },
      onError: error => errors.push(error),
    });
    viewer.setView({ center: { raDeg: 120, decDeg: 30, frame: "ICRS" }, fovDeg: 60 });
    assert.equal(callbacks, 1); assert.equal(errors.length, 1);
    assert.match(errors[0].message, /host callback/);
    viewer.resume(); h.frame();
    assert.throws(() => viewer.setFieldOfView({ widthDeg: 1, heightDeg: 1, rotationDeg: 0,
      rotationConvention: "north-through-east", mosaic: { columns: 10000, rows: 1, overlapPercent: 10 } }), /mosaic/);
    assert.throws(() => viewer.setDisplayOptions({ surprise: () => {} }), /Unknown/);
    assert.throws(() => viewer.setDisplayOptions({ labels: "yes" }), /boolean/);
    viewer.setDisplayOptions({ starMagnitudeLimit: undefined });
    assert.equal(viewer.getState().display.starMagnitudeLimit, 6.5);
  } finally { viewer?.destroy(); h.restore(); }
});

test("equatorial rendering puts increasing RA to the left and drag follows the displayed axes", () => {
  const h = harness(); let viewer;
  try {
    viewer = createCelestiaAtlasViewer({ container: h.container, skySurveySource: null,
      stars: [{ id: "east-star", raDeg: 121, decDeg: 30, mag: 1, frame: "ICRS" }] });
    viewer.setCoordinateMode("equatorial");
    viewer.setObserver({ latitudeDeg: -33, longitudeDeg: 0, elevationM: 0 });
    viewer.setView({ center: { raDeg: 120, decDeg: 30, frame: "ICRS" }, fovDeg: 60 });
    viewer.setDisplayOptions({ grid: false, horizon: false, hideBelowHorizon: false,
      atmosphere: false, milkyWay: false, solarSystem: false, comets: false, constellations: false });
    viewer.resume(); h.frame();
    const star = h.calls.find(([name, x, y, radius]) => name === "arc" && radius > 0 && x > 400 && x < 600 && y > 200 && y < 400);
    assert.ok(star); assert.ok(star[1] < 500);
    const canvas = h.container.children[0];
    canvas.listeners.get("pointerdown")({ pointerId: 1, isPrimary: true, clientX: 500, clientY: 300, preventDefault() {} });
    canvas.listeners.get("pointermove")({ pointerId: 1, clientX: 550, clientY: 300, preventDefault() {} });
    assert.ok(viewer.getView().center.raDeg > 120);
  } finally { viewer?.destroy(); h.restore(); }
});

test("north-through-east camera angle follows the sky in either projection handedness", () => {
  for (const mirrorX of [false, true]) for (const rotationDeg of [0, 37, -41.4]) {
    const angle = 30 * Math.PI / 180, offset = 0.001;
    const center = { raDeg: 120, decDeg: 0, frame: "ICRS" };
    const point = projectEquatorial({ ...center, raDeg: 120 + offset * Math.sin(angle), decDeg: offset * Math.cos(angle) },
      { center, fovDeg: 60, rotationDeg, mirrorX }, 1000, 600);
    const bearing = Math.atan2(point.x - 500, 300 - point.y) * 180 / Math.PI;
    const actual = cameraFrameScreenRotationDeg(rotationDeg, 30, "north-through-east", mirrorX);
    assert.ok(Math.abs(actual - bearing) < 1e-7);
  }
});

test("MPC activity exponent includes the 2.5 magnitude conversion at near and far distances", () => {
  const source = cometCatalog.objects[0];
  for (const qAu of [0.5, 6]) {
    const [object] = getCometObjects(Date.UTC(2026, 10, 1), { latitudeDeg: 0, longitudeDeg: 0, elevationM: 0 },
      [{ ...source, qAu, eccentricity: 0, absoluteMagnitude: 6, slope: 4 }]);
    const expected = 6 + 5 * Math.log10(object.distanceAu) + 10 * Math.log10(qAu);
    assert.ok(Math.abs(object.mag - expected) < 1e-10);
  }
});


test("Allsky remains lazy while paused, hidden or wide-field and is aborted on pause", async () => {
  const h = harness(); let viewer;
  try {
    viewer = createCelestiaAtlasViewer({ container: h.container });
    assert.equal(h.requests.length, 0);
    viewer.resume(); h.frame();
    await new Promise(setImmediate);
    assert.equal(h.requests.length, 0);
    viewer.setDisplayOptions({ skySurvey: false });
    viewer.setView({ center: { raDeg: 120, decDeg: 30, frame: "ICRS" }, fovDeg: 8 });
    h.frame(); await new Promise(setImmediate);
    assert.equal(h.requests.length, 0);
    viewer.setDisplayOptions({ skySurvey: true });
    h.frame(); await new Promise(setImmediate);
    const allsky = h.requests.find(request => /Allsky/.test(request.url));
    assert.ok(allsky);
    viewer.pause();
    assert.equal(allsky.signal.aborted, true);
    await new Promise(setImmediate);
    viewer.resume(); h.frame(); await new Promise(setImmediate);
    assert.equal(h.requests.filter(request => /Allsky/.test(request.url)).length, 2);
  } finally { viewer?.destroy(); await new Promise(setImmediate); h.restore(); }
});


test("off-centre drags retain the grabbed coordinate in either mode and hemisphere", () => {
  const h = harness(); let viewer;
  try {
    viewer = createCelestiaAtlasViewer({ container: h.container, skySurveySource: null });
    viewer.resume();
    for (const latitudeDeg of [-33, 50]) for (const mode of ["equatorial", "horizontal"]) {
      viewer.setCoordinateMode(mode);
      viewer.setObserver({ latitudeDeg, longitudeDeg: 13, elevationM: 0 });
      viewer.setTimeRate(0); viewer.setTime(Date.UTC(2026, 10, 1));
      viewer.setView({ center: { raDeg: 120, decDeg: 60, frame: "ICRS" }, fovDeg: 60 });
      const grabbed = unprojectEquatorial(650, 220, viewer.getProjectionView(), 1000, 600);
      const canvas = h.container.children[0];
      canvas.listeners.get("pointerdown")({ pointerId: 1, isPrimary: true, clientX: 650, clientY: 220, preventDefault() {} });
      canvas.listeners.get("pointermove")({ pointerId: 1, clientX: 710, clientY: 260, preventDefault() {} });
      const projected = projectEquatorial(grabbed, viewer.getProjectionView(), 1000, 600);
      assert.ok(Math.hypot(projected.x - 710, projected.y - 260) < 0.001, `${latitudeDeg} ${mode}`);
      canvas.listeners.get("pointercancel")({ pointerId: 1, preventDefault() {} });
    }
  } finally { viewer?.destroy(); h.restore(); }
});
