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
