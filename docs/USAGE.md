# Using Celestia Atlas

## Standalone application

```bash
python serve.py
```

Open `http://localhost:8000`.

### Navigation

- Drag to pan.
- Use the mouse wheel or pinch to zoom.
- Click an object for details.
- Search by name, alias, or catalogue identifier.
- Change observer location and time through the controls.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus search |
| `G` | Toggle coordinate grid |
| `C` | Toggle constellations |
| `D` | Toggle deep-sky objects |
| `L` | Toggle labels |
| `H` | Switch horizontal/equatorial mode |
| `N` | Toggle night mode |
| `R` | Reset view |
| `F` | Toggle fullscreen |

The standalone application uses Berlin as its initial observer location until another location is entered or device location is applied.

## Embedded viewer

```js
import {
  createCelestiaAtlasViewer,
  DEFAULT_DSS_SKY_SURVEY_SOURCE,
} from "./src/index.js";

const viewer = createCelestiaAtlasViewer({
  container: document.querySelector("#atlas"),
  catalog,
  stars,
  constellations,
  observer: {
    latitudeDeg: 52.52,
    longitudeDeg: 13.405,
    elevationM: 0,
  },
  utcMs: Date.now(),
  skySurveySource: DEFAULT_DSS_SKY_SURVEY_SOURCE,
});

viewer.resume();
```

## View and time

```js
viewer.setCoordinateMode("horizontal");

viewer.setView({
  center: {
    raDeg: 83.822,
    decDeg: -5.391,
    frame: "ICRS",
  },
  fovDeg: 12,
});

viewer.setObserver({
  latitudeDeg: 48.137,
  longitudeDeg: 11.575,
  elevationM: 520,
});

viewer.setTime(Date.now());
viewer.setTimeRate(120);
```

## Search and selection

```js
const result = viewer.search("Abell 39")[0];

if (result) {
  viewer.focusTarget(result);
  viewer.select(result);
}
```

Search covers the complete local catalogue even when an object is hidden by rendering filters.

## Display options

```js
viewer.setDisplayOptions({
  grid: false,
  azimuthalGrid: true,
  meridian: true,
  ecliptic: true,
  atmosphere: true,
  milkyWay: true,
  skySurvey: true,
  cardinals: true,
  constellations: true,
  labels: true,
  deepSkyObjects: true,
  solarSystem: true,
  comets: true,
  horizon: true,
  hideBelowHorizon: true,
  nightMode: false,
  starMagnitudeLimit: 6.5,
  galaxyMagnitudeLimit: 14,
  deepSkyMagnitudeLimit: 13,
  starScale: 1,
});
```

Catalogue and object-type filters are allowlists:

```js
viewer.setDisplayOptions({
  deepSkyObjectTypes: ["DrkN", "RfN", "EmN", "HII"],
  deepSkyCatalogueGroups: ["ldn", "barnard", "sharpless", "vdb", "rcw"],
});
```

`null` means all values are allowed. An empty array hides the entire category. Search remains unrestricted.

## Photographic survey

```js
viewer.setDisplayOptions({ skySurvey: true });
viewer.setDisplayOptions({ skySurvey: false });
```

Replace the source:

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
  rightsUrl: "https://example.org/terms",
});
```

Supported formats are `jpg`, `jpeg`, `png`, and `webp`.

For an offline or same-origin package, point `url` at the packaged HiPS root:

```js
viewer.setSkySurvey({
  key: "packaged-milky-way",
  label: "Packaged photographic sky survey",
  url: "/celestia-atlas-data/hips/milky-way",
  frame: "ICRS",
  minOrder: 3,
  maxOrder: 4,
  tileWidth: 512,
  format: "webp",
  attribution: "Survey attribution supplied with the data package",
});
```

The URL and orders must match the package actually being served. Keep the
source attribution visible even when every tile is local.

Disable all survey loading:

```js
viewer.setSkySurvey(null);
```

## Custom horizon

```js
viewer.setHorizon([
  { azimuthDeg: 0, altitudeDeg: 12 },
  { azimuthDeg: 90, altitudeDeg: 18 },
  { azimuthDeg: 180, altitudeDeg: 7 },
  { azimuthDeg: 270, altitudeDeg: 10 },
]);

viewer.setDisplayOptions({
  hideBelowHorizon: true,
});
```

## HEALPix landscape

```js
await viewer.setLandscape({
  key: "observatory",
  url: "/assets/landscapes/observatory",
});
```

Disable it:

```js
await viewer.setLandscape(null);
```

## Camera field of view

```js
import { calculateCameraFieldOfView } from "./src/index.js";

const camera = calculateCameraFieldOfView({
  sensorWidthPx: 6248,
  sensorHeightPx: 4176,
  pixelSizeMicrons: 3.76,
  focalLengthMm: 500,
  apertureMm: 100,
});

viewer.setFieldOfView({
  widthDeg: camera.widthDeg,
  heightDeg: camera.heightDeg,
  rotationDeg: 0,
  rotationConvention: "clockwise-from-celestial-north",
});
```

Disable the overlay:

```js
viewer.setFieldOfView(null);
```

## Offline behavior

The application shell, catalogues, search, calculations, Milky Way panorama,
landscape, and available object previews work locally.

The standalone default DSS survey is remote: unseen fields require a connection
and previously viewed fields may remain available through browser Cache Storage.
An embedded host that must be fully offline should provide a packaged
`skySurveySource` as above, or pass `null` to disable photographic tiles. The
viewer never needs a network request for catalogue search or coordinate work.

## Embedded lifecycle

```js
document.addEventListener("visibilitychange", () => {
  if (document.hidden) viewer.pause();
  else {
    viewer.resume();
    viewer.resize();
  }
});
```

Native shells should apply the same rule to route and app foreground/background
events. Call `destroy()` when the embedding component is permanently unmounted.
