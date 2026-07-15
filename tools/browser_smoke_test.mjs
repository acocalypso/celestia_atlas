#!/usr/bin/env node
/**
 * Launch the standalone atlas in headless Chrome and fail on browser errors.
 *
 * This intentionally uses Chrome's built-in DevTools protocol instead of a
 * third-party browser automation package. It serves the repository over a
 * temporary localhost origin, exercises search, selection, controls, dragging,
 * and zooming, and inspects console, runtime, log, and resource failures.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const CATALOG_BUNDLE = process.env.SMOKE_CATALOG_BUNDLE
  ? resolve(ROOT, process.env.SMOKE_CATALOG_BUNDLE)
  : null;
const MIME = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitForChildExit(child, timeoutMilliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolveExit) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolveExit(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMilliseconds);
    child.once("exit", onExit);
  });
}

async function unusedPort() {
  const server = createNetServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : null,
    process.platform === "win32"
      ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
      : null,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable)
    throw new Error("Chrome was not found; set CHROME_PATH to its executable");
  return executable;
}

async function staticServer(port = 0) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const servedPath = requested.replace(
        /^\/__survey__\//,
        "/assets/landscapes/guereins/",
      );
      const relative = normalize(servedPath).replace(/^([/\\])+/, "");
      const path =
        relative === "dso-catalog.js" && CATALOG_BUNDLE
          ? CATALOG_BUNDLE
          : resolve(ROOT, relative);
      if (path !== ROOT && !path.startsWith(`${ROOT}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const content = await readFile(path);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": MIME.get(extname(path).toLowerCase()) ?? "application/octet-stream",
      });
      response.end(content);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  return server;
}

async function devtoolsTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Chrome may still be starting.
    }
    await delay(100);
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

function cdpClient(webSocketUrl, onEvent) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();
  const opened = new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    onEvent(message.method, message.params ?? {});
  });
  return {
    async send(method, params = {}) {
      await opened;
      const id = nextId++;
      const result = new Promise((resolveResult, reject) =>
        pending.set(id, { resolve: resolveResult, reject }),
      );
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close() {
      socket.close();
    },
  };
}

function remoteValue(argument) {
  if ("value" in argument) return argument.value;
  return argument.description ?? argument.type;
}

async function waitForAtlas(client) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await client.send("Runtime.evaluate", {
      expression:
        "document.readyState === 'complete' && document.querySelector('.celestia-atlas-canvas') && document.querySelector('#loadingScreen')?.classList.contains('hidden')",
      returnByValue: true,
    });
    if (result.result?.value) return;
    if (attempt === 119) throw new Error("Atlas did not finish initializing");
    await delay(100);
  }
}

async function waitForServiceWorkerControl(client) {
  let state;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const result = await client.send("Runtime.evaluate", {
      expression: `(async () => {
        if (!('serviceWorker' in navigator)) return { supported: false };
        const registration = await navigator.serviceWorker.getRegistration();
        return {
          supported: true,
          registered: Boolean(registration),
          active: Boolean(registration?.active),
          controlled: Boolean(navigator.serviceWorker.controller),
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    state = result.result?.value;
    if (state?.active && state.controlled) return state;
    if (attempt === 149)
      throw new Error(
        `Service worker did not take control before the offline reload: ${JSON.stringify(state)}`,
      );
    await delay(100);
  }
}

async function reloadAndWaitForAtlas(client) {
  const reloadToken = `before-offline-reload-${Date.now()}`;
  await client.send("Runtime.evaluate", {
    expression: `globalThis.__CELESTIA_ATLAS_RELOAD_TOKEN__ = ${JSON.stringify(reloadToken)}`,
  });
  await client.send("Page.reload");
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const result = await client.send("Runtime.evaluate", {
      expression: `globalThis.__CELESTIA_ATLAS_RELOAD_TOKEN__ !== ${JSON.stringify(reloadToken)} && document.readyState === 'complete' && document.querySelector('.celestia-atlas-canvas') && document.querySelector('#loadingScreen')?.classList.contains('hidden')`,
      returnByValue: true,
    });
    if (result.result?.value) return;
    if (attempt === 149)
      throw new Error("Atlas did not boot after the service-worker offline reload");
    await delay(100);
  }
}

async function waitForSkySurvey(
  client,
  { settled = false, idle = false } = {},
) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const canvas = document.querySelector('.celestia-atlas-canvas');
        const credit = document.querySelector('.celestia-atlas-survey-credit');
        return {
          active: canvas?.dataset.skySurveyActive === 'true',
          loadedTiles: Number(canvas?.dataset.skySurveyLoadedTiles || 0),
          order: Number(canvas?.dataset.skySurveyOrder),
          targetOrder: Number(canvas?.dataset.skySurveyTargetOrder),
          rasterUsedOrders: canvas?.dataset.skySurveyRasterUsedOrders,
          rasterMissingTiles: canvas?.dataset.skySurveyRasterMissingTiles,
          creditVisible: Boolean(credit && !credit.hidden && getComputedStyle(credit).display !== 'none'),
          creditText: credit?.textContent?.trim(),
          online: navigator.onLine,
          runtime: globalThis.__CELESTIA_ATLAS_VIEWER__?.getState().skySurvey,
          resources: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => name.includes('/__survey__/')),
        };
      })()`,
      returnByValue: true,
    });
    const state = result.result?.value;
    const settledAtTarget =
      state?.order === state?.targetOrder &&
      state?.rasterMissingTiles === "0" &&
      state?.rasterUsedOrders === String(state?.targetOrder) &&
      state?.runtime?.pendingTiles === 0;
    if (
      state?.active &&
      state.loadedTiles > 0 &&
      Number.isInteger(state.order) &&
      (!settled || settledAtTarget) &&
      (!idle || state.runtime?.pendingTiles === 0) &&
      state.creditVisible &&
      state.creditText
    )
      return state;
    if (attempt === 119)
      throw new Error(`Sky survey did not become visible: ${JSON.stringify(state)}`);
    await delay(100);
  }
}

function viewFromHash(hash) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ""));
  return {
    raDeg: Number(params.get("ra")),
    decDeg: Number(params.get("dec")),
    fovDeg: Number(params.get("fov")),
  };
}

async function currentHash(client) {
  const result = await client.send("Runtime.evaluate", {
    expression: "location.hash",
    returnByValue: true,
  });
  return result.result?.value ?? "";
}

function assertViewChanged(beforeHash, afterHash, { center = false, fov = false } = {}) {
  const before = viewFromHash(beforeHash);
  const after = viewFromHash(afterHash);
  if (![...Object.values(before), ...Object.values(after)].every(Number.isFinite))
    throw new Error(`Invalid view hashes: ${beforeHash} -> ${afterHash}`);
  if (
    center &&
    Math.abs(before.raDeg - after.raDeg) < 1e-5 &&
    Math.abs(before.decDeg - after.decDeg) < 1e-5
  )
    throw new Error(`Drag did not change the view centre: ${beforeHash} -> ${afterHash}`);
  if (fov && Math.abs(before.fovDeg - after.fovDeg) < 1e-3)
    throw new Error(`Zoom did not change the field of view: ${beforeHash} -> ${afterHash}`);
}

async function assertMobileHeaderLayout(client, expectedViewport) {
  const mobileHeader = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const controls = ['timeButton', 'shareButton', 'fullscreenButton'].map(id => {
        const button = document.getElementById(id);
        if (!button) return { id, missing: true };
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return {
          id,
          rect: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
          insideViewport:
            rect.width > 0 &&
            rect.height > 0 &&
            rect.left >= 0 &&
            rect.top >= 0 &&
            rect.right <= viewport.width &&
            rect.bottom <= viewport.height,
          enabled:
            !button.disabled && button.getAttribute('aria-disabled') !== 'true',
          visible:
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) > 0 &&
            style.pointerEvents !== 'none',
          reachable: Boolean(hit && button.contains(hit)),
          wired: typeof button.onclick === 'function',
        };
      });
      return { viewport, controls };
    })()`,
    returnByValue: true,
  });
  const state = mobileHeader.result.value;
  const unreachableControls = state?.controls?.filter(
    (control) =>
      control.missing ||
      !control.insideViewport ||
      !control.enabled ||
      !control.visible ||
      !control.reachable ||
      !control.wired,
  );
  if (
    state?.viewport?.width !== expectedViewport.width ||
    state?.viewport?.height !== expectedViewport.height ||
    unreachableControls?.length
  )
    throw new Error(
      `Mobile header controls are clipped or unreachable at ${expectedViewport.width}x${expectedViewport.height}: ${JSON.stringify(state)}`,
    );
}

async function loadMobileViewport(client, sitePort, viewport) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await client.send("Page.navigate", {
    url: `http://127.0.0.1:${sitePort}/index.html`,
  });
  await waitForAtlas(client);
  await assertMobileHeaderLayout(client, viewport);
}

async function run() {
  const liveSurvey = process.env.SMOKE_LIVE_SURVEY === "1";
  const searchQuery = process.env.SMOKE_QUERY || "M 31";
  const expectedSourceFilters = Number(
    process.env.SMOKE_EXPECTED_SOURCE_FILTERS || 0,
  );
  const expectPropertyConflicts =
    process.env.SMOKE_EXPECT_PROPERTY_CONFLICT === "1";
  const expectedDetailText = process.env.SMOKE_EXPECT_DETAIL_TEXT || "";
  const expectedTitle = process.env.SMOKE_EXPECT_TITLE || "";
  const expectedStarCount = Number(process.env.SMOKE_EXPECTED_STAR_COUNT || 0);
  const expectedDsoCount = Number(process.env.SMOKE_EXPECTED_DSO_COUNT || 0);
  let server = await staticServer();
  const sitePort = server.address().port;
  const debugPort = await unusedPort();
  const profile = await mkdtemp(join(tmpdir(), "celestia-atlas-chrome-"));
  const chrome = spawn(
    chromeExecutable(),
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );
  let chromeStderr = "";
  chrome.stderr.on("data", (chunk) => {
    chromeStderr += String(chunk);
  });
  const errors = [];
  let offlineReloadStarted = false;
  let offlineDocumentFromServiceWorker = false;
  let client;
  try {
    const target = await devtoolsTarget(debugPort);
    client = cdpClient(target.webSocketDebuggerUrl, (method, params) => {
      if (
        offlineReloadStarted &&
        method === "Network.responseReceived" &&
        params.type === "Document" &&
        params.response?.url?.startsWith(`http://127.0.0.1:${sitePort}/`) &&
        params.response?.fromServiceWorker
      )
        offlineDocumentFromServiceWorker = true;
      if (method === "Runtime.exceptionThrown") {
        errors.push(`Uncaught exception: ${params.exceptionDetails?.text ?? "unknown"}`);
      } else if (
        method === "Runtime.consoleAPICalled" &&
        ["error", "assert"].includes(params.type)
      ) {
        errors.push(`console.${params.type}: ${params.args.map(remoteValue).join(" ")}`);
      } else if (method === "Log.entryAdded" && params.entry?.level === "error") {
        errors.push(
          `Browser log${params.entry.url ? ` (${params.entry.url})` : ""}: ${params.entry.text}`,
        );
      } else if (
        method === "Network.loadingFailed" &&
        ["Document", "Script", "Stylesheet", "Image", "Fetch", "XHR", "Manifest"].includes(
          params.type,
        ) &&
        params.errorText !== "net::ERR_ABORTED"
      ) {
        errors.push(
          `Resource failed (${params.type}, request ${params.requestId}): ${params.errorText}`,
        );
      } else if (
        method === "Network.responseReceived" &&
        ["Document", "Script", "Stylesheet", "Image", "Fetch", "XHR", "Manifest"].includes(
          params.type,
        ) &&
        params.response?.status >= 400
      ) {
        errors.push(`HTTP ${params.response.status}: ${params.response.url}`);
      }
    });
    await Promise.all([
      client.send("Runtime.enable"),
      client.send("Log.enable"),
      client.send("Network.enable"),
      client.send("Page.enable"),
    ]);
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "globalThis.CELESTIA_ATLAS_ENABLE_TEST_HOOKS = true;",
    });
    if (!liveSurvey)
      await client.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `globalThis.CELESTIA_ATLAS_SKY_SURVEY_SOURCE = {
          key: 'browser-smoke-survey',
          label: 'Browser smoke survey',
          url: location.origin + '/__survey__',
          frame: 'ICRS',
          minOrder: 0,
          maxOrder: 0,
          tileWidth: 512,
          format: 'webp',
          attribution: 'Local browser smoke survey fixture.',
          attributionUrl: location.origin + '/assets/README.md',
        };`,
      });
    await client.send("Page.navigate", {
      url: `http://127.0.0.1:${sitePort}/index.html`,
    });

    await waitForAtlas(client);

    const interaction = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const controls = document.querySelector('#controlsButton');
        const controlsInitiallyClosed = document.querySelector('#controlPanel')?.classList.contains('closed');
        controls?.click();
        const hideBelow = document.querySelector('#hideBelowHorizonSwitch');
        if (hideBelow?.checked) hideBelow.click();
        if (${JSON.stringify(liveSurvey)}) {
          const landscape = document.querySelector('#horizonSwitch');
          if (landscape?.checked) landscape.click();
        }
        const labelledSwitch = document.querySelector('#milkyWaySwitch');
        labelledSwitch?.focus();
        document.querySelector('[data-catalog-filter-kind="sources"][data-catalog-filter-action="none"]')?.click();
        document.querySelector('[data-catalog-filter-kind="sources"][data-catalog-filter-action="all"]')?.click();
        document.querySelector('[data-catalog-filter-kind="types"][data-catalog-filter-action="none"]')?.click();
        document.querySelector('[data-catalog-filter-kind="types"][data-catalog-filter-action="all"]')?.click();
        const search = document.querySelector('#searchInput');
        search.value = ${JSON.stringify(searchQuery)};
        search.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('.search-result')?.click();
        const sourceValues = [...document.querySelectorAll('#dsoSourceFilters input')].map(input => input.value.toLowerCase()).sort();
        const metadataGroups = [...(globalThis.DSO_CATALOG_META?.catalogueGroups || [])].map(value => String(value).toLowerCase()).sort();
        return {
          controlsInitiallyClosed,
          controlsOpen: !document.querySelector('#controlPanel')?.classList.contains('closed'),
          belowHorizonObjectsEnabled: hideBelow?.checked === false,
          labelledSwitchFocusable: document.activeElement === labelledSwitch,
          detailsOpen: document.querySelector('#detailsPanel')?.classList.contains('open'),
          detailTitle: document.querySelector('.object-title')?.textContent?.trim(),
          detailAliases: document.querySelector('.object-aliases')?.textContent?.trim(),
          detailSources: [...document.querySelectorAll('.detail-section li')].map(item => item.textContent.trim()),
          propertyConflictSection: [...document.querySelectorAll('.detail-section')].some(section => section.querySelector('h3')?.textContent === 'Source-specific property values' && section.querySelector('li')),
          typeFilters: document.querySelectorAll('#dsoTypeFilters input').length,
          sourceFilters: document.querySelectorAll('#dsoSourceFilters input').length,
          sourceFiltersUnique: new Set(sourceValues).size === sourceValues.length,
          sourceFiltersMatchMetadata: JSON.stringify(sourceValues) === JSON.stringify(metadataGroups),
          starCount: Number((document.querySelector('#starCount')?.textContent || '').replace(/\\D/g, '')),
          dsoCount: Number((document.querySelector('#dsoCount')?.textContent || '').replace(/\\D/g, '')),
          canvas: Boolean(document.querySelector('.celestia-atlas-canvas')),
        };
      })()`,
      returnByValue: true,
    });
    const interactionState = interaction.result.value;
    if (
      !interactionState?.controlsInitiallyClosed ||
      !interactionState?.controlsOpen ||
      !interactionState?.belowHorizonObjectsEnabled ||
      !interactionState?.labelledSwitchFocusable ||
      !interactionState?.detailsOpen ||
      !interactionState?.detailTitle ||
      (expectedTitle && interactionState?.detailTitle !== expectedTitle) ||
      !interactionState?.detailAliases ||
      interactionState?.detailSources?.length < 1 ||
      new Set(interactionState?.detailSources).size !==
        interactionState?.detailSources.length ||
      (expectedDetailText &&
        !interactionState?.detailSources?.some((value) =>
          value.includes(expectedDetailText),
        )) ||
      (expectPropertyConflicts && !interactionState?.propertyConflictSection) ||
      interactionState?.typeFilters < 1 ||
      interactionState?.sourceFilters < 1 ||
      (expectedSourceFilters > 0 &&
        interactionState?.sourceFilters !== expectedSourceFilters) ||
      !interactionState?.sourceFiltersUnique ||
      !interactionState?.sourceFiltersMatchMetadata ||
      (expectedStarCount > 0 &&
        interactionState?.starCount !== expectedStarCount) ||
      (expectedDsoCount > 0 && interactionState?.dsoCount !== expectedDsoCount) ||
      !interactionState?.canvas
    )
      throw new Error(`Standalone interaction failed: ${JSON.stringify(interactionState)}`);

    const initialSurveyState = await waitForSkySurvey(client);
    if (
      liveSurvey &&
      !/Digitized Sky Survey.*STScI\/NASA.*CDS/.test(
        initialSurveyState.creditText,
      )
    )
      throw new Error(
        `The live photographic layer omitted its visible credit: ${JSON.stringify(initialSurveyState)}`,
      );
    if (!liveSurvey) {
      await waitForSkySurvey(client, { settled: true });
      const persistentSurvey = await client.send("Runtime.evaluate", {
        expression: `(async () => {
          const cache = await caches.open('celestia-atlas-survey-v1');
          const keys = await cache.keys();
          return keys.filter(request => request.url.includes('/__survey__/Norder0/')).length;
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (!(persistentSurvey.result.value > 0))
        throw new Error("The viewer did not persist its loaded survey tiles");

      await client.send("Runtime.evaluate", {
        expression: `(() => {
          const viewer = globalThis.__CELESTIA_ATLAS_VIEWER__;
          const source = globalThis.__CELESTIA_ATLAS_SKY_SURVEY_SOURCE__;
          globalThis.__CELESTIA_ATLAS_NATIVE_FETCH__ = globalThis.fetch;
          globalThis.fetch = (input, init) => {
            const url = String(input?.url || input);
            if (url.includes('/__survey__/Norder1/'))
              return Promise.reject(new TypeError('Intentional target-order smoke-test failure'));
            return globalThis.__CELESTIA_ATLAS_NATIVE_FETCH__(input, init);
          };
          viewer?.setSkySurvey(null);
          viewer?.setSkySurvey({ ...source, maxOrder: 1 });
        })()`,
      });
      const onlineParentFallback = await waitForSkySurvey(client, {
        idle: true,
      });
      if (
        !onlineParentFallback.online ||
        onlineParentFallback.targetOrder !== 1 ||
        onlineParentFallback.order !== 0 ||
        onlineParentFallback.rasterUsedOrders !== "0"
      )
        throw new Error(
          `Cached parent survey imagery did not survive a target fetch failure while online: ${JSON.stringify(onlineParentFallback)}`,
        );
      await client.send("Runtime.evaluate", {
        expression: `(() => {
          const viewer = globalThis.__CELESTIA_ATLAS_VIEWER__;
          const source = globalThis.__CELESTIA_ATLAS_SKY_SURVEY_SOURCE__;
          globalThis.fetch = globalThis.__CELESTIA_ATLAS_NATIVE_FETCH__;
          delete globalThis.__CELESTIA_ATLAS_NATIVE_FETCH__;
          viewer?.setSkySurvey(null);
          viewer?.setSkySurvey(source);
        })()`,
      });
      await waitForSkySurvey(client, { settled: true });
    }

    const box = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const r = document.querySelector('.celestia-atlas-canvas').getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()`,
      returnByValue: true,
    });
    const rectangle = box.result.value;
    const x = rectangle.x + rectangle.width / 2;
    const y = rectangle.y + rectangle.height / 2;
    await delay(250);
    await assertCentredMarkerHitTest(
      client,
      x,
      y,
      interactionState.detailTitle,
    );
    const beforeDragHash = await currentHash(client);
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: x + 90,
      y,
      button: "left",
      buttons: 1,
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: x + 90,
      y,
      button: "left",
      clickCount: 1,
    });
    await delay(350);
    const afterDragHash = await currentHash(client);
    assertViewChanged(beforeDragHash, afterDragHash, { center: true });
    let beforeWheelHash = afterDragHash;
    if (liveSurvey) {
      const eagle = await focusSearchResult(client, "M 16");
      const eagleIdentity = [eagle?.id, eagle?.name, ...(eagle?.aliases || [])]
        .filter(Boolean)
        .join(" ");
      const eagleCenter = eagle?.view?.center;
      if (
        eagle?.count < 1 ||
        !/\bM\s*16\b|Eagle Nebula/i.test(eagleIdentity) ||
        !/Eagle Nebula|M\s*16/i.test(eagle?.detailTitle || "") ||
        !Number.isFinite(eagle?.coordinates?.raDeg) ||
        !Number.isFinite(eagle?.coordinates?.decDeg) ||
        !Number.isFinite(eagleCenter?.raDeg) ||
        !Number.isFinite(eagleCenter?.decDeg) ||
        Math.abs(eagleCenter.raDeg - eagle.coordinates.raDeg) > 1e-6 ||
        Math.abs(eagleCenter.decDeg - eagle.coordinates.decDeg) > 1e-6
      )
        throw new Error(
          `The live survey did not re-centre on M16 before zooming: ${JSON.stringify(eagle)}`,
        );
      await delay(350);
      await assertCentredMarkerHitTest(client, x, y, eagle.detailTitle);
      await client.send("Runtime.evaluate", {
        expression:
          "document.querySelector('[data-close=\"detailsPanel\"]')?.click()",
      });
      beforeWheelHash = await currentHash(client);
    }
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x,
      y,
      deltaX: 0,
      deltaY: liveSurvey ? -2000 : -240,
    });
    await delay(liveSurvey ? 1500 : 700);
    if (liveSurvey) await waitForSkySurvey(client, { settled: true });
    const afterWheelHash = await currentHash(client);
    assertViewChanged(beforeWheelHash, afterWheelHash, { fov: true });
    if (liveSurvey) {
      const liveSurveyScreenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      await mkdir(join(ROOT, ".cache"), { recursive: true });
      await writeFile(
        join(ROOT, ".cache", "browser-smoke-live-survey.png"),
        Buffer.from(liveSurveyScreenshot.data, "base64"),
      );
    }

    await waitForServiceWorkerControl(client);
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });
    await client.send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await client.send("Runtime.evaluate", {
      expression: `(() => {
        const viewer = globalThis.__CELESTIA_ATLAS_VIEWER__;
        const source = globalThis.__CELESTIA_ATLAS_SKY_SURVEY_SOURCE__;
        viewer?.setSkySurvey(null);
        viewer?.setSkySurvey(source);
      })()`,
    });
    // The source reset clears every decoded tile, so becoming active again
    // proves that the viewer rehydrated imagery from persistent Cache Storage.
    await waitForSkySurvey(client, { idle: true });
    const offlineState = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const canvas = document.querySelector('.celestia-atlas-canvas');
        return {
          canvas: Boolean(canvas),
          surveyActive: canvas?.dataset.skySurveyActive === 'true',
          searchEnabled: !document.querySelector('#searchInput')?.disabled,
          status: document.querySelector('#statusText')?.textContent,
        };
      })()`,
      returnByValue: true,
    });
    if (
      !offlineState.result.value?.canvas ||
      !offlineState.result.value?.surveyActive ||
      !offlineState.result.value?.searchEnabled
    )
      throw new Error(
        `Offline atlas fallback/cache was not usable: ${JSON.stringify(offlineState.result.value)}`,
      );

    // Remove the origin server entirely so a successful reload cannot be
    // mistaken for Chrome's HTTP cache or a network-first service-worker hit.
    await new Promise((resolveClose) => server.close(resolveClose));
    offlineReloadStarted = true;
    await reloadAndWaitForAtlas(client);
    const offlineReloadSurvey = await waitForSkySurvey(client, { idle: true });
    const offlineReloadState = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const canvas = document.querySelector('.celestia-atlas-canvas');
        return {
          canvas: Boolean(canvas),
          controlled: Boolean(navigator.serviceWorker?.controller),
          online: navigator.onLine,
          surveyActive: canvas?.dataset.skySurveyActive === 'true',
          searchEnabled: !document.querySelector('#searchInput')?.disabled,
          status: document.querySelector('#statusText')?.textContent,
        };
      })()`,
      returnByValue: true,
    });
    if (
      !offlineDocumentFromServiceWorker ||
      !offlineReloadState.result.value?.canvas ||
      !offlineReloadState.result.value?.controlled ||
      !offlineReloadState.result.value?.surveyActive ||
      !offlineReloadState.result.value?.searchEnabled ||
      !offlineReloadSurvey?.active ||
      offlineReloadSurvey.loadedTiles < 1
    )
      throw new Error(
        `Service-worker-controlled offline reload did not restore the app shell and cached survey: ${JSON.stringify({ documentFromServiceWorker: offlineDocumentFromServiceWorker, page: offlineReloadState.result.value, survey: offlineReloadSurvey })}`,
      );
    if (liveSurvey) {
      await client.send("Runtime.evaluate", {
        expression: `(() => {
          const landscape = document.querySelector('#horizonSwitch');
          if (landscape?.checked) landscape.click();
        })()`,
      });
      await delay(350);
      await waitForSkySurvey(client, { idle: true });
      const offlineSurveyScreenshot = await client.send(
        "Page.captureScreenshot",
        { format: "png", captureBeyondViewport: false },
      );
      await writeFile(
        join(ROOT, ".cache", "browser-smoke-live-survey-offline.png"),
        Buffer.from(offlineSurveyScreenshot.data, "base64"),
      );
    }
    server = await staticServer(sitePort);
    offlineReloadStarted = false;
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await client.send("Network.setCacheDisabled", { cacheDisabled: false });
    await delay(500);
    await client.send("Runtime.evaluate", {
      expression: "window.dispatchEvent(new Event('online'))",
    });
    await waitForSkySurvey(client, { settled: liveSurvey });
    await delay(500);
    await waitForSkySurvey(client, { settled: liveSurvey });

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const screenshotPath = join(ROOT, ".cache", "browser-smoke.png");
    await mkdir(join(ROOT, ".cache"), { recursive: true });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

    await client.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 844, height: 390 },
      // Restore the canonical portrait viewport used by pinch and screenshots.
      { width: 390, height: 844 },
    ])
      await loadMobileViewport(client, sitePort, viewport);
    const mobileSurveyTarget = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const viewer = globalThis.__CELESTIA_ATLAS_VIEWER__;
        const target = viewer?.search('M 31')?.[0];
        if (target) viewer.focusTarget(target);
        return { found: Boolean(target), id: target?.id, name: target?.name };
      })()`,
      returnByValue: true,
    });
    if (!mobileSurveyTarget.result.value?.found)
      throw new Error("The mobile credit layout fixture could not focus M31");
    await waitForSkySurvey(client, { idle: true });
    await assertMobileSurveyCreditLayout(client, {
      width: 390,
      height: 844,
    });
    const mobileBox = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const r = document.querySelector('.celestia-atlas-canvas').getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()`,
      returnByValue: true,
    });
    const mobileRectangle = mobileBox.result.value;
    const mobileX = mobileRectangle.x + mobileRectangle.width / 2;
    const mobileY = mobileRectangle.y + mobileRectangle.height / 2;
    const beforePinchHash = await currentHash(client);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: mobileX - 35, y: mobileY, id: 0, force: 1 },
        { x: mobileX + 35, y: mobileY, id: 1, force: 1 },
      ],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: mobileX - 75, y: mobileY, id: 0, force: 1 },
        { x: mobileX + 75, y: mobileY, id: 1, force: 1 },
      ],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await delay(700);
    const afterPinchHash = await currentHash(client);
    assertViewChanged(beforePinchHash, afterPinchHash, { fov: true });
    const mobileScreenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const mobileScreenshotPath = join(ROOT, ".cache", "browser-smoke-mobile.png");
    await writeFile(
      mobileScreenshotPath,
      Buffer.from(mobileScreenshot.data, "base64"),
    );

    if (errors.length) {
      throw new Error(`Browser smoke test found ${errors.length} error(s):\n${errors.join("\n")}`);
    }
    process.stdout.write(
      `Browser smoke test passed (desktop drag/wheel, mobile pinch); screenshots: ${screenshotPath}, ${mobileScreenshotPath}\n`,
    );
  } finally {
    client?.close();
    if (chrome.exitCode === null && chrome.signalCode === null)
      chrome.kill("SIGTERM");
    if (!(await waitForChildExit(chrome, 5000))) {
      chrome.kill("SIGKILL");
      await waitForChildExit(chrome, 5000);
    }
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
    if (chrome.exitCode && chromeStderr)
      process.stderr.write(chromeStderr.slice(-4000));
  }
}

async function assertMobileSurveyCreditLayout(client, expectedViewport) {
  const result = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const credit = document.querySelector('.celestia-atlas-survey-credit');
      if (!credit) return { viewport, missing: true };
      const rect = credit.getBoundingClientRect();
      const style = getComputedStyle(credit);
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      const overlaps = ['.quick-tour', '.statusbar', '.topbar', '.left-rail']
        .map(selector => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const obstacle = element.getBoundingClientRect();
          const obstacleStyle = getComputedStyle(element);
          const visible =
            obstacle.width > 0 &&
            obstacle.height > 0 &&
            obstacleStyle.display !== 'none' &&
            obstacleStyle.visibility !== 'hidden' &&
            Number(obstacleStyle.opacity) > 0;
          const intersects =
            visible &&
            rect.left < obstacle.right &&
            rect.right > obstacle.left &&
            rect.top < obstacle.bottom &&
            rect.bottom > obstacle.top;
          return intersects ? selector : null;
        })
        .filter(Boolean);
      return {
        viewport,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        visible:
          !credit.hidden &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 &&
          style.pointerEvents !== 'none',
        insideViewport:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left >= 0 &&
          rect.top >= 0 &&
          rect.right <= viewport.width &&
          rect.bottom <= viewport.height,
        reachable: Boolean(hit && credit.contains(hit)),
        linked: Boolean(credit.href),
        overlaps,
      };
    })()`,
    returnByValue: true,
  });
  const state = result.result?.value;
  if (
    state?.viewport?.width !== expectedViewport.width ||
    state?.viewport?.height !== expectedViewport.height ||
    state?.missing ||
    !state?.visible ||
    !state?.insideViewport ||
    !state?.reachable ||
    !state?.linked ||
    state?.overlaps?.length
  )
    throw new Error(
      `Mobile survey credit is clipped, obscured, or unreachable at ${expectedViewport.width}x${expectedViewport.height}: ${JSON.stringify(state)}`,
    );
}

async function focusSearchResult(client, query) {
  const result = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const viewer = globalThis.__CELESTIA_ATLAS_VIEWER__;
      const candidates = viewer?.search(${JSON.stringify(query)}) || [];
      const target = candidates[0];
      const search = document.querySelector('#searchInput');
      if (search) {
        search.value = ${JSON.stringify(query)};
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.querySelector('.search-result')?.click();
      const coordinates = target?.coordinates || target;
      return {
        count: candidates.length,
        id: target?.id,
        name: target?.name,
        aliases: target?.aliases,
        coordinates: target
          ? { raDeg: coordinates?.raDeg, decDeg: coordinates?.decDeg }
          : null,
        view: viewer?.getState().view,
        detailTitle: document.querySelector('.object-title')?.textContent?.trim(),
      };
    })()`,
    returnByValue: true,
  });
  return result.result?.value;
}

async function assertCentredMarkerHitTest(client, x, y, expectedTitle) {
  await client.send("Runtime.evaluate", {
    expression:
      "document.querySelector('[data-close=\"detailsPanel\"]')?.click()",
  });
  await delay(150);
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await delay(200);
  const result = await client.send("Runtime.evaluate", {
    expression: `({
      open: document.querySelector('#detailsPanel')?.classList.contains('open'),
      title: document.querySelector('.object-title')?.textContent?.trim()
    })`,
    returnByValue: true,
  });
  if (!result.result.value?.open || result.result.value?.title !== expectedTitle)
    throw new Error(
      `Selected catalogue object was not rendered and hit-testable at the view centre: ${JSON.stringify(result.result.value)}`,
    );
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
