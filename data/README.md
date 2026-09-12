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

HYG v4.1 also carries Henry Draper identifiers. The builder retains those as
`HD <number>` search aliases inside the CC BY-SA HYG asset.

SAO identifiers stay in a separate ODbL cross-index. Rebuild the pinned release
in this order (SIMBAD responses are included; HYG uses its verified cache or
downloads the pinned upstream revision):

```bash
npm run build:hyg-stars
npm run build:wr-stars
npm run build:sao-stars
```

The SAO builder retains sorted arrays of SAO identifiers per HD key. The query
also retains SIMBAD object IDs so conflicting HD or SAO identities are marked
ambiguous, not silently discarded or attached. At runtime aliases attach only
to a unique exact HD target; reverse collisions remain unattached. No SAO
records enter the render collection. Component designations such as
`HD 100015A` remain distinct from `HD 100015`. The browser package contains only
8,850 HD groups used by the HYG/WR layers; the full 190,390-row SIMBAD response
is archived with its hash. Filtering copies no HYG positions or magnitudes into
the SIMBAD asset. The selected target-catalogue hashes are recorded in metadata.

HYG identifiers excluded by the existing plotting-proximity filter transfer
only through a unique exact identifier or proper-name match. The transfer key
is `curatedName`, not an array index. Renaming a curated star requires rebuilding
the HYG asset; reordering it does not. Unconfirmed components remain separately
searchable in `searchStars` / `HYG_SEARCH_STAR_DATA` with `searchOnly: true`.
Proximity never establishes an identifier association. This release includes
125 curated identity transfers and 15 independent search-only HYG components.

The WR layer carries SIMBAD WR designations, cross-identifiers and ICRS
positions for 518 objects. Measured V magnitudes are available for 230 of them;
the other 288 remain search-only. It invents no visual magnitude. Unique exact HIP/HD/WR
cross-identifiers attach its aliases to existing stars without duplicating them.
Ambiguous or unmatched records remain distinct. The viewer excludes `searchOnly`
records from its precomputed render list, while retaining search/focus and a
selection ring. Selecting an unknown-magnitude WR record never invents brightness.

All three generated layers now contain real data. Search for `HD48915` or
`SAO151881` to select Sirius, or `WR104` for a faint Wolf-Rayet target. Normal
map visibility follows the magnitude limit; selecting a faint target focuses
and displays it. Unknown-magnitude targets display a selection ring.

The builders default to the pinned response hashes and 2026-09-12 generation
epoch. To intentionally update a snapshot, supply `--source-file`,
`--expected-sha256`, `--source-date-epoch` and (for WR) `--expected-objects`.
Archive its response, query, retrieval date and service version as described in
`sources/simbad/README.md`. Query hashes use UTF-8 with LF line endings.

Generated star-related assets are therefore kept in three separate packages:

```text
hyg-star-catalog.js / data/hyg-star-catalog.json          CC BY-SA 4.0
sao-star-crossids.js / data/sao-star-crossids.json        ODbL 1.0
wr-star-catalog.js / data/wr-star-catalog.json            ODbL 1.0
```

The assets have deliberately separate provenance and licence boundaries:

- OpenNGC-derived files are CC BY-SA 4.0.
- SIMBAD A66-derived files are ODbL 1.0; see
  `../licenses/SIMBAD-ODbL-1.0.md`.
- Stellarium-derived supplement files are GPL-2.0-or-later; see
  `../licenses/Stellarium-GPL-2.0.txt`.
- HYG-derived files are CC BY-SA 4.0; see
  `../licenses/HYG-CC-BY-SA-4.0.md`.
- SIMBAD SAO cross-identifiers and WR search records are ODbL 1.0 when built;
  see `../licenses/SIMBAD-ODbL-1.0.md`.
- Celestia Atlas source code remains MIT licensed.

Eight historical CDS/VizieR catalogues are supported as acknowledged, local
imports. These are richer source-specific datasets, not the source of the
public Stellarium supplement. Their catalogue-specific redistribution rights
have not been established, so their downloaded tables and derived outputs are
not committed or deployed. Southern Dark Clouds and Feitzinger-Stuewe are
available only through this local path and do not occur in the public
supplement. See [the catalogue guide](../docs/CATALOGUES.md) for the exact
commands, schemas, transformations, citations, and rights policy.
