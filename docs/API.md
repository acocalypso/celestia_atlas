# Public API

Celestia Atlas exports its viewer from `src/index.js`. Type declarations are available in `src/index.d.ts`.

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
| `milkyWayPanoramaUrl` | `string` | Alternate panorama |
| `skySurveySource` | `SkySurveySource \| null` | Survey source or local-only mode |
| `onSelect` | `(target) => void` | Selection callback |
| `onViewChange` | `(view) => void` | Camera callback |
| `onError` | `(error) => void` | Non-survey error callback |

When `skySurveySource` is omitted, `DEFAULT_DSS_SKY_SURVEY_SOURCE` is used.

## Lifecycle

```js
viewer.pause();
viewer.resume();
viewer.resize();
viewer.destroy();
```

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

See `src/index.d.ts` for the complete typed API.
