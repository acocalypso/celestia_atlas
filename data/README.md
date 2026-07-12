# Generated catalogue data

Run:

```bash
python tools/build_openngc_catalog.py
```

This creates:

```text
openngc-catalog.json
openngc-viewer-catalog.json
openngc-meta.json
../dso-catalog.js
```

The GitHub Pages workflow performs this step automatically using the pinned
OpenNGC release. The generated files are local application assets; the deployed
atlas does not query OpenNGC or another catalogue service at runtime.

`openngc-catalog.json` preserves source metadata and hour-based right ascension.
`openngc-viewer-catalog.json` contains only renderer/search fields with tagged
ICRS decimal-degree coordinates, so embedded clients can load it without
copying and converting every object.
