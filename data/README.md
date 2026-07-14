# Generated catalogue data

Install the pinned build dependency and create the public OpenNGC-only bundle:

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

GitHub Pages runs the OpenNGC-only build. The deployed atlas makes no catalogue
network requests at runtime.

Eight historical CDS/VizieR catalogues are supported as acknowledged, local
imports. Their catalogue-specific redistribution rights have not been
established, so their downloaded tables and derived outputs are not committed
or deployed. See [the catalogue guide](../docs/CATALOGUES.md) for the exact
commands, schemas, transformations, citations, and rights policy.
