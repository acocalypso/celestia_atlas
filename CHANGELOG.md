# Changelog

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
