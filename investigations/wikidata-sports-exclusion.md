# Splitting sports data out of the QLever queries

One recurring theme across the `person` and `event` category queries: sports
coverage on Wikidata is disproportionately large relative to its historical
significance for this app's purposes, and shows up as a distinct, generally
excludable slice each time. This doc tells that story in two parts — one
per category — kept as separate sections rather than merged, since the
underlying Wikidata properties/classes and the exact numbers differ, but
they're the same underlying story.

## Part 1: sports figures (`person` category)

Implemented in TODO item 8 / `plans/qlever-exclude-sports-figures.md`
(2026-07-16). Summarized here for context; see that plan for the full
implementation details.

**Finding**: two Wikidata properties generally identify a sportsperson,
without needing to enumerate individual sports:

1. **`P641` (sport)** — links a person directly to the sport(s) they're
   associated with. Measured coverage: of ~389,000 people with the
   "association football player" occupation, 99.0% also had `P641` set.
2. **`P106` (occupation) transitively subclassing `athlete` (`Q2066131`)**
   — Wikidata's sport-specific occupations (association football player,
   basketball player, boxer, tennis player, sport cyclist, badminton
   player, fencer, American football player — 8/8 sampled) are modeled as
   `subclass of` → `athlete`, possibly through intermediate levels.

```sparql
FILTER NOT EXISTS { ?item wdt:P641 ?anySport }
FILTER NOT EXISTS { ?item wdt:P106/wdt:P279* wd:Q2066131 }
```

Verified directly: a known athlete (Messi, `Q615`) is excluded; a known
non-athlete (Napoleon, `Q517`) survives. No meaningful performance cost
from adding these two `FILTER NOT EXISTS` clauses.

**Known caveat**: Wikidata classifies mind sports (chess, confirmed) under
the same `athlete` ancestor, so those get excluded too — not fixed,
flagged as an accepted side effect.

**Where it applies**: only the `person` category branch (`P106`/`P641` are
person-specific properties).

## Part 2: sports seasons (`event` category)

New finding (2026-07-16), during a follow-on investigation into the
`event` category (see `investigations/wikidata-event-transitive-type-match.md`
for the related "how events are typed" finding this built on).

**Finding**: pulling a ~1000-record stratified sample of events across
`-3000`..`1899` (five era buckets, ~200 each) and looking at description
patterns, the single largest category by far was **recurring annual sports
season summaries** — e.g. "1771 English cricket season," "1772 English
cricket season," one Wikipedia article per year, not a distinct historical
happening. Wikidata types these as **`Q27020041` ("sports season")**.

Quantified against the full `-3000`..`1899` event set (9,767 items,
transitive type match — see the type-match investigation):

**2,498 of 9,767 events (25.6%) are "sports season" items.**

This is a clean, single-class, blanket-excludable case — directly
analogous to Part 1's `athlete` ancestor class, just for events instead of
people:

```sparql
FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q27020041 }
```

No sub-case nuance was found here (unlike the `election` investigation,
where the equivalent-scale finding turned out to need a curated subtype
list rather than one blanket class — see
`investigations/wikidata-election-exclusion.md`).

**Where it applies**: the `event` category branch. No person-category
equivalent needed (sports seasons aren't people).

## Implemented as

TODO item covering this (alongside the election-subtype and
sports-season exclusions together) — see `plans/qlever-improve-event-category.md`
(or whichever plan file ultimately covers the `event` category changes)
for the concrete implementation.
