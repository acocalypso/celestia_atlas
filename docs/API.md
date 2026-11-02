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
  variableStars,
  constellations,
  observer,
  utcMs,
  devicePixelRatioCap,
  milkyWayPanoramaUrl,
  skySurveySource,
  cometElements,
  onSelect,
  onViewChange,
  onError,
});
```

### Main options

| Option                | Type                                     | Description                                      |
| --------------------- | ---------------------------------------- | ------------------------------------------------ |
| `container`           | `HTMLElement`                            | Required host element                            |
| `catalog`             | `DeepSkyCatalogueObject[]`               | Deep-sky catalogue                               |
| `stars`               | `StarCatalogueObject[]`                  | Star catalogue                                   |
| `variableStars`       | `VariableStarCatalogueData \| null`      | Compact GCVS named-variable search layer; package export `./variable-star-data` |
| `constellations`      | `WesternConstellationData` | Complete image-free Western line figures (88 IAU constellations, HIP paths and fixed ICRS vertices); the legacy named-pair object remains accepted for compatibility |
| `observer`            | `Observer`                               | Initial observer                                 |
| `utcMs`               | `number`                                 | Initial UTC Unix timestamp                       |
| `devicePixelRatioCap` | `number`                                 | Maximum render DPR                               |
| `milkyWayPanoramaUrl` | `string \| null`                         | Alternate panorama, or `null` to skip loading it |
| `skySurveySource`     | `SkySurveySource \| null`                | Survey source or local-only mode                 |
| `onSelect`            | `(target) => void`                       | Selection callback                               |
| `onViewChange`        | `(view) => void`                         | Camera callback                                  |
| `onError`             | `(error) => void`                        | Non-survey error callback                        |

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
  rotationConvention: "north-through-east",
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
  validateEquatorialCoordinates({
    raDeg: 37.95,
    decDeg: 89.264,
    frame: "ICRS",
  }),
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
moon, and comet calculations are also exported. Static star and DSO search ignores display filters. Solar-system and comet search
respects their display toggles; GCVS search respects the GCVS catalogue group.

Use `combineCatalogLayers` instead of concatenating sources when provenance and
deduplication metadata matter. Filter allowlists use `null` for all values and
an empty array for no values.

## Low-level HiPS helpers

Advanced hosts may validate a survey, choose an order, discover visible tiles,
construct tile keys/URLs, map tile mesh points, and rasterize tiles with the
exported `skySurvey*`, `equatorialToHipsTile`,
`hipsTilePointToEquatorial`, `discoverVisibleSkySurveyTiles`, and
`rasterizeSkySurvey*` helpers. Most integrations should use `setSkySurvey`,
which owns view-driven discovery, caching, blending, and cancellation.

Configuration and coordinate validation functions throw for malformed input.
Viewer callbacks report non-survey runtime failures through `onError`; survey
availability is exposed in `getState().skySurvey` so an offline miss does not
take down the viewer.

See `src/index.d.ts` for the complete typed API.


## Orientation and integration contracts

Both viewer modes use an east-left sky view. Equatorial mode keeps celestial
north up; horizontal mode keeps the local vertical up. `getView()` returns the
sky centre and FOV. `getProjectionView()` additionally returns the current
`mirrorX` and `rotationDeg`; use it with `projectEquatorial` for host overlays.

For camera position angles use `rotationConvention: "north-through-east"`:
0 degrees points the frame's up axis north, 90 degrees points it east. This is
independent of projection rotation and handedness. The older `clockwise-from-celestial-north`
and `counterclockwise-from-celestial-north` names retain their screen-direction
semantics for existing integrations. In the viewer's east-left projection,
counterclockwise corresponds to astronomical north-through-east PA.
`celestialPositionAngleCanvasRotationDeg` always takes astronomical PA.

The view centre stays attached to its ICRS/J2000 target when time or observer
changes, including in horizontal mode. This preserves mount following and
framing; horizontal describes screen orientation, not a fixed Alt/Az anchor.

`setView` accepts FOV in (0, 180] and clamps it to 130 degrees. `focusTarget(target,
fovDeg)` clamps to [0.05, 130]. Mosaics contain at most 50 rows and 50 columns;
overlap is [0, 100). Their panels share the central tangent plane: use them for
small imaging fields, not precision wide-angle mosaic planning.

## Time, catalogue and landscape limits

Viewer UTC input is restricted to years 1?3998. Invalid times throw; advancing
clocks stop at the boundaries. Time rates must be finite and within ?1,000,000;
zero freezes the clock. A resumed viewer schedules its own time redraws. Pause
suspends rendering and requests, while the logical clock continues to advance.

`cometElements` supplies an initial MPC element array; `setCometElements(elements)`
replaces it and refreshes search/rendering. `slope` is the MPC activity exponent:
apparent magnitude is H + 5 log10(delta) + 2.5 slope log10(r). The bundled
snapshot is not live and two-body propagation is approximate, especially far
from the orbital-element epoch. Hosts may provide updated elements.

Coordinates must already be ICRS or J2000. `epochJulianYear` is metadata and does
not select JNow axes or perform precession; convert driver JNow coordinates
before `setMountPosition`. Stars are fixed catalogue coordinates without proper
motion or annual aberration. Solar-system positions use the bundled engine's
body-specific apparent/topocentric models and Delta-T approximation. Altitudes
are geometric, with UT1 approximated by UTC and no refraction or polar motion.
`localSiderealDegrees` returns mean sidereal time; its hour-angle companion uses
mean-of-date declination, not unprecessed J2000 coordinates.

`setLandscape` requires twelve equal square order-0 tiles, each a power of two
from 2 through 2048 pixels. Invalid geometry returns false and reports `onError`.
`starCatalogueGroups` filters plotted stars by curated/HYG/HD/SAO/WR identity.
Unknown display keys and non-boolean layer toggles are rejected; undefined
optional values are ignored. Render failures and throwing host view callbacks
are isolated and reported through `onError`.

The decoded survey budget is 64 MiB for coarse pointers and 128 MiB otherwise.
It is not a total viewer-memory cap: GPU copies, CPU rasters and catalogue/search
objects require additional memory. Persistent survey storage is limited by entry
count (4096 plus up to 63 entries between trims), not by bytes or a durability
guarantee. Allsky previews load only when a resumed viewer actually needs visible
survey imagery; disabling the layer or pausing/destroying aborts that load.


The viewer uses symbolic solar-system markers and does not draw resolved disks,
planetary phases, or Jupiter-moon transit/eclipse predictions. Labels outside the
DSO layer can overlap. The landscape's curved mesh and interpolated survey
horizon are rendering approximations. For observing event times or precision
wide-angle mosaics, use a dedicated ephemeris/planning calculation.

DSO magnitudes preserve the source's V measurement, or B when V is unavailable;
`magBand` identifies that choice. Filters compare the published value, without
an assumed universal B?V conversion for galaxies or nebulae.
