# Third-party notices

## IAU Minor Planet Center comet elements

The offline comet catalogue is generated from an IAU Minor Planet Center
`CometEls.txt` snapshot using the MPC Ephemerides and Orbital Elements comet
format.

- Project: https://www.minorplanetcenter.net/
- Format documentation: https://docs.minorplanetcenter.net/mpc-ops-docs/orbits/comet-orbit-format/
- Pinned source SHA-256: `8e7bb528fac5c5e8f0f11c72f4fa1102ee50220bab8654a4fedba1a558e68a8f`
- Records: 1,214

Celestia Atlas changes include fixed-column parsing, compact JSON/JavaScript
conversion, two-body universal-variable propagation, light-time correction,
observer parallax, search metadata and approximate magnitude calculation.

## Astronomy Engine

Solar-system positions, illumination and visual magnitudes are calculated with
**Astronomy Engine** by Donald Cross.

- Project: https://github.com/cosinekitty/astronomy
- Version pinned by this project: `2.1.19`
- Licence: MIT

Astronomy Engine is distributed under the MIT licence. Its copyright and
permission notice are available in the upstream project.

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

## Stellarium DSO cross-index supplement

The separate public historical-nebula supplement is derived from the standard
DSO catalogue distributed with **Stellarium**.

- Project: https://github.com/Stellarium/stellarium
- Pinned Stellarium version: `v26.2`
- DSO catalogue version: `3.23`
- Pinned source:
  https://raw.githubusercontent.com/Stellarium/stellarium/v26.2/nebulae/default/catalog.txt
- Validated upstream rows: 94,899
- Upstream licence: GPL-2.0-or-later (declared by Stellarium's `CITATION.cff`)
- Full licence copy: `licenses/Stellarium-GPL-2.0.txt`

Celestia Atlas selects only rows carrying at least one non-zero Barnard, Sh2,
vdB, RCW, LDN, or LBN cross-index. Modifications include strict schema and row
count validation; source-aware aliases; FK5/J2000-to-ICRS transformation with
build-time coordinate provenance; conservative type mapping; dark-nebula
opacity handling that does not mislabel the ordinal class as magnitude; exact
axis/position-angle preservation when present; provenance metadata; and
deterministic compact JSON/JavaScript serialization. Original Stellarium type,
morphology when supplied, row identifier, selected cross-indices, catalogue
version, and source URL are retained in the derived records or supplement
metadata.

The following derived assets remain under GPL-2.0-or-later and are kept
separate from the OpenNGC-derived CC BY-SA 4.0 files:

```text
stellarium-supplement.js
data/stellarium-dso-supplement.json
data/stellarium-supplement-meta.json
```

Redistribution of the supplement must comply with GPL-2.0-or-later, including
the applicable notice, licence-copy, and corresponding-source requirements.
Its inclusion does not relicense Celestia Atlas's MIT source code or OpenNGC's
CC BY-SA 4.0 catalogue data.

## Optional historical nebula and dark-cloud catalogues

Celestia Atlas contains build-time import support for the following CDS/VizieR
catalogues. These provide richer source-specific properties than the public
Stellarium cross-index supplement, but are not its data source. Their complete
source tables and transformed records are **not** committed or included in the
public deployment because neither the current CDS catalogue metadata nor the
catalogue ReadMes state an open redistribution licence.

| Catalogue | Original publication | CDS/VizieR ID |
| --- | --- | --- |
| Lynds Dark Nebulae (LDN) | Lynds, B. T. (1962), *ApJS* 7, 1, DOI `10.1086/190072` | `VII/7A` |
| Barnard dark objects | Barnard, E. E. (1927), *A Photographic Atlas of Selected Regions of the Milky Way* | `VII/220A` |
| Lynds Bright Nebulae (LBN) | Lynds, B. T. (1965), *ApJS* 12, 163, DOI `10.1086/190123` | `VII/9` |
| Sharpless 2 H II regions | Sharpless, S. (1959), *ApJS* 4, 257, DOI `10.1086/190049` | `VII/20` |
| van den Bergh reflection nebulae | van den Bergh, S. (1966), *AJ* 71, 990, DOI `10.1086/109995` | `VII/21` |
| RCW emission nebulae | Rodgers, A. W.; Campbell, C. T.; Whiteoak, J. B. (1960), *MNRAS* 121, 103, DOI `10.1093/mnras/121.1.103` | `VII/216` |
| Southern Dark Clouds | Hartley et al. (1986), *A&AS* 63, 27 | `VII/191` |
| Feitzinger-Stuewe southern dark nebulae | Feitzinger, J. V.; Stuewe, J. A. (1984), *A&AS* 58, 365; erratum *A&AS* 63, 203 | `VII/68A` |

CDS states in its [VizieR rules of
usage](https://cds.unistra.fr/vizier-org/licences_vizier.html) that data are
freely usable in a scientific context with citation of the original authors,
publication, and publisher; commercial conditions depend on data origin and
users must review the relevant ReadMe and journal policy. Those rules do not
provide an open-source redistribution grant. The local fetch tool therefore
requires an explicit acknowledgement, stores downloads under the ignored
`.cache/` directory, and never runs in the public Pages workflow. A user's
acknowledgement does not create redistribution rights.

The source review is catalogue-specific:

- `VII/7A`, `VII/9`, `VII/20`, and `VII/21` originate in historical AAS
  journal publications; neither their CDS records nor ReadMes identify an open
  data licence for the electronic tables.
- Barnard's 1927 publication may be public domain in some jurisdictions, but
  the later machine-readable compilation served as `VII/220A` has no explicit
  redistribution licence. The project does not infer one.
- The `VII/216` ReadMe expressly describes the original RCW/MNRAS publication
  as copyrighted. Local access is not treated as permission to republish it.
- `VII/191` and `VII/68A` originate in A&AS/ESO publications and have no open
  table licence in their current CDS records. The Feitzinger-Stuewe raster is
  excluded entirely.

When locally importing these catalogues, cite the original publication above,
the specific CDS/VizieR identifier, and the CDS/VizieR service DOI
`10.26093/cds/vizier`. Generated provenance records identify the source table,
original identifier and coordinate frame. Celestia Atlas modifications include
schema validation, identifier and alias normalization, Astropy FK4/Galactic to
ICRS transformation, explicitly marked approximate size derivation,
conservative cross-identification merging, and compact browser serialization.

The `VII/68A` raster sky map and globule table are not part of the initial
import. Do not redistribute a locally generated combined catalogue until the
rights for every included source are cleared for the intended use.

The public Stellarium supplement covers only LDN, Barnard, LBN, Sharpless 2,
vdB, and RCW cross-indices. Southern Dark Clouds (`VII/191`) and
Feitzinger-Stuewe (`VII/68A`) remain local-only and are not present in the
public deployment.

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
