import {
  validateEquatorialCoordinates,
  validateObserver,
} from "./core/coordinates.js";

export function createCelestiaAtlasViewer(options) {
  const {
    container,
    catalog = [],
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
    const scale = width / view.fovDeg;
    const project = (coordinates) => ({
      x:
        width / 2 +
        (((coordinates.raDeg - view.center.raDeg + 540) % 360) - 180) * scale,
      y: height / 2 - (coordinates.decDeg - view.center.decDeg) * scale,
    });
    if (display.grid) {
      context.strokeStyle = display.nightMode
        ? "rgba(255,80,70,.2)"
        : "rgba(119,158,194,.2)";
      context.lineWidth = 1;
      for (let ra = 0; ra < 360; ra += 15) {
        const top = project({ raDeg: ra, decDeg: 90 });
        const bottom = project({ raDeg: ra, decDeg: -90 });
        if (top.x >= 0 && top.x <= width) {
          context.beginPath();
          context.moveTo(top.x, top.y);
          context.lineTo(bottom.x, bottom.y);
          context.stroke();
        }
      }
      for (let dec = -75; dec <= 75; dec += 15) {
        const y = project({ raDeg: view.center.raDeg, decDeg: dec }).y;
        if (y >= 0 && y <= height) {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(width, y);
          context.stroke();
        }
      }
    }
    hitTargets = [];
    if (display.deepSkyObjects)
      for (const object of catalog) {
        if (!Number.isFinite(object.raDeg) || !Number.isFinite(object.decDeg))
          continue;
        const { x, y } = project(object);
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
      const { x, y } = project(mount.coordinates);
      context.strokeStyle = mount.stale ? "#f6c978" : "#62d8ff";
      context.beginPath();
      context.arc(x, y, 8, 0, Math.PI * 2);
      context.moveTo(x - 12, y);
      context.lineTo(x + 12, y);
      context.moveTo(x, y - 12);
      context.lineTo(x, y + 12);
      context.stroke();
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
    const next = {
      raDeg:
        (drag.center.raDeg -
          ((event.clientX - drag.x) / width) * view.fovDeg +
          360) %
        360,
      decDeg: Math.max(
        -90,
        Math.min(
          90,
          drag.center.decDeg + ((event.clientY - drag.y) / width) * view.fovDeg,
        ),
      ),
      frame: drag.center.frame,
    };
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
      return catalog
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
