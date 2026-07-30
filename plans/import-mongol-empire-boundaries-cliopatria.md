# Import Mongol Empire boundaries from Cliopatria (TODO item 12)

## Summary

Import the Mongol Empire's territorial extent, as separate boundary
snapshots over time, from the Cliopatria dataset (Seshat Global History
Databank), into the local Postgres database as regular `entries` rows
with `multipolygon` locations — so they actually appear on the map and
timeline like any other entry. Per the `CLAUDE.md` data-provenance
principle, each imported entry must carry a citation back to its origin.

This is also the first time anything other than Wikipedia/Wikidata-derived
data lands in the `entries` table, which exposes a real gap: the
Postgres-path `HistoricalEvent.wikipediaTitle`/citation link
(`local-concept-server`'s `entries.ts`, `entry-detail.ts`) currently
*assumes* every Postgres entry's title is literally its Wikipedia page
title (`e.title AS "wikipediaTitle"` — see `entries.ts`). That assumption
is wrong for Cliopatria data, so this plan also introduces a small,
source-agnostic citation mechanism rather than stretching the
Wikipedia-only one.

## Data source, verified live

Fetched and inspected directly (not from memory) at
`https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/main/cliopatria.geojson.zip`
(44MB zipped, 165MB unzipped, `cliopatria_polities_only.geojson`, one
`Feature` per line, 13,772 features total). License: **CC BY 4.0**
(`LICENSE.md` in the repo), already recorded in `LICENSES.md`.

Each feature's `properties` carries: `Name`, `FromYear`, `ToYear`, `Area`
(km²), `Type`, `Wikipedia` (an enwiki article title — a nice bonus
cross-reference, not this import's citation target), `Wikidata` (a Q-id),
`SeshatID`, `Components`, `MemberOf`. Geometry is `Polygon` or
`MultiPolygon` in standard GeoJSON `[lng, lat]` order — matches this
app's `MultiPolygonLocation.polygons` shape (`web-client/src/types/index.ts`)
exactly, no reprojection needed.

Filtering `properties.Name === "Mongol Empire"` (there are also separate,
un-imported "Great Mongol State," "Mongol Khanate," "Mongolia," and
"Mongolian People's Republic" polities in the dataset — different named
entities, out of scope) yields **12 time-slices, 1206–1293 CE**,
consistently `MultiPolygon`, 190–1,478 coordinate points each (small
enough to store and render at full fidelity — no RDP simplification
needed, unlike the continent lanesets). `Area` values range from
~2.46M km² (1206–1209) up to ~27.4M km² (1279–1284), consistent with the
Mongol Empire's real historical peak extent (~24M km²) — a sanity check
that this is genuine, correctly-scaled boundary data, not a units bug.

Cliopatria has no stable per-feature web page/permalink (`SeshatID` is
empty for these records), so per `CLAUDE.md`'s "failing that, a generic
link to the data source" clause, the citation for these entries points to
the Cliopatria GitHub repository generally, not a specific record.

## Design

### New, source-agnostic citation fields (schema + type + both data paths)

Add to `entries` (via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, since
`CREATE TABLE IF NOT EXISTS` won't touch the already-existing live
table):

```sql
ALTER TABLE entries ADD COLUMN IF NOT EXISTS citation_url TEXT NOT NULL DEFAULT '';
ALTER TABLE entries ADD COLUMN IF NOT EXISTS citation_label TEXT NOT NULL DEFAULT '';
```

Add `citationUrl: string` and `citationLabel: string` to
`HistoricalEvent` (`web-client/src/types/index.ts`). **`wikipediaTitle`
stays as-is, untouched** — it remains genuinely useful raw provenance
data for Wikipedia/Wikidata-sourced entries, and touching TODO 6–10's
already-completed QLever code more than necessary isn't warranted here.
`citationUrl`/`citationLabel` become the one thing the UI actually
renders a link from, computed per data path:

- **`local-concept-server`'s `getEntriesByIds`** (`entries.ts`): new
  columns, falling back to the existing Wikipedia-title-based link when
  `citation_url` is empty (true for every pre-existing seeded row, which
  really is Wikipedia-sourced) —
  `COALESCE(NULLIF(e.citation_url,''), 'https://en.wikipedia.org/wiki/' || e.title) AS "citationUrl"`,
  same pattern for `citationLabel` defaulting to `'Wikipedia'`. No
  backfill needed.
- **`qlever-client.ts`'s `bindingToEvent`**: add
  `citationUrl`/`citationLabel` computed from the already-required
  `wikipediaTitle`, same as today's UI logic — just moved from the UI
  layer into the data layer.
- **New Cliopatria rows**: `citationUrl` = the Cliopatria GitHub repo URL,
  `citationLabel` = `'Cliopatria (Seshat Global History Databank)'`.

### UI change (`entry-detail.ts` + its template in `index.html`)

- `detail-link`'s `href` switches from the hardcoded
  `https://en.wikipedia.org/wiki/${wikipediaTitle}` construction to
  `ev.citationUrl` directly.
- Add one new small element (`#detail-source`, inside the existing
  `.meta` row, styled inline with the existing years/category spans — no
  new `<style>` block beyond what's already in the template) showing
  `ev.citationLabel`, so a citation is visibly named, not just an
  unlabeled link. For existing Wikipedia-backed entries this reads
  "Wikipedia" (no behavior change users would notice); for Cliopatria
  entries it reads "Cliopatria (Seshat Global History Databank)".

### New fetch/transform script: `db/fetch-cliopatria-mongol.mjs`

Mirrors `db/fetch-wikidata-persons.mjs`'s role (a standalone, re-runnable,
committed ingestion script, not a throwaway) but much simpler — one HTTP
fetch, one filter, no chunking/pagination/rate-limit concerns (Cliopatria
is a single static file, not a live rate-limited API):

1. Download `cliopatria.geojson.zip` from the GitHub raw URL above.
2. Unzip it (shell out to the system `unzip` binary, consistent with this
   project's `bzip2`-via-CLI precedent over adding a decompression
   dependency).
3. Stream-filter for `properties.Name === "Mongol Empire"` (the file is
   one JSON Feature per line — line-based filtering avoids loading the
   full 165MB/13,772-feature document into memory for a 12-feature need).
4. Map each feature to this app's entry shape: `slug` (e.g.
   `mongol-empire-1206-1209`), `title` (e.g. "Mongol Empire
   (1206–1209)" — the 12 slices share one `Name`, so the year range goes
   in the title to keep them distinguishable in any flat list/search),
   `startYear`/`endYear` from `FromYear`/`ToYear` (month/day = 0,
   unknown), `category: 'pol_mil_organization'`, a generated
   `description` (empire name, year range, source, and the `Area`
   figure), `tags: ['cliopatria']`, `citationUrl`/`citationLabel` as
   above, and `locations: [{ type: 'multipolygon', polygons: <geometry.coordinates> }]`.
5. Write the result as a plain JSON array to
   `web-client/public/data/cliopatria-boundaries.json`.

### `db/seed.mjs` changes

Read the new `cliopatria-boundaries.json` file alongside the existing
TSV/lanesets reads (it's already-shaped entry objects, no TSV parsing
needed — just `JSON.parse`), append its rows into the same `entryValues`/
`locationValues` arrays used for TSV-derived entries, and extend the
`entries` INSERT's column list with `citation_url`/`citation_label`
(TSV-derived rows pass `''`/`''` for both, relying on the SQL-side
`COALESCE` fallback described above at read time).

## Affected files

- `db/schema.sql` — two new `entries` columns.
- `web-client/src/types/index.ts` — `citationUrl`/`citationLabel` on
  `HistoricalEvent`.
- `web-client/local-concept-server/src/api/entries.ts` — `getEntriesByIds`
  SQL gains the two new computed columns.
- `web-client/src/wikidata/qlever-client.ts` — `bindingToEvent` sets the
  two new fields from the existing `wikipediaTitle`.
- `web-client/src/components/entry-detail.ts` + the
  `entry-detail-template` in `web-client/public/index.html` — render the
  citation link/label generically.
- `db/fetch-cliopatria-mongol.mjs` (new) — fetch/transform script.
- `web-client/public/data/cliopatria-boundaries.json` (new, generated) —
  the 12 Mongol Empire entries.
- `db/seed.mjs` — load the new JSON file.
- `LICENSES.md` — move Cliopatria from "researched, not yet ingested" to
  "in active use."
- `TODO.md` — mark item 12 `COMPLETED`.

## Verification

1. Run `node db/fetch-cliopatria-mongol.mjs`, confirm it writes exactly
   12 records to `cliopatria-boundaries.json` with plausible geometry
   (spot-check one feature's coordinate count/bbox against the source).
2. `cd web-client/local-concept-server && npm run build` and
   `cd web-client && npm run build` — both must stay clean
   (`tsc --noEmit`).
3. Run `bash db/init-db.sh`, confirm the row-count output includes the 12
   new entries and their `entry_locations` rows, and that
   `ST_IsValid(geometry)` is true for all 12 (the known continent-lane
   self-intersection issue in `PARKINGLOT.md` is a good reason to check
   this explicitly rather than assume it).
4. Query `/api/entries/by-ids` for one of the 12 ids directly (`curl`) and
   confirm the JSON response has a populated `multipolygon` location and
   the new `citationUrl`/`citationLabel` fields pointing at Cliopatria.
5. Launch the web app (see the `run` skill's guidance for this project)
   and visually confirm at least one Mongol Empire boundary renders on
   the map for a year in 1206–1293, and that the detail panel's citation
   link/label point at Cliopatria, not Wikipedia. If launching a browser
   isn't practical in this pass, note that explicitly rather than
   claiming it was checked.
6. Confirm existing Wikipedia/Wikidata-sourced entries still show working
   "Wikipedia" citation links (regression check for the fallback
   `COALESCE` logic).
