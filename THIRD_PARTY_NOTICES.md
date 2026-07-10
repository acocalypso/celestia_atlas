# Third-party notices

## OpenNGC

The generated deep-sky catalogue is based on **OpenNGC**, created by Mattia
Verga and contributors.

- Project: https://github.com/mattiaverga/OpenNGC
- Data licence: Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0)
- Version pinned by this project: `v20260501`

OpenNGC incorporates data from sources including the NASA/IPAC Extragalactic
Database (NED), HyperLEDA, SIMBAD, HEASARC, and Harold Corwin's NGC/IC research.
See the OpenNGC project and each generated record's source information for the
upstream acknowledgements.

Changes made by Celestia Atlas include CSV parsing, filtering out star,
duplicate and explicitly non-existent entries from the plotted DSO set,
normalising identifiers, compact JSON/JavaScript conversion, and merging a
small curated description layer for prominent objects.

Generated OpenNGC-derived catalogue files must remain available under
CC BY-SA 4.0 with attribution and share-alike terms.

## NASA Image and Video Library

Images downloaded with `tools/fetch_nasa_dso_images.py` come from the NASA Image
and Video Library. Each image has a sidecar JSON file containing its source URL,
NASA identifier, credit and a rights reminder.

NASA media is generally available for informational and educational use under
NASA's media usage guidelines, but NASA pages may include third-party material.
Review each source page before redistribution.

## Bundled Milky Way panorama

`assets/milky-way.webp` is a locally generated artistic panorama included with
this project. It is not calibrated scientific survey imagery.
