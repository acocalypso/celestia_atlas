# Public API

Celestia Atlas exports its viewer from `src/index.js`. Type declarations are available in `src/index.d.ts`.

All supported runtime imports are re-exported from `src/index.js`; consumers
should not import internal modules. The declarations in `src/index.d.ts` are the
authoritative signature reference.

## Create a viewer

```js
const viewer = createCelestiaAtlasViewer({
  container,
  catalog,
  stars,
  constellations,
  observer,
  utcMs,
  devicePixelRatioCap,
  milkyWayPanoramaUrl,
  skySurveySource,
  onSelect,
  onViewChange,
  onError,
});
```

### Main options

| Option | Type | Description |
| --- | --- | --- |
| `container` | `HTMLElement` | Required host element |
| `catalog` | `DeepSkyCatalogueObject[]` | Deep-sky catalogue |
| `stars` | `StarCatalogueObject[]` | Star catalogue |
| `constellations` | `Record<string, Array<[string,string]>>` | Constellation line data |
| `observer` | `Observer` | Initial observer |
| `utcMs` | `number` | Initial UTC Unix timestamp |
| `devicePixelRatioCap` | `number` | Maximum render DPR |
| `milkyWayPanoramaUrl` | `string \| null` | Alternate panorama, or `null` to skip loading it |
| `skySurveySource` | `SkySurveySource \| null` | Survey source or local-only mode |
| `onSelect` | `(target) => void` | Selection callback |
| `onViewChange` | `(view) => void` | Camera callback |
| `onError` | `(error) => void` | Non-survey error callback |

When `skySurveySource` is omitted, `DEFAULT_DSS_SKY_SURVEY_SOURCE` is used.
Survey sources may define `blendStartFovDeg` and `blendFullFovDeg` to control
their wide-field opacity. Defaults are 20 degrees and 10 degrees respectively.

## Lifecycle

```js
viewer.pause();
viewer.resume();
viewer.resize();
viewer.destroy();
```

Create a viewer once per host element. Pause it while its route, tab, or native
web view is hidden; resume and resize it when visible again; destroy it before
removing the host permanently. A destroyed viewer must not be reused.

## Camera

```js
viewer.setCoordinateMode("horizontal");
viewer.setCoordinateMode("equatorial");

viewer.setView({
  center: {
    raDeg: 10.6847,
    decDeg: 41.269,
    frame: "ICRS",
  },
  fovDeg: 8,
});

const view = viewer.getView();
```

## Observer and time

```js
viewer.setObserver({
  latitudeDeg: 52.52,
  longitudeDeg: 13.405,
  elevationM: 0,
});

viewer.setTime(Date.now());
viewer.setTimeRate(120);

const timestamp = viewer.getTime();
```

## Search and selection

```js
const results = viewer.search("M31");

viewer.focusTarget(results[0]);
viewer.select(results[0]);
```

## Mount support

```js
viewer.setMountPosition({
  coordinates: {
    raDeg: 10.6847,
    decDeg: 41.269,
    frame: "ICRS",
  },
  connected: true,
  stale: false,
  timestampUtcMs: Date.now(),
});

viewer.setMountFollow(true);
viewer.focusMount();
viewer.setMountPosition(null);
```

## Field-of-view overlay

```js
viewer.setFieldOfView({
  widthDeg: 2.4,
  heightDeg: 1.6,
  rotationDeg: 0,
  rotationConvention: "clockwise-from-celestial-north",
});
```

Disable:

```js
viewer.setFieldOfView(null);
```

## Horizon and landscape

```js
viewer.setHorizon([
  { azimuthDeg: 0, altitudeDeg: 12 },
  { azimuthDeg: 180, altitudeDeg: 7 },
]);

await viewer.setLandscape({
  key: "observatory",
  url: "/assets/landscapes/observatory",
});
```

## Sky survey

```js
viewer.setSkySurvey({
  key: "my-survey",
  label: "My survey",
  url: "https://example.org/hips/my-survey",
  frame: "ICRS",
  minOrder: 0,
  maxOrder: 7,
  tileWidth: 512,
  format: "jpg",
  attribution: "Required source credit",
  attributionUrl: "https://example.org/credits",
});
```

Disable:

```js
viewer.setSkySurvey(null);
```

## Display options

`setDisplayOptions` accepts partial updates.

```js
viewer.setDisplayOptions({
  skySurvey: true,
  labels: true,
  nightMode: false,
  starMagnitudeLimit: 6.5,
  galaxyMagnitudeLimit: 14,
  deepSkyMagnitudeLimit: 13,
});
```

Available keys:

```text
grid
azimuthalGrid
meridian
ecliptic
atmosphere
milkyWay
skySurvey
cardinals
constellations
labels
starMagnitudeLimit
galaxyMagnitudeLimit
deepSkyMagnitudeLimit
deepSkyObjectTypes
deepSkyCatalogueGroups
starScale
deepSkyObjects
solarSystem
comets
horizon
hideBelowHorizon
nightMode
```

## Runtime state

```js
const state = viewer.getState();
```

The state contains observer, time, view, display, pause status, and survey runtime information.

## Coordinate helpers

Coordinates passed across the API boundary are tagged as `ICRS` or `J2000`.
Observer longitude is positive east and timestamps are UTC Unix milliseconds.
Horizontal azimuth is measured from north through east; altitude is geometric.

```js
import {
  equatorialToHorizontal,
  horizontalToEquatorial,
  transformEquatorialVectorFrame,
  validateEquatorialCoordinates,
  validateObserver,
} from "./src/index.js";

const observer = validateObserver({
  latitudeDeg: 52.52,
  longitudeDeg: 13.405,
  elevationM: 0,
});

const horizontal = equatorialToHorizontal(
  validateEquatorialCoordinates({ raDeg: 37.95, decDeg: 89.264, frame: "ICRS" }),
  observer,
  Date.now(),
);
```

Additional exported astronomy helpers include Julian date, local sidereal time,
hour-angle conversions, degree normalization, and horizon-aligned camera views.

## Optics and projection helpers

`calculateCameraFieldOfView` converts sensor dimensions, pixel size, focal
length, and aperture into an imaging field of view. `projectAngularExtent`,
`cameraFrameScreenRotationDeg`, and
`celestialPositionAngleCanvasRotationDeg` support overlays whose size and
position angle must remain stable while the view moves.

## Catalogue helpers

The public entry point exports helpers for combining catalogue layers,
classifying deep-sky objects, applying catalogue/type/magnitude filters, and
building and searching a normalized local search index. Solar-system, Jupiter
moon, and comet calculations are also exported. Search is independent of
display filters.

Use `combineCatalogLayers` instead of concatenating sources when provenance and
deduplication metadata matter. Filter allowlists use `null` for all values and
an empty array for no values.

## Low-level HiPS helpers

Advanced hosts may validate a survey, choose an order, discover visible tiles,
construct tile keys/URLs, and rasterize tiles with the exported `skySurvey*`,
`equatorialToHipsTile`, `discoverVisibleSkySurveyTiles`, and
`rasterizeSkySurvey*` helpers. Most integrations should use `setSkySurvey`,
which owns view-driven discovery, caching, blending, and cancellation.

Configuration and coordinate validation functions throw for malformed input.
Viewer callbacks report non-survey runtime failures through `onError`; survey
availability is exposed in `getState().skySurvey` so an offline miss does not
take down the viewer.

See `src/index.d.ts` for the complete typed API.
