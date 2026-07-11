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
