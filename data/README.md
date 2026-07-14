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
dso-viewer-catalog.json       compact degree-based runtime projection
catalog-sources.json          exact source, rights, and transform manifest
dedup-candidates.json         spatial and ambiguous identity review report
openngc-catalog.json          legacy full OpenNGC package path
openngc-viewer-catalog.json   legacy compact OpenNGC package path
openngc-meta.json             legacy OpenNGC metadata
../dso-catalog.js             browser bundle plus curated-detail merge
```

Build the separately licensed public Stellarium supplement with:

```bash
python tools/build_stellarium_supplement.py --version v26.2
```

It validates the 94,899-row Stellarium v26.2 DSO catalogue v3.23 and selects
records carrying an LDN, Barnard, LBN, Sh2, vdB, or RCW cross-index:

```text
stellarium-dso-supplement.json  normalized public supplement records
stellarium-supplement-meta.json pinned source, version, count, licence, hashes
../stellarium-supplement.js     compact browser supplement
```

GitHub Pages builds and deploys both assets. The viewer loads the supplement
before constructing its search index, so the six historical groups appear
alongside OpenNGC as seven source filters and remain available to offline
search. The deployed atlas makes no catalogue network requests at runtime.

The assets have deliberately separate provenance and licence boundaries:

- OpenNGC-derived files are CC BY-SA 4.0.
- Stellarium-derived supplement files are GPL-2.0-or-later; see
  `../licenses/Stellarium-GPL-2.0.txt`.
- Celestia Atlas source code remains MIT licensed.

Eight historical CDS/VizieR catalogues are supported as acknowledged, local
imports. These are richer source-specific datasets, not the source of the
public Stellarium supplement. Their catalogue-specific redistribution rights
have not been established, so their downloaded tables and derived outputs are
not committed or deployed. Southern Dark Clouds and Feitzinger-Stuewe are
available only through this local path and do not occur in the public
supplement. See [the catalogue guide](../docs/CATALOGUES.md) for the exact
commands, schemas, transformations, citations, and rights policy.
