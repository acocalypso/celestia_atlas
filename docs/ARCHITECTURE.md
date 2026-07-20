# Architecture

Celestia Atlas is a static browser application. It does not require an application server or runtime astronomy API.

## Layers

```text
Standalone UI
    ↓
Public viewer API
    ↓
Rendering and astronomy core
    ↓
Local catalogues + optional image HiPS
```

## Main modules

| Module | Responsibility |
| --- | --- |
| `standalone-app.js` | Standalone controls and application integration |
| `src/public-api.js` | Viewer lifecycle, interaction, rendering, and state |
| `src/core/coordinates.js` | Equatorial and horizontal transforms |
| `src/core/projection.js` | Camera projection and orientation |
| `src/core/solar-system.js` | Sun, Moon, planets, Pluto, and Galilean moons |
| `src/core/comets.js` | Comet positions from pinned elements |
| `src/core/landscape.js` | Milky Way and HEALPix landscape rasterization |
| `src/core/sky-survey.js` | HiPS mapping, visible tiles, and reprojection |
| `src/core/catalog-identifiers.js` | Ranked normalized search |
| `src/core/catalog-layers.js` | Catalogue normalization and composition |
| `src/core/optics.js` | Imaging-train calculations |

## Render pipeline

A frame combines:

1. Background and atmosphere
2. Milky Way panorama
3. Optional photographic survey
4. Grids and reference lines
5. Stars
6. Deep-sky objects
7. Solar System objects and comets
8. Horizon and landscape
9. Labels, selections, and imaging overlays

## Catalogue model

The runtime combines curated stars, HYG stars, OpenNGC records, the Stellarium supplement, the SIMBAD A66 layer, and pinned comet elements.

The normalized JSON files preserve provenance and richer metadata. Compact JavaScript and viewer JSON files provide the browser representation.

Ambiguous spatial candidates are not automatically merged.

See [CATALOGUES.md](CATALOGUES.md) for catalogue details.

## Survey pipeline

The default source is DSS2 Color image HiPS.

### Startup

The viewer attempts to load the standard order-3 `Allsky.jpg` mosaic as a low-resolution continuity layer.

### Tile selection

When zoomed in:

1. A HiPS order is selected for the current angular scale.
2. Exact visible NESTED tile indices are discovered.
3. The request is fitted to the decoded-memory budget.
4. Visible preview and detail tiles are queued.
5. Cached lower-order parent tiles may be used as fallbacks.

Tile paths use:

```text
Norder{order}/Dir{group}/Npix{tileIndex}.{format}
```

### Fetch and reprojection

The browser checks Cache Storage before fetching a tile. Images are decoded into RGBA pixels and reprojected into the current canvas view.

Interaction uses reduced work. A settled view is refined asynchronously.

### Memory limits

| Device class | Approximate decoded survey budget |
| --- | ---: |
| Coarse pointer | 64 MiB |
| Fine pointer | 128 MiB |

## Persistent cache

The viewer and service worker share:

```text
celestia-atlas-survey-v1
```

The cache is limited to approximately 512 survey resources. Storage and quota failures are non-fatal.

## Offline behavior

The application shell, catalogues, search, calculations, Milky Way panorama, landscape, and available object previews remain local.

An unseen DSS field may require a connection. If the survey cannot be used, rendering falls back to the local sky background.

## Coordinate conventions

Public equatorial coordinates are tagged as `ICRS` or `J2000`.

Horizontal coordinates use north as azimuth `0°`, east as `90°`, altitude positive above the geometric horizon, and east-positive longitude.

Atmospheric refraction is not applied.
