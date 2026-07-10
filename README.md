# Celestia Atlas Offline — Full v6 Project

A self-contained browser sky atlas with a native Canvas renderer, offline star and DSO catalogs, constellation figures, observer-sky calculations, local DSO images, and GitHub Pages deployment.

## Highlights

- No Aladin, HiPS, remote sky viewer, API, CDN, analytics, or runtime network dependency.
- Local catalog search for stars, Messier/NGC objects, aliases, and coordinates.
- Observer-sky and equatorial atlas modes.
- Local galaxy/nebula/cluster images loaded from `images/dso/`.
- Offline PWA caching through `service-worker.js`.
- Automatic DSO image indexing during GitHub Pages deployment.
- Robust pointer release handling to prevent the sky remaining in drag mode.
- Defensive image-panel creation for older cached HTML.

## Run locally

From the repository root:

```bash
python serve.py
```

Open `http://localhost:8000`.

A local HTTP server is recommended because service workers are not active when opening `index.html` directly through `file://`.

## Add DSO images

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

The GitHub Actions workflow runs this command automatically before deployment.

## NASA build-time downloader

Download configured sample targets:

```bash
python tools/fetch_nasa_dso_images.py --all
```

Or selected objects:

```bash
python tools/fetch_nasa_dso_images.py M31 M51 M104
```

The downloader stores local copies and metadata. The atlas never contacts NASA at runtime. Review every generated source, credit, and license before publishing.

## GitHub Pages

In the repository, open **Settings → Pages** and set the source to **GitHub Actions**.

Push to `main`. The included workflow:

1. Generates `dso-images.js`.
2. Builds the `_site` artifact.
3. Copies local DSO images.
4. Deploys the result to GitHub Pages.

For the repository `acocalypso/celestia_atlas`, the expected URL is:

```text
https://acocalypso.github.io/celestia_atlas/
```

## Updating an existing installation

This release uses `app-v6.js` and cache `celestia-atlas-offline-v6` to bypass older cached builds. After deployment, load:

```text
https://acocalypso.github.io/celestia_atlas/?build=v6
```

The browser console should show:

```text
Celestia Atlas app build v6
```

If an older release still appears, unregister the old service worker and clear site data once in browser developer tools.

## Project structure

```text
.
├── .github/workflows/pages.yml
├── .gitignore
├── .nojekyll
├── app.js
├── app-v6.js
├── catalog.js
├── dso-images.js
├── images/dso/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── serve.py
├── styles.css
└── tools/
    ├── build_dso_image_index.py
    └── fetch_nasa_dso_images.py
```
