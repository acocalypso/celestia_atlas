# Celestia Atlas Offline v8

Celestia Atlas source code is licensed under GNU GPL v3 or later. See
`LICENSE`. Bundled and generated third-party data retains the separate terms
listed in `THIRD_PARTY_NOTICES.md`.

A self-contained browser planetarium with a local Milky Way dome, offline star
catalogue, a comprehensive OpenNGC deep-sky catalogue, local DSO photographs,
live offline Sun, Moon and planet positions, and no runtime astronomy services.

## What changed in v8

- The GitHub Pages build downloads and converts the pinned OpenNGC release into
  a local browser catalogue.
- NGC, IC, Messier cross-identifiers, common names, coordinates, object type,
  magnitudes, angular sizes, Hubble class, redshift and radial velocity are
  preserved when available.
- Faint DSOs appear progressively as the field of view narrows, so the full
  catalogue remains usable without covering the wide sky in thousands of marks.
- Search covers the complete generated catalogue and its aliases offline.
- Search and rendering include topocentric J2000 positions for the Sun, Moon,
  planets and Pluto at the selected observer location and time.
- The NASA image downloader now accepts any catalogue object, supports large
  resumable batches, filtering, offsets, dry runs, reports and relevance scoring.

## Runtime privacy and offline behavior

The deployed atlas makes no catalogue, tile, API, analytics or font requests.
`dso-catalog.js`, the Astronomy Engine browser build, the Milky Way panorama
and all DSO images are ordinary local files cached by the service worker.

Online access is used only by optional **build tools**:

- `build_openngc_catalog.py` downloads the source CSV while building.
- `fetch_nasa_dso_images.py` downloads selected publication images into the
  repository.

After those files are generated, the website remains offline-capable.

## GitHub Pages deployment

In the repository, select:

```text
Settings → Pages → Source → GitHub Actions
```

Push the project to `main`. The included workflow will:

1. Download the pinned OpenNGC release.
2. Generate `dso-catalog.js` and `data/openngc-catalog.json`.
3. Rebuild the local DSO image index.
4. Assemble and deploy the static Pages artifact.

The site address is normally:

```text
https://acocalypso.github.io/celestia_atlas/
```

The committed `dso-catalog.js` is a small curated fallback. The complete file is
created inside GitHub Actions. To commit the generated full catalogue as well,
run the catalogue builder locally before `git add`.

## Build the full catalogue locally

Python 3.10 or newer is recommended:

```bat
python tools\build_openngc_catalog.py
```

The default source is pinned for reproducibility:

```text
OpenNGC v20260501
```

Choose another tag or branch explicitly:

```bat
python tools\build_openngc_catalog.py --version master
```

Generated files:

```text
dso-catalog.js
data/openngc-catalog.json
data/openngc-meta.json
```

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

## Project structure

```text
index.html
styles.css
catalog.js                 compact bright-star + curated fallback data
dso-catalog.js             generated complete OpenNGC browser catalogue
app-v8.js                  main atlas engine
app.js                     compatibility loader for the main engine
milky-way-renderer.js      local WebGL sky dome
service-worker.js
manifest.webmanifest
assets/milky-way.webp
images/dso/
data/
tools/build_openngc_catalog.py
tools/build_dso_image_index.py
tools/fetch_nasa_dso_images.py
.github/workflows/pages.yml
```

## Data attribution

OpenNGC catalogue data is by Mattia Verga and contributors and is licensed under
CC BY-SA 4.0. Keep `THIRD_PARTY_NOTICES.md` and the in-app attribution when
redistributing a generated catalogue.

NASA image sidecars retain the source URL and credit returned by the NASA Image
and Video Library. Review each source page before publication because a NASA
site can host third-party material with separate rights.
