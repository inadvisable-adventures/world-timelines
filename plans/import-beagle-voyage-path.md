# Import the HMS Beagle voyage as a `path` entry (TODO item 13)

## Summary

Import Charles Darwin's HMS Beagle voyage (1831–1836) as a single entry
with a `path` location — an ordered sequence of waypoints, the first
real use of this app's `path` location shape (previously exercised only
by `pol_mil_organization`/`multipolygon` in TODO item 12; `path` is
still untouched). This is the "journey" leg of the three-part
first-implementation-slice idea in `PARKINGLOT.md` (Cliopatria's
boundaries leg is done — TODO item 12 — this is the second).

**Not implemented yet** — this plan captures the design and a verified
data survey so implementation can start directly next time, per the
user's request to plan without building.

## Data source, verified live

Fetched directly (not from memory):
`https://climateviewer.org/layers/MRM/Explorers/charles-darwin-voyage-of-the-beagle-1832-1836.geojson`
(200 OK, 108KB). License: **CC BY-NC-SA 4.0** (non-commercial — already
recorded in `LICENSES.md`'s "researched" table; fine for this hobby
project).

The file is a flat `FeatureCollection` of 169 `Point` features, **not**
all part of the voyage route:

- **149 features are named `"#N = <place>"`** (e.g. `"#1 = Charles
  Darwin's Start - Plymouth"`, `"#148 = Falmouth"`) — these are the real,
  ordered voyage waypoints. Numbering has real gaps (e.g. no `#22`,
  `#40`, `#51`, `#58`–`#60`, and `#106` appears twice, once for "Maypu"
  and once for "Climbed the Andes Mountains") — sort by the numeric
  prefix, don't assume a contiguous 1..148 range or rely on the number
  count matching feature count.
- **20 features are unrelated "bonus content" markers** — links to the
  source book, thematic essay pages (e.g. "Difficulties in Theory:
  Organic beings..."), a "digitally walk this map in 3D" pin, a Charles
  Darwin Trust link. **Must be filtered out** — identify by the `"#N ="`
  name prefix (regex `^#\d+`) rather than any other field; there's no
  boolean flag distinguishing them.

Each real waypoint's `description` contains prose from *The Voyage of
the Beagle* with an embedded date, but **date formatting is inconsistent
and not simply comma-separated month/day/year** — confirmed by testing a
naive `Month Day, Year` regex against all 149 points: only 5/149 matched.
Real examples found: `"Plymouth, UK, December 27, 1831"` (the clean
case), `"On the 6th of January we reached Teneriffe"` (ordinal day, no
year), `"JULY 24th 1833"` (no comma), `"March 26th, 1835,"` (comma after
year-less ordinal), and many with no date in the visible excerpt at all.

## Design decisions

### One entry, one `path` location, category `event`

A voyage is fundamentally a journey/event, not a person/place — matches
this app's 9-category model better than any alternative. Title: "HMS
Beagle voyage (1831–1836)". Overall `startDate`/`endDate` use the
well-documented historical anchor dates (departed Plymouth 27 December
1831, returned to Falmouth 2 October 1836) rather than parsed values from
the two endpoint features — more reliable than trusting prose-text
extraction for the two dates that matter most.

### Date parsing: a tolerant regex + carry-forward heuristic, not per-point precision

Given the real inconsistency found above, the implementation needs a
regex broad enough to catch ordinal-day prose dates
(`\d{1,2}(st|nd|rd|th)?\s+(of\s+)?<Month>,?\s*(\d{4})?` roughly, case-
insensitive month names), plus a **running "current year" cursor**: when
a fragment includes an explicit year, update the cursor; when it doesn't
(most of the "6th of January" style fragments), apply the cursor's
current value. This is necessary because a large fraction of the prose
excerpts only restate month+day, relying on an earlier passage for the
year (true to how Darwin's own journal reads). Waypoints where no date
fragment can be found at all (a real minority, confirmed above) fall back
to linear interpolation between the nearest dated neighbors by sequence
position, with a correspondingly larger `uncertaintyYears`/month value on
those specific points rather than pretending false precision.

This is real, non-trivial text-parsing work — flagged honestly rather
than waved away as "light parsing" (the phrase used when this idea was
first scoped in `investigations/historical-boundary-journey-trade-data-sources.md`).
Budget real implementation time for it and verify against a sample
spanning the whole voyage, not just the clean first point.

### Per-waypoint `t` (fractional progress)

`PathLocation.waypoints[].t` (0–1 through the *entry's* overall time
span) should be computed from each waypoint's own extracted/interpolated
date relative to the fixed 1831-12-27..1836-10-02 span, not from its
plain index position — the voyage's pace was very uneven (weeks docked
at some ports, long open-ocean crossings between others), so index-based
spacing would misrepresent the timeline animation this field exists for.

### Citation

`citationUrl` → the ClimateViewer GeoJSON's own page
(`https://climateviewer.org/history-and-science/explorers/maps/charles-darwin-voyage-of-the-beagle-1832-1836/`),
`citationLabel` → `"ClimateViewer (MyReadingMapped)"`. Unlike Cliopatria,
this is a single whole-voyage record, not one-citation-per-fragment, so
no per-waypoint citation is needed — matches how `citationUrl`/`Label`
are already modeled as per-*entry*, not per-location.

## Affected files

- `db/fetch-beagle-voyage.mjs` (new) — fetch + filter + date-parse +
  transform script, same role as `db/fetch-cliopatria-mongol.mjs`.
- `web-client/public/data/beagle-voyage.json` (new, generated) — one
  entry.
- `db/seed.mjs` — load the new file (same pattern as
  `cliopatria-boundaries.json`, generalize the "extra JSON entry files"
  loading into a small list rather than one-off hardcoding a second file
  — see Cliopatria's version for the one-file precedent this extends).
- `LICENSES.md` — add ClimateViewer (CC BY-NC-SA 4.0) to "in active use."
- `TODO.md` — mark item 13 `COMPLETED` once implemented.

No schema, type, or UI changes needed — `citationUrl`/`citationLabel`
(TODO 12) and `path` rendering (`world-map.ts`'s `drawLocations`, already
implemented and used nowhere yet) both already exist.

## Verification (for implementation time)

1. Run the fetch script, confirm exactly 149 waypoints (not 169), sorted
   ascending by their `#N` prefix.
2. Spot-check date extraction across the *whole* range (not just the
   easy first point) — at minimum #1 (clean case), a mid-voyage point
   with an ordinal-no-year date, and a point requiring interpolation —
   print each waypoint's resolved date next to its raw description
   during a dry run and manually eyeball plausibility (monotonically
   non-decreasing dates end to end is a good automatic sanity check
   too — the voyage should never appear to travel backward in time).
3. Confirm builds stay clean, then `db/init-db.sh`, then a direct
   `/api/entries/by-ids` check confirming a `path` location with ~149
   ordered waypoints and correct `citationUrl`/`citationLabel`.
4. Visual check in a browser once one is available (same caveat as TODO
   12 — flag explicitly if skipped again rather than assumed).
