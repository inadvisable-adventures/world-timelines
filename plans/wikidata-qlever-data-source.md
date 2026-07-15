# Wikidata (QLever) as an alternative data source

## Summary

Extend `query-worker.ts` so it can answer a query either against
`local-concept-server` (today's only path — Postgres-backed local test
data) or, when selected, by running a SPARQL query directly against
QLever's public Wikidata endpoint (`https://qlever.dev/api/wikidata`) and
converting the results into this app's `HistoricalEvent` shape so they can
be cached in IndexedDB exactly like Postgres-backed entries are. A new
settings (gear) icon in the app's upper-right lets the user pick which
source is active. Fictional Wikidata entities (per `research/wikidata.md`'s
data-quality notes) are excluded.

This builds on `research/wikidata.md` (peer-directory research doc, not
checked in) and on TODO item 5's IndexedDB caching infrastructure
(`web-client/src/cache/`).

## Validated before writing this plan

Before committing to a design, the following was checked directly against
the live QLever endpoint (not assumed from the research doc, which flagged
several of these as open questions):

- **CORS**: `https://qlever.dev/api/wikidata` responds with
  `Access-Control-Allow-Origin: *` — a browser `fetch()` from the worker can
  call it directly, no server-side proxy needed.
- **No API key required**: a query with zero auth headers returns real
  results (HTTP 200). The web UI's "Access Token" field is for *write*
  operations (managing shared query configs), not for running read queries.
- **Query shape works**: a query joining `wdt:P31` (instance-of), a
  date via the full statement path (`p:PROP/psv:PROP` +
  `wikibase:timeValue`/`wikibase:timePrecision`, needed for date-precision
  fidelity — the simplified `wdt:PROP` shortcut loses precision), an
  `OPTIONAL` place lookup for `wdt:P625` coordinates, and the fictional-entity
  exclusion filters described below, returns correct real data (tested:
  18th-century Boston-area persons with correct names, descriptions, exact
  birth dates + precision, and coordinates).
- **BCE dates**: serialized as e.g. `-0500-01-01T00:00:00Z` (leading minus,
  zero-padded year) — parseable with a plain regex (`parseInt` handles the
  leading minus correctly), no need for `Date` parsing (which is unreliable
  for extreme/negative years).
- **Coordinates**: returned as WKT literals, e.g. `POINT(-71.057778
  42.360278)` — space-separated `lng lat` order, regex-parseable.
- **Performance**: a *cold* query (novel filter combination) over the
  realistic worst case — 2 categories unioned, the app's full default time
  range (`-3000` to `2100`), `LIMIT 100` — took **~13–14 seconds**. QLever
  caches server-side: an identical re-run of the same query took **~200ms–1s**.
  This means: first load / first novel query against Wikidata will feel
  slow; repeated/refined queries won't. The UI needs a loading indicator
  during in-flight queries (today there isn't one outside the initial
  worker handshake — queries against Postgres are fast enough that this was
  never needed) and a generous client-side timeout.

## Decision: entry ids for Wikidata-sourced entries

**Recommendation, and what was implemented: use the raw Wikidata Q-id
(e.g. `"Q42"`) as `HistoricalEvent.id`, not a generated UUID.**

Reasoning:
- `HistoricalEvent.id` is typed as plain `string` — nothing in the client
  enforces UUID format. The UUID requirement from TODO item 2 was
  specifically a Postgres primary-key design decision; Wikidata-sourced
  entries never touch Postgres, so they don't inherit that requirement.
- A Q-id is already a stable, globally-unique, human-traceable identifier —
  more useful for debugging than a random or hashed UUID (`Q42` is directly
  look-up-able on wikidata.org; a UUIDv5 hash of `Q42` would not be).
  Minting a synthetic UUID (e.g. via a hand-rolled UUIDv5 over the Q-id)
  would add a real chunk of code (SHA-1 via `crypto.subtle`, UUID
  bit-twiddling) for strictly less debuggability than just using the Q-id.
- `local-concept-server`'s `validateUuidList` (UUID-regex validation) only
  guards the Postgres-backed `/api/entries/by-ids` /
  `/api/lanesets/by-ids` routes. The Wikidata path never calls those routes
  — the worker talks to QLever directly and never sends a Wikidata id back
  to `local-concept-server` — so nothing downstream actually requires UUID
  shape.
- IndexedDB keys only need to be unique *within their object store*; string
  format is irrelevant. Wikidata-sourced entries get their own object store
  (see below) specifically so a Q-id and a Postgres UUID never need to be
  distinguished by shape or risk colliding.

## Scope: what the data-source toggle affects

Only **entry query results** (map markers, timeline entry dots — i.e. what
`query-worker.ts`'s `query` message handler returns) switch backends.
Lanesets/lanes and historical eras keep loading from `local-concept-server`
unconditionally in both modes:
- There's no Wikidata equivalent of this app's curated geographic
  "lanesets" (continents/regions/cradles) or its hand-curated historical-era
  bands — those are app-specific curated data, not something to source live
  from Wikidata.
- The request specifically scopes this to "extend the query worker" —
  `query-worker.ts` is exactly the module that answers `query` messages;
  era/laneset loading is separate code in `app-root.ts` that never goes
  through the worker.

## Wikidata category mapping

Each of this app's 9 `EventCategory` values maps to a Wikidata type
(`wdt:P31` value), a single anchor date property, and a place-lookup
strategy. **v1 scope decision**: one date property per category (not a
fallback chain via `UNION` across multiple candidate properties), and all
entries are treated as point-events (no start/end range extraction, `P582`
end-time is not queried) — both are deliberate simplifications to ship a
clean, well-tested v1 rather than a shakier multi-branch query; richer
date-range extraction (e.g. event `P580`+`P582` pairs, `historical_period`
ranges) is a good follow-up, not done here.

| `EventCategory`        | Wikidata type (`wdt:P31`)         | Date property         | Place strategy                          |
|-------------------------|------------------------------------|------------------------|-------------------------------------------|
| `person`                 | `wd:Q5` (human)                    | `P569` (birth date)     | via `P19` (place of birth) → `P625`        |
| `event`                  | `wd:Q1656682` (event)              | `P585` (point in time)  | direct `P625` on the item                  |
| `place`                  | `wd:Q618123` (geographic location) | `P571` (inception)      | direct `P625` on the item                  |
| `artifact`                | `wd:Q838948` (creative work)       | `P571` (inception)      | direct `P625` on the item                  |
| `pol_mil_organization`  | `wd:Q43229` (organization)         | `P571` (inception)      | via `P159` (headquarters location) → `P625` |
| `business`                | `wd:Q4830453` (business)           | `P571` (inception)      | via `P159` (headquarters location) → `P625` |
| `historical_period`     | `wd:Q11514315` (historical period) | `P580` (start time)     | none (periods aren't reliably geo-tagged)  |
| `concepts`                | `wd:Q151885` (concept)             | `P571` (inception)      | none                                        |
| `other`                   | **unsupported** — contributes nothing to a Wikidata query | — | — |

A date is **required** (an item without the category's date property is
excluded) — consistent with every existing entry in this app having a date.
A place is **optional** (`OPTIONAL` in SPARQL) — `locations: []` is a valid
state in the existing data model, and many concepts/periods/organizations
genuinely lack a clean single coordinate.

## SPARQL query construction

`query-worker.ts` already parses the DSL into `DslFilter[]` + a `timeRange`
+ an optional `geoFilter` (`dsl-parser.ts`, unchanged). A new module,
`web-client/src/wikidata/qlever-client.ts`, builds a SPARQL query from the
same inputs:

1. For each selected category (or all 8 supported categories, if no
   `category` DSL filter is active), emit one `UNION` branch:
   ```sparql
   {
     ?item wdt:P31 wd:<TypeQid> .
     ?item p:<DateProp>/psv:<DateProp> ?dateNode .
     ?dateNode wikibase:timeValue ?date ; wikibase:timePrecision ?datePrecision .
     <OPTIONAL place-lookup, binding ?coord>
     BIND("<category>" AS ?matchedCategory)
   }
   ```
2. Wrap all branches together with shared filters applied once (not
   per-branch): year range (`FILTER(YEAR(?date) >= ... && YEAR(?date) <=
   ...)`, intersecting the DSL's `year` filter with the timeline's
   `timeRange` exactly as the Postgres path already does), text
   (`CONTAINS(LCASE(...), "...")` over label + description), lat/lng
   (`geof:longitude(?coord)`/`geof:latitude(?coord)` range filters, only
   added when a lat/lng filter is actually present — naturally excludes
   place-less entries when the user has asked for a geographic box, same
   behavior as the Postgres path's `entry_locations` join), and the
   fictional-entity exclusion (below).
3. `OPTIONAL` label (`rdfs:label`, English) and description
   (`schema:description`, English).
4. `LIMIT <n>` — same `DEFAULT_LIMIT`/`MAX_LIMIT` constants
   `query-worker.ts` already uses for the Postgres path (100 default, 500
   hard cap), shared rather than duplicated.

### Fictional-entity exclusion (per `research/wikidata.md`)

```sparql
FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q14897293 }  # not a fictional entity (by type, transitively)
FILTER NOT EXISTS { ?item wdt:P1074 ?anyFictionalUniverse }  # not part of a fictional universe
```
Verified this doesn't meaningfully hurt performance (isolated timing: the
`P279*` transitive-closure filter added negligible cost on top of the base
query in direct testing — QLever handles this pattern far better than WDQS,
consistent with `research/wikidata.md`'s findings).

## Response parsing → `HistoricalEvent`

- `?item` (a full IRI like `http://www.wikidata.org/entity/Q42`) → strip the
  prefix → `id: "Q42"`.
- `?itemLabel` → `title` (fall back to the Q-id if no English label).
- `?description` → `description` (fall back to `''`).
- `?matchedCategory` → `category`.
- `?date` + `?datePrecision` → `startDate`/`endDate` (both set to the same
  point-in-time, per the v1 point-event simplification above):
  - Parse year/month/day via regex (`/^(-?\d+)-(\d{2})-(\d{2})T/`), not
    `Date` parsing (unreliable for BCE/extreme years) — validated against a
    real `-0500-01-01T00:00:00Z` response.
  - Zero out month/day when `datePrecision` is coarser than day/month
    (`< 11` → day unknown → 0; `< 10` → month unknown → 0), matching this
    app's existing `0 = unknown precision` convention.
  - `uncertaintyYears` derived from `datePrecision` (Wikidata's own
    precision code is a direct, more principled signal than the ingester's
    text-based LUT): day/month/year (11/10/9) → 0; decade (8) → 5; century
    (7) → 50; millennium (6) → 500; 10k/100k/1M/10M+ years (5/4/3/0–2) →
    5,000 / 50,000 / 500,000 / 5×10⁸ respectively.
  - `detectedCalendar: 'gregorian'` always — a known v1 simplification
    (Wikidata's full calendar-model qualifier, Gregorian vs. Julian, isn't
    queried; see `research/wikidata.md`'s data-quality notes). Matches the
    same fallback (`calendar || 'gregorian'`) already used elsewhere in this
    codebase.
- `?coord` (WKT `POINT(lng lat)`) → regex-parse into a single-element
  `locations: [{type: 'point', lat, lng}]`; absent → `locations: []`.
- `infoboxType`: `"wikidata:<TypeQid>"` (e.g. `"wikidata:Q5"`) — traceable
  provenance, distinct from `''` (hand-crafted) and real Wikipedia infobox
  names.
- `tags: ['wikidata']` — lets the app (or a future feature) distinguish
  Wikidata-sourced entries from Postgres-sourced ones by tag, same pattern
  eras already use (`-history`-suffixed tags).
- `lastUpdated`: the time this app fetched the entry (`new Date().toISOString()`
  at parse time) — **not** a Wikidata-side modification timestamp (Wikidata
  doesn't expose one cheaply via SPARQL). This is an honest choice: it
  means "world-timelines last saw this entry at time T," which is exactly
  what the IndexedDB cache needs it to mean.

## Caching: why this is write-through, not slim-list/by-ids

The Postgres path's slim-list-then-by-ids split (TODO item 5) exists
because `local-concept-server` can cheaply answer "which ids are
current" *separately* from "give me full records" — that's what makes
diffing against the cache worthwhile before paying for full-record fetches.
Wikidata has no equivalent cheap listing: a SPARQL query *is* both the
listing and the full data in one round trip, and there's no property
exposing "last modified" cheaply at scale. So for the Wikidata path:

- Every query still has to hit QLever fresh (no way to know "did anything
  relevant change" without asking).
- What *is* cached: each returned entry is written through to a dedicated
  IndexedDB object store (`wikidataEntries`, separate from the Postgres
  path's `entries` store — avoids ever needing to distinguish a Q-id from a
  UUID by shape, and lets each source's cache be reasoned about/cleared
  independently) via `idb-cache.ts`'s existing `putCached` (newly exported;
  today it's an unexported implementation detail of `resolveViaCache`).
- This still satisfies "converting the responses to our format so they can
  be cached, and caching them" — it just doesn't reuse the diff-before-fetch
  half of the existing cache module, because that half solves a problem
  (avoiding an expensive full-record fetch when a cheap listing says
  nothing changed) that doesn't exist for a live SPARQL source.

## Worker protocol changes

- `types/index.ts`: add `export type DataSource = 'postgres' | 'wikidata';`
  and add `dataSource: DataSource` to `QueryRequest` (sent fresh with every
  query — simplest, stateless, matches how `geoFilter` already works).
- `query-worker.ts`: on `query`, branch on `msg.dataSource`. `'postgres'`
  path is today's unchanged `local-concept-server` fetch flow. `'wikidata'`
  path: build the SPARQL query (`qlever-client.ts`), `fetch()` it with an
  `AbortController` timeout (45s — comfortably above the ~13–14s worst-case
  cold-query time measured above, since QLever's own timeout is 600s+ but
  a hung request shouldn't hang this app's UI indefinitely), parse the
  response into `HistoricalEvent[]`, write-through cache them, return them
  directly as the query result (no separate slim/by-ids round trip).
- Errors (QLever unreachable, malformed response, timeout) are caught and
  logged, mirroring the existing Postgres-path error handling — the UI
  simply shows no new results rather than crashing.

## Settings (gear) icon UI

New web component `web-client/src/components/settings-menu.ts` +
`#settings-menu-template` in `index.html`, styled/structured to match the
existing `laneset-picker.ts` popup pattern (click a button → toggle a
popup list → click an option → closes + dispatches a bubbling/composed
custom event). Placed via `position: absolute; top: 8px; right: 8px;` in
`app-root-template`'s host (a small `:host { position: relative; }` addition
makes this anchor correctly), so it sits in the literal upper-right corner
of the whole app regardless of the map/sidebar split — a small gear
character (`⚙`) button, no new icon asset needed (matches this app's
existing pattern of using plain Unicode glyphs for icons — `▾`, `▶`/`▼`,
`×`, `⤢` are already used this way, no icon library).

Options: `"World Timelines test data"` (`dataSource: 'postgres'`, default —
preserves current behavior for anyone not touching the new setting) and
`"Wikidata (QLever)"` (`dataSource: 'wikidata'`).

`app-root.ts`: track `dataSource` state (default `'postgres'`), wire the
new `data-source-changed` event to update it and re-query, include it in
every `QueryRequest`. Also add a loading indicator around in-flight queries
(today's `.loading` overlay is only toggled around the worker's initial
handshake) — show it when a query is sent, hide it when results arrive —
since a cold Wikidata query can take over 10 seconds and the UI would
otherwise appear frozen.

## Affected files

- `web-client/src/wikidata/category-map.ts` — new (the mapping table above)
- `web-client/src/wikidata/qlever-client.ts` — new (SPARQL builder, fetch,
  response → `HistoricalEvent[]` parser)
- `web-client/src/cache/idb-cache.ts` — add `WIKIDATA_ENTRIES_STORE`
  (bumps `DB_VERSION`), export `putCached`
- `web-client/src/worker/query-worker.ts` — branch on `dataSource`
- `web-client/src/types/index.ts` — `DataSource` type, `QueryRequest`
  field
- `web-client/src/components/settings-menu.ts` — new
- `web-client/src/components/app-root.ts` — wire settings menu,
  `dataSource` state, loading indicator around queries
- `web-client/public/index.html` — new template + `<settings-menu>` +
  small `:host` positioning CSS
- `web-client/tsconfig.worker.json` — add `"src/wikidata/**/*.ts"` to
  `include`
- `design-docs/poc-design.md` — document the new source-switchable
  architecture

## Known limitations (documented, not fixed here)

- No start/end date ranges (point-events only), no multi-property date
  fallback chains, no calendar-model (Julian vs. Gregorian) detection.
- `other` category is unsupported for Wikidata.
- No dedup against Postgres-sourced entries if a user somehow sees the same
  real-world subject from both sources (out of scope — the two sources are
  used one at a time via the toggle, not merged).
- Cold-query latency (10–15s) is inherent to querying live over a broad
  category/time range; mitigated with a loading indicator and a generous
  timeout, not eliminated.

## Verification

- `web-client` builds cleanly (`npm run build`, strict TypeScript).
- Launch the app, switch the data source to Wikidata via the new gear
  icon, and confirm: a query returns real people/events with sensible
  titles/dates/coordinates; DevTools → IndexedDB shows the new
  `wikidataEntries` store populated; no fictional entities appear in a
  spot-check; switching back to "World Timelines test data" restores the
  existing Postgres-backed behavior unchanged.
- Confirm the loading indicator appears during a cold Wikidata query and
  clears once results render.
