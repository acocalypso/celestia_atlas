# Pinned SIMBAD A66 source snapshot

This directory contains the complete source response used for the separate
Abell 1966 planetary-nebula layer. `a66-2026-07-15.adql` is the TAP query and
`a66-2026-07-15.tsv` is its unedited tab-separated response.

- Service: SIMBAD TAP, operated by CDS, Strasbourg, France
- Endpoint: <https://simbad.u-strasbg.fr/simbad/sim-tap/sync>
- Retrieval date: 2026-07-15
- Advertised service release: SIMBAD4 1.8 - 2026-06
- Response rows: 1,152 identifier rows for 86 distinct `PN A66` objects
- Response SHA-256:
  `1aac0fb91c4ae39581b86a6bf1e8cc2fbdeaa93d0460762f73df59dd7e501348`
- Licence: Open Data Commons Open Database License 1.0 (`ODbL-1.0`)

The long-form response intentionally preserves every identifier returned by
SIMBAD at retrieval time. The offline builder groups rows only through the
shared SIMBAD object selected by the query. It never infers identity from
coordinates. SIMBAD is a dynamic database rather than a versioned catalogue;
committing the response, query, retrieval date, service release, and hashes
makes this derived layer reproducible even after the live service changes.

Required acknowledgement: “This research has made use of the SIMBAD database,
operated at CDS, Strasbourg, France.” See `../../../THIRD_PARTY_NOTICES.md` and
`../../../licenses/SIMBAD-ODbL-1.0.md` for redistribution terms and citation
details.

## Pinned stellar responses (2026-09-12)

`sao-hd-crossids.adql` retains the SIMBAD object ID with every HD/SAO pair;
`wr-stars.adql` retains WR designations, object IDs, identifiers and ICRS
coordinates and optional measured V magnitudes. Their unedited responses are
`sao-hd-crossids-2026-09-12.tsv` (190,390 rows) and
`wr-stars-vmag-2026-09-12.tsv` (6,458 rows, 518 objects). Both were retrieved
from <https://simbad.cds.unistra.fr/simbad/sim-tap/sync> with TSV output and
`MAXREC=1000000`, well above the returned row counts. The service advertised
`SIMBAD4 1.8 - 2026-07`. These responses and their generated derivatives are
ODbL-1.0 data; retain the SIMBAD acknowledgement above.

Hashes are pinned in the builders and in `star-catalogs-2026-09-12.meta.json`.
The raw response hashes preserve exact downloaded LF-delimited bytes; query
hashes normalize line endings to LF. The default builds are offline except
when the separate HYG cache must first be downloaded. The SAO builder
preserves all pairs but marks cross-object conflicts; the WR builder rejects
conflicting coordinates or duplicate WR designations across objects.

The browser SAO output is filtered to exact HD designations present in the HYG
and WR packages. The archived full response remains available to reproduce
that selection. No component suffix is silently collapsed to a numeric HD ID.
