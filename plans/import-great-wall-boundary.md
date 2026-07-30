# Import the Great Wall of China from OpenStreetMap (TODO item 14)

## Summary

Import the Great Wall of China's geometry, fetched from OpenStreetMap via
Overpass, as an entry with one or more `path` locations. This is the
"building project" leg of the three-part first-implementation-slice idea
in `PARKINGLOT.md` (Cliopatria's boundaries leg is done — TODO item 12;
the Beagle voyage's journey leg is planned but not yet built — TODO item
13; this is the third).

**Not implemented yet** — this plan captures the design and a verified
data survey so implementation can start directly next time, per the
user's request to plan without building.

## Data source, verified live

Queried directly today (not from memory) via the plain OSM API (not
Overpass, which timed out — see Design decisions):
`https://api.openstreetmap.org/api/0.6/relation/318110.json`. Tags
confirm this is the right entity: `name:en=Great Wall of China`,
`wikidata=Q12501`, `heritage:operator=whc`, `ref:whc=438` (UNESCO World
Heritage reference), last edited within the last two weeks of this plan
being written.

**Correction to `LICENSES.md`'s existing "researched" entry**: plain
OpenStreetMap (what this relation actually lives on, `osm.org`/
`overpass-api.de`) is **ODbL**-licensed (share-alike), not the CC0 of
OpenHistoricalMap — a related but separate project. `LICENSES.md`
currently only lists OpenHistoricalMap; implementation must add a
*separate* line item for plain OpenStreetMap with the correct ODbL terms,
not just relabel the existing row.

**The relation has 6,498 direct members**: 6,417 ways, 74 nodes, 7
sub-relations (confirmed via a direct member-list fetch — a *recursive*
full-geometry fetch, `(._;>>;);out geom;`, timed out at 60–90s against
the public `overpass-api.de` instance both times it was tried, so
implementation will need to either paginate the fetch, use a different
Overpass mirror/instance, or fetch member ways individually/in batches).
The relation's own OSM note field says *"Maybe a split of this relation
into smaller 'per province' relations would be better"* — confirming
this is a large, genuinely fragmented network of separate wall sections,
not one contiguous line, consistent with the Great Wall's real history
(built/rebuilt across many non-contiguous sections over ~2,000 years).

## Design decisions

### This will not become ~6,400 separate `path` locations on one entry

Storing one `path` location per OSM way (`entry_locations` has no hard
row-count limit, but 6,000+ locations for a single entry is a real
departure from every other entry in this app — Cliopatria's largest
entry has 1 location, and the existing multi-location code exists only
for the rare multi-`P19` merge case in `qlever-client.ts`/
`fetch-wikidata-persons.mjs`) would mean a huge single API payload and
thousands of canvas draw calls (`world-map.ts`'s `drawLocations`) every
time this one entry is visible — a real, avoidable performance risk, not
a hypothetical one.

**Decision: line-merge, then cap by length.** Implementation should (a)
fetch full geometry for the member ways, (b) merge ways that share an
endpoint node into longer contiguous polylines (a standard, bespoke — no
new dependency — graph operation: build an adjacency map by shared
endpoint coordinates, walk chains), which will still likely leave a large
number of genuinely disconnected wall sections (that's real history, not
a bug), then (c) keep only the N longest merged polylines by total
length, dropping short fragments. **The exact value of N is deliberately
left for implementation**, not guessed here — it depends on the real
distribution of merged-segment lengths, which isn't known without doing
the (expensive) full fetch. Pick N empirically at implementation time by
looking at the actual length histogram (e.g. "top 50 sections cover 80%
of total mapped length" would be a reasonable place to draw the line);
document whatever's chosen and why, the same way TODO item 9 documented
its disk-space-driven scope decision.

### One entry, multiple `path` locations, category `place`

Matches the existing precedent for physical monuments/structures already
in the sample data (`Great Pyramid of Giza` is category `place`, not
`artifact`). Title: "Great Wall of China." `locations` will be an array
of `path` entries (no `t`/fractional-progress needed — a wall isn't
traversed over time the way a voyage is, so every waypoint's `t` should
be omitted).

### Dates: acknowledge real imprecision rather than inventing false precision

OSM carries no construction-phase/date metadata (confirmed in
`investigations/historical-boundary-journey-trade-data-sources.md` — OSM
tags reflect current physical state, not build history), and the wall's
real construction spans roughly the Warring States period (~7th century
BCE earliest sections) through the Ming dynasty (1368–1644 CE, which
produced most of what's actually standing/mapped today). Rather than
pinning arbitrary precise dates the data can't support, use a wide
anchor range (tentatively `-700`..`1644`) with a correspondingly large
`uncertaintyYears`, and say plainly in the description that this is a
multi-dynasty, multi-century construction project, not a single
building event. **Confirm the exact anchor years against a reliable
source (e.g. cross-check with the entity's own Wikipedia article) during
implementation** rather than trusting this plan's ballpark figures
uncritically.

### Citation

`citationUrl` → `https://www.openstreetmap.org/relation/318110`,
`citationLabel` → `"OpenStreetMap contributors"` (the conventional ODbL
attribution phrasing) — share-alike terms apply to redistributed/adapted
data (the merged-and-capped polylines are a real transformation of the
source), worth a one-line acknowledgment in `LICENSES.md` alongside the
license correction noted above, consistent with how other non-commercial/
share-alike sources in this project (e.g. Chronas) are already flagged.

## Affected files

- `db/fetch-great-wall.mjs` (new) — Overpass/OSM API fetch, line-merge,
  length-based cap, transform script.
- `web-client/public/data/great-wall.json` (new, generated).
- `db/seed.mjs` — load the new file (generalize the "extra JSON entry
  files" list the same way TODO item 13's plan describes).
- `LICENSES.md` — add plain OpenStreetMap (ODbL) as a distinct entry from
  the existing OpenHistoricalMap (CC0) row.
- `TODO.md` — mark item 14 `COMPLETED` once implemented.

No schema, type, or UI changes needed — same as TODO item 13, this reuses
machinery already built (TODO item 12's citation fields, `path` rendering
already implemented, multi-location-per-entry already supported).

## Verification (for implementation time)

1. Confirm the fetch survives Overpass's timeout behavior (batch/paginate
   as needed) and produces a plausible way count before merging.
2. After line-merging, print the length distribution and justify the
   chosen cap N in the plan's own Result section (per the "no silent
   caps" convention this project already follows — see TODO item 9's
   scope-decision writeup).
3. Confirm builds stay clean, `db/init-db.sh`, then a direct
   `/api/entries/by-ids` check confirming N `path` locations with
   plausible coordinates (should trace recognizable wall sections across
   northern China) and correct `citationUrl`/`citationLabel`.
4. Visual check in a browser once one is available (same caveat as TODO
   items 12/13).
