# Celestia Atlas Offline v8

Celestia Atlas source code is licensed under the MIT License. See `LICENSE`.
The generated OpenNGC catalogue remains under CC BY-SA 4.0, and the separate
Stellarium DSO supplement remains under GPL-2.0-or-later. These data assets do
not inherit the MIT code licence or each other's licence. See
`THIRD_PARTY_NOTICES.md` and `licenses/Stellarium-GPL-2.0.txt`.

A self-contained browser planetarium with a local Milky Way dome, offline star
catalogue, a comprehensive OpenNGC deep-sky catalogue, local DSO photographs,
live offline Sun, Moon, planet and comet positions, and no runtime astronomy
services.

## What changed in v8

- The GitHub Pages build feeds the pinned OpenNGC release through a shared,
  source-independent catalogue model and creates a local browser catalogue.
- A separately generated public supplement selects the LDN, Barnard, LBN,
  Sharpless 2, vdB, and RCW cross-index records from Stellarium v26.2 DSO
  catalogue v3.23. The atlas loads and searches this supplement alongside
  OpenNGC while retaining its GPL-2.0-or-later terms and provenance.
- Source-specific local importers provide richer records for those six groups
  and support Southern Dark Clouds and Feitzinger-Stuewe dark nebulae from
  VizieR. Those complete historical tables and their derived outputs are not
  publicly bundled because their current VizieR records do not state an open
  redistribution licence. Southern Dark Clouds and Feitzinger-Stuewe objects
  are therefore local-only and are not supplied by the public supplement.
- Astropy performs true FK4/B1875, B1900, B1950, Galactic, FK5/J2000, and ICRS
  build-time transformations. Original frames and source provenance are kept.
- Catalogue/type controls, punctuation-tolerant ranked search, distinct dark,
  reflection, and emission-nebula markers, and full source/shape/property
  details are available in the standalone viewer and public API.
- NGC, IC, Messier cross-identifiers, common names, coordinates, object type,
  magnitudes, angular sizes, Hubble class, redshift and radial velocity are
  preserved when available.
- Faint DSOs appear progressively as the field of view narrows, so the full
  catalogue remains usable without covering the wide sky in thousands of marks.
- Search covers the complete generated catalogue and its aliases offline.
- Search and rendering include topocentric J2000 positions for the Sun, Moon,
  planets and Pluto at the selected observer location and time.
- A pinned 1,214-record Minor Planet Center catalogue provides offline comet
  search and approximate topocentric positions without runtime requests.
- Standalone and embedded consumers can independently control equatorial and azimuth grids,
  the local meridian, ecliptic, Milky Way and atmospheric horizon glow.
- The bundled Galactic panorama uses `l = 0°` at its centre, longitude
  increasing rightward and Galactic north (`b = +90°`) at the top.
- Jupiter's four Galilean moons use live, light-time-corrected offline positions
  and become individually searchable and visible in narrow fields.
- Standalone and embedded consumers can load order-0 HiPS/HEALPix landscape datasets with
  transparent horizons through the asynchronous `setLandscape` API.
- The standalone controls panel now starts closed, leaving the sky unobstructed
  until the controls or time button is used to open it.
- Celestial objects and sky layers below the geometric or custom horizon are
  hidden by default. Embedded consumers can supply an azimuth/altitude profile
  with `setHorizon` and can opt out through the `hideBelowHorizon` display option.
- Camera overlays can be derived from physical imaging-train data with
  `calculateCameraFieldOfView`: sensor width and height in pixels, pixel size,
  telescope focal length and optional aperture.
- HEALPix landscapes now follow the Stellarium tile-axis convention, use
  premultiplied bilinear sampling and render at a bounded DPR-aware resolution.
  A reduced interaction raster is replaced with a sharp full-quality raster
  after wheel input becomes idle.
- Mobile coarse-pointer rendering caps the canvas DPR at 1.25 and uses a
  64-pixel panorama budget while moving, then redraws at up to 768 pixels when
  settled. Fine-pointer budgets remain 384/1024 with a default DPR cap of 2.
  Panorama uploads, canvas backing sizes and one-second moving-object results
  are reused until their inputs actually change.
- Stars, galaxy-family objects and other deep-sky objects have independent
  limiting-magnitude filters in both the public API and standalone controls.
- Camera orientation is independent of grid visibility. New viewers default to
  horizon-aligned `horizontal` mode; use
  `viewer.setCoordinateMode("equatorial")` only for an equator-up atlas view.
  Hiding the azimuth grid does not change landscape roll or drag orientation.
- Embedded controls can read a defensive copy of the current center and zoom
  through `getView` without accessing renderer internals.
- The NASA image downloader now accepts any catalogue object, supports large
  resumable batches, filtering, offsets, dry runs, reports and relevance scoring.

## Runtime privacy and offline behavior

The deployed atlas makes no catalogue, tile, API, analytics or font requests.
`dso-catalog.js`, `stellarium-supplement.js`, the Astronomy Engine browser
build, the Milky Way panorama and all DSO images are ordinary local files
cached by the service worker.

Online access is used only by **build tools**:

- `build_dso_catalog.py` downloads the pinned OpenNGC CSV for the distributable
  default build. `build_openngc_catalog.py` remains a compatibility command.
- `build_stellarium_supplement.py` downloads the pinned Stellarium v26.2 DSO
  catalogue v3.23 and emits a separate public cross-index supplement.
- `fetch_catalog_sources.py` can explicitly download the optional VizieR tables
  into the ignored local cache after the user acknowledges the rights review.
- `fetch_nasa_dso_images.py` downloads selected publication images into the
  repository.

After those files are generated, the website remains offline-capable.

## Coordinate frames and horizontal geometry

Public equatorial coordinates are always tagged as either `ICRS` or `J2000`.
The public `J2000` tag denotes the J2000 mean-equator frame that Astronomy
Engine calls EQJ. Before horizontal projection, an `ICRS` direction is rotated
explicitly into FK5/J2000 with the transpose of the IAU SOFA `iauFk5hip`
orientation matrix; a tagged `J2000` direction is already EQJ and does not
receive that rotation.

Observed horizontal orientation uses the pinned `astronomy-engine` 2.1.19
EQJ-to-HOR rotation. This carries J2000 directions through precession and
nutation to the observation date and applies the engine's sidereal Earth
orientation for the supplied UTC time and observer. The inverse path applies
the inverse observed-frame rotation and, when requested, rotates FK5/J2000 back
to ICRS.

The public horizontal convention is azimuth zero at geographic north,
increasing eastward (`90 degrees` east), with altitude positive above the
geometric horizon. Observer longitude is positive east of Greenwich and is
normalized to `[-180, 180)`. Altitude is geometric: Celestia Atlas does not
apply atmospheric refraction, pressure, temperature or wavelength correction.

Times enter as UTC Unix milliseconds. Astronomy Engine approximates UT1 and
UTC as equal and uses its own Earth-rotation, precession, nutation and delta-T
models. Celestia Atlas does not ingest live IERS Earth-orientation parameters,
DUT1 or polar motion. The horizontal result is therefore appropriate for atlas
display and framing geometry, but is not a substitute for a mount model or
precision apparent-place reduction.

Horizontal handedness is checked against the official IAU SOFA 2023-10-11 C
validation vectors for `iauHd2ae` and `iauAe2hd`. The accepted SOFA errors are
`1e-13` radian for the `Hd2ae` azimuth and `1e-14` radian for its altitude and
both `Ae2hd` outputs; corresponding degree-based assertions are no looser than
`1e-11` degree. Fixed full-frame literals generated by Astronomy Engine 2.1.19
are held to `1e-10` degree. General forward/inverse round trips are held to
`1e-9` degree, with relaxed bounds only for deliberately tested exact-pole
singularities. The fixed engine literals protect this integration from an
unnoticed dependency behavior change; the independent SOFA vectors establish
the horizontal-axis convention.

## GitHub Pages deployment

In the repository, select:

```text
Settings → Pages → Source → GitHub Actions
```

Push the project to `main`. The included workflow will:

1. Install the pinned Python and Node.js build dependencies.
2. Download the pinned OpenNGC release and generate neutral plus legacy
   compatibility outputs from the same normalized records.
3. Build the separate GPL-2.0-or-later Stellarium cross-index supplement for LDN,
   Barnard, LBN, Sharpless 2, vdB, and RCW.
4. Run the JavaScript/Python suites and Chrome interaction/error smoke tests.
   The deployed-bundle smoke test verifies all seven source filters and checks
   that a public supplement object can be searched, drawn, and selected.
5. Rebuild the local DSO image index.
6. Assemble and deploy the static Pages artifact.

The workflow deliberately does not fetch or publish the optional VizieR
catalogues while their redistribution status remains unresolved.

The site address is normally:

```text
https://acocalypso.github.io/celestia_atlas/
```

The committed `dso-catalog.js` is the distributable OpenNGC browser bundle.
`stellarium-supplement.js` is a distinct GPL-2.0-or-later browser asset whose
records are merged into the runtime search/render index when the page loads.
The workflow rebuilds both reproducibly and exposes seven source filters:
OpenNGC plus the six supplement groups. Optional local VizieR builds may replace
or extend them for evaluation, but those richer derived records must not be
committed or published without catalogue-by-catalogue rights clearance.

## Build the catalogue locally

Python 3.11 or newer is required by the pinned Astropy release. Install the
build-time astronomy dependency, then create the distributable OpenNGC-only
catalogue:

```bat
python -m pip install -r tools\requirements-catalog.txt
python tools\build_dso_catalog.py --catalogues openngc
```

Build the separately licensed public supplement from the pinned Stellarium
release:

```bat
python tools\build_stellarium_supplement.py --version v26.2
```

This reads Stellarium DSO catalogue v3.23, validates the 94,899-row upstream
input, and emits only records carrying at least one LDN, Barnard, LBN,
Sharpless 2, vdB, or RCW cross-identifier.

The default source is pinned to OpenNGC `v20260501`. The compatibility command
remains available for existing automation:

```bat
python tools\build_openngc_catalog.py
```

The shared builder creates:

```text
dso-catalog.js
data/dso-catalog.json
data/dso-viewer-catalog.json
data/catalog-sources.json
data/dedup-candidates.json
data/openngc-catalog.json
data/openngc-viewer-catalog.json
data/openngc-meta.json
stellarium-supplement.js
data/stellarium-dso-supplement.json
data/stellarium-supplement-meta.json
```

`dso-catalog.json` preserves the normalized nested model and provenance.
`dso-viewer-catalog.json` and `dso-catalog.js` contain the smaller degree-based
runtime projection. Package consumers can load the neutral payload through
`@acocalypso/celestia-atlas/normalized-viewer-catalog-data`; the existing
`catalog-data` and `viewer-catalog-data` exports retain their legacy OpenNGC
schemas for compatibility.
The separate `stellarium-supplement-data` and `stellarium-supplement-meta`
package exports preserve the Stellarium asset and licence boundary.
`dedup-candidates.json` records report-only spatial candidates and ambiguous
cross-identifications for manual review; neither category is auto-merged.

To evaluate all optional catalogues locally, first review the source terms and
then run:

```bat
python tools\fetch_catalog_sources.py --cache-dir .cache\catalog-sources --acknowledge-rights-review
python tools\build_dso_catalog.py --catalogues all --vizier-source-dir .cache\catalog-sources --acknowledge-rights-review
```

Select individual groups with a comma-separated list such as
`openngc,ldn,barnard,lbn,sharpless,vdb,rcw,dcld,feitzinger`. VizieR importers
only read local files; they never download implicitly. Do not publish a local
combined output until the included catalogue rights are cleared for the
intended distribution. See [`docs/CATALOGUES.md`](docs/CATALOGUES.md) for the
schemas, coordinate policy, deduplication rules, citations, and limitations.

## NASA image downloader v2

Pillow is optional but strongly recommended for local WebP conversion:

```bat
python -m pip install pillow
```

Download named objects:

```bat
python tools\fetch_nasa_dso_images.py M31 "NGC 253" M42
```

Download the prominent-object set:

```bat
python tools\fetch_nasa_dso_images.py --popular
```

Download a batch of catalogue galaxies brighter than magnitude 11:

```bat
python tools\fetch_nasa_dso_images.py --all --types galaxy --mag-max 11 --missing --limit 100
```

Continue with the next batch:

```bat
python tools\fetch_nasa_dso_images.py --all --types galaxy --mag-max 11 --missing --offset 100 --limit 100
```

Preview a selection without network downloads:

```bat
python tools\fetch_nasa_dso_images.py --all --types PN --mag-max 13 --limit 50 --list
```

Useful flags:

```text
--missing             skip objects that already have an image
--overwrite           replace existing image files
--types galaxy,PN     filter by type text or OpenNGC type code
--mag-max 12          restrict known magnitudes
--offset 100          begin at a later point in the selection
--limit 100           batch size; 0 means unlimited
--skip-failed         skip objects in the persistent failure state
--dry-run             show planned NASA searches without downloading
--format webp|jpg     local output format
--max-dimension 1920  resize limit
```

The tool writes:

```text
images/dso/<object>.webp
images/dso/<object>.json
images/dso/download-report.json
images/dso/.nasa-download-state.json
```

The state and report files are ignored by Git. Successfully downloaded images
and attribution JSON files should be committed.

The NASA Image and Video Library is a publication archive, not an all-sky survey.
It will not contain a suitable photograph for every NGC/IC entry. Missing
results are logged and do not stop the batch.

After adding images manually, rebuild the index with:

```bat
python tools\build_dso_image_index.py
```

## Local preview

```bat
python serve.py
```

Open:

```text
http://localhost:8000
```

Do not test service-worker behavior through `file://`; use localhost or HTTPS.

## Horizon clipping and physical camera FOV

The viewer hides celestial content below the horizon by default. With no custom
profile, the cutoff is 0 degrees altitude. Supply a local obstruction profile
as azimuth/altitude points; the viewer sorts and interpolates it continuously
through north:

```js
viewer.setHorizon([
  { azimuthDeg: 0, altitudeDeg: 12 },
  { azimuthDeg: 90, altitudeDeg: 18 },
  { azimuthDeg: 180, altitudeDeg: 7 },
  { azimuthDeg: 270, altitudeDeg: 10 },
]);

viewer.setDisplayOptions({ hideBelowHorizon: true });
```

The standalone imaging overlay accepts physical camera and telescope values
instead of manually entered angular dimensions. Embedded consumers can use the
same exported helper and pass its angular result to the viewer:

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

Camera rotation is measured from projected celestial north, independent of the
current horizon or equatorial screen orientation. A clockwise position angle
therefore remains tied to the sky as the view pans instead of rotating with the
canvas.

The helper also returns physical sensor dimensions, diagonal FOV, pixel scale
in arcseconds per pixel and, when aperture is supplied, focal ratio. Aperture
does not change angular FOV; that is determined by sensor size and focal length.

## Brightness filters

The viewer accepts separate apparent limiting magnitudes for stars, galaxies
and all other deep-sky objects:

```js
viewer.setDisplayOptions({
  starMagnitudeLimit: 5.5,
  galaxyMagnitudeLimit: 12,
  deepSkyMagnitudeLimit: 10,
});
```

Objects with a known magnitude render when their magnitude is less than or
equal to the corresponding limit. Lower numbers therefore keep only brighter
objects. Galaxy pairs, triplets, groups and clusters use the galaxy limit;
`deepSkyMagnitudeLimit` covers nebulae, star clusters and other DSOs. The
default value of `30` for both DSO categories means no user cap, while the
existing field-of-view ceiling still prevents a wide view from becoming
overloaded. Setting a stricter DSO limit also hides objects whose magnitude is
unknown. A selected target bypasses the drawing filters, and search continues
to query the complete offline catalogue.

Catalogue and type filters are independent allowlists. `null` means all; an
empty array intentionally hides the whole facet:

```js
viewer.setDisplayOptions({
  deepSkyObjectTypes: ["DrkN", "RfN", "EmN", "HII"],
  deepSkyCatalogueGroups: ["ldn", "barnard", "sharpless", "vdb", "rcw"],
});
```

Historical nebula catalogues usually do not publish visual magnitudes. The
renderer does not invent them: ordinary magnitude-less optional records appear
in narrower fields, while only large explicitly approximate cloud markers are
allowed at wider fields. Filtering happens before sky projection for mobile
performance. Search still covers hidden groups and types.

## Project structure

```text
index.html
styles.css
standalone.css              standalone shell styling
standalone-app.js           standalone adapter for the shared viewer API
catalog.js                 compact bright-star + curated fallback data
dso-catalog.js             generated degree-based browser catalogue
stellarium-supplement.js   separate GPL-2.0-or-later public supplement
src/public-api.js           shared standalone/embedded renderer
src/core/catalog-identifiers.js ranked tolerant identifier search
src/core/optics.js          physical imaging-train FOV calculations
service-worker.js
manifest.webmanifest
assets/landscapes/          packaged offline HEALPix landscape
images/dso/
data/
tools/build_dso_catalog.py  shared normalized catalogue builder
tools/build_openngc_catalog.py compatibility command
tools/build_stellarium_supplement.py separate public supplement builder
tools/fetch_catalog_sources.py explicit local source acquisition
tools/catalog_sources/     source-specific importers and source manifest
tools/build_dso_image_index.py
tools/fetch_nasa_dso_images.py
docs/CATALOGUES.md          schemas, science policy, build and rights notes
.github/workflows/pages.yml
```

## Data attribution

OpenNGC catalogue data is by Mattia Verga and contributors and is licensed under
CC BY-SA 4.0. Keep `THIRD_PARTY_NOTICES.md` and the in-app attribution when
redistributing a generated catalogue.

The separately packaged LDN, Barnard, LBN, Sharpless 2, vdB, and RCW
cross-index supplement is derived from Stellarium v26.2 DSO catalogue v3.23 and
remains under GPL-2.0-or-later. Its source, generated supplement, metadata,
attribution, and full licence copy must remain available when it is
redistributed. This does not change the MIT licence for Celestia Atlas code or
the CC BY-SA 4.0 terms for the OpenNGC asset.

The supported VizieR-hosted historical catalogues have no populated open
licence in their current CDS metadata. They remain optional user-run imports
and are not the source of the public supplement. Review each source and
publication terms before redistributing locally generated records. In
particular, Southern Dark Clouds and Feitzinger-Stuewe remain local-only. Full
citations and the exact transformation notes are in `THIRD_PARTY_NOTICES.md`
and [`docs/CATALOGUES.md`](docs/CATALOGUES.md).

NASA image sidecars retain the source URL and credit returned by the NASA Image
and Video Library. Review each source page before publication because a NASA
site can host third-party material with separate rights.
