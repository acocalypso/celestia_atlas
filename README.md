# Celestia Atlas

**An offline-first browser planetarium and embeddable JavaScript sky-atlas renderer.**

[![Deploy Celestia Atlas](https://github.com/acocalypso/celestia_atlas/actions/workflows/pages.yml/badge.svg)](https://github.com/acocalypso/celestia_atlas/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/Code%20License-MIT-blue.svg)](LICENSE)

[Live atlas](https://acocalypso.github.io/celestia_atlas/) ·
[Documentation](docs/README.md) ·
[Catalogue documentation](docs/CATALOGUES.md) ·
[Third-party notices](THIRD_PARTY_NOTICES.md)

Celestia Atlas combines local astronomical catalogues, offline celestial calculations, a packaged Milky Way panorama, optional deep-sky previews, horizon-aware rendering, and on-demand DSS2 photographic imagery.

The project includes a standalone Progressive Web App and a framework-neutral JavaScript viewer that can be embedded in other browser applications.

## Highlights

- Offline catalogue search, navigation, coordinate transforms, and celestial calculations
- 8,910 stars and 21,192 deep-sky catalogue markers in the current public build
- All 110 Messier designations, with catalogue number and common name labels
- Local positions for the Sun, Moon, planets, Pluto, Galilean moons, and comets
- Horizontal and equatorial viewing modes
- Constellations, grids, meridian, ecliptic, labels, and cardinal directions
- Custom horizon profiles and HEALPix landscape support
- Camera field-of-view and mosaic overlays
- Progressive DSS2 Color HiPS imagery at narrow fields of view
- Bounded mobile and desktop memory usage
- No analytics, remote fonts, runtime API keys, or remote catalogue queries

## Quick start

```bash
git clone https://github.com/acocalypso/celestia_atlas.git
cd celestia_atlas
python serve.py
```

Open:

```text
http://localhost:8000
```

Use localhost or HTTPS rather than `file://`. Module loading, service workers, CORS, and persistent survey caching require an HTTP origin.

## Embed the viewer

```html
<div id="atlas"></div>

<style>
  #atlas {
    position: relative;
    width: 100%;
    height: 70vh;
    min-height: 420px;
    background: #030812;
  }
</style>

<script type="module">
  import {
    createCelestiaAtlasViewer,
    DEFAULT_DSS_SKY_SURVEY_SOURCE,
  } from "./src/index.js";

  const viewer = createCelestiaAtlasViewer({
    container: document.querySelector("#atlas"),
    catalog: [],
    stars: [],
    constellations: {},
    observer: {
      latitudeDeg: 52.52,
      longitudeDeg: 13.405,
      elevationM: 0,
    },
    utcMs: Date.now(),
    skySurveySource: DEFAULT_DSS_SKY_SURVEY_SOURCE,
    onSelect: (target) => console.log(target),
    onError: (error) => console.error(error),
  });

  viewer.setView({
    center: {
      raDeg: 10.6847,
      decDeg: 41.269,
      frame: "ICRS",
    },
    fovDeg: 8,
  });

  viewer.resume();
</script>
```

New viewers start paused. Apply the initial state and call `resume()` when rendering should begin.

See [docs/USAGE.md](docs/USAGE.md) and [docs/API.md](docs/API.md) for complete examples.

## Photographic sky survey

The default photographic layer uses DSS2 Color image HiPS tiles from a CDS-listed MAST mirror.

- It begins blending in below a 20° field of view.
- It reaches full opacity at approximately 10°.
- Only visible JPEG tiles are requested.
- Viewed fields may remain available offline through Cache Storage.
- The complete survey is not bundled or redistributed by this repository.

Embedded applications can keep a packaged survey visible at wide fields by setting
`blendStartFovDeg` and `blendFullFovDeg` on their `skySurveySource`. Set
`milkyWayPanoramaUrl: null` and disable the `milkyWay` display option when the
photographic survey replaces the synthetic panorama entirely.

Disable the survey:

```js
viewer.setDisplayOptions({ skySurvey: false });
```

Create a strictly local viewer:

```js
const viewer = createCelestiaAtlasViewer({
  container,
  skySurveySource: null,
});
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for survey loading and caching details.

## Documentation

| Document                                         | Contents                                                      |
| ------------------------------------------------ | ------------------------------------------------------------- |
| [docs/README.md](docs/README.md)                 | Documentation index                                           |
| [docs/USAGE.md](docs/USAGE.md)                   | Standalone and embedded usage                                 |
| [docs/API.md](docs/API.md)                       | Public viewer API                                             |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Rendering, data flow, HiPS, caching, and offline design       |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)       | Setup, catalogue builds, tests, images, and deployment        |
| [docs/CATALOGUES.md](docs/CATALOGUES.md)         | Schemas, transformations, source policy, and catalogue rights |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Attribution and redistribution terms                          |

## Development

```bash
npm ci
python -m pip install -r tools/requirements-catalog.txt
npm test
npm run test:browser
```

Build the primary generated data layers:

```bash
python tools/build_dso_catalog.py --catalogues openngc
python tools/build_stellarium_supplement.py --version v26.2
python tools/build_abell_pn_catalog.py
python tools/build_hyg_star_catalog.py
```

Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) before changing pinned sources or generated catalogue files.

## Data and licensing

The application source code is licensed under the [MIT License](LICENSE).

Generated data and external imagery retain separate licence boundaries:

| Component                         | Licence or terms                 |
| --------------------------------- | -------------------------------- |
| Celestia Atlas source code        | MIT                              |
| OpenNGC-derived catalogue assets  | CC BY-SA 4.0                     |
| HYG-derived star assets           | CC BY-SA 4.0                     |
| SIMBAD A66-derived asset          | ODbL 1.0                         |
| Stellarium-derived DSO supplement | GPL-2.0-or-later                 |
| DSS2 photographic imagery         | External STScI/MAST survey terms |
| NASA image previews               | Per-source metadata and rights   |

Do not assume generated catalogues or downloaded images inherit the MIT licence.

Review [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [`licenses/`](licenses/), and [docs/CATALOGUES.md](docs/CATALOGUES.md) before redistributing data, changing survey endpoints, or publishing optional local catalogue builds.

## Limitations

Celestia Atlas is intended for visualization, search, observing preparation, and camera framing. It is not a replacement for precision astrometry or a telescope mount model.

The runtime does not ingest live IERS Earth-orientation parameters, DUT1, polar motion, or atmospheric refraction data.
