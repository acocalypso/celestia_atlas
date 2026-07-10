# Celestia Atlas Offline

A self-contained interactive sky atlas. It does **not** use Aladin, Stellarium Web, HiPS, remote APIs, CDNs, online catalogs, external fonts, analytics, or third-party JavaScript libraries.

## Fastest start — no server

Double-click `celestia-atlas-offline.html`. This single file contains the renderer, interface, star catalog, DSO catalog, and styles.

Device geolocation may be restricted for `file://` pages by some browsers. Manual latitude and longitude always work.

## Installable local app

For service-worker caching and browser installation, run:

```bash
python3 serve.py
```

Open `http://localhost:8000`. Internet access is not required.

## Included

- Native Canvas celestial-sphere renderer using 3D vector projection
- Observer/horizon and equatorial atlas modes
- 130 local bright stars and 50 popular deep-sky objects
- Offline search by names, Messier/NGC identifiers, aliases, and coordinates
- 27 constellation figures, coordinate grids, and calculated Galactic plane
- Time travel, animated sky, geolocation/manual location, altitude calculations
- Object details with automatic local DSO photographs and schematic fallbacks
- Mouse, wheel, touch, pinch, keyboard, fullscreen, and shareable hash state
- Service worker for offline installation

## Data scope

This is a compact navigational catalog rather than a photographic survey. Coordinates are J2000 and descriptive values are rounded. The Milky Way overlay is calculated from the Galactic coordinate system. A DSO photograph is shown only when a matching local file exists; otherwise the preview is clearly marked as schematic.

## Keyboard shortcuts

`/` search · `H` mode · `G` grid · `C` constellations · `D` DSOs · `L` labels · `N` night mode · `R` reset · `F` fullscreen


## Local galaxy and DSO images

Put image files in `images/dso`. The simplest convention is the compact object identifier:

```text
images/dso/m31.webp
images/dso/m51.webp
images/dso/m104.webp
images/dso/ngc253.webp
```

The app tries identifiers, aliases and names. It supports WebP, JPEG, PNG and AVIF. If you add `m31.webp`, selecting M31 immediately displays it without an online request.

For attribution, galleries and service-worker precaching, create an optional sidecar JSON file and regenerate the index:

```bash
python tools/build_dso_image_index.py
```

The included GitHub Pages workflow does this automatically during deployment. In **Settings → Pages**, select **GitHub Actions** as the source to use that workflow.

### Optional NASA download helper

The build-time helper searches the NASA Image and Video Library, downloads local copies and writes attribution metadata:

```bash
python tools/fetch_nasa_dso_images.py M31 M51 M104
# or
python tools/fetch_nasa_dso_images.py --all
```

The atlas itself never contacts NASA. Review each generated source/credit JSON before publishing, because NASA notes that some material on its sites may be third-party copyrighted content. Images should be acknowledged to their listed source and must not imply NASA endorsement.

The old single-file `celestia-atlas-offline.html` continues to work with schematic previews. The folder-based `index.html` build is the recommended version for local photographs.
