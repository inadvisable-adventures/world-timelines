# Lean, filtered ingest (#64) — COMPLETED

## Result (2026-07-06)

Fresh full pass (resumed once after an environment kill; offset cache + stride-
aware checkpoint made recovery seamless). Output: `ingester/collected_entries.tsv`.

- **56,431 entries / 16 MB** — down 15× from the pre-filter 860,514 / 242 MB.
- **Coordinate hit rate 100%** (`exclude_no_coords` in effect; 0 `no-coords-found`).
- **artifact 0** (ship excluded); no sports/music/social biography types present.
- **person/officeholder max start(birth) year = 1899** — cap holds exactly.
- Output mix: settlement 45,774 (81%), military_conflict 7,967, person 845,
  officeholder 484, military_person 442, country 243, event 215, then small
  counts of artist/scientist/royalty/writer/places.
- **Write-back stayed clean:** the run rewrote `infobox-catalog.tsv` and
  `include_in_future=1` remained 28 (previously grew 43→75→201), confirming the
  pollution fix.

Note the expected consequence: with `exclude_no_coords` on, `person`/`officeholder`
are now tiny (most biographies carry only a birthplace name), so the dataset is
settlement/place-dominated. To keep coordinate-less historical people, exempt
those types from `exclude_no_coords` (follow-up if desired).

## Summary

Tighten the ingest to a leaner, more map- and history-relevant dataset by
excluding low-value bulk (sports/music/social-media biographies, ships),
restricting generic biographies to pre-1900 births, and dropping entries with no
coordinates. Also fix the root cause that makes type-exclusions fail to stick:
the catalog write-back pollutes `include_in_future`.

Covers the user's six asks:
1. Exclude all sports biographies.
2. Exclude `musical_artist` and `social_media_personality`.
3. Restrict `person` and `officeholder` to births ≤ 1899 CE.
4. Add (or set, if present) a config option to exclude `no-coords-found` entries.
5. Exclude `ship`.
6. Run a new ingest.

## Root-cause finding (why (5) keeps recurring)

The ingester overwrites `infobox-catalog.tsv` at the end of every run, and
`InboxCatalog` sets `include_in_future = was_included`, where `was_included` is
true for **every** infobox template that merely co-occurs on a page that had any
included type. So the include set grows each run (observed: 43 → 75 → 201
`include_in_future=1` rows across successive runs). A type set to 0 by hand
(e.g. `ship`) gets regenerated to 1 on the next run — exactly the "I got rid of
it but it's back" symptom. Most polluted additions map to category `other` (and
are dropped by `exclude_category other`), but productive types like `ship`
persist. This must be fixed or no exclusion is durable.

## Affected Files

- `ingester/src/infobox-catalog.ts` — preserve `include_in_future` from the input
  include set instead of deriving it from `was_included`
- `ingester/src/index.ts` — pass the include set to the catalog; add no-coords and
  per-type birth-year filters
- `ingester/src/ingest-config.ts` — new `exclude_no_coords` and `max_birth_year` settings
- `ingester/infobox-catalog.tsv` — reset `include_in_future` to a clean allowlist
- `ingester/ingest.config.tsv` — enable the new filters
- `design-docs/poc-design.md` — document the write-back fix + new filters

## Implementation

### 1. Fix catalog write-back pollution

`InboxCatalog` gains a constructor arg `includeSet: Set<string>` (the types with
`include_in_future=1` from `catalog_input`). `record()` sets
`includeInFuture = includeSet.has(type)` rather than `= wasIncluded`. `toTsv`
then preserves the human-reviewed flags; newly-discovered types default to 0
(visible via `was_included` for future review, never auto-included). `index.ts`
constructs it with the same `includeTypes` set it already builds.

### 2. Reset the catalog to a clean allowlist

Set `include_in_future=1` for exactly the historically-relevant productive types,
0 for everything else (drops all sports/music/social types — named or not —
`ship`, and sub-template noise). Allowlist (from the productive types in the #63
output, minus the exclusions):

`person, officeholder, settlement, military_person, scientist, writer, artist,
military_conflict, royalty, philosopher, clergy, event, historical_event,
police_officer, country, spy, murderer, mass_murderer, biography, composer,
militant_organization, battle, body_of_water, war, ancient_site, invention,
shinto_shrine, island`

Applied with an `awk` pass over `infobox-catalog.tsv` (col 5 = 1 iff col 1 ∈
allowlist). With fix (1) in place, this sticks across runs.

### 3. `exclude_no_coords` filter

New config `exclude_no_coords` (bool). When set, an article whose
`extractLocations` returns no points is rejected (counted as rejected), rather
than collected with a `no-coords-found` tag.

**Interaction to flag:** most `person`/`officeholder` articles carry no
coordinates (only birthplace *names*), so enabling this will sharply reduce those
categories regardless of the birth-year filter — the birth-year rule then applies
to the coordinate-bearing remainder. This is consistent with a map-centric
dataset (unmappable entries add weight but no map value).

### 4. Per-type birth-year restriction

New repeatable config `max_birth_year<TAB>TYPE<TAB>YEAR`. Build
`Map<infoboxType, number>`. After `startDate` is extracted, if the entry's
`primaryType` has a cap and `startDate.startYear > cap`, reject. Seed with
`person → 1899` and `officeholder → 1899`. (For a person/officeholder infobox,
`startDate` is the `birth_date` field, so `startYear` is the birth year in the
common case.)

### 5. Config file

Add to `ingest.config.tsv`:
```
exclude_no_coords	1
max_birth_year	person	1899
max_birth_year	officeholder	1899
```

### 6. Re-run

Fresh run (not resume) via `./ingest-ctl.sh supervise`; the include-set and
filters changed, so a clean pass is required. Report the new size, category mix,
and coordinate hit rate.

## Key Decisions

- **Catalog is the single source of truth for *which types are considered*;** the
  write-back fix makes hand-edits durable. Birth-year and no-coords are
  cross-cutting filters the catalog can't express, so they live in the config.
- **Allowlist over denylist** for the catalog reset: guarantees no sports/social
  type (even ones not seen yet) sneaks in via future co-occurrence.
- Birth-year restriction is **per-infobox-type** (person, officeholder), not
  per-category, honoring "person and officeholder specifically" — scientists,
  writers, royalty, etc. are not birth-restricted.

## Verification

- `npm run build` passes; unit-check the new filters on captured snippets.
- Spot-check with `lookup`: a post-1899 footballer/officeholder is rejected; a
  pre-1900 coordinate-bearing settlement/person is kept.
- After the run: report row count, category + infobox-type breakdown (no sports/
  music/social/ship; person/officeholder births ≤ 1899), and coord hit rate
  (should be ~100% since no-coords are excluded).
- Confirm the written-back `infobox-catalog.tsv` still has the clean allowlist
  (pollution fixed).
