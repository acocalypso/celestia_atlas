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
- Object details and clearly marked schematic object previews
- Mouse, wheel, touch, pinch, keyboard, fullscreen, and shareable hash state
- Service worker for offline installation

## Data scope

This is a compact navigational catalog rather than a photographic survey. Coordinates are J2000 and descriptive values are rounded. The Milky Way overlay is calculated from the Galactic coordinate system. Object preview art is schematic and is not presented as telescope imagery.

## Keyboard shortcuts

`/` search · `H` mode · `G` grid · `C` constellations · `D` DSOs · `L` labels · `N` night mode · `R` reset · `F` fullscreen
