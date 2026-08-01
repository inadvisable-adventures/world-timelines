# Use imported boundary geometry as spatial filters (TODO item 19)

## Summary

Let a query restrict results to entries physically inside or outside an
imported boundary polygon (e.g. "only things inside the Mongol Empire's
1206–1207 extent" — TODO item 12's Cliopatria import). New DSL filters
`filter inside: <slug>` / `filter outside: <slug>`, a new `<boundary-
picker>` UI control bidirectionally synced with those lines (mirroring
`laneset-picker.ts`'s established pattern), and PostGIS-backed filtering
server-side.

## Scope decision: filter predicate, not a special lane

The TODO item itself frames this as "either... or": a special lane
*or* an inside/outside filter predicate. Filter predicate chosen because
it's DB-native (this project already stores every boundary polygon in
PostGIS-backed `entry_locations.geometry`, the same column type/engine
already used for the existing `filter lat:`/`filter lng:` bounding-box
filter) and generalizes to any future polygon-shaped import automatically
— a special-lane approach would mean teaching the *lane* system (a
wholly separate schema: `lanesets`/`lanes` tables, static
`lanesets.json` provenance) to also source geometry from `entries`, a
much larger structural change for comparatively narrower payoff (one
more lane, vs. a filter every future boundary import gets for free).

## Investigation

- `entries.slug` (`db/schema.sql`) is `NOT NULL UNIQUE` but not
  currently exposed by any API response — needed as the filter's
  human-typeable value (matching `laneset <slug>`'s precedent; a raw
  UUID isn't something anyone would type into the DSL by hand).
- `local-concept-server/src/api/entries.ts`'s `listEntries` already has
  a directly analogous precedent to extend: the `filter lat:`/`filter
  lng:` bounding-box condition reduces any location kind to a
  representative point via `ST_PointOnSurface(el.geometry)` at the
  entry's primary (ordinal 0) location, then range-checks it in SQL.
  "Inside/outside a boundary" is the same representative-point idea, one
  level more precise: `ST_Contains(boundary_geometry, ST_PointOnSurface(
  candidate_geometry))` instead of a lat/lng `BETWEEN`.
- Only Cliopatria's Mongol Empire entries (TODO #12) currently have
  `polygon`/`multipolygon` locations — Beagle voyage and Great Wall
  (TODO #13/#14) are `path`-only, which don't represent closed regions
  anyway ("inside a path" isn't a meaningful question), so they're
  correctly excluded by construction (filtering to `entry_locations.kind
  IN ('polygon', 'multipolygon')`) without any special-casing by source.
- The live Wikidata/QLever path (`queryWikidata` in `query-worker.ts`)
  has no equivalent capability — embedding an arbitrary boundary
  polygon into a GeoSPARQL filter would be a substantial separate
  effort, and no imported boundary geometry has ever been Wikidata-
  sourced anyway. **Scoped out**: `insideSlug`/`outsideSlug` are parsed
  from the DSL regardless of active data source, but only the Postgres
  path (`queryPostgres`) actually applies them — under the Wikidata
  source they're silently inert, the same "parsed but only some sources
  honor it" shape already established for other DSL state in this
  codebase.

## Design decisions

### DSL: `filter inside:` / `filter outside:`, not a new top-level statement

Unlike `pin:` (TODO #16, deliberately *not* filter-shaped because it
adds entries back in rather than restricting them), inside/outside
boundary checks genuinely do restrict the result set — they belong under
the existing generic `filter <field>: <value>` grammar
(`dsl-parser.ts`), parsed into two new `DslFilter` kinds
(`insideBoundary`/`outsideBoundary`, each `{ slug: string }`). At most
one of each is honored (last line wins, consistent with how `category`
already behaves when repeated) — "inside X but outside Y" is a coherent
combination, so both can be set simultaneously; two `inside` lines are
not (there's no obvious intersection-vs-replace semantics worth
guessing at without a real use case asking for it).

### Server-side: PostGIS `ST_Contains`, boundary resolved by slug at query time

```sql
EXISTS (
  SELECT 1 FROM entry_locations el, entries b, entry_locations bl
  WHERE el.entry_id = entries.id AND el.ordinal = 0 AND el.geometry IS NOT NULL
    AND b.slug = :'insideSlug' AND bl.entry_id = b.id AND bl.geometry IS NOT NULL
    AND ST_Contains(bl.geometry, ST_PointOnSurface(el.geometry))
)
```
(negated via `NOT EXISTS` for `outside`). The boundary side isn't
restricted to a single location row (`bl.entry_id = b.id`, not `bl.
ordinal = 0`) — a future boundary entry with multiple polygon locations
should count membership in *any* of them, and `ST_Contains` already
handles a `MultiPolygon`'s disjoint parts as one logical union, so no
extra `ST_Union` step is needed for Cliopatria's case either.

**Accepted asymmetry**: an unknown slug in `inside` mode returns zero
results (self-evidently wrong, discoverable) but in `outside` mode is a
silent no-op (`NOT EXISTS` over nothing is vacuously true for every
row). Not worth a pre-validation round-trip query to fix — the
boundary-picker UI only ever emits real slugs; a typo only reaches this
path via hand-edited DSL, a rare, self-correcting-once-noticed edge case
for a hobby prototype.

### New small endpoint: `GET /api/entries/boundaries`

Returns `{id, slug, title}[]` for every entry with at least one
`polygon`/`multipolygon` location — deliberately *not* routed through
the existing slim-list-plus-IndexedDB-cache machinery
(`resolveViaCache`/`fetchEntriesByIds`) that lanesets and query results
use: the boundary picker only needs `slug`/`title` to render its list,
never the actual polygon coordinates (those stay server-side, consumed
only by the `ST_Contains` SQL above), so there's no large payload to
justify caching infrastructure for what's currently ~12 rows.

### UI: `<boundary-picker>`, structurally mirroring `laneset-picker.ts`

Same button + popup pattern (`#current` button, `.popup` list,
`togglePopup`/`closePopup`/click-outside-to-close) — the one structural
difference is each popup row needs two independent toggles ("In"/"Out"),
not a single click-to-select, since inside and outside are independent
selections. Dispatches `boundary-filter-changed` with `{ inside: string
| null, outside: string | null }`; exposes `setBoundaries(list)` and
`setSelected({inside, outside})` (silent, matching every other picker's
sync convention). `app-root.ts` wires it exactly like
`laneset-picker.ts` today: DSL → picker via `onDslChanged` parsing the
two new filter kinds, picker → DSL via `setDslLine` on the new event.

## Affected files

- `db/schema.sql` — no changes (PostGIS/`entry_locations.geometry`
  already there).
- `web-client/local-concept-server/src/api/entries.ts` — `insideSlug`/
  `outsideSlug` query params on `listEntries`; new `listBoundaries()`.
- `web-client/local-concept-server/src/server.ts` — new `GET
  /api/entries/boundaries` route.
- `web-client/src/types/index.ts` — two new `DslFilter` kinds.
- `web-client/src/worker/dsl-parser.ts` — `inside`/`outside` filter
  parsing.
- `web-client/src/worker/query-worker.ts` — `QueryBounds.insideSlug`/
  `outsideSlug`, `boundsToSearchParams`.
- `web-client/src/components/boundary-picker.ts` (new) +
  `web-client/public/index.html` (`boundary-picker-template`, mounted
  in `app-root-template`'s sidebar below `laneset-picker`).
- `web-client/src/components/app-root.ts` — load boundaries, wire
  `boundary-filter-changed`, sync in `onDslChanged`.
- `TODO.md` — mark item 19 `COMPLETED` once implemented.

## Verification (for implementation time)

1. `tsc --noEmit` clean in both `web-client/` and
   `web-client/local-concept-server/`.
2. `db/init-db.sh`, then direct `curl` checks: `/api/entries/boundaries`
   returns the 12 Cliopatria entries and nothing else; `/api/entries?
   insideSlug=<a Mongol Empire slug>` returns a strict subset of the
   unfiltered result and excludes at least one real entry known to sit
   outside that time-slice's territory (spot-checked by coordinate, not
   assumed); `outsideSlug` returns the complementary set.
3. Confirm the DSL round-trip: set `filter inside: <slug>` by hand,
   confirm `parseDsl` extracts it; confirm the picker (once wired) would
   receive the right `setSelected` call by tracing `onDslChanged`.
4. Visual check in a browser once one is available — the picker
   interaction itself (two independent toggle states per row) is real
   UI logic worth actually seeing render. Flag explicitly if skipped.
