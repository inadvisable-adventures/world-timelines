# World Timelines — Proof-of-Concept Design

## Overview

The POC is a fully client-side SPA that lets users explore historical events on an interactive world map linked to a horizontal timeline. There is no server; all data is stored in compact TSV files loaded at runtime, and all queries are processed in a WebWorker.

## Goals

- Demonstrate the core interaction: map + timeline + query editor synchronized together.
- Show that client-side querying of TSV data in a WebWorker is fast enough for real use.
- Establish the data schema for historical events so the ingester can be built against it.
- Run as a fully static website (open `index.html` via a local HTTP server).

## Non-Goals (POC)

- No user accounts, persistence, or sharing.
- No server-side search or geospatial indexing.
- No zoom-level aggregation (events shown individually regardless of density).
- No full Wikipedia data integration yet (uses sample data; ingester is a separate concern).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Browser Main Thread                      │
│                                                               │
│  index.html → main.ts                                         │
│       │                                                       │
│  ┌────▼──────────────────────────────────────────────────┐   │
│  │                    <app-root>                          │   │
│  │  ┌──────────────┐  ┌─────────────────────────────┐   │   │
│  │  │ <world-map>  │  │        right sidebar         │   │   │
│  │  │  (Canvas)    │  │  ┌──────────────────────┐   │   │   │
│  │  │              │  │  │  <category-picker>   │   │   │   │
│  │  │              │  │  └──────────────────────┘   │   │   │
│  │  │              │  │  ┌──────────────────────┐   │   │   │
│  │  │              │  │  │   <query-editor>     │   │   │   │
│  │  └──────┬───────┘  └──────────┬──────────────┘   │   │   │
│  │         │  ┌──────────────────┘                   │   │   │
│  │  ┌──────▼──▼──────────────────────────────────┐   │   │   │
│  │  │              <world-timeline>               │   │   │   │
│  │  └──────────────────────┬─────────────────────┘   │   │   │
│  └─────────────────────────┼──────────────────────────┘   │   │
│                             │ postMessage                   │   │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                         WebWorker                            │
│  query-worker.ts                                             │
│    ├─ tsv-parser.ts    (load + parse TSV)                    │
│    └─ dsl-parser.ts    (parse filter DSL)                    │
│                                                              │
│  Static assets: public/data/events.tsv                       │
└──────────────────────────────────────────────────────────────┘
```

### Communication Protocol

**Main → Worker:**
```ts
type InitRequest   = { type: 'init'; dataUrl: string };
type QueryRequest  = { type: 'query'; dsl: string; timeRange: [number, number]; limit: number };
```

**Worker → Main:**
```ts
type ReadyResponse = { type: 'ready'; count: number };
type QueryResponse = { type: 'results'; events: HistoricalEvent[] };
```

---

## Data Model

### Locations (Answer to Q3)

Events may have **multiple locations** stored as a JSON array. Five representation types cover the range of map/timeline correlations:

```ts
type EventLocation =
  | PointLocation
  | PolygonLocation
  | MultiPolygonLocation
  | PathLocation
  | CircleLocation
;
```

| Type | Use case | Notes |
|---|---|---|
| `point` | Exact or approximate single location | `uncertain?: boolean` renders half-alpha + dashed |
| `polygon` | Single contiguous territory with optional holes | `rings[0]` = exterior; `rings[1+]` = holes (enclaves, internal exclusions). Canvas `evenodd` fill rule carves holes correctly. |
| `multipolygon` | Non-contiguous territory (array of `polygon` rings) | e.g. an empire whose provinces are geographically separated |
| `path` | Journey, trade route, road | Ordered `waypoints[]`; optional `t` (0–1) marks fractional progress through the event's time span, enabling time-correlated animation |
| `circle` | Approximate or uncertain area | `uncertain?: boolean` renders half-alpha. Use when only a general region is known (e.g. within a political boundary's rough extent) |

Points, polygons, and circles all carry an `uncertain` flag. When set, the location is drawn at reduced opacity with a dashed stroke to signal disputed placement or an imprecise area.

The world-map renders **all** locations for each event. The first location is used as the primary anchor for tooltip positioning.

### Dates (Answer to Q2)

Dates are stored in a **denormalized** structure alongside the original expression:

```ts
interface EventDate {
  originalExpression: string; // raw string as found in Wikipedia
  detectedCalendar:   string; // 'gregorian' | 'julian' | 'islamic' | 'hebrew' | 'unknown'
  startYear:  number;         // signed int, negative = BCE
  startMonth: number;         // 0 = unknown
  startDay:   number;         // 0 = unknown
  endYear:    number;
  endMonth:   number;
  endDay:     number;
  uncertaintyYears: number;   // LUT-estimated uncertainty
}
```

Precision is set only as warranted: a year-range expression yields 0 for month/day fields.

### `HistoricalEvent` (runtime type, in TSV + in memory)

| Field          | Type             | Description                                                  |
|----------------|------------------|--------------------------------------------------------------|
| id             | string           | Unique slug (Wikipedia page title slug from ingester)         |
| title          | string           | Display name                                                  |
| locations      | EventLocation[]  | One or more geographic locations (serialized as JSON in TSV)  |
| startDate      | EventDate        | Start date with full denormalized structure                   |
| endDate        | EventDate \| null | null if startDate is also the end date                       |
| category       | EventCategory    | person / event / place / artifact / pol_mil_organization / business / historical_period / concepts / other |
| infoboxType    | string           | Wikipedia infobox template name (empty for hand-crafted data) |
| description    | string           | Short description (1–2 sentences)                             |

### TSV Format

16 tab-separated columns, header row first:

```
id  title  locations  start_year  start_month  start_day  end_year  end_month  end_day
start_expr  end_expr  calendar  uncertainty_years  category  infobox_type  description
```

`locations` is compact (single-line) JSON; double quotes inside do not conflict with TSV since the format does not use cell quoting. Tabs and newlines within any field are escaped as `\t` / `\n`.

---

## Query DSL (Answer to TODO #9)

The query editor accepts a multi-line text DSL. The default result is the 100 most-recently-indexed events. Each `filter` line narrows the result further; all lines are ANDed together. The final set is capped at 100.

**Syntax:**

```
# Comments are supported
filter category: person, event
filter year: -500 to 1500
filter text: roman empire
filter lat: 0 to 90
filter lng: -10 to 50
laneset continents
```

**Filter types:**

| Filter     | Syntax                     | Description                                      |
|------------|----------------------------|--------------------------------------------------|
| `category` | `category: a, b, c`        | One or more categories (OR within, AND across)   |
| `year`     | `year: START to END`       | Events overlapping this year range               |
| `text`     | `text: query`              | Case-insensitive substring in title or description |
| `lat`      | `lat: MIN to MAX`          | Primary location latitude                        |
| `lng`      | `lng: MIN to MAX`          | Primary location longitude                       |

A non-filter directive, `laneset <id>` / `laneset none`, selects the timeline's active geographic laneset (it does not filter results). The **category picker** and **laneset picker** are visual shortcuts that generate/update the `filter category:` and `laneset` lines respectively, and reflect DSL edits back. The **timeline** time range is passed to the worker as a separate `timeRange` parameter that ANDs with the DSL results.

### Lanes & lanesets (TODO #65)

`public/data/lanesets.json` (generated by `web-client/scripts/gen-lanesets.mjs` from the vendored Natural Earth polygons + custom rectangles, RDP-simplified) defines several **lanesets**, each a division of Earth's surface into **lanes** with geometry, a display name, and a description. Built-in lanesets: `continents` (default), `landmasses`, `global-regions`, and `cradles` (cradles of civilization + an "Outside the cradles" catch-all). Lanes tile the globe (land lanes precede ocean lanes so land wins during assignment). Each lane may map one or more historical-era `source`s (e.g. `rome-history` → Europe), and the synthetic Global lane carries `world-history` eras. Entries are assigned to a lane by point-in-polygon against the active laneset; lanes and lanesets are selectable (side-panel detail + map outline).

---

## Component Details

### `<world-map>` Web Component

- Canvas-based, equirectangular projection.
- Draws country outlines from `world-110m.geojson` (Natural Earth 110m, ~838 KB).
- Renders all locations per event: point markers (colored circle), polygon outlines, circles.
- Hover tooltip shows title, years, description. Click dispatches `event-selected`.
- `setEvents(events)` and `highlightEvent(id)` are public methods.

### `<world-timeline>` Web Component

- Horizontally scrollable + zoomable Canvas timeline. X-axis = time, default −3000 to 2100. Pan with drag; zoom with the wheel; debounced `time-range-changed` on change.
- **Geographic lanes (#65):** the body is a vertical stack of lane bands defined by the active *laneset* (a division of Earth's surface — see [Lanes & lanesets](#lanes--lanesets-todo-65)). Each lane is a very dark band with a viewport-sticky left title + collapse chevron. Entries are assigned to a lane by point-in-polygon of their primary coordinate (`geo/point-in-polygon.ts`, on the capped result set) and packed vertically within the lane; markers use a brighter border than fill. Historical eras are children of their lane, drawn with dotted boundary lines and view-centered labels (overlap capped to keep the latest-ending era when crowded). An optional top **Global** lane (collapsed by default) holds world-spanning eras, toggled by the synthetic "global eras" category chip. Shift-wheel scrolls the lane stack when it overflows.
- Click an entry → `event-selected`; click a lane title → `lane-selected` (chevron toggles collapse). Lane and entry selection are mutually exclusive.

### `<laneset-picker>` Web Component

- Sits below the category picker. Shows the current laneset's name; clicking opens a pick-list of all lanesets plus **None** (with descriptions).
- Dispatches `laneset-changed` with `{ id }`; bidirectional with the DSL `laneset` line. Exposes `setLanesets(...)` / `setSelected(id)`.

### `<category-picker>` Web Component

- Shows one toggle chip per `EventCategory` with the category's color.
- All categories selected by default.
- Dispatches `category-filter-changed` with `{ selected: EventCategory[] }`.
- Exposes `setSelected(cats)` to reflect DSL-driven changes back to the UI.
- A synthetic **"global eras"** chip (not a real category) dispatches `global-eras-toggled` to show/hide the timeline's Global lane.

### `<query-editor>` Web Component

- A styled `<textarea>` with line-count gutter.
- Debounces input (150 ms) then dispatches `dsl-changed` with the DSL text.
- Exposes `setDsl(text)` so app-root can inject changes from the category picker.

### `<app-root>` Web Component

- Owns the WebWorker instance and all cross-component state.
- Layout: left column (map, ~75% width) + right sidebar (picker + editor) + full-width timeline below.
- Handles all cross-component sync:
  - `time-range-changed` → sends updated `timeRange` to worker, triggers new query.
  - `dsl-changed` → parses category filter from DSL, updates picker; sends query to worker.
  - `category-filter-changed` → updates `filter category:` line in DSL editor; sends query to worker.
  - `event-selected` → calls `highlightEvent(id)` on map and timeline.

---

## Static Assets

| Path                             | Description                                                   |
|----------------------------------|---------------------------------------------------------------|
| `public/index.html`              | Entry point; all `<template>` elements live here              |
| `public/data/events.tsv`         | Sample historical events (43 hand-crafted, new 16-col schema) |
| `public/data/world-110m.geojson` | Simplified world map (Natural Earth 110m, public domain)      |
| `public/worker/query-worker.js`  | Compiled WebWorker                                            |
| `public/main.js`                 | Compiled main bundle                                          |

---

## Wikipedia Data Pipeline (Ingester — A1–A4 Resolved)

### Download

`en_wiki_download/enwiki-latest-pages-articles-multistream.xml.bz2` (26.4 GB).
**Status:** Download in progress. (~34 GB of purgeable macOS space confirmed available.)

### Approach

1. **Index reader**: decompress `enwiki-latest-pages-articles-multistream-index.txt.bz2` by shelling out to the system `bzip2` binary; parse `offset:articleId:title` lines; group articles by stream byte-offset. The main loop only needs the unique stream byte-offsets, which are cached to a compact binary file (`offset-cache.ts`, `stream-offsets.bin`) after the first decode — decoding the 280 MB index takes ~25s, while loading the ~2 MB cache is <1s, so restarts skip the decode. The cache is validated against the source index's size + mtime and rebuilt transparently on a miss; `npm run build-offset-cache` builds it eagerly.
2. **Stream reader** (`bz2-reader.ts`): shell out to the system `bzip2` binary to decompress individual bzip2 streams from the main dump at specific byte offsets without loading the full 26 GB file.
3. **XML parser**: extract `<title>` and `<text>` from the decompressed XML chunk.
4. **Infobox parser**: regex-based extraction of infobox types, coordinates (`{{coord|…}}`, `{{#invoke:Coordinates|coord|…}}`, `{{Location map…|lat=|long=}}`, `|lat_deg=`, `|latitude=`), and date fields (`|date=`, `|birth_date=`, etc.). Coordinate recall is bounded (~7.4%, measured) by what the wikitext actually contains: many articles carry no machine-readable coordinates at all (Wikidata-backed empty `|coordinates=`, `{{coord missing}}` tags, blank field skeletons, or only place *names*). Higher recall would need Wikidata/gazetteer resolution — see `PARKINGLOT.md`.
5. **Date parser** (`date-parser.ts`): normalize to `EventDate` with year/month/day precision; detect calendar system.
6. **Uncertainty LUT** (`uncertainty-lut.ts`): LUT-based estimation based on era, date expression style (exact / circa / century), and continent.
7. **Infobox catalog** (`infobox-catalog.ts`): tracks all infobox types encountered. On completion, outputs `infobox-catalog.tsv` with columns: `infobox_type`, `proposed_category`, `count`, `was_included`, `include_in_future`. `include_in_future` is the human-reviewed allowlist and is **preserved** across runs (seeded from the `catalog_input` include set), NOT regenerated from `was_included` — otherwise every sub/sibling template co-occurring on an included page would get marked, the include set would grow each run, and hand-removed types (e.g. `ship`) would silently reappear. Newly-seen types default to `include_in_future=0` (surfaced via `was_included` for review, never auto-included).
8. **Category mapping**: maps infobox type → EventCategory using a configurable table; defaults to the high-value types from A1. Additional `ingest.config.tsv` filters: `exclude_category`, `date_after`/`date_before`, `exclude_no_coords` (drop entries with no extractable coordinates — yields a map-focused dataset), and `max_birth_year <type> <year>` (per-infobox-type start-year cap, e.g. `person`/`officeholder` births ≤ 1899).
9. **TSV writer** (`tsv-writer.ts`): streams 16-column TSV rows to stdout.

### Resumability & interruption

The ingester writes a `PROGRESSING` checkpoint to `ingest_status.tsv` every ≥100
considered articles, `fsync`ing the partial output (`collected_entries.tsv.partial`)
first. Because the main loop is CPU-bound and fully synchronous (a `bzip2`
`spawnSync` per stream) it never yields to the event loop, so in-process JS
signal handlers are unreliable and are deliberately **not** registered —
SIGINT/SIGTERM terminate the process immediately (Node default). A kill therefore
loses at most ~100 considered articles; `--resume` reads the last checkpoint and
continues, appending to the partial. A full pass renames the partial to the final
output. Synchronous faults (e.g. a malformed stream) are caught, checkpointed as
`STOPPING`, and exit non-zero so the run stays resumable.

Each status row records the run's `stride`. `--resume` only accepts a checkpoint
whose stride matches the current run, so a full run (stride 1) never silently
resumes against a sampled run's checkpoint (e.g. stride 100 near the end of the
dump); rows predating the column are treated as stride 1.

### Supervisor (`ingest-ctl.sh`)

`ingester/ingest-ctl.sh` is a bespoke bash wrapper that runs the ingest to
completion across crashes: `start`/`resume` (auto-detecting fresh vs. `--resume`
from the partial's presence), `stop` (SIGTERM), `status`/`watch` (read-only —
liveness via `kill -0`, progress from the status log; never disturbs the running
process), and `supervise` (launch, then poll `kill -0` every 15s and re-`--resume`
on any non-completing exit until the partial is promoted to the final output).

### bzip2 decoding

Decompression shells out to the system `bzip2` binary (`bzip2-cli.ts`, via `child_process.spawnSync`) rather than a pure-JS decoder. Bzip2 natively supports concatenated/multi-stream data, but the ingester doesn't rely on that directly — it already computes each stream's byte offset from the index and hands the decoder a single, self-contained bzip2 stream per call. This was originally implemented with the `seek-bzip` npm package; it was swapped out because decompression throughput was the ingester's runtime bottleneck, and the system binary is markedly faster (measured: ~18s vs. ~44s decompressing the 280MB multistream index). This adds a runtime dependency on `bzip2` being present on PATH (true of essentially all Unix systems) in exchange for removing an npm dependency.

---

## Build System

- Language: TypeScript strict mode throughout.
- **web-client**: `tsc` (two configs: main + worker). No runtime bundler.
- **ingester**: `tsc` with NodeNext module resolution.
- **local-concept-server**: `tsc` with NodeNext module resolution; bespoke Node.js HTTP server.
- Build command (each project): `npm run build`.
- Dev server: `npm start` from `web-client/local-concept-server/` (port 4242, serves `web-client/public/`).

---

## TODO Item Mapping

| #  | TODO Item                                | Plan File                    | Status    |
|----|------------------------------------------|------------------------------|-----------|
| 1  | Bootstrap web-client project             | bootstrap-web-client.md      | COMPLETED |
| 2  | Implement types and data model           | implement-types.md           | COMPLETED |
| 3  | Create sample data files                 | create-sample-data.md        | COMPLETED |
| 4  | Implement WebWorker query engine         | implement-query-worker.md    | COMPLETED |
| 5  | Implement world-map component            | implement-world-map.md       | COMPLETED |
| 6  | Implement timeline component             | implement-timeline.md        | COMPLETED |
| 7  | Implement app-root and main entry        | implement-app-root.md        | COMPLETED |
| 8  | Implement ingester (A1–A4 resolved)      | scaffold-ingester.md         | COMPLETED |
| 9  | Category picker + Query DSL editor       | category-picker-query-dsl.md | COMPLETED |
| 10 | Run ingester against enwiki dump         | run-ingester-integration.md  | BLOCKED (download pending) |
