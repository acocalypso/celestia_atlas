import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const serviceWorkerSource = await readFile(
  new URL("../service-worker.js", import.meta.url),
  "utf8",
);
const APP_ORIGIN = "https://acocalypso.github.io";
const APP_BASE = `${APP_ORIGIN}/celestia_atlas/`;
const DSS_BASE =
  "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/DSSColor";

function requestKey(request) {
  const value = typeof request === "string" ? request : request.url;
  return new URL(value, APP_BASE).href;
}

class MemoryCache {
  entries = new Map();

  async add(request) {
    this.entries.set(requestKey(request), new Response("precache"));
  }

  async addAll(requests) {
    await Promise.all(requests.map((request) => this.add(request)));
  }

  async delete(request) {
    return this.entries.delete(requestKey(request));
  }

  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }

  async match(request) {
    return this.entries.get(requestKey(request))?.clone();
  }

  async put(request, response) {
    this.entries.set(requestKey(request), response.clone());
  }
}

function createHarness(fetchImplementation = async () => new Response("live")) {
  const listeners = new Map();
  const stores = new Map();
  const deletedCaches = [];
  const caches = {
    async delete(name) {
      deletedCaches.push(name);
      return stores.delete(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new MemoryCache());
      return stores.get(name);
    },
  };
  const self = {
    location: { origin: APP_ORIGIN },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };
  const context = vm.createContext({
    Array,
    Promise,
    Request,
    Response,
    Set,
    URL,
    caches,
    fetch: (...args) => fetchImplementation(...args),
    importScripts() {},
    self,
  });
  vm.runInContext(serviceWorkerSource, context, {
    filename: "service-worker.js",
  });

  async function dispatch(type, init = {}) {
    const waits = [];
    let responsePromise;
    const event = {
      ...init,
      waitUntil(value) {
        waits.push(Promise.resolve(value));
      },
      respondWith(value) {
        responsePromise = Promise.resolve(value);
      },
    };
    listeners.get(type)(event);
    const response = responsePromise ? await responsePromise : undefined;
    await Promise.all(waits);
    return { responded: Boolean(responsePromise), response };
  }

  return { caches, deletedCaches, dispatch, stores };
}

test("precaches the offline app core without precaching remote survey tiles", async () => {
  const harness = createHarness();
  await harness.dispatch("install");

  const core = harness.stores.get("celestia-atlas-offline-v30");
  assert.ok(core);
  assert.ok(core.entries.has(`${APP_BASE}src/core/sky-survey.js`));
  assert.ok(core.entries.has(`${APP_BASE}assets/milky-way.webp`));
  assert.ok(
    [...core.entries.keys()].every(
      (url) => !url.startsWith("https://stpubdata.s3.us-east-1.amazonaws.com/"),
    ),
  );
  assert.equal(harness.stores.has("celestia-atlas-survey-v1"), false);
});

test("serves DSS tiles stale-while-revalidate and bounds the runtime cache", async () => {
  let liveBody = "refreshed";
  const harness = createHarness(async () => new Response(liveBody));
  const runtime = await harness.caches.open("celestia-atlas-survey-v1");
  const urls = Array.from(
    { length: 96 },
    (_, index) => `${DSS_BASE}/Norder7/Dir0/Npix${index}.jpg`,
  );
  await Promise.all(
    urls.map((url, index) => runtime.put(url, new Response(`cached-${index}`))),
  );

  const cachedResult = await harness.dispatch("fetch", {
    request: new Request(urls[95]),
  });
  assert.equal(cachedResult.responded, true);
  assert.equal(await cachedResult.response.text(), "cached-95");
  assert.equal(await (await runtime.match(urls[95])).text(), "refreshed");

  liveBody = "new-tile";
  const newUrl = `${DSS_BASE}/Norder7/Dir10000/Npix10000.jpg`;
  const newResult = await harness.dispatch("fetch", {
    request: new Request(newUrl),
  });
  assert.equal(await newResult.response.text(), "new-tile");
  assert.ok((await runtime.keys()).length <= 96);
  assert.equal(await runtime.match(urls[0]), undefined);
  assert.equal(await (await runtime.match(newUrl)).text(), "new-tile");
});

test("stores same-origin HiPS tiles only in the bounded survey cache", async () => {
  const surveyUrl = `${APP_BASE}surveys/custom/Norder7/Dir0/Npix1.webp`;
  const harness = createHarness(async () => new Response("local-survey"));

  const result = await harness.dispatch("fetch", {
    request: new Request(surveyUrl),
  });

  assert.equal(result.responded, true);
  assert.equal(await result.response.text(), "local-survey");
  const survey = harness.stores.get("celestia-atlas-survey-v1");
  assert.equal(await (await survey.match(surveyUrl)).text(), "local-survey");
  assert.equal(
    await harness.stores.get("celestia-atlas-offline-v30")?.match(surveyUrl),
    undefined,
  );
});

test("keeps viewed survey tiles offline and fails unseen tiles cleanly", async () => {
  const harness = createHarness(async () => {
    throw new TypeError("offline");
  });
  const runtime = await harness.caches.open("celestia-atlas-survey-v1");
  const cachedUrl = `${DSS_BASE}/Norder6/Dir0/Npix42.jpg`;
  await runtime.put(cachedUrl, new Response("offline-copy"));

  const cachedResult = await harness.dispatch("fetch", {
    request: new Request(cachedUrl),
  });
  assert.equal(await cachedResult.response.text(), "offline-copy");

  const missingResult = await harness.dispatch("fetch", {
    request: new Request(`${DSS_BASE}/Norder6/Dir0/Npix43.jpg`),
  });
  assert.equal(missingResult.response.type, "error");
  assert.equal(missingResult.response.status, 0);
});

test("serves cached same-origin HiPS tiles offline and fails misses cleanly", async () => {
  const harness = createHarness(async () => {
    throw new TypeError("offline");
  });
  const runtime = await harness.caches.open("celestia-atlas-survey-v1");
  const cachedUrl = `${APP_BASE}surveys/custom/Norder6/Dir0/Npix42.webp`;
  await runtime.put(cachedUrl, new Response("offline-local-copy"));

  const cachedResult = await harness.dispatch("fetch", {
    request: new Request(cachedUrl),
  });
  assert.equal(await cachedResult.response.text(), "offline-local-copy");

  const missingResult = await harness.dispatch("fetch", {
    request: new Request(
      `${APP_BASE}surveys/custom/Norder6/Dir0/Npix43.webp`,
    ),
  });
  assert.equal(missingResult.response.type, "error");
  assert.equal(missingResult.response.status, 0);
});

test("leaves other cross-origin requests alone and keeps landscapes in the core cache", async () => {
  let networkRequests = 0;
  const harness = createHarness(async () => {
    networkRequests += 1;
    return new Response("local-fixture");
  });

  const unrelated = await harness.dispatch("fetch", {
    request: new Request("https://example.com/Norder7/Dir0/Npix1.jpg"),
  });
  assert.equal(unrelated.responded, false);
  assert.equal(networkRequests, 0);

  await harness.dispatch("install");
  const landscapeUrl = `${APP_BASE}assets/landscapes/guereins/Norder0/Dir0/Npix1.webp`;
  const landscape = await harness.dispatch("fetch", {
    request: new Request(landscapeUrl),
  });
  assert.equal(landscape.responded, true);
  assert.equal(await landscape.response.text(), "precache");
  assert.equal(networkRequests, 0);
  const core = harness.stores.get("celestia-atlas-offline-v30");
  assert.equal(await (await core.match(landscapeUrl)).text(), "precache");
  assert.equal(
    await harness.stores
      .get("celestia-atlas-survey-v1")
      ?.match(landscapeUrl),
    undefined,
  );
});

test("activation removes only superseded Atlas caches", async () => {
  const harness = createHarness();
  for (const name of [
    "celestia-atlas-offline-v29",
    "celestia-atlas-offline-v30",
    "celestia-atlas-survey-v29",
    "celestia-atlas-survey-v1",
    "another-app-cache-v1",
  ])
    await harness.caches.open(name);

  await harness.dispatch("activate");
  assert.deepEqual(harness.deletedCaches.sort(), [
    "celestia-atlas-offline-v29",
    "celestia-atlas-survey-v29",
  ]);
  assert.equal(harness.stores.has("another-app-cache-v1"), true);
});
