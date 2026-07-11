# IndexedDB caching: rewrite web client + local-concept-server

## Summary

`local-concept-server` stops being a pure static file server and becomes a
thin JSON API (still also serving the static SPA shell) that queries the
local Postgres database via the `psql` CLI (per the earlier decision to avoid
adding a `pg`/driver dependency). The web client stops loading the entire
dataset into worker memory from a static TSV; instead it caches entries,
eras, and lanesets in IndexedDB, and for any query first asks the server for
a **slim result list** (`{id, lastUpdated}` pairs only), diffs that against
what's already cached and fresh, and fetches full records for only the
missing/stale ids in a follow-up call.

This plan only takes effect once items 1–4 (installed Postgres, schema, init
script, verified local DB) are done — it depends on `world_timelines` already
existing and seeded.

## Current architecture recap (see research notes folded in below)

- `query-worker.ts` today: on `init`, fetches the *entire* TSV file and
  parses it into an in-memory array; on `query`, parses the DSL text
  (`dsl-parser.ts`, unchanged by this plan) into `DslFilter[]`, then does a
  full `Array.filter` in `applyFilters()` and slices to `limit`.
- `app-root.ts` separately fetches `historical_eras.tsv` and
  `lanesets.json` once at startup, entirely client-side, no server
  involvement.
- `local-concept-server` is a single-file (`server.ts`) static file server
  with zero routing logic beyond SPA-fallback-to-`index.html`.
- No client-side caching exists today (`grep` for
  `localStorage|indexedDB|sessionStorage` in `web-client/src` — zero hits).

## Key decision: entry ids become UUIDs; lanesets/lanes keep a separate slug

Today `HistoricalEvent.id`, `Laneset.id`, and `Lane.id` are all
content-derived slugs (e.g. `'great-pyramid-giza'`, `'continents'`,
`'africa'`). Post-migration, the Postgres UUID becomes the identifier used
for caching and the by-ids fetch — but lanesets/lanes are also referenced by
**humans**, directly, in two places that can't hold a UUID: the query DSL
(`laneset continents`) and the laneset picker UI. Entries are never
referenced this way (the DSL filters entries by category/year/text/lat/lng,
never by id).

So:
- `HistoricalEvent.id` and `HistoricalEra.id` become the Postgres UUID.
  Both gain `lastUpdated: string` (ISO 8601).
- `Laneset` and `Lane` keep their existing slug-like field but rename it to
  `slug` (still what the DSL/picker/URL-stable references use) and add a new
  `id: string` (UUID, used only for cache keys and the by-ids call) plus
  `lastUpdated: string`.
- Every place that currently does `laneset.id === x` / `lane.id === y` for
  DSL parsing, picker selection, or lane lookup switches to `.slug`.

## `local-concept-server` changes

New files under `web-client/local-concept-server/src/`:

- `db.ts` — `runQuery<T>(sql: string, vars: Record<string, string>): Promise<T>`.
  Builds a `psql` invocation via `child_process.execFile` (array args, no
  shell — avoids OS command injection entirely) of the form:
  `psql -h $PGHOST -d $PGDATABASE -v ON_ERROR_STOP=1 -X -q -A -t
  -v k1=<v1> -v k2=<v2> -c "<sql>"`, where `<sql>` always wraps the caller's
  query as `SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
  <inner> ) t;` so stdout is exactly one JSON array, parsed with
  `JSON.parse`. All caller-supplied values are passed as `-v` variables and
  referenced in `<inner>` only via psql's quoted-substitution syntax
  (`:'k1'`), which performs proper SQL-literal escaping — the query string
  itself never has raw user input concatenated into it. `PGHOST`/`PGDATABASE`
  read from env vars, defaulting to `db/.pgdata` (resolved relative to the
  repo root) and `world_timelines`, matching `db/init-db.sh`'s conventions.
- `api/entries.ts`:
  - `listEntries(params)` → slim list. Accepts `category` (comma-separated
    `EventCategory` list, validated against the fixed enum — reject
    unknown values with 400), `yearMin`/`yearMax` (integers), `text` (matched
    via `position(lower(:'text') in lower(title) || ' ' || lower(description))
    > 0`, avoiding `LIKE` wildcard-escaping entirely), `latMin/latMax/lngMin/
    lngMax` (joins `entry_locations`, uses the first/lowest `ordinal` row's
    coordinates — same "primary anchor" semantics as today's `primaryLat`/
    `primaryLng` helpers), `limit` (clamped server-side to a hard max of 500
    regardless of the requested value). Returns `[{id, lastUpdated}]`.
    Deriving the exact WHERE clause: time-range and DSL year-range collapse
    to one condition server-side — inspecting `query-worker.ts`'s
    `applyFilters`, the "effective end year" it filters on is always the raw
    `end_year` column (both branches of `ev.endDate?.startYear ??
    ev.startDate.endYear` resolve to the same stored value), so the SQL
    condition is simply `start_year <= :yearMax AND end_year >= :yearMin`.
  - `getEntriesByIds(ids)` → full records. Validates every id is a
    syntactically valid UUID (regex) — 400 on any that aren't — then queries
    `entries` joined with `entry_locations` (aggregated back into a
    `locations` array per entry via `json_agg` ordered by `ordinal`),
    reshaping each row into exactly the `HistoricalEvent` TS shape (camelCase
    keys, `locations[]` reconstructed per-kind: `point`/`circle` from
    `ST_AsGeoJSON(geometry)`, `polygon`/`multipolygon` likewise, `path` from
    the raw `waypoints` JSONB column).
  - `listEras(params)` — same shape as `listEntries` but the WHERE clause is
    fixed to `category = 'historical_period' AND EXISTS (SELECT 1 FROM
    unnest(tags) t WHERE t LIKE '%-history')`, no `limit` cap (eras must all
    load, matching `parseErasTsv`'s unlimited today).
- `api/lanesets.ts`:
  - `listLanesets()` → `[{id, slug, lastUpdated}]` for all lanesets (small,
    unfiltered).
  - `getLanesetsByIds(ids)` → full `Laneset[]` with nested `lanes[]`
    (geometry via `ST_AsGeoJSON`, `bbox` reassembled from the 4 columns,
    `eraSources` from the `era_sources` array column).
- `server.ts` changes: the existing `serve()` static handler is unchanged for
  any path not starting with `/api/`; a new small router dispatches
  `/api/entries`, `/api/entries/by-ids` (POST), `/api/eras`,
  `/api/lanesets`, `/api/lanesets/by-ids` (POST) to the handlers above,
  JSON-encoding responses with `Content-Type: application/json`. No routing
  library added — a `switch`/`if` chain on `req.method` + parsed pathname is
  enough for 5 routes, consistent with the existing hand-rolled style.

## Web client changes

New module `web-client/src/cache/idb-cache.ts` (plain TS, native
`indexedDB` API, no dependency):
- `openCache(): Promise<IDBDatabase>` — opens/upgrades a `world-timelines`
  IndexedDB database with two object stores, `entries` and `lanesets`
  (lanes are nested inside their laneset record — lanesets are few and
  always fetched/cached as a whole), both keyed by `id` (the UUID).
- `getCached<T>(db, store, ids: string[]): Promise<Map<string, T & {
  lastUpdated: string }>>` — bulk read via a single transaction.
- `putCached<T>(db, store, records: T[]): Promise<void>` — write-through
  after a network fetch.
- `resolveViaCache<T>(db, store, slim: {id, lastUpdated}[], fetchMissing:
  (ids: string[]) => Promise<T[]>): Promise<T[]>` — the shared diff-and-fill
  algorithm used by both the worker (entries/eras) and `app-root.ts`
  (lanesets): for each slim entry, use the cached copy if present with an
  equal-or-newer `lastUpdated`; otherwise collect its id; fetch all collected
  ids in one `fetchMissing` call; write the results into the cache; return
  the full list in the original slim-list order.

`query-worker.ts` rewrite:
- Drop `init`'s whole-file fetch+parse; `init` instead just calls
  `openCache()` and reports `{type: 'ready'}` (no meaningful `count` up
  front anymore — data isn't loaded eagerly).
- On `query`: `parseDsl(msg.dsl)` (unchanged) → build the same query params
  described in the server section (intersecting the DSL's `year`/`lat`/`lng`
  filters with `msg.timeRange`/`msg.geoFilter` client-side, exactly as
  today, just producing request params instead of an in-memory filter) →
  `fetch('/api/entries?...')` for the slim list → `resolveViaCache(...,
  ids => fetch('/api/entries/by-ids', {method:'POST', body: JSON.stringify({ids})}))`
  → post the resulting `HistoricalEvent[]` back as `QueryResponse.events`,
  preserving the existing message contract so `app-root.ts`/`world-map.ts`/
  `timeline.ts` don't need to change how they consume query results.

`app-root.ts` changes:
- Era loading: `fetch('/api/eras')` (slim) → `resolveViaCache` against the
  `entries` IDB store (eras are stored as entries — same table, same shape)
  → same `HistoricalEra[]`-shaped result the rest of the app already expects
  (still reduced from the full entry via the same `source`-from-tag logic,
  now applied client-side to the fetched full records instead of raw TSV
  rows).
- Laneset loading: `fetch('/api/lanesets')` (slim) → `resolveViaCache`
  against the `lanesets` IDB store → full `Laneset[]`.
- Every `laneset.id`/`lane.id` equality check used for DSL/picker/lookup
  purposes (grep `app-root.ts`, `laneset-picker.ts`, `dsl-parser.ts`,
  `timeline.ts` for `.id` on a `Laneset`/`Lane` value) switches to `.slug`.

`web-client/src/types/index.ts` changes: add `lastUpdated: string` to
`HistoricalEvent` and `HistoricalEra`; rename `Laneset.id`/`Lane.id`'s
current meaning — add `id: string` (UUID) + `slug: string` (today's id) +
`lastUpdated: string` to both.

## What stops being fetched directly by the client

`collected_entries.sample.tsv`, `historical_eras.tsv`, and `lanesets.json`
under `web-client/public/data/` remain on disk (they're still `db/seed.mjs`'s
input source per `db-init-script.md`) but the running app no longer fetches
them — it talks to `/api/...` instead. `gen-lanesets.mjs` is unchanged (it
still regenerates `lanesets.json` as a build-time step feeding the seed
script).

## Design docs

`design-docs/poc-design.md` currently states the app is "fully client-side
… no server, no database" — update this section once this item lands to
describe the Postgres-backed server + IndexedDB cache architecture.

## Affected files

- `web-client/local-concept-server/src/server.ts` (routing added)
- `web-client/local-concept-server/src/db.ts` (new)
- `web-client/local-concept-server/src/api/entries.ts` (new)
- `web-client/local-concept-server/src/api/lanesets.ts` (new)
- `web-client/src/cache/idb-cache.ts` (new)
- `web-client/src/worker/query-worker.ts` (rewritten)
- `web-client/src/components/app-root.ts` (era/laneset loading rewritten;
  `.id` → `.slug` lookups updated)
- `web-client/src/components/laneset-picker.ts`, `timeline.ts` (`.id` →
  `.slug` where used for human-facing/lookup purposes)
- `web-client/src/worker/dsl-parser.ts` (`laneset <name>` continues to
  resolve against `.slug`)
- `web-client/src/types/index.ts` (type changes above)
- `design-docs/poc-design.md` (architecture description update)

## Verification

- `web-client` and `local-concept-server` both `npm run build` cleanly
  (strict TypeScript, per `CLAUDE.md`).
- Launch `local-concept-server` against the seeded local DB; load the app in
  a browser; run a query — confirm entries render on the map/timeline.
- DevTools → Application → IndexedDB shows `world-timelines` with populated
  `entries`/`lanesets` stores after a query.
- Reload the page and repeat the same query with the server's `psql` process
  briefly blocked/killed — cached results still render (proves "cache used
  for anything present" without a live server round-trip for unchanged ids).
- Change one entry's `description` directly in Postgres, bump nothing else,
  re-run the same query — since `last_updated` wasn't touched, the cached
  (stale) copy is still served; then `UPDATE ... SET last_updated = now()`
  and confirm the client re-fetches and shows the new description.
- Laneset picker + `laneset <slug>` DSL line still work end-to-end.
