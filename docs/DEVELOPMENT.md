# Development

## Requirements

- Python 3.11 or newer
- Node.js 22 (the version used by CI; newer versions should also work)
- Google Chrome or Chromium for browser smoke tests

The GitHub Pages workflow currently uses Python 3.12 and Node.js 22. Set
`CHROME_PATH` when the browser executable is not discoverable automatically.

## Install dependencies

```bash
npm ci
python -m pip install -r tools/requirements-catalog.txt
```

## Local preview

```bash
python serve.py
```

Open `http://localhost:8000`.

## Tests

```bash
npm test
npm run test:browser
```

Individual suites:

```bash
npm run test:js
npm run test:catalog
```

`npm test` is the required unit and catalogue gate. The browser smoke test
starts an isolated local server and checks desktop drag/wheel interaction,
mobile pinch interaction, runtime console errors, and failed network requests.
Use `SMOKE_TRACE=1 npm run test:browser` when the browser interaction trace is
needed for diagnosis.

Run the suites affected by a change while developing, then run both `npm test`
and `npm run test:browser` before publishing a runtime or UI change.

## Change checklist by area

| Change | Required companion work |
| --- | --- |
| Public API | Update implementation, `src/index.d.ts`, [API.md](API.md), and tests |
| Viewer behavior or UI | Test standalone and embedded behavior; run the browser smoke test |
| Coordinates or projection | Add numerical tests at ordinary and polar/meridian edge cases |
| Catalogue builder or schema | Regenerate every affected output and preserve source metadata |
| Survey loading or caching | Test offline failure, attribution, movement, and cache reuse |
| Third-party data or imagery | Update notices, licence copies, source version, and redistribution review |

## Catalogue builds

```bash
python tools/build_dso_catalog.py --catalogues openngc
python tools/build_stellarium_supplement.py --version v26.2
python tools/build_abell_pn_catalog.py
python tools/build_hyg_star_catalog.py
```

Compatibility command:

```bash
python tools/build_openngc_catalog.py
```

## Generated files

Builders produce or update files including:

```text
dso-catalog.js
stellarium-supplement.js
abell-pn-catalog.js
hyg-star-catalog.js

data/dso-catalog.json
data/dso-viewer-catalog.json
data/catalog-sources.json
data/dedup-candidates.json
data/openngc-catalog.json
data/openngc-viewer-catalog.json
data/openngc-meta.json
data/stellarium-dso-supplement.json
data/stellarium-supplement-meta.json
data/abell-pn-catalog.json
data/hyg-star-catalog.json
```

Regenerate affected outputs when changing a builder, source version, normalization rule, or runtime schema.
Generated catalogue files must not be edited by hand. Review both the builder
change and the generated diff.

## Optional VizieR imports

```bash
python tools/fetch_catalog_sources.py \
  --cache-dir .cache/catalog-sources \
  --acknowledge-rights-review

python tools/build_dso_catalog.py \
  --catalogues all \
  --vizier-source-dir .cache/catalog-sources \
  --acknowledge-rights-review
```

Do not publish optional derived records until every included source has been reviewed for redistribution rights.

## Deep-sky preview images

```bash
python -m pip install pillow
python tools/fetch_nasa_dso_images.py M31 "NGC 253" M42
python tools/build_dso_image_index.py
```

Downloaded images use sidecar metadata. Review each original source before publication.

## GitHub Pages

Configure:

```text
Settings → Pages → Source → GitHub Actions
```

Push to `main`.

The workflow rebuilds public catalogue layers, runs tests and browser smoke tests, validates required files and licences, assembles `_site`, and deploys it.

Optional VizieR catalogues are not fetched or published by the workflow.

## Contribution checklist

- Keep standalone behavior and the public API aligned.
- Preserve coordinate-frame tags and source provenance.
- Do not auto-merge ambiguous catalogue matches.
- Retain required attribution and licence files.
- Regenerate affected outputs.
- Run relevant tests.
- Avoid unnecessary runtime network dependencies.
- Document source-version and rights changes.
- Keep browser console and network-error checks clean.
- Do not commit `.cache/`, `_site/`, browser profiles, or smoke-test screenshots.
