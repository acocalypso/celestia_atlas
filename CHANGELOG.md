# Changelog

## Unreleased

- Added live offline Sun, Moon, planet and Pluto rendering, search, selection
  and observer/time-dependent topocentric J2000 positions to the standalone app.
- Added a reproducible 1,214-record MPC comet catalogue with universal-variable
  propagation, light-time correction, rendering, search and selection.
- Changed the standalone app to load the same framework-neutral engine modules
  as embedded consumers instead of maintaining a duplicate ephemeris adapter.
- Added tested J2000 ecliptic and Galactic transforms plus embedded Milky Way,
  ecliptic, azimuth grid, local meridian and atmospheric horizon layers.
- Added live offline Io, Europa, Ganymede and Callisto positions, rendering,
  search and narrow-field centering to embedded and standalone viewers.
- Added order-0 HiPS/HEALPix landscape loading, spherical projection,
  transparency and non-fatal load-error reporting to the embedded viewer.
- Added a typed `getView` API for renderer-independent host controls.
- Replaced the standalone canvas engine with an adapter around the same public
  viewer used by embedded applications. Reference layers, planets, Galilean
  moons, comets, catalogue search, selection, time/location, lifecycle,
  imaging overlays and HEALPix landscape rendering now share one code path.
- Packaged the Guéreins order-0 HEALPix landscape for offline standalone use and
  added standalone controls for ecliptic, meridian, atmosphere and camera FOV.
- Changed the standalone controls panel to start closed with synchronized
  visual and accessibility state on both panel buttons.
- Added default-on below-horizon clipping for stars, catalogues, moving
  objects, mount markers and projected sky layers. The cutoff follows the
  interpolated custom `setHorizon` profile when one is supplied and can be
  disabled with the `hideBelowHorizon` display option.
- Added `calculateCameraFieldOfView` and physical standalone inputs for sensor
  pixel width/height, pixel size, telescope focal length and optional aperture.
  The helper returns angular dimensions, diagonal FOV, pixel scale, sensor
  dimensions and focal ratio for the shared imaging overlay.
- Fixed HEALPix landscape orientation and face closure by applying the
  Stellarium tile-axis convention. Added premultiplied-alpha bilinear sampling,
  bounded DPR-aware raster resolution and an idle full-quality redraw after
  reduced-resolution wheel interaction.

## v8

- Added reproducible full OpenNGC NGC/IC + addendum catalogue generation.
- Added offline search across the generated catalogue and aliases.
- Added adaptive DSO rendering for large catalogue performance.
- Added OpenNGC details including catalogue ID, magnitude band, Hubble class,
  position angle, surface brightness, redshift and radial velocity where known.
- Rebuilt the NASA image downloader for arbitrary catalogue targets and large
  resumable batches.
- Added filtering, batching, dry-run/list modes, persistent state, reports,
  improved NASA result scoring and safer media selection.
- Updated service-worker cache and GitHub Pages workflow.
- Added CC BY-SA 4.0 attribution and third-party notices.

## v7

- Added the local WebGL Milky Way dome.
- Added projected DSO image previews and improved sky presentation.

## v6 and earlier

- Added local DSO image indexing, service-worker caching, native sky rendering,
  time/location controls, offline search and GitHub Pages deployment support.
