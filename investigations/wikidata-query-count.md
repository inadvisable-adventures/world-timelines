# How many people match the QLever `person` baseline filters, and is counting them expensive?

Date: 2026-07-16. Investigated directly against the live QLever endpoint
(`https://qlever.dev/api/wikidata`), not from memory or documentation.

## Question

Given the current `person` category filters used by
`web-client/src/wikidata/qlever-client.ts` (TODO items 6–8: category type,
required date, no sports figures, required Wikipedia page), how many
Wikidata people actually match, and would running a `COUNT` query to find
out be burdensome to the shared public QLever endpoint?

## Filters actually in effect today (as implemented)

From `web-client/src/wikidata/category-map.ts` and `qlever-client.ts`:

- `?item wdt:P31 wd:Q5` — is a human.
- `?item p:P569/psv:P569 ?dateNode` (+ `wikibase:timeValue`/`timePrecision`) — has a birth date. **Required.**
- `OPTIONAL { ?item wdt:P19 ?placeItem . ?placeItem wdt:P625 ?coord . }` — birthplace coordinates. **Optional, not required** — see finding below, this matters.
- `FILTER NOT EXISTS { ?item wdt:P641 ?anySport }` and `FILTER NOT EXISTS { ?item wdt:P106/wdt:P279* wd:Q2066131 }` — excludes sports figures (TODO item 8).
- `?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?wikipediaTitle` — has an English Wikipedia article. **Required** (TODO item 7).
- `FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q14897293 }` and `FILTER NOT EXISTS { ?item wdt:P1074 ?anyFictionalUniverse }` — excludes fictional entities (TODO item 6).
- `FILTER(YEAR(?date) >= -3000 && YEAR(?date) <= 2100)` — the app's default timeline range.

**Correction to how this was originally framed**: "must have a usable
location" is *not* actually one of today's filters — the place lookup is
`OPTIONAL`. An entry can and does come back with `locations: []`.

## Result: the count

Ran the exact query above (with `SELECT (COUNT(DISTINCT ?item) AS
?count)` in place of the app's normal field list) twice:

| Run | Result | Wall time | `query-time-ms` |
|---|---|---|---|
| 1 (cold) | 1,241,767 | 31.5s | 29,690 |
| 2 (immediate re-run, same query text) | 1,241,768 | 41.1s | 37,738 |

**~1.24 million people** currently match the baseline filters.

## Finding: COUNT queries do not benefit from QLever's warm-cache speedup

Earlier work in this project (see `plans/wikidata-qlever-data-source.md`)
found that QLever caches server-side: an identical `LIMIT 100` query goes
from ~13-14s cold to ~200ms-1s on a repeat. **That does not hold for a
`COUNT(DISTINCT ...)` aggregate** — the second run above was *slower*, not
faster (41.1s vs. 31.5s), and returned a different number (1,241,768 vs.
1,241,767 — Wikidata is edited continuously and QLever stays near-real-time,
so this is a real, not a stale-cache, difference). A count has no `LIMIT`
to short-circuit on and apparently little to cache for an aggregate over a
live, constantly-changing graph — every run re-evaluates the full matching
set.

**Conclusion on burden**: a one-off `COUNT` like this is a real but
bounded cost (~30-40s, once) — reasonable for occasional manual/exploratory
use, well within QLever's documented 600+s timeout headroom. It is **not**
something to wire into the running app (e.g. a live "N results match"
counter fired on every keystroke/filter change) — that query pattern is
meaningfully heavier than the `LIMIT`-bounded queries the app is actually
built around, and won't get faster with repetition the way normal app
queries do.

## Finding: making location a *required* (non-`OPTIONAL`) filter is much more expensive

Curious whether "must have a usable location" — if actually implemented as
a required join rather than left optional — would change the cost
picture, so this was tested directly: replacing `OPTIONAL { ?item wdt:P19
?placeItem . ?placeItem wdt:P625 ?coord . }` with the same triples as a
plain (required) pattern.

**Result: timed out after 120s with no answer at all.**

This is a meaningful data point for any future work that wants to actually
enforce "has a usable location" as a query-level filter (as opposed to the
current behavior, where a person can still come back with `locations: []`)
— a naive required join is apparently far more expensive than the
optional version, to the point of not completing in a reasonable time
during this test. Making location genuinely required would need a
different, cheaper approach (an index-friendlier pattern, a narrower
type/date range to reduce the candidate set first, etc.), not a
straightforward "drop the `OPTIONAL` keyword" change.

## Follow-up, if wanted

Not filed as a TODO item yet — this was a scoping investigation, not an
implementation. If "entries must have a usable location" becomes a real
requirement, it should get its own TODO item + plan (per
`development-process.md`) that specifically addresses the required-join
performance problem found here, rather than naively removing the
`OPTIONAL` keyword.
