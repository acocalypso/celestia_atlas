# Deep-sky catalogue pipeline

Celestia Atlas builds its browser catalogue ahead of time. The browser never
queries VizieR, SIMBAD, OpenNGC, or another astronomy service at runtime.
The optional DSS2 Color layer is a remote image survey, not a catalogue query:
it loads only visible HiPS image tiles below 20 degrees FOV, caches a bounded
recent set, and is never used for search, coordinates, object identity, or
metadata. Disabling or losing that layer does not change catalogue behavior.

The public atlas loads four separately generated catalogue assets. OpenNGC and
HYG-derived data are each distributed under CC BY-SA 4.0. The SIMBAD A66 layer
is distributed under ODbL 1.0. A fourth asset selects historical DSO
cross-index records from Stellarium v26.2 DSO catalogue v3.23 and is distributed
under GPL-2.0-or-later. The assets retain separate metadata, notices, package
exports, and licence files; no asset changes the terms of another or the MIT
licence of the Celestia Atlas code.

Richer import support is also provided for eight historical nebula and
dark-cloud tables from CDS/VizieR. Their current CDS records do not state an
open redistribution licence, so their complete downloaded or derived tables
are deliberately not committed or included in the public Pages build. They can
be fetched and built locally after the user reviews and accepts the source
terms. Acceptance is not a grant of additional rights.

## Public sources

| Asset                             | Pinned source                                                                  | Included records                                                                           | Runtime groups                                              | Licence                                                               |
| --------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Normalized base catalogue         | OpenNGC `v20260501`, plus the two documented Messier completions below         | 12,579 markers                                                                             | `openngc`, `messier`                                        | OpenNGC rows CC BY-SA 4.0; M40 factual SIMBAD record attributed below |
| Abell 1966 planetary-nebula layer | Committed SIMBAD TAP snapshot, retrieved 2026-07-15 from SIMBAD4 1.8 (2026-06) | 86 objects from 1,152 identifier rows                                                      | `abell-pn`                                                  | ODbL 1.0                                                              |
| Stellarium DSO supplement         | Stellarium `v26.2`, DSO catalogue `3.23`                                       | 8,658 records from the validated 94,899-row input having at least one selected cross-index | `abell`, `ldn`, `barnard`, `lbn`, `sharpless`, `vdb`, `rcw` | GPL-2.0-or-later                                                      |
| HYG naked-eye star layer          | HYG `v4.1`, commit `3bf37f4`                                                   | 8,780 records after curated-layer duplicate removal                                        | stars through visual magnitude 6.5                          | CC BY-SA 4.0                                                          |

### Messier completion and labels

The normalized base catalogue contains exactly 110 independently filterable
`messier` members. OpenNGC supplies 108 Messier cross-identifications. The
builder adds the two historically exceptional entries explicitly:

- `M40` is the optical double star Winnecke 4, which OpenNGC correctly excludes
  from its deep-sky rows. The point marker uses SIMBAD's catalogue-level
  ICRS/J2000 position `12:22:12.0 +58:05:00`, records SIMBAD as its source, and
  does not invent a nebula or cluster classification.
- `M102` is attached to OpenNGC's `NGC 5866` record using NASA's Hubble Messier
  catalogue convention. The record keeps `NGC 5866` searchable and explicitly
  notes that the historical M102 identification is disputed.

The runtime label helper renders a Messier designation together with a common
name, for example `M81 · Bode's Galaxy` and `M42 · Great Orion Nebula`. Search
continues to match either form. The generic `catalog-data` and
`viewer-catalog-data` package exports contain the normalized base catalogue;
the explicit `openngc-*-data` exports remain the 12,578-row OpenNGC-only
compatibility assets.

Sources: [SIMBAD M40](https://simbad.harvard.edu/simbad/sim-basic?Ident=M40)
and [NASA Hubble Messier 102](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-102/).

### Abell 1966 planetary-nebula layer

The `abell-pn` group is not the Abell/ACO galaxy-cluster cross-index in the
Stellarium supplement. Its primary display identifiers are `Abell PN 1` through
`Abell PN 86`, with explicit search aliases `Abell n`, `Abelln`, `A66 n`,
`A66-n`, and `PN A66 n`. Loading this layer before Stellarium makes a generic
`Abell 39` result prefer the planetary nebula while `Abell 1656` remains the ACO
galaxy cluster. Both objects remain independently searchable where the two
historical namespaces overlap.

SIMBAD is dynamic rather than a versioned catalogue. For reproducibility the
project commits the exact ADQL query, its unedited 1,152-row TAP response, a
source manifest, retrieval date, advertised service release, and SHA-256 hashes
under `data/sources/simbad/`. The offline builder groups only rows joined to the
same SIMBAD object. It retains each source main ID, object type, ICRS position,
and exact cross-identifiers. Four unique exact NGC/IC identifiers (`IC 972`,
`NGC 6742`, `NGC 7076`, and `IC 1454`) may attach to OpenNGC; coordinates are
never identity evidence. The source and derived assets remain under ODbL 1.0.

### HYG star selection

`build_hyg_star_catalog.py` validates the pinned 119,626-row HYG v4.1 CSV and
its SHA-256 before processing it. It excludes Sol and selects 8,920 stars with
apparent visual magnitude at most 6.5. All HYG components within 2 arcminutes
of a curated `STAR_DATA` position are then removed, not just the nearest
component of a multiple system. This removes 140 source rows around the 130
curated stars and leaves 8,780 supplemental records without replacing the
curated names or descriptions.

The compact record fields are `uid` (`hyg:<row id>`), numeric `hyg`, `id`,
`name`, J2000.0 `ra` in hours, `dec` in degrees, visual `mag`, optional `bv`,
`con`, and `catalogSource`. `named: true` appears only when the HYG `proper`
field is non-empty; unnamed rows use `HIP n` or `HYG n` as both identifier and
name so the renderer can avoid generating thousands of fallback labels. The
asset metadata preserves the exact source URL, commit, hash, selection limit,
counts, attribution, licence and modifications.

The supplement reads Stellarium's standard
[`nebulae/default/catalog.txt`](https://raw.githubusercontent.com/Stellarium/stellarium/v26.2/nebulae/default/catalog.txt)
and selects rows with a non-zero Abell/ACO, Barnard, Sh2, vdB, RCW, LDN, or
LBN column. The Abell gate contributes 5,249 rows, including the southern
`S` series and one row with two comma-separated identifiers.
One Stellarium row can contribute more than one searchable alias and runtime
group. The emitted record retains the Stellarium row identifier, original
cross-indices, catalogue version, source URL, and transformation provenance.
All ten runtime groups are searchable and filterable in the deployed atlas.

The Stellarium-derived JavaScript/JSON and metadata stay separate from the
OpenNGC-derived files. See `licenses/Stellarium-GPL-2.0.txt` for the complete
licence text and `THIRD_PARTY_NOTICES.md` for attribution and modification
details.

## Optional local VizieR sources

| Group                | CDS/VizieR table                                                                                 | Imported records | Input coordinates                                         | Atlas type                      |
| -------------------- | ------------------------------------------------------------------------------------------------ | ---------------: | --------------------------------------------------------- | ------------------------------- |
| LDN                  | [`VII/7A/ldn`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/7A?format=html&tex=true)         |            1,791 | FK4/B1950                                                 | `DrkN`                          |
| Barnard              | [`VII/220A/barnard`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/220A?format=html&tex=true) |              349 | FK4/B1875                                                 | `DrkN`                          |
| LBN                  | [`VII/9/catalog`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/9?format=html&tex=true)       |            1,125 | FK4/B1950                                                 | `Neb`, refined only by evidence |
| Sharpless 2          | [`VII/20/catalog`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/20?format=html&tex=true)     |              313 | FK4/B1900                                                 | `HII`                           |
| vdB                  | [`VII/21/catalog`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/21?format=html&tex=true)     |              158 | Galactic, with VizieR-added positions retained separately | `RfN`                           |
| RCW                  | [`VII/216/rcw`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/216?format=html&tex=true)       |              181 | FK4/B1950                                                 | `EmN`, refined only by evidence |
| Southern Dark Clouds | [`VII/191/table1`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/191?format=html&tex=true)    |            1,101 | FK4/B1950                                                 | `DrkN`                          |
| Feitzinger-Stuewe    | [`VII/68A/darkneb`](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/68A?format=html&tex=true)   |              489 | FK4/B1950                                                 | `DrkN`                          |

`VII/68A/globules` and its raster sky map are intentionally outside the first
import scope. The globule table has a second, colliding `FEST` number sequence,
and the raster has separate scientific and redistribution questions.

The public Stellarium supplement does not make these VizieR tables public and
does not replace the richer local importers. It covers seven cross-index
families and does not include Southern Dark Clouds (`dcld`) or
Feitzinger-Stuewe (`feitzinger`). Those two groups remain local-only.

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

The main combined build's complete JSON output keeps the nested model. Browser
outputs, including the public Stellarium supplement JSON, are deterministic,
flattened projections containing only rendering, search, filtering, shape, and
compact provenance fields. Legacy fields such as `name`, `type`,
`catalogSource`, `raDeg`, and `decDeg` remain available to embedded consumers.

## Coordinates and dimensions

Coordinate conversion is performed by Astropy at build time:

- Stellarium's decimal RA/Dec values are interpreted as FK5/J2000 and
  transformed to normalized ICRS. The importer keeps the original decimal
  values and `FK5/J2000` frame tag in its build-time provenance; the compact
  public record keeps the normalized ICRS position and stable Stellarium UID;
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

For the public supplement, positive Stellarium major/minor axes and position
angles are retained as exact catalogue values. A positive major axis with a
zero minor axis remains a major-only shape and does not acquire an invented
minor axis or position angle. Original Stellarium type and non-empty morphology
fields remain in compact source properties. The V field used by dark nebulae
as an ordinal opacity class is retained as `opacityClass` and never enters the
visual-magnitude filter. Only confident type mappings are normalized; an
unrecognized or uncertain input class remains `Other` rather than being
silently reclassified.
Stellarium's `ClG` class is normalized as `GCluster` / `Galaxy cluster` for
Abell records; the original `stellariumType` remains available in provenance.

## Names and search

Importers create source-aware identifiers and common aliases such as `B 72`,
`Barnard 72`, `Sh2-101`, `Sh 2-101`, `Sharpless 101`, `LDN1235`, `LBN331`,
`vdB 142`, `RCW104`, `Abell 1656`, `ACO 1656`, and the southern forms
`Abell S117` and `ACO S117`. Browser search normalizes Unicode, case, spaces,
and hyphens once when the viewer starts. Results rank exact normalized
identifiers before prefixes and substrings.
The source row carrying `ACO 2462,3897` remains one sky object with its combined
source alias and both `Abell` and `ACO` forms for each identifier; it is not
duplicated or position-matched to an unrelated record.

The separate A66 layer uses `Abell PN n` as its unambiguous display ID while
retaining generic `Abell n` and the A66 variants above for observer searches.
Its `abell-pn` group and SIMBAD object type distinguish it from the `abell`
Abell/ACO galaxy-cluster group. Search order is intentional: A66 is composed
before Stellarium, so `Abell 39` resolves first to `Abell PN 39`; there is no
A66 1656, so `Abell 1656` resolves only to the ACO cluster.

The public supplement exposes the same identifier variants from Stellarium's
cross-index columns. Because it is loaded before the viewer builds its search
index, an Abell/ACO, LDN, Barnard, LBN, Sharpless, vdB, or RCW query searches
the deployed supplement rather than a test fixture or runtime network service.

At runtime, a supplement row can enrich an OpenNGC row only through a
reciprocal one-to-one NGC/IC identifier. Position is never used to invent an
identity. After that exact match, a great-circle check can only veto attachment
when the published centres are separated by more than both 30 arcminutes and a
10%-padded sum of the two catalogue radii. The veto preserves both markers at
their source positions. Four such conflicts are retained as independent rows
in the pinned public build; repeated historical identifiers are always kept as
separate source rows.

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

Build the separate public Stellarium supplement:

```bash
python tools/build_stellarium_supplement.py --version v26.2
```

The supplement command pins and validates DSO catalogue v3.23, then writes:

```text
stellarium-supplement.js
data/stellarium-dso-supplement.json
data/stellarium-supplement-meta.json
```

Build the separate A66 layer from the committed, hash-pinned snapshot (the
builder performs no network access):

```bash
python tools/build_abell_pn_catalog.py
```

This writes `abell-pn-catalog.js` and `data/abell-pn-catalog.json`. Package
consumers can access the JSON payload through the `abell-pn-data` export. The
snapshot and derived layer remain under ODbL 1.0; see
`licenses/SIMBAD-ODbL-1.0.md` and `THIRD_PARTY_NOTICES.md`.

Build the separate HYG star layer:

```bash
python tools/build_hyg_star_catalog.py
```

This writes `hyg-star-catalog.js` and `data/hyg-star-catalog.json`. Package
consumers can access the JSON payload through the `hyg-star-data` export. The
derived files remain under CC BY-SA 4.0; see
`licenses/HYG-CC-BY-SA-4.0.md` and `THIRD_PARTY_NOTICES.md`.

Package consumers can access the two supplement files through the
`stellarium-supplement-data` and `stellarium-supplement-meta` exports. Keeping
them distinct from the OpenNGC package exports preserves source provenance and
licence boundaries.

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

The default Pages build deploys OpenNGC, the separate A66 layer, and the
seven-group Stellarium supplement. A local combined build can additionally opt in to one or more
cached VizieR groups. Do not publish that VizieR-derived output unless the
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
historical VizieR tables. Coverage includes the Stellarium row gate and
cross-index selection, FK5/J2000, FK4 and Galactic transforms, aliases,
area-derived shapes, missing optional fields, malformed rows, explicit and
ambiguous cross-identifications, manual overrides, and byte-stable output.
Chrome smoke coverage loads the deployable OpenNGC, A66, Stellarium, and HYG
assets, asserts the nine expected DSO source filters, and verifies that
supplement objects and HYG stars can be searched, drawn, and selected directly
from their canvas markers.
Focused A66 tests additionally verify the committed snapshot/query hashes, all
86 sequential designations, raw SIMBAD type distribution, required aliases,
the four exact merge keys, byte-reproducible outputs, and the 21,192-object
result of composing OpenNGC, A66, then Stellarium.

## Source and licence notes

Stellarium v26.2 distributes DSO catalogue v3.23 with the GPL-licensed
Stellarium project. Celestia Atlas modifications are limited to schema and row
count validation, selection of rows carrying one of seven cross-index families,
identifier normalization, FK5/J2000-to-ICRS transformation, type/shape mapping,
dark-nebula opacity handling, compact provenance retention, and deterministic
JSON/JavaScript serialization. The
derived supplement remains under GPL-2.0-or-later; its GPL version 2 text is in
`licenses/Stellarium-GPL-2.0.txt`. The separately generated OpenNGC asset
continues under CC BY-SA 4.0, and the atlas code continues under MIT.

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

The public A66 source is not one of those VizieR tables. It is an independently
licensed SIMBAD TAP snapshot under ODbL 1.0. Retain the SIMBAD acknowledgement,
snapshot/query manifest, source and generated hashes, modification statement,
and the local licence notice when redistributing it.

## Known limitations and next steps

- Public historical identifiers include the seven Stellarium cross-index
  families plus the separate 86-object A66 layer. Southern Dark Clouds and
  Feitzinger-Stuewe are not in the public supplement.
- The richer optional VizieR tables are not in the public bundle until their
  redistribution terms are cleared catalogue by catalogue.
- Markers and scaled ellipse footprints show catalogue centres and published
  or explicitly approximate extents, not measured nebula or cloud contours.
- Historical positions and sizes have source-dependent precision; transformed
  decimal coordinates do not improve the original measurement accuracy.
- Ordinal opacity, brightness, colour, and density classes are retained, but
  they are not interchangeable with calibrated surface brightness or visual
  magnitude.
- Position-and-dimension matches are review candidates, not automatic merges.
- Future layers can add licensed dust-extinction rasters, molecular-cloud maps,
  or scientifically measured polygon boundaries without changing catalogue
  identity records.
