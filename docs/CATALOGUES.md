# Deep-sky catalogue pipeline

Celestia Atlas builds its browser catalogue ahead of time. The browser never
queries VizieR, SIMBAD, OpenNGC, or another astronomy service at runtime.

The committed public bundle contains OpenNGC, whose catalogue data is
distributed under CC BY-SA 4.0. Import support is also provided for the eight
historical nebula and dark-cloud tables below. Their current CDS records do not
state an open redistribution licence, so their complete downloaded or derived
tables are deliberately not committed or included in the public Pages build.
They can be fetched and built locally after the user reviews and accepts the
source terms. Acceptance is not a grant of additional rights.

## Supported sources

| Group | CDS/VizieR table | Imported records | Input coordinates | Atlas type |
| --- | --- | ---: | --- | --- |
| OpenNGC | OpenNGC `v20260501` | 12,578 in the pinned build | ICRS | existing OpenNGC type |
| LDN | [`VII/7A/ldn`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/7A?format=html&tex=true) | 1,791 | FK4/B1950 | `DrkN` |
| Barnard | [`VII/220A/barnard`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/220A?format=html&tex=true) | 349 | FK4/B1875 | `DrkN` |
| LBN | [`VII/9/catalog`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/9?format=html&tex=true) | 1,125 | FK4/B1950 | `Neb`, refined only by evidence |
| Sharpless 2 | [`VII/20/catalog`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/20?format=html&tex=true) | 313 | FK4/B1900 | `HII` |
| vdB | [`VII/21/catalog`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/21?format=html&tex=true) | 158 | Galactic, with VizieR-added positions retained separately | `RfN` |
| RCW | [`VII/216/rcw`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/216?format=html&tex=true) | 181 | FK4/B1950 | `EmN`, refined only by evidence |
| Southern Dark Clouds | [`VII/191/table1`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/191?format=html&tex=true) | 1,101 | FK4/B1950 | `DrkN` |
| Feitzinger-Stuewe | [`VII/68A/darkneb`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/68A?format=html&tex=true) | 489 | FK4/B1950 | `DrkN` |

`VII/68A/globules` and its raster sky map are intentionally outside the first
import scope. The globule table has a second, colliding `FEST` number sequence,
and the raster has separate scientific and redistribution questions.

The row counts above are validation gates, not invented catalogue content. A
source whose schema or count changes is rejected until the importer and source
manifest are reviewed.

## Normalized model

Every source importer emits the same build-time model:

- a stable namespaced UID, primary name, display aliases, and type code;
- ICRS decimal-degree coordinates plus the original frame and coordinate text;
- a point, circle, or ellipse with major/minor axes and position angle when the
  source actually supplies them;
- typed source properties such as opacity, ordinal brightness, density, area,
  and notes without treating unrelated ordinal scales as magnitudes;
- one or more source references with catalogue, identifier, VizieR ID, table,
  original identifier, and coordinate provenance;
- contributing catalogue groups, including every group retained after a
  cross-identification merge.

The complete JSON output keeps the nested model. The browser output is a
deterministic, flattened projection containing only rendering, search,
filtering, shape, and provenance fields. Legacy fields such as `name`, `type`,
`catalogSource`, `raDeg`, and `decDeg` remain available to embedded consumers.

## Coordinates and dimensions

Coordinate conversion is performed by Astropy at build time:

- LDN, LBN, RCW, Southern Dark Clouds, and Feitzinger-Stuewe use
  `FK4(equinox="B1950")` to ICRS;
- Barnard uses `FK4(equinox="B1875")` to ICRS;
- Sharpless uses its original `FK4(equinox="B1900")` position to ICRS;
- vdB preserves its original Galactic coordinates and converts them with
  Astropy. Any VizieR/SIMBAD-added equatorial position is identified as such
  rather than presented as original catalogue data;
- OpenNGC's published ICRS values are retained without a second transform.

B1950 values are never relabelled J2000. Tests compare representative
transformations against independent VizieR-generated ICRS values with
tolerances appropriate to each source's precision.

Direct axes and diameters remain measured catalogue dimensions. If only an area
`A` in square degrees is available, an equivalent circular marker is derived:

```text
diameter_deg = 2 * sqrt(A / pi)
```

That marker is tagged `approximate` and `area_equivalent`. It is a searchable
extent marker, not a measured dust-cloud boundary. vdB blue/red radii are also
preserved as band-specific properties; a derived display diameter is marked
approximate. Feitzinger-Stuewe's inclination relative to the Galactic plane is
not reused as an equatorial position angle.

## Names and search

Importers create source-aware identifiers and common aliases such as `B 72`,
`Barnard 72`, `Sh2-101`, `Sh 2-101`, `Sharpless 101`, `LDN1235`, `LBN331`,
`vdB 142`, and `RCW104`. Browser search normalizes Unicode, case, spaces, and
hyphens once when the viewer starts. Results rank exact normalized identifiers
before prefixes and substrings.

Search normalization is deliberately separate from identity. In particular,
coordinate-coded Southern Dark Cloud names retain the distinction between `+`
and `-`; punctuation stripping is never used as a deduplication key.

## Deduplication

Merges follow this order:

1. an unambiguous one-to-one explicit cross-identification;
2. an exact, source-aware catalogue identifier alias;
3. compatible position and dimensions as a candidate report only;
4. a reviewed manual override.

Nearby positions alone are never merged. One-to-many relationships remain
related records until an override resolves them. LDN subregions are kept
separate, including overlapping or identically centred entries. Dark nebulae
only merge with dark nebulae; generic nebulae can be refined to reflection,
emission, or H II when an explicit identification supports it. SNRs are not
silently converted to H II regions.

Even an explicit historical cross-reference must pass a conservative centre
sanity check: 30 arcminutes, or the two published marker radii plus 30
arcminutes for extended objects. More distant associations remain separate and
are written to the ambiguity report. This prevents an “associated” Barnard or
Lynds designation from being treated automatically as the identical cloud.

The manual override file supports explicit merges, explicit non-merges, and a
canonical record choice for a reviewed merge. Output sorting and JSON
formatting do not depend on importer order, local paths, or wall-clock time.
`data/dedup-candidates.json` keeps both report-only spatial candidates and
ambiguous cross-identification sets visible for manual review.

## Source acquisition and rebuilding

Install the catalogue build dependency with the same Python interpreter used
for the build:

```bash
python -m pip install -r tools/requirements-catalog.txt
```

The fetch command requires an explicit source-terms acknowledgement. It writes
only under `.cache/`, which is ignored by Git. Importers themselves perform no
network access.

Build the public, redistribution-cleared OpenNGC bundle:

```bash
python tools/build_dso_catalog.py --catalogues openngc
```

For a local scientific evaluation of every optional source:

```bash
python tools/fetch_catalog_sources.py --cache-dir .cache/catalog-sources --acknowledge-rights-review
python tools/build_dso_catalog.py --catalogues all --vizier-source-dir .cache/catalog-sources --acknowledge-rights-review
```

Use `--catalogues` with a comma-separated subset of `openngc`, `ldn`,
`barnard`, `lbn`, `sharpless`, `vdb`, `rcw`, `dcld`, and `feitzinger` for a
selective build. `--offline` prohibits an OpenNGC download, and
`--source-date-epoch` fixes the optional generated timestamp for reproducible
output comparisons.

The exact commands and output paths are also shown by:

```bash
python tools/fetch_catalog_sources.py --help
python tools/build_dso_catalog.py --help
```

The default Pages build remains OpenNGC-only. A local combined build can opt in
to one or more cached VizieR groups. Do not publish its output unless the
relevant catalogue rights have been cleared for the intended distribution.

All generated browser assets are local files. Once built, the atlas has no
VizieR, SIMBAD, CDS, or OpenNGC runtime dependency.

## Tests

Run the JavaScript and Python suites:

```bash
npm test
python -m unittest discover -s tests -p "test_catalog_*.py"
```

Catalogue fixtures are small synthetic rows matching the documented table
schemas. They exercise parsing and failure behaviour without redistributing the
historical tables. Coverage includes FK4 and Galactic transforms, aliases,
area-derived shapes, missing optional fields, malformed rows, explicit and
ambiguous cross-identifications, manual overrides, and byte-stable output.
CI also builds an ignored OpenNGC-plus-fixtures browser bundle and verifies in
Chrome that `Sh 2-1` can be searched, drawn, and selected directly from its
canvas marker. The fixture bundle is test-only and is never deployed.

## Source and licence notes

The eight optional tables are served by CDS/VizieR. Their current catalogue
metadata has no populated licence field, and their ReadMes do not grant an open
redistribution licence. The CDS [VizieR rules of
usage](https://cds.unistra.fr/vizier-org/licences_vizier.html) allow use in a
scientific context with citation, state that commercial conditions depend on
the data origin, and direct users to the originating publication policy. That
is not sufficient permission to publish the tables as part of an
open-source/browser data bundle.

See `THIRD_PARTY_NOTICES.md` and `tools/catalog_sources/manifest.json` for each
publication, catalogue identifier, transformation summary, and rights-review
status. Cite the original publication and CDS/VizieR service DOI
`10.26093/cds/vizier` when using locally imported records.

## Known limitations and next steps

- The optional historical tables are not in the public bundle until their
  redistribution terms are cleared catalogue by catalogue.
- Markers show catalogue centres and approximate extents, not nebula or cloud
  outlines.
- Historical positions and sizes have source-dependent precision; transformed
  decimal coordinates do not improve the original measurement accuracy.
- Ordinal opacity, brightness, colour, and density classes are retained, but
  they are not interchangeable with calibrated surface brightness or visual
  magnitude.
- Position-and-dimension matches are review candidates, not automatic merges.
- Future layers can add licensed dust-extinction rasters, molecular-cloud maps,
  or scientifically measured polygon boundaries without changing catalogue
  identity records.
