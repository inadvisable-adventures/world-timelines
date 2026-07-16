# Exclude sports figures from the QLever `person` query — COMPLETED

## Result (2026-07-16)

Implemented as designed: `CategoryMapping.excludePatterns` (new optional
field) holds the two `FILTER NOT EXISTS` fragments, populated for `person`
only, spliced into that category's `UNION` branch by `categoryBranch()`.

Verified by running the actual built `queryQLever()` function (not just a
standalone SPARQL check) for `person`, 1900–1950: 29 results after the
existing duplicate-location merge, all non-athletes on inspection
(politicians, writers, musicians, scientists, clergy, diplomats, an
archaeologist, a psychologist) — no sports figures. One transient QLever
500 error was hit on a prior identical call and did not reproduce on
retry (same query succeeded both via a direct manual `fetch` replication
and via `queryQLever` itself moments later) — treated as an external
service blip, not a bug in this code.

## Summary

Add two general-purpose exclusion filters to the `person` category's
SPARQL branch (`web-client/src/wikidata/qlever-client.ts`, TODO item 6),
so athletes/sports figures are excluded without enumerating individual
sports.

## Verified approach

Two Wikidata properties generally identify a sportsperson, tested directly
against the live QLever endpoint before writing this plan:

1. **`P641` (sport)** — links a person directly to the sport(s) they're
   associated with (Messi → `P641 = association football`). Measured
   coverage: of ~389,000 people with the "association football player"
   occupation, 99.0% also have `P641` set.
2. **`P106` (occupation) transitively subclassing `athlete`
   (`Q2066131`)** — Wikidata's sport-specific occupations (association
   football player, basketball player, boxer, tennis player, sport
   cyclist, badminton player, fencer, American football player — 8/8
   sampled) are modeled as `subclass of` (`P279`, possibly through
   intermediate levels) → `athlete`. Doesn't depend on `P641` being
   separately populated, so it's a useful second, independent signal —
   same "two overlapping checks" pattern the existing fictional-entity
   exclusion already uses for robustness.

Both together:
```sparql
FILTER NOT EXISTS { ?item wdt:P641 ?anySport }
FILTER NOT EXISTS { ?item wdt:P106/wdt:P279* wd:Q2066131 }
```

Verified directly: a known athlete (Messi, `Q615`) is correctly excluded
by this combination; a known non-athlete historical figure (Napoleon,
`Q517`) correctly survives it. The full combined query (person category,
date + place + fictional-exclusion + Wikipedia-page-required + this new
sports exclusion, 1900–1950, `LIMIT 100`) measured ~7.3s cold — no
meaningful performance regression from the two additional `FILTER NOT
EXISTS` clauses, and a spot-check of the 100 returned people (singers,
physicists, politicians, poets, military officers) showed no obvious
athletes.

**Known caveat, not fixed by this plan**: Wikidata also classifies
"mind sports" like chess under the same `athlete` ancestor class
(confirmed: `chess player` occupation → subclass\* of `Q2066131`), so this
filter will also exclude chess players, e-sports competitors, and similar
along with physical athletes. Narrowing to exclude only physical sports
would require a different/narrower ancestor class or an explicit
allowlist — out of scope here unless it turns out to matter in practice.

## Where this applies

Only the `person` category branch — `P106`/`P641` are person-specific
properties; other categories (event, place, artifact, etc.) don't have an
analogous "is this a sportsperson" concept.

## Implementation

Add an optional `excludePatterns?: string[]` field to `CategoryMapping`
(`web-client/src/wikidata/category-map.ts`) — a list of additional
`FILTER NOT EXISTS { ... }` fragments included inside that category's
branch (config-driven, not hardcoded to `'person'` in `qlever-client.ts`,
so this mechanism is reusable if a future category needs its own
exclusions). `qlever-client.ts`'s `categoryBranch()` splices
`mapping.excludePatterns` into the branch block, after the place lookup
and before the `BIND`. Since each `FILTER NOT EXISTS` lives inside its
category's own `UNION` branch, it only affects that branch's evaluation.

## Affected files

- `web-client/src/wikidata/category-map.ts` — `CategoryMapping.excludePatterns`,
  populated for `person`.
- `web-client/src/wikidata/qlever-client.ts` — `categoryBranch()` splices
  in the exclusion patterns.

## Verification

- `web-client` builds cleanly.
- Query the Wikidata source for `person` over a period known to include
  both notable athletes and non-athletes (e.g. 1900–1950) and confirm no
  obvious sports figures appear in the results.
