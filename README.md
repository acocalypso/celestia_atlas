# Celestia Atlas

**An offline-first sky atlas for the browser and an embeddable JavaScript viewer.**

[![Deploy Celestia Atlas](https://github.com/acocalypso/celestia_atlas/actions/workflows/pages.yml/badge.svg)](https://github.com/acocalypso/celestia_atlas/actions/workflows/pages.yml)
[![Code license: MIT](https://img.shields.io/badge/code%20license-MIT-blue.svg)](LICENSE)

[Open the atlas](https://acocalypso.github.io/celestia_atlas/) · [Documentation](docs/README.md) · [Changelog](CHANGELOG.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

Celestia Atlas combines local star and deep-sky catalogues with observer-based sky calculations, constellation lines, a horizon panorama, and camera-framing tools. The standalone application runs as a Progressive Web App; the same rendering engine can be embedded in another browser application.

Core search and sky calculations run locally. An optional DSS2 Color photographic layer loads imagery on demand when a network connection is available.

## What you can do

- Explore the sky in horizontal or equatorial mode, change the observer location and time, and search stars or deep-sky objects by name and catalogue identifier.
- Display all 88 Western constellation line figures, coordinate grids, cardinal directions, the Sun, Moon, planets, Pluto, Galilean moons, and comets.
- Use the lower-screen compass to read the view centre's geographic bearing. Its visibility setting is saved in the browser.
- View the Touch'N'Stars landscape by default. Embedded hosts can provide a custom horizon or another HEALPix landscape.
- Overlay a camera field of view or mosaic and zoom into optional DSS2 Color photographic imagery.

The public build includes 9,437 searchable stars and 21,192 deep-sky catalogue markers, including all 110 Messier designations. The catalogues and their source terms are documented in [CATALOGUES.md](docs/CATALOGUES.md).

## Run the standalone atlas

Try the [live atlas](https://acocalypso.github.io/celestia_atlas/), or serve a local checkout:

```bash
git clone https://github.com/acocalypso/celestia_atlas.git
cd celestia_atlas
python serve.py
```

Open **http://localhost:8000**. The preview server listens on your computer only. Python is sufficient to run the checked-in standalone application; Node.js is needed for development tests.

Drag to pan, use the mouse wheel or pinch to zoom, click an object for details, and search from the top bar. The initial observer location is Berlin until you change it or apply device location. The compass can be switched off under **Controls → View compass**. See [USAGE.md](docs/USAGE.md) for shortcuts and the rest of the controls.

Use `localhost` or HTTPS. ES modules, the service worker, and persistent browser caching do not work reliably from `file://`.

## Embed the viewer

The public entry point is [`src/index.js`](src/index.js). A minimal local-only viewer can use the packaged bright-star and constellation data:

```html
<div id="atlas" style="position: relative; width: 100%; height: 70vh"></div>

<script type="module">
  import { createCelestiaAtlasViewer } from "./src/index.js";
  import brightSky from "./data/bright-sky.json" with { type: "json" };
  import constellations from "./data/western-constellations.json" with { type: "json" };

  const viewer = createCelestiaAtlasViewer({
    container: document.querySelector("#atlas"),
    stars: brightSky.stars,
    constellations,
    observer: { latitudeDeg: 52.52, longitudeDeg: 13.405, elevationM: 0 },
    utcMs: Date.now(),
    skySurveySource: null,
  });

  viewer.setCoordinateMode("horizontal");
  viewer.resume();
</script>
```

New viewers start paused. The host controls their size, lifecycle, catalogues, observer, and display options. Add deep-sky records through `catalog`, or use `composeStarCatalog` to combine curated, HYG, and WR stars with HD and SAO identifiers. The public `starCatalogueMask` and `STAR_CATALOGUE_BITS` helpers support source filters; search remains available when a layer is hidden.

See [USAGE.md](docs/USAGE.md) for a larger example, [API.md](docs/API.md) for the viewer contract, and [`src/index.d.ts`](src/index.d.ts) for types. The package is marked private in `package.json`; embedded hosts currently consume the source or a pinned Git revision.

## Offline and photographic imagery

The application shell, bundled catalogues, sky calculations, Milky Way panorama, and default landscape are local. After the app has loaded, its service worker caches the standalone assets for offline use. Browser storage policies can still evict cached data.

The optional DSS2 Color layer starts blending in below a 20° field of view and reaches full opacity near 10°. It requests only imagery needed for the visible field. Previously viewed fields may be cached; unseen fields need a connection. The full photographic survey is not bundled. Embedded hosts can disable network imagery with `skySurveySource: null` or supply their own survey source.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for rendering, HiPS tiles, caching, and memory limits.

## Develop and contribute

Development uses Node.js 22, Python 3.11 or newer, and Chrome or Chromium for browser smoke tests:

```bash
npm ci
python -m pip install -r tools/requirements-catalog.txt
npm test
npm run test:browser
```

The repository contains generated catalogue files. Read [DEVELOPMENT.md](docs/DEVELOPMENT.md) before changing source versions, builders, or generated output. It also covers local preview, test suites, and GitHub Pages deployment.

| Guide | Purpose |
| --- | --- |
| [USAGE.md](docs/USAGE.md) | Standalone controls and embedding examples |
| [API.md](docs/API.md) | Public viewer API |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Rendering and offline design |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, testing, catalogue builds, and deployment |
| [CATALOGUES.md](docs/CATALOGUES.md) | Data provenance, schemas, and source rights |

## Licensing and accuracy

The application code is [MIT licensed](LICENSE). **Bundled and generated data do not all share that licence.** OpenNGC and HYG-derived assets use CC BY-SA 4.0; the SIMBAD A66-derived asset uses ODbL 1.0; the Stellarium-derived supplement and Western constellation lines use GPL-2.0-or-later. DSS2 imagery and optional object previews retain their respective source terms. Review [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [`licenses/`](licenses/) before redistributing data or imagery.

Celestia Atlas is intended for visualization, search, observing preparation, and camera framing. It does not ingest live IERS Earth-orientation parameters, DUT1, polar motion, or atmospheric refraction data and should not be used as a precision astrometry or mount model.
