# The `event` category query was missing almost all of ancient/classical history

Date: 2026-07-16. Found while trying to pull a representative ~1000-record
sample of events across `-3000`..`1899` for the sports/election
investigations (`investigations/wikidata-sports-exclusion.md`,
`investigations/wikidata-election-exclusion.md`) — the sampling itself
surfaced a more fundamental problem with the `event` category's query than
either of those findings.

## The problem

`web-client/src/wikidata/category-map.ts`'s `event` mapping matches items
via `wdt:P31 wd:Q1656682` — an **exact** type match: the item must be
directly typed as "event," not some more specific subclass of it. This was
the original v1 design for every category (see
`plans/wikidata-qlever-data-source.md`), and it works fine for `person`
(`wdt:P31 wd:Q5`, human) because "human" is the type real people actually
get tagged with directly. Events don't work the same way.

## Verified directly

Checked before assuming anything:

- **Only 11,230 items total** are typed exactly as `Q1656682` (event),
  across all of Wikidata, any date.
- Of those, **zero** have a usable `P585` (point in time) date before
  year 500, and a follow-up check found **zero** with a `P580` (start
  time) date before year 500 either.
- Pulling a sample bucket for `-3000`..`-500` and `-500`..`500` with the
  exact-type query returned **0 rows in both buckets** — not a query bug,
  confirmed by inspecting the raw (empty) response bodies directly.

**Broadening to a transitive subclass match** —
`wdt:P31/wdt:P279* wd:Q1656682` (the item is *some kind* of event,
including subclasses like battle, treaty, election, synod, etc.) —
changes this completely:

- **467** events in `-3000`..`500` alone (vs. 0 with the exact match).
- **9,767** total across the full `-3000`..`1899` range, with the
  Wikipedia-page-required and fictional-exclusion filters also applied.

Most real-world historical happenings on Wikidata are modeled as
*subclasses* of "event" (battle, war, treaty, synod, election, etc.), not
as the bare "event" type itself — which is apparently reserved mostly for
either genuinely generic/uncategorized happenings or is otherwise rare in
practice. The exact-match design essentially only worked by accident for
modern history, where enough events happen to get union-matched some
other way or where volume is high enough that the rare bare-typed
`Q1656682` items still add up to a few dozen; it silently failed for
everything older.

## Why this wasn't caught earlier

The original `event` category was built and shipped (TODO item 6) without
a dedicated broad sample check across the full date range — verification
at the time focused on query correctness and the fictional-entity/sports
exclusions for `person`, not on event coverage across the whole timeline.
This is exactly the kind of gap a representative sample surfaces that a
handful of spot-check queries doesn't.

## Performance check

Switching to transitive matching didn't come with a meaningful
performance penalty in the queries run during this investigation — the
`-3000`..`500` bucket with the transitive match returned in ~1.1s, and the
full `9,767`-count query in ~9.5s (comparable to other whole-range `COUNT`
queries seen elsewhere in this project, e.g.
`investigations/wikidata-query-count.md`'s person-count work).

## Implemented as

`event`'s `typeQid` matching in `category-map.ts`/`qlever-client.ts`
switched from exact (`wdt:P31 <Q-id>`) to transitive
(`wdt:P31/wdt:P279* <Q-id>`) matching — see
`plans/qlever-improve-event-category.md`. Only applied to `event` for now;
other categories (`place`, `artifact`, `pol_mil_organization`, `business`,
`historical_period`, `concepts`) were not re-audited for the same gap as
part of this investigation and may benefit from the same check later.
