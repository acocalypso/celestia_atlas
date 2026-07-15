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

## HYG v4.1 naked-eye star layer

The separate star supplement is derived from the **HYG Database** by David Nash
(Astronomy Nexus).

- Project: https://github.com/astronexus/HYG-Database
- Pinned version: `v4.1`
- Pinned source commit: `3bf37f4b2d5460e1278286320d1d62fab9b493c1`
- Pinned source:
  https://github.com/astronexus/HYG-Database/blob/3bf37f4b2d5460e1278286320d1d62fab9b493c1/hyg/CURRENT/hygdata_v41.csv
- Source SHA-256:
  `d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd`
- Upstream rows: 119,626
- Licence: Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0)
- Local licence notice: `licenses/HYG-CC-BY-SA-4.0.md`

Celestia Atlas selects the 8,920 non-solar records whose apparent visual
magnitude is at most 6.5. To prevent duplicate plotting, it removes all 140 HYG
components within 2 arcminutes of a star in the curated 130-record `STAR_DATA`
layer. The 8,780 remaining records retain their HYG row identity, HIP identifier
when supplied, HYG proper name when supplied, J2000.0 right ascension and
declination, visual magnitude, optional B-V colour index, constellation and a
compact HYG source label. The `named` field is emitted only for rows with a HYG
proper name. HYG's `ci` field is renamed to `bv`; no missing colour is invented.

These derived assets remain under CC BY-SA 4.0 and are kept separate from the
MIT code and the other generated catalogue layers:

```text
hyg-star-catalog.js
data/hyg-star-catalog.json
```

Redistributors must retain the attribution, source link, licence link and
indication of the selection, field renaming, duplicate removal and compact
serialization modifications described above.

## SIMBAD A66 planetary-nebula layer

The separate Abell 1966 planetary-nebula layer is derived from a pinned TAP
response from the **SIMBAD astronomical database**, operated at CDS,
Strasbourg, France.

- Service: https://simbad.u-strasbg.fr/simbad/
- TAP endpoint: https://simbad.u-strasbg.fr/simbad/sim-tap/sync
- Advertised service release at retrieval: `SIMBAD4 1.8 - 2026-06`
- Retrieval date: `2026-07-15`
- Committed query: `data/sources/simbad/a66-2026-07-15.adql`
- Query SHA-256:
  `ab2fe86d5c84e6d027bcb363c9d775b428d11eb003ec3fbf426331b64751e639`
- Committed TAP response: `data/sources/simbad/a66-2026-07-15.tsv`
- Response SHA-256:
  `1aac0fb91c4ae39581b86a6bf1e8cc2fbdeaa93d0460762f73df59dd7e501348`
- Response rows: 1,152 exact identifiers for 86 distinct `PN A66` objects
- Licence: Open Data Commons Open Database License 1.0 (`ODbL-1.0`)
- Local licence notice: `licenses/SIMBAD-ODbL-1.0.md`

Required acknowledgement retained by Celestia Atlas:

> This research has made use of the SIMBAD database, operated at CDS,
> Strasbourg, France.

SIMBAD also requests citation of Wenger et al. (2000), “The SIMBAD astronomical
database,” *Astronomy and Astrophysics Supplement Series* 143, 9. The historical
designation originates with Abell (1966), *Astrophysical Journal* 144, 259.

Celestia Atlas groups the long-form response by the SIMBAD object selected by
the query, normalizes display spacing, adds deterministic `Abell`, `A66`, and
`PN A66` search variants, and preserves the SIMBAD main identifier, object
type, ICRS coordinates, and exact cross-identifiers. Only four unique exact
NGC/IC identities are emitted as optional merge keys. Sky position is never
used to infer identity. SIMBAD's current classification is preserved even for
historical A66 entries now typed as a galaxy, possible object, possible active
galaxy, emission-line galaxy, H II region, or supernova remnant rather than a
planetary nebula.

The snapshot and these derived assets remain under ODbL 1.0 and are kept
separate from the MIT code and other catalogue licence boundaries:

```text
data/sources/simbad/a66-2026-07-15.tsv
abell-pn-catalog.js
data/abell-pn-catalog.json
```

Redistributors must retain the ODbL terms, SIMBAD attribution, source/query
metadata, hashes, and modification statement above.

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

The separate public historical DSO supplement is derived from the standard
DSO catalogue distributed with **Stellarium**.

- Project: https://github.com/Stellarium/stellarium
- Pinned Stellarium version: `v26.2`
- DSO catalogue version: `3.23`
- Pinned source:
  https://raw.githubusercontent.com/Stellarium/stellarium/v26.2/nebulae/default/catalog.txt
- Validated upstream rows: 94,899
- Upstream licence: GPL-2.0-or-later (declared by Stellarium's `CITATION.cff`)
- Full licence copy: `licenses/Stellarium-GPL-2.0.txt`

Celestia Atlas selects 8,658 rows carrying at least one non-zero Abell/ACO,
Barnard, Sh2, vdB, RCW, LDN, or LBN cross-index. Modifications include strict schema and row
count validation; source-aware aliases; FK5/J2000-to-ICRS transformation with
build-time coordinate provenance; conservative type mapping; dark-nebula
opacity handling that does not mislabel the ordinal class as magnitude; exact
axis/position-angle preservation when present; provenance metadata; and
deterministic compact JSON/JavaScript serialization. Original Stellarium type,
morphology when supplied, row identifier, selected cross-indices, catalogue
version, and source URL are retained in the derived records or supplement
metadata.

The Abell/ACO galaxy-cluster designations refer to Abell, Corwin, and Olowin
(1989), “A Catalog of Rich Clusters of Galaxies,” *Astrophysical Journal
Supplement Series* 70, 1, DOI `10.1086/191333`. They are distinct from the
Abell-1966 planetary-nebula designations in the separate SIMBAD A66 layer.

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

The public Stellarium supplement covers Abell/ACO, LDN, Barnard, LBN,
Sharpless 2, vdB, and RCW cross-indices. Southern Dark Clouds (`VII/191`) and
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
