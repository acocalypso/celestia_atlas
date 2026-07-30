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

| Module                            | Responsibility                                              |
| --------------------------------- | ----------------------------------------------------------- |
| `standalone-app.js`               | Standalone controls and application integration             |
| `src/public-api.js`               | Viewer lifecycle, interaction, rendering, and state         |
| `src/core/coordinates.js`         | Equatorial and horizontal transforms                        |
| `src/core/projection.js`          | Camera projection and orientation                           |
| `src/core/solar-system.js`        | Sun, Moon, planets, Pluto, and Galilean moons               |
| `src/core/comets.js`              | Comet positions from pinned elements                        |
| `src/core/landscape.js`           | Milky Way and HEALPix landscape rasterization               |
| `src/core/sky-survey.js`          | HiPS mapping, tile discovery, and CPU fallback reprojection |
| `src/core/sky-survey-webgl.js`    | Progressive GPU HiPS tile compositor                        |
| `src/core/catalog-identifiers.js` | Ranked normalized search                                    |
| `src/core/catalog-layers.js`      | Catalogue normalization and composition                     |
| `src/core/optics.js`              | Imaging-train calculations                                  |

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

### Fetch and rendering

The browser checks Cache Storage before fetching a tile and decodes it once into
RGBA pixels. The normal renderer uploads each decoded tile to one WebGL texture
and projects it on a tessellated, curved HEALPix mesh. Moving the view changes
the small mesh, not a viewport-sized bitmap.

Each visible target tile is always drawn from the highest loaded level in its
NESTED ancestor chain. The order-3 Allsky mosaic is the final ancestor fallback.
Detail tiles replace their parent independently as they arrive, so dragging and
releasing never clears or rebuilds the full photographic layer. Texture memory
follows the decoded-tile LRU.

If WebGL is unavailable, the viewer retains the asynchronous CPU reprojection
path and keeps its last complete raster visible during interaction.

### Memory limits

| Device class   | Approximate decoded survey budget |
| -------------- | --------------------------------: |
| Coarse pointer |                            64 MiB |
| Fine pointer   |                           128 MiB |

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
