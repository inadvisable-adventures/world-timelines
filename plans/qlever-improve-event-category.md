# Improve the QLever `event` category: coverage fix + noise reduction — COMPLETED

## Result (2026-07-16)

Implemented largely as designed, with one significant discovery during
implementation that changed the exclusion mechanism: **stacking many
transitive (`wdt:P31/wdt:P279*`) `FILTER NOT EXISTS` clauses is
catastrophically slow** — measured directly: the originally-planned 10
separate transitive exclusion clauses (this plan's original design)
combined with the already-transitive event-type match and the
Wikipedia-required join took **53s for the base case and 60s–90s+
(timing out) once combined with a realistic full query** — worse than
useless, since it exceeds the client's own 45s timeout.

Root-caused by elimination (isolating the type match, the Wikipedia join,
and each filter individually — all fast alone) to the *combination* of
several transitive-closure subqueries. The fix: **one combined `MINUS` +
`VALUES` block using exact (non-transitive) `wdt:P31` matching**, replacing
10 separate `FILTER NOT EXISTS` clauses:

```sparql
MINUS {
  ?item wdt:P31 ?excludedType .
  VALUES ?excludedType { wd:Q27020041 wd:Q18608583 wd:Q18536594 wd:Q15261477 wd:Q1057954 wd:Q24397514 wd:Q26466721 wd:Q15280243 wd:Q152450 wd:Q7864918 wd:Q24333627 wd:Q112711344 }
}
```

This measured **~2–6s** for the same query shapes that previously timed
out, verified correct by direct `ASK` checks (an item confirmed typed with
an excluded Q-id is confirmed excluded by this pattern) — an earlier
apparent "correctness bug" during testing turned out to be a false alarm
from checking result *titles* for keywords like "gubernatorial" instead of
checking actual Wikidata types; several such titles turned out to be typed
only as the generic bare "public election" (deliberately kept, see
`investigations/wikidata-election-exclusion.md`), not the specific
excluded subtype.

**Two more exclusion classes added beyond the original plan**, found
during end-to-end verification (not chased further beyond these, to avoid
open-ended scope creep — this is a documented, accepted "not exhaustive"
limitation, not a new open investigation):
- `Q18608583` "recurring sporting event" — the competition series itself
  (as opposed to `Q27020041`, one year's edition).
- `Q18536594` "Olympic sporting event" — one discipline within one
  Olympics (e.g. "cycling at the 1896 Summer Olympics – men's 100
  kilometres") — extremely high volume, same low-individual-significance
  pattern as sports seasons.

**Also observed, not fixed (out of scope, a pre-existing Wikidata data
quality characteristic, not a bug in this code)**: a small number of
items carry clearly wrong `P585` dates — e.g. "UIM F2 World Championship"
(a real-world 2019-founded motorsport series) had a `P585` value of
`0002-01-01`, and "2022 Estadio Corregidora riots" had a `P585` value of
year 40. Both were incidentally excluded by the sports/event-class filters
above (coincidentally, not because the date was checked), but similar bad
dates could appear attached to items outside the excluded classes.
Something to be aware of when reviewing Wikidata-sourced results,
independent of anything this plan changed.

**End-to-end verification** (via the actual built `queryQLever()`
function, not just standalone SPARQL):
- Coverage fix confirmed: `-3000`..`-500` now returns real ancient events
  ("Egyptian Invasion of Kerma," "Cimmerian invasion of Phrygia," "Gedrosian
  campaign," in ~230ms) instead of zero.
- Noise reduction confirmed: a `1700`..`1899`, `LIMIT 100` query returned
  94 results (after dedup) with zero sports-season, recurring-sporting-event,
  or Olympic-sub-event titles, in ~1.8s.
- **Not exhaustive, by design**: some narrow election articles (e.g. a
  "Melbourne Cup" annual horse race, a Virginia congressional district
  election) still appear, because they're typed with Wikidata classes not
  in the curated exclusion list. Chasing every remaining narrow class was
  deliberately not pursued further — the net effect is a real, substantial
  improvement, not a perfect one, consistent with how the sports-figure
  and election investigations already accepted similar known gaps.

## Summary

Three changes to the `event` category's SPARQL branch
(`web-client/src/wikidata/category-map.ts`/`qlever-client.ts`), all found
via the same investigation (a ~1000-record stratified sample across
`-3000`..`1899`) and all documented in detail in their own investigation
docs:

1. **Coverage fix**: switch `event`'s type match from exact
   (`wdt:P31 wd:Q1656682`) to transitive
   (`wdt:P31/wdt:P279* wd:Q1656682`) — the exact match returns
   effectively zero events before ~1200 CE (11,230 items typed exactly as
   "event" total, none with a usable date before year 500). See
   `investigations/wikidata-event-transitive-type-match.md`.
2. **Noise reduction — sports seasons**: exclude `Q27020041` ("sports
   season") — 2,498 of 9,767 events (25.6%) under the broadened query are
   recurring annual season-summary articles (e.g. "1771 English cricket
   season"), not distinct historical events. Clean, single-class,
   blanket-excludable. See `investigations/wikidata-sports-exclusion.md`.
3. **Noise reduction — narrow elections**: exclude a curated list of
   sub-national/single-seat election subtypes (gubernatorial, by-election,
   U.S. House races, mayoral, municipal, U.S. Senate races, state-level
   presidential sub-articles) while keeping national/significant ones
   (general elections, imperial elections, legislative elections, and the
   ambiguous-but-mixed bare "public election" tier, which sampling showed
   contains real national events like British general elections). See
   `investigations/wikidata-election-exclusion.md` for the full Q-id list
   and rationale per type.

## Design

### Transitive type match

`CategoryMapping.typeQid` currently gets used in `categoryBranch()` as
`?item wdt:P31 ${mapping.typeQid}`. Add a per-category flag (or just
always use transitive matching — see decision below) so `event` uses
`?item wdt:P31/wdt:P279* ${mapping.typeQid}` instead.

**Decision: add an explicit `matchMode?: 'exact' | 'transitive'` field to
`CategoryMapping`, defaulting to `'exact'`**, rather than switching every
category to transitive matching by default. Only `event` sets
`matchMode: 'transitive'` for now. Reasoning: `person` (`wdt:P31 wd:Q5`)
is known to work correctly as an exact match — humans are tagged directly
as "human," and switching it to transitive would risk pulling in stray
subclasses of "human" (there are some oddities in Wikidata's class
hierarchy under Q5) with no evidence it's needed, per
`investigations/wikidata-event-transitive-type-match.md`'s own note that
other categories weren't re-audited for the same gap. An opt-in flag
keeps this fix scoped to the category it was actually verified for.

### Exclusions

Both the sports-season and election exclusions are `FILTER NOT EXISTS`
fragments added to `event`'s existing `excludePatterns` array (the same
mechanism TODO item 8 built for `person`'s sports-figure exclusion — no
new mechanism needed):

```ts
event: {
  typeQid: 'wd:Q1656682',
  matchMode: 'transitive',
  dateProp: 'P585',
  place: { kind: 'direct' },
  excludePatterns: [
    'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q27020041 }', // sports season
    'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q15261477 }', // gubernatorial election
    'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q1057954 }',  // by-election
    'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q24397514 }', // US House election
    'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q26466721 }', // special election to US House
    'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q15280243 }', // mayoral election
    'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q152450 }',   // municipal election
    'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q7864918 }',  // UK Parliamentary by-election
    'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q24333627 }', // US Senate election
    'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q112711344 }', // US presidential election in a single state
  ],
},
```

## Affected files

- `web-client/src/wikidata/category-map.ts` — `CategoryMapping.matchMode`
  (new, optional), `event`'s `excludePatterns` (10 new clauses).
- `web-client/src/wikidata/qlever-client.ts` — `categoryBranch()` respects
  `matchMode` when building the `wdt:P31` pattern.
- `db/fetch-wikidata-persons.mjs` — **not affected**; it's `person`-only
  and doesn't share the `event` branch logic (it duplicates only the
  `person` pattern, per its own header comment).

## Verification

- `web-client` builds cleanly.
- Query the Wikidata source for `event`, a broad pre-1200 range (e.g.
  `-500` to `500`), and confirm results actually appear (regression check
  against the near-zero coverage found in the investigation).
- Spot-check a `1700`..`1899` query for absence of sports-season and
  narrow-election items; confirm a known excluded case (e.g. a specific
  gubernatorial election, if findable) is actually excluded and a known
  kept case (e.g. an Imperial election) still appears.
- Re-run the same style of "type breakdown" query used in the
  investigations to confirm the excluded share actually drops out of a
  full-range count.
