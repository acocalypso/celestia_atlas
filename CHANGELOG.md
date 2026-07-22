# Changelog

## Unreleased

- Completed the 110-entry Messier catalogue with an explicitly sourced M40
  point marker and the documented NASA M102/NGC 5866 convention. Messier
  membership is now independently filterable, while map and selection labels
  retain both the `M` designation and common name.
- Added an independently implemented celestial HiPS image renderer and a
  default DSS2 Color source. Real survey imagery fades in between 20 and 10
  degrees FOV, refines progressively to order 9, respects rotation and custom
  horizons, and remains behind catalogue/grid/landscape overlays.
- Added bounded mobile/desktop tile loading, gesture-time preview orders,
  non-fatal Milky Way fallback, conditional in-view attribution, an embed API
  and standalone toggle. A separate 512-tile Cache Storage layer shared by the
  viewer and service worker can preserve viewed fields offline in standalone
  and embedded builds when browser storage permits, without attempting to
  redistribute the full survey.
- Kept survey rendering responsive on mobile by chunking and cancelling
  high-quality reprojection work, aborting obsolete downloads, planning only
  above-horizon tiles, and filling unavailable detail tiles from cached parent
  orders before falling back transparently to the bundled Milky Way.
- Reworked equatorial-to-horizontal conversion around explicitly tagged ICRS
  and FK5/J2000 (Astronomy Engine EQJ) frames. ICRS inputs receive the explicit
  IAU SOFA `iauFk5hip` orientation rotation; the pinned Astronomy Engine 2.1.19
  EQJ/HOR transform now supplies precession, nutation and sidereal orientation
  at the observer's UTC time. Azimuth remains north-zero/east-positive,
  longitude east-positive, and altitude geometric without atmospheric
  refraction.
- Added official IAU SOFA 2023-10-11 `Hd2ae`/`Ae2hd` handedness fixtures with
  radian tolerances of `1e-13` for `Hd2ae` azimuth and `1e-14` for the remaining
  outputs (degree ceilings no looser than `1e-11`). Fixed Astronomy Engine
  full-frame literals use `1e-10` degree and general inverse round trips use
  `1e-9` degree, relaxed only at exact-pole singularities. Documented the
  engine's UT1-as-UTC and Earth-orientation limitations.
- Anchored camera and mosaic position angles to projected celestial north, so
  horizon-aligned panning no longer makes framing overlays rotate with screen
  up.
- Corrected the horizontal observer projection to natural inside-the-sphere
  handedness, with increasing azimuth screen-right while facing the horizon.
  Stars, grids, catalogue footprints, the Milky Way, DSS imagery and the
  landscape now share that orientation, while horizontal dragging still moves
  the sky with the pointer.
- Kept the Milky Way exactly registered across ICRS and J2000 views, corrected
  catalogue ellipse major axes to their north-through-east position angles,
  and added an east-facing Deneb/Altair browser regression screenshot.
- Corrected the Milky Way panorama's Galactic-longitude orientation so its
  north-to-south horizon crossing is no longer mirrored. Galactic north remains
  at the top of the source panorama.
- Decoupled camera orientation from grid visibility. The viewer now defaults to
  a horizon-aligned observer mode, `setCoordinateMode` explicitly selects
  horizontal or equatorial orientation, and hiding azimuth lines no longer
  rotates landscapes or makes horizontal dragging appear diagonal.
- Added independent limiting-magnitude filters for stars, galaxy-family
  objects and other deep-sky objects to the public viewer and standalone UI.
  A lower magnitude limit shows only brighter objects; selected targets remain
  visible and offline search continues to cover the full catalogue.
- Added a compact, degree-based 12,578-object OpenNGC package export for
  embedded viewers, reducing the raw catalogue payload from 6,019,427 to
  2,971,964 bytes and removing the host-side object conversion.
- Optimized coarse-pointer rendering with allocation-free landscape and Milky
  Way projections, bounded interaction rasters, cached raster uploads,
  conditional canvas resizing, off-screen culling, ephemeris caching and
  coalesced view-change events. Added pointer cancellation and 2D context-loss
  recovery for mobile lifecycle interruptions.
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
