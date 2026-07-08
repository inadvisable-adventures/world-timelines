# Timeline geographic lanes (#65) — COMPLETED

## Result (2026-07-06)

Implemented across 7 phases; all commits build and the app was driven end-to-end
in headless Chrome (CDP). Verified: the timeline renders geographic lane bands
with sticky titles + collapse; entries are assigned to the correct lane by
point-in-polygon (18 city/ocean cases across all 4 lanesets pass) and packed
vertically with brighter borders; eras render as lane children with dotted
separators + view-centered labels and map to the right lane per laneset
(Egyptian→Africa/Nile, Roman→Europe, Chinese→Asia/Yellow River, Peru→South
America/Andean); the DSL `laneset` line and the sidebar picker stay in sync and
switching re-lays out the lanes; the Global lane + "global eras" toggle work; the
world-history era set was trimmed to a clean non-overlapping sequence.

Deviations from the original plan, all reasonable:
- **Entry→lane assignment runs in the timeline**, not the worker: the worker
  already caps results at the DSL limit (≤100), so point-in-polygon on that small
  set is trivial and avoids shipping laneset geometry into the worker.
- **Ocean lanes** are coarse lat/lng rectangles (conventional ocean cuts are
  meridian/parallel anyway); their map outline is a rectangle. Fine for the POC.
- **Continent/region outlines** are grouped country polygons (not dissolved), so
  a selected lane's outline shows internal country borders — acceptable; a true
  dissolve is a future refinement.

## Summary

Replace the current two-part timeline (a separate events body on top + collapsible
per-source era panel on the bottom) with a single stack of **geographic lanes**.
A *laneset* partitions Earth's surface by some criterion; each *lane* is one
region of that partition. The active laneset is chosen in the query DSL
(`laneset <name>` / `laneset none`) and via a selector in the sidebar. Historical
eras and entry markers both become children of the lane whose geometry contains
them. Lanes, lanesets, and their descriptions are new selectable objects
(sidebar detail + map outline).

This is a big, multi-component feature; implement in the phases below.

## Affected Files

- `web-client/public/data/lanesets.json` — **new** data file (lanesets + lane geometry)
- `web-client/src/types/index.ts` — `Laneset`, `Lane` types; DSL/worker message additions
- `web-client/src/worker/dsl-parser.ts` — parse `laneset <name>`
- `web-client/src/worker/query-worker.ts` — assign entries to lanes (point-in-polygon); echo active laneset + per-entry lane id
- `web-client/src/components/timeline.ts` — the large rework (lanes, eras-in-lanes, entries-in-lanes, sticky titles, collapse)
- `web-client/src/components/world-map.ts` — outline the selected lane/laneset geometry
- `web-client/src/components/entry-detail.ts` (or a sibling) — show selected lane/laneset name + description
- `web-client/src/components/laneset-picker.ts` — **new** selector UX below the category picker
- `web-client/src/components/app-root.ts` — load lanesets, wire selection/DSL/state
- `web-client/public/index.html` — templates for the new/changed components
- `design-docs/poc-design.md` — document lanes model + DSL

## Data model

### `lanesets.json`

```jsonc
{
  "lanesets": [
    {
      "id": "continents",
      "name": "Traditional Continents & Oceans",
      "description": "Earth divided into the seven traditional continents (Europe and Asia counted separately) plus the major oceans.",
      "lanes": [
        {
          "id": "europe",
          "name": "Europe",
          "description": "The continent bounded by the Atlantic, the Arctic, the Urals, the Caucasus, and the Mediterranean.",
          "geometry": { "type": "MultiPolygon", "coordinates": [ /* [lng,lat] rings */ ] }
        }
        // … more lanes; lanes should tile the whole globe with minimal gaps/overlap
      ]
    }
    // … more lanesets
  ]
}
```

- Geometry is GeoJSON `MultiPolygon` in `[lng,lat]`, consistent with `world-110m.geojson`.
- Lanes within a laneset should tile Earth's surface (land + ocean) so every entry
  lands in exactly one lane; a small residual "Unassigned" lane catches gaps.

### Types (`types/index.ts`)

```typescript
export interface Lane { id: string; name: string; description: string; geometry: GeoJsonMultiPolygon; }
export interface Laneset { id: string; name: string; description: string; lanes: Lane[]; }
```

## DSL: `laneset`

- Grammar: a line `laneset <id>` (or `laneset none`). Parsed in `dsl-parser.ts`;
  `ParsedQuery` gains `laneset: string | null` (`'none'` → no lanes shown; absent
  → default laneset).
- Bidirectional with the sidebar selector (see below), exactly like categories:
  choosing in the UI rewrites/updates the `laneset` line; editing the line updates
  the selector.
- The worker echoes the resolved laneset id back so `app-root` can drive the
  timeline; entry→lane assignment (below) is computed against that laneset.

## Entry → lane assignment (worker)

- In `query-worker.ts`, after loading `lanesets.json` (passed in at init or fetched),
  compute each result entry's lane id by **point-in-polygon** of its primary
  coordinate against the active laneset's lane geometries. Bespoke ray-casting
  (no deps), with a per-lane bounding-box prefilter for speed over ~56k entries.
- Attach `laneId` to each returned entry (new optional field on the result shape).
- Entries with no coordinate → no lane (our current dataset is 100% coordinates,
  so this is rare/none).

## Timeline rework (the core)

Remove the separate events body, density histogram, and per-source era panel
(`ERA_SOURCE_*`, `EraSection`, `computeEraSections`, `drawEras`, `drawDensity`).
New layout: a vertical stack of lane bands for the active laneset.

Per lane (top → bottom in a stable laneset order):
- **Lane band**: a very dark color box spanning the full timeline width and the
  lane's vertical extent. Dark enough that entries/eras read against it.
- **Sticky title**: the lane's display name pinned to the **left edge of the
  timeline viewport** (screen-left), not the content — it stays put while the user
  pans time. Clicking the title selects the lane; a collapse chevron toggles it.
- **Collapse**: collapsed → only the title row; expanded → full band with eras +
  entries.
- **Eras (children of the lane)**: the historical periods belonging to this lane,
  drawn as a horizontal sequence separated by **dotted vertical lines**, each with
  a **view-centered label** (label positioned at the center of the currently
  visible portion of the era). Overlap rule: if two eras overlap, list both; if
  that is visually crowded (labels would collide), show only the **latest-ending**
  era in the overlap region.
- **Entries (children of the lane)**: entry markers placed **vertically within the
  lane band** via greedy packing (reusing the old lane-packing logic, now scoped
  per geographic lane). Circles and duration shaded regions must have a **border
  color brighter than their fill** (invert the current `fill + dark stroke`).

Era → lane mapping: historical eras currently carry a `source` (e.g.
`china-history`, `rome-history`, `world-history`). Assign each era to a lane by a
representative region/point per source, resolved through the active laneset's
geometry (e.g. `rome-history` → Europe under the continents laneset).

**Global eras (`world-history`)** — RESOLVED: render them in a dedicated
**"Global" lane pinned to the top** of every geographic laneset, **collapsed by
default**. Its visibility is toggled by a **synthetic "Global Eras" category**
button in the category picker (see below) rather than being always-on. Its map
outline is the whole globe.

**Trim the global era set** so the global eras form a clean, **non-overlapping**
sequence: curate `world-history`-tagged rows in the era data, removing
region-specific or overlapping spans (e.g. Genghis Khan / Mongol expansion, which
belongs to a region, not a global backdrop). This is a data-curation subtask on
`web-client/public/data/historical_eras.tsv` (and the `ingester/` source TSVs it
is merged from).

## Map, selection, sidebar

- **Selectable lanes/lanesets**: clicking a lane title (timeline) or a laneset
  header selects it. Selection shows the object's **name + description** in the
  side panel (extend `entry-detail`, or a parallel `detail` panel), and **outlines
  its geometry on the map** (`world-map.ts` draws the selected lane/laneset
  polygon boundary prominently). Selection is **mutually exclusive** with entry
  selection: selecting a lane clears any selected entry and vice versa, so there
  is a single detail panel and one active selection at a time.

- **Laneset selector UX** (`laneset-picker.ts`): sits **below the category picker**
  in the sidebar. Renders only the currently-selected laneset's name; on click,
  pops up a pick-list of all lanesets plus **None**. Selecting updates the DSL
  `laneset` line and the timeline. Follows the category-picker's visual idiom.

- **Synthetic "Global Eras" category**: add a special toggle to the category
  picker (alongside the real categories) that shows/hides the top "Global" lane.
  It is not a real `EventCategory` — it gates the global era lane's visibility
  only. Default: off (lane hidden/collapsed).

## Initial lanesets (author with judgement + searches for shape data)

Shape data derives from Natural Earth (the map already uses
`ne_110m_admin_0_countries` as `world-110m.geojson`); dissolve admin-0 polygons by
the relevant attribute and add ocean polygons (`ne_110m_ocean`, split into named
oceans by meridian/parallel cuts). Simplify to keep the file lean. Web searches as
needed for named-region boundaries and ocean extents.

**Ocean granularity — RESOLVED: match the laneset's granularity.** Coarse
lanesets get a single "Oceans" lane; the fine "global regions" laneset gets the
five named oceans (Atlantic, Pacific, Indian, Arctic, Southern). Specifically:

1. **Traditional continents & oceans** — Africa, Antarctica, Asia, Europe (split
   from Asia at the Urals/Caucasus/Bosphorus), North America, South America,
   Oceania/Australia; **five named oceans** (Atlantic, Pacific, Indian, Arctic,
   Southern) — medium granularity on both land and water.
2. **Landmasses & oceans** — Eurasia, Africa, The Americas, Antarctica, Australia
   (+ major islands grouping); a **single "Oceans" lane** (coarsest).
3. **Global regions** — finer partition: Western/Central/Eastern/Northern/Southern
   Europe, East/Southeast/South/Central/Western Asia, Northern/Sub-Saharan Africa,
   North/Central/South America, Oceania, etc. (Natural Earth `SUBREGION`/`REGION_UN`
   is a good basis); **five named oceans** (finest).
4. **Cradles of civilization** — a *thematic* partition: one lane per traditional
   cradle plus a single **"Outside the cradles"** catch-all covering all other land
   and water. Cradle lanes (verify the canonical set via search during
   implementation; the commonly-cited six): Mesopotamia (Fertile Crescent,
   Tigris–Euphrates), Ancient Egypt (Nile Valley), Indus Valley, Ancient China
   (Yellow River basin), Mesoamerica, and Andean South America (Norte Chico /
   Caral–Supe). Each cradle lane's description names its river system / heartland
   and rough dates. Geometry here is **custom** (approximate bounding polygons
   around each heartland — not a Natural Earth dissolve), sourced via search for
   each cradle's extent; the catch-all is the complement. No separate ocean lanes
   (water falls into "Outside the cradles").

Each laneset gets a `description` naming its division criterion; each lane gets a
`name` + `description`.

## Suggested phasing

1. Data + types: `lanesets.json` (start with the continents laneset), `Lane`/`Laneset` types, loader in `app-root`.
2. DSL `laneset` + sidebar `laneset-picker` (bidirectional), default laneset.
3. Timeline rework: lane bands + sticky titles + collapse; move entries into lanes; brighter borders; remove old body/era panel/density.
4. Eras as lane children (dotted separators, view-centered labels, overlap rule) + era→lane mapping.
5. Worker point-in-polygon entry→lane assignment.
6. Selection: lane/laneset detail in sidebar + map outline.
7. Author the remaining lanesets (landmasses, global regions, cradles of civilization).

## Key decisions

- **Lanesets partition the globe** so every coordinate-bearing entry maps to exactly one lane; a residual "Unassigned" lane absorbs gaps.
- **Reuse Natural Earth** (already vendored) as the shape source; dissolve + simplify rather than adding a dependency.
- **Sticky titles pin to the viewport**, not the timeline content, so they survive horizontal panning.
- Keep geometry **simplified** — several lanesets of full-resolution polygons would bloat the payload; target coarse boundaries sufficient for lane assignment + map outline.

## Open questions

- **RESOLVED — global eras:** top "Global" lane, collapsed by default, toggled by
  a synthetic "Global Eras" category button; trim the `world-history` era set to a
  non-overlapping sequence (drop region-specific spans like Genghis Khan).
- **RESOLVED — selection:** mutually exclusive (lane vs entry); one active selection, one detail panel.
- **RESOLVED — oceans:** granularity matches the laneset — landmasses get one "Oceans" lane; continents and global-regions get the five named oceans.
- Point-in-polygon cost — RESOLVED (implementer's call): precompute each entry's
  lane id at load with a per-lane bbox prefilter; recompute only when the active
  laneset changes.

## Verification

- `npm run build` passes.
- DSL `laneset continents` shows continent lane bands; `laneset none` hides lanes; the sidebar selector reflects and drives it.
- Entries appear inside the correct lane (spot-check a few by coordinate); circles/regions have brighter borders than fills.
- Eras render as dotted-separated, view-centered labels within their lane; overlap rule behaves.
- Selecting a lane/laneset shows its name+description in the side panel and outlines it on the map.
- Lanes collapse/expand; titles stay pinned to the viewport left while panning.
- (Browser-dependent verification steps will be noted as skipped if the browser can't be launched here.)
