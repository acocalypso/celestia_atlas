# Generated catalogue data

Install the pinned build dependency and create the public OpenNGC bundle:

```bash
python -m pip install -r tools/requirements-catalog.txt
python tools/build_dso_catalog.py --catalogues openngc
```

The compatibility command `python tools/build_openngc_catalog.py` delegates to
the same builder. Both commands update the neutral and legacy files together:

```text
dso-catalog.json              normalized rich model with provenance
dso-viewer-catalog.json       compact runtime projection, including all 110 Messier designations
catalog-sources.json          exact source, rights, and transform manifest
dedup-candidates.json         spatial and ambiguous identity review report
openngc-catalog.json          legacy full OpenNGC package path
openngc-viewer-catalog.json   legacy compact OpenNGC-only package path
openngc-meta.json             legacy OpenNGC metadata
../dso-catalog.js             browser bundle plus curated-detail merge
```

Build the separately licensed public Stellarium supplement with:

```bash
python tools/build_stellarium_supplement.py --version v26.2
```

It validates the 94,899-row Stellarium v26.2 DSO catalogue v3.23 and selects
8,658 records carrying an Abell/ACO, LDN, Barnard, LBN, Sh2, vdB, or RCW
cross-index:

```text
stellarium-dso-supplement.json  normalized public supplement records
stellarium-supplement-meta.json pinned source, version, count, licence, hashes
../stellarium-supplement.js     compact browser supplement
```

GitHub Pages builds and deploys the separate catalogue assets. The viewer loads
the A66 layer before Stellarium and constructs one search index, so `abell-pn`,
the seven Stellarium historical groups, Messier, and OpenNGC appear as ten source
filters and remain available to offline search. The deployed atlas makes no
catalogue network requests at runtime.

Build the separate ODbL-1.0 Abell 1966 planetary-nebula layer from its
committed SIMBAD TAP snapshot:

```bash
python tools/build_abell_pn_catalog.py
```

The builder verifies the 2026-07-15 response hash and its 1,152 identifier
rows, then emits all 86 `PN A66` objects. It preserves SIMBAD main identifiers,
object types, ICRS coordinates, and cross-identifiers; only four unique exact
NGC/IC IDs are emitted as merge keys, with no positional identity matching:

```text
abell-pn-catalog.json          86 compact A66 records plus source metadata
../abell-pn-catalog.js         separate browser assignment for those records
sources/simbad/                pinned query, TAP response, hashes and manifest
```

Build the separate HYG v4.1 naked-eye star layer with:

```bash
python tools/build_hyg_star_catalog.py
```

It validates the pinned 119,626-row source and SHA-256, selects 8,920 non-solar
stars through visual magnitude 6.5, and removes 140 components within 2
arcminutes of the curated star layer. The output is kept separate:

```text
hyg-star-catalog.json          8,780 compact stars plus source metadata
../hyg-star-catalog.js         browser assignment for the same star records
```

The assets have deliberately separate provenance and licence boundaries:

- OpenNGC-derived files are CC BY-SA 4.0.
- SIMBAD A66-derived files are ODbL 1.0; see
  `../licenses/SIMBAD-ODbL-1.0.md`.
- Stellarium-derived supplement files are GPL-2.0-or-later; see
  `../licenses/Stellarium-GPL-2.0.txt`.
- HYG-derived files are CC BY-SA 4.0; see
  `../licenses/HYG-CC-BY-SA-4.0.md`.
- Celestia Atlas source code remains MIT licensed.

Eight historical CDS/VizieR catalogues are supported as acknowledged, local
imports. These are richer source-specific datasets, not the source of the
public Stellarium supplement. Their catalogue-specific redistribution rights
have not been established, so their downloaded tables and derived outputs are
not committed or deployed. Southern Dark Clouds and Feitzinger-Stuewe are
available only through this local path and do not occur in the public
supplement. See [the catalogue guide](../docs/CATALOGUES.md) for the exact
commands, schemas, transformations, citations, and rights policy.
