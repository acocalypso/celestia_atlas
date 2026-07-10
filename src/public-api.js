import {
  validateEquatorialCoordinates,
  validateObserver,
} from "./core/coordinates.js";
import { projectEquatorial, unprojectEquatorial } from "./core/projection.js";

export function createCelestiaAtlasViewer(options) {
  const {
    container,
    catalog = [],
    stars = [],
    constellations = {},
    onSelect,
    onViewChange,
    devicePixelRatioCap = 2,
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

  let destroyed = false;
  let paused = true;
  let observer = validateObserver(
    options.observer ?? { latitudeDeg: 0, longitudeDeg: 0, elevationM: 0 },
  );
  let utcMs = Number.isFinite(options.utcMs) ? options.utcMs : Date.now();
  let view = { center: { raDeg: 0, decDeg: 0, frame: "ICRS" }, fovDeg: 70 };
  let mount = null;
  let fieldOfView = null;
  let horizon = [];
  let hitTargets = [];
  let selected = null;
  let display = {
    grid: true,
    labels: true,
    deepSkyObjects: true,
    horizon: true,
    nightMode: false,
  };
  let drag = null;
  let frameId = null;
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
  const draw = () => {
    frameId = null;
    if (destroyed || paused) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatioCap, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = display.nightMode ? "#080000" : "#03060d";
    context.fillRect(0, 0, width, height);
    const scale = width / (2 * Math.tan((view.fovDeg * Math.PI) / 360));
    const project = (coordinates) =>
      projectEquatorial(coordinates, view, width, height);
    const strokeCurve = (coordinates) => {
      context.beginPath();
      let drawing = false;
      for (const coordinate of coordinates) {
        const point = project(coordinate);
        if (
          !point ||
          point.x < -width ||
          point.x > width * 2 ||
          point.y < -height ||
          point.y > height * 2
        ) {
          drawing = false;
          continue;
        }
        if (drawing) context.lineTo(point.x, point.y);
        else {
          context.moveTo(point.x, point.y);
          drawing = true;
        }
      }
      context.stroke();
    };
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
    for (const lines of Object.values(constellations)) {
      for (const [startName, endName] of lines) {
        const start = starsByName.get(String(startName).toLocaleLowerCase());
        const end = starsByName.get(String(endName).toLocaleLowerCase());
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
      const point = project(star);
      if (
        !point ||
        point.x < 0 ||
        point.x > width ||
        point.y < 0 ||
        point.y > height
      )
        continue;
      const radius = Math.max(0.7, Math.min(4, 3.5 - (star.mag ?? 4) * 0.45));
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
        if (!Number.isFinite(object.raDeg) || !Number.isFinite(object.decDeg))
          continue;
        const point = project(object);
        if (!point) continue;
        const { x, y } = point;
        if (x >= 0 && x <= width && y >= 0 && y <= height) {
          const isSelected = selected === object;
          context.fillStyle = isSelected
            ? "#f6c978"
            : display.nightMode
              ? "#ff584f"
              : "#edf5ff";
          context.beginPath();
          context.arc(x, y, isSelected ? 5 : 2, 0, Math.PI * 2);
          context.fill();
          hitTargets.push({ x, y, object });
          if (display.labels && (isSelected || view.fovDeg < 20)) {
            context.font = "11px system-ui";
            context.fillText(object.id || object.name, x + 6, y - 4);
          }
        }
      }
    if (mount?.connected) {
      const point = project(mount.coordinates);
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
      const overlayWidth = fieldOfView.widthDeg * scale;
      const overlayHeight = fieldOfView.heightDeg * scale;
      context.save();
      context.translate(width / 2, height / 2);
      const direction =
        fieldOfView.rotationConvention === "clockwise-from-celestial-north"
          ? 1
          : -1;
      context.rotate((direction * fieldOfView.rotationDeg * Math.PI) / 180);
      context.strokeStyle = "#64e39c";
      context.strokeRect(
        -overlayWidth / 2,
        -overlayHeight / 2,
        overlayWidth,
        overlayHeight,
      );
      context.restore();
    }
    if (display.horizon && horizon.length > 1) {
      context.strokeStyle = "#f6c978";
      context.beginPath();
      for (let index = 0; index < horizon.length; index += 1) {
        const point = horizon[index];
        const x = (point.azimuthDeg / 360) * width;
        const y = height - ((point.altitudeDeg + 90) / 180) * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
  };
  const invalidate = () => {
    if (!destroyed && !paused && frameId === null)
      frameId = requestAnimationFrame(draw);
  };
  const resizeObserver = new ResizeObserver(invalidate);
  resizeObserver.observe(container);

  const pointerDown = (event) => {
    if (
      destroyed ||
      paused ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      center: view.center,
      moved: false,
    };
  };
  const pointerMove = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3)
      drag.moved = true;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const next = unprojectEquatorial(
      width / 2 - (event.clientX - drag.x),
      height / 2 - (event.clientY - drag.y),
      { ...view, center: drag.center },
      width,
      height,
    );
    view = { ...view, center: next };
    onViewChange?.(structuredClone(view));
    invalidate();
  };
  const finishPointer = (event) => {
    if (
      !drag ||
      (event?.pointerId !== undefined && drag.pointerId !== event.pointerId)
    )
      return;
    const completed = drag;
    const pointerId = completed.pointerId;
    drag = null;
    if (canvas.hasPointerCapture?.(pointerId))
      canvas.releasePointerCapture(pointerId);
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
  };
  const wheel = (event) => {
    if (destroyed || paused) return;
    event.preventDefault();
    view = {
      ...view,
      fovDeg: Math.max(
        0.05,
        Math.min(180, view.fovDeg * Math.exp(event.deltaY * 0.001)),
      ),
    };
    onViewChange?.(structuredClone(view));
    invalidate();
  };
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", finishPointer);
  canvas.addEventListener("pointercancel", finishPointer);
  canvas.addEventListener("lostpointercapture", finishPointer);
  canvas.addEventListener("wheel", wheel, { passive: false });

  return Object.freeze({
    resume() {
      assertAlive();
      paused = false;
      invalidate();
    },
    pause() {
      assertAlive();
      paused = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
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
      invalidate();
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
      view = { center, fovDeg: value.fovDeg };
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
      }
      invalidate();
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
          value.heightDeg <= 0
        )
          throw new TypeError("Invalid field-of-view overlay");
        if (
          ![
            "clockwise-from-celestial-north",
            "counterclockwise-from-celestial-north",
          ].includes(value.rotationConvention)
        )
          throw new TypeError("FOV rotation convention is required");
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
      invalidate();
    },
    setDisplayOptions(value) {
      assertAlive();
      display = { ...display, ...value };
      invalidate();
    },
    focusTarget(target, fovDeg = Math.min(view.fovDeg, 15)) {
      assertAlive();
      const center = validateEquatorialCoordinates(
        target.coordinates ?? target,
      );
      view = { center, fovDeg: Math.max(0.05, Math.min(180, fovDeg)) };
      selected = catalog.find((item) => item.id === target.id) ?? null;
      onViewChange?.(structuredClone(view));
      invalidate();
    },
    select(value) {
      assertAlive();
      const coordinates = validateEquatorialCoordinates(value.coordinates);
      selected = catalog.find((item) => item.id === value.id) ?? null;
      onSelect?.({ ...value, coordinates });
      invalidate();
    },
    search(query) {
      assertAlive();
      const needle = String(query).trim().toLocaleLowerCase();
      if (!needle) return [];
      return searchableObjects
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
      return structuredClone({ observer, utcMs, view, paused });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", finishPointer);
      canvas.removeEventListener("pointercancel", finishPointer);
      canvas.removeEventListener("lostpointercapture", finishPointer);
      canvas.removeEventListener("wheel", wheel);
      canvas.remove();
      frameId = null;
    },
  });
}
