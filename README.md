# Celestia Atlas Offline — Full v7 Project

A self-contained browser sky atlas with a native WebGL Milky Way sky dome, a Canvas celestial-sphere renderer, offline star and DSO catalogs, constellation figures, observer-sky calculations, local DSO photographs, and GitHub Pages deployment.

## Highlights

- No Aladin, HiPS, remote sky viewer, API, CDN, analytics, or runtime network dependency.
- Native WebGL Milky Way panorama aligned to Galactic, equatorial, and observer coordinates.
- Local DSO photographs projected directly at their catalogued sky positions when zoomed in.
- Local catalog search for stars, Messier/NGC objects, aliases, and coordinates.
- Observer-sky and equatorial atlas modes.
- Offline PWA caching through `service-worker.js`.
- Automatic DSO image indexing during GitHub Pages deployment.
- Robust pointer release handling to prevent the sky remaining in drag mode.
- WebGL fallback to the original calculated Galactic-plane overlay when WebGL is unavailable.

## Run locally

From the repository root:

```bash
python serve.py
```

Open `http://localhost:8000`.

A local HTTP server is recommended because service workers are not active when opening `index.html` directly through `file://`.

## Milky Way sky dome

The bundled file is:

```text
assets/milky-way.webp
```

It is a local, procedurally generated 2:1 equirectangular Galactic-coordinate panorama. The WebGL renderer maps it onto the inside of the sky sphere and keeps it aligned while you pan, zoom, change time, switch coordinates, or move the observer.

You can replace the file with another 2:1 Galactic-coordinate panorama. Keep the filename unchanged, then increase the service-worker cache version before deployment.

## DSO images in the sky

Put images in:

```text
images/dso/
```

Recommended names:

```text
m31.webp
m42.jpg
m51.png
m104.webp
ngc253.jpg
ngc5128.jpg
```

Supported formats: WebP, JPEG, PNG, and AVIF.

Create an optional sidecar JSON file with the same basename:

```json
{
  "object": ["M31", "NGC 224", "Andromeda Galaxy"],
  "title": "Andromeda Galaxy",
  "alt": "The Andromeda Galaxy and its dust lanes",
  "credit": "NASA, ESA and collaborators",
  "source": "https://example.org/source-page",
  "license": "Review source usage terms"
}
```

Then regenerate the local index:

```bash
python tools/build_dso_image_index.py
```

The same images are used in two places:

1. The object details panel.
2. The sky itself as softly blended previews at the correct RA/Dec when the field of view is below about 48°.

The GitHub Actions workflow runs the indexer automatically before deployment.

## NASA build-time downloader

Download configured sample targets:

```bash
python tools/fetch_nasa_dso_images.py --all
```

Or selected objects:

```bash
python tools/fetch_nasa_dso_images.py M31 M51 M104
```

The downloader stores local copies and metadata. The atlas never contacts NASA at runtime. Review every generated source, credit, and licence before publishing.

## GitHub Pages

In the repository, open **Settings → Pages** and set the source to **GitHub Actions**.

Push to `main`. The included workflow:

1. Generates `dso-images.js`.
2. Builds the `_site` artifact.
3. Copies the WebGL renderer and Milky Way panorama.
4. Copies local DSO images.
5. Deploys the result to GitHub Pages.

For the repository `acocalypso/celestia_atlas`, the expected URL is:

```text
https://acocalypso.github.io/celestia_atlas/
```

## Updating an existing installation

This release uses `app-v7.js` and cache `celestia-atlas-offline-v7` to bypass older cached builds. After deployment, load:

```text
https://acocalypso.github.io/celestia_atlas/?build=v7
```

The browser console should show:

```text
Celestia Atlas app build v7
```

If an older release still appears, unregister the old service worker and clear site data once in browser developer tools.

## Project structure

```text
.
├── .github/workflows/pages.yml
├── .gitignore
├── .nojekyll
├── app.js
├── app-v7.js
├── assets/
│   ├── milky-way.webp
│   └── README.md
├── catalog.js
├── dso-images.js
├── images/dso/
├── index.html
├── manifest.webmanifest
├── milky-way-renderer.js
├── service-worker.js
├── serve.py
├── styles.css
└── tools/
    ├── build_dso_image_index.py
    └── fetch_nasa_dso_images.py
```
