# Changelog

## v7

- Added a native WebGL sky dome with a local equirectangular Milky Way panorama.
- Aligned the Milky Way texture with Galactic, equatorial, and horizontal coordinates.
- Added a Milky Way brightness control and shared URL state.
- Added local DSO photograph previews directly on the sky at catalogued RA/Dec positions.
- Scaled DSO previews from angular size, field of view, and view depth.
- Added a switch to disable DSO image previews independently of DSO markers.
- Added a fallback calculated Galactic-plane overlay when WebGL or the texture is unavailable.
- Updated the GitHub Pages workflow to publish the renderer and `assets` folder.
- Updated the service worker to cache the new sky-dome assets offline.
- Preserved all v6 image-panel and pointer-release fixes.

## v6

- Added cache-proof `app-v6.js` entry point.
- Fixed missing `#objectImage` and `#objectImageCaption` handling.
- Added defensive creation of image UI elements for stale HTML.
- Fixed pointer drag state remaining active after object selection or mouse release.
- Added window-level pointer cleanup, lost pointer capture handling, mouse-button-loss handling, touch cancellation, and blur cleanup.
- Updated service-worker strategy to network-first for application files and cache-first for local DSO images.
- Updated GitHub Pages artifact action to `actions/upload-pages-artifact@v4`.
- Added complete GitHub Pages workflow and image-index generation.
- Included corrected NASA asset manifest parser.
