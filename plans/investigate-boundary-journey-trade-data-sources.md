# Investigate sources of historical boundary, journey, trade-route, and building-project data — COMPLETED

## Result (2026-07-19)

Completed as a pure research/write-up pass, per the plan below — no code
or dependencies were added. Four parallel research passes (one per
category) fetched and verified real, currently-accessible datasets rather
than relying on memory. Full findings, per-source license/format/fit
tables, and citations are in
`investigations/historical-boundary-journey-trade-data-sources.md`.

Headline results:

- **Boundaries**: strong fit found — **Cliopatria** (Seshat Global History
  Databank), a single CC BY 4.0 GeoJSON with explicit `FromYear`/`ToYear`
  fields spanning 3400 BCE–2024 CE, maps directly onto the app's existing
  `polygon`/`multipolygon` model.
- **Trade routes**: strong fit found — **Itiner-e**, a peer-reviewed 2025
  Roman road network (14,769 segments, CC BY 4.0, actively maintained);
  **OWTRAD** (Ciolek/ANU) is the only source found with real coordinate
  data for the Silk Road/trans-Saharan routes specifically, but is
  non-commercial-licensed and unmaintained since ~2007–2012.
- **Journeys**: patchwork — a ready-to-use **HMS Beagle voyage GeoJSON**
  (ClimateViewer, CC BY-NC-SA 4.0) is the strongest single hit, but
  **no structured dataset exists at all** for the Polynesian/Austronesian
  migration the user specifically named — an honest negative finding;
  that example would need to be hand-built from settlement-date
  literature rather than imported.
- **Building projects**: **OpenStreetMap via Overpass** (keyed off
  Wikidata's `P402` property) is the best general-purpose source —
  verified the Great Wall of China's OSM relation (318110, 6,130 way
  members, actively edited) and Hadrian's Wall's dedicated WHS boundary
  relation. None of the geometry sources across any category carry
  construction-phase/date metadata — that would need to be this app's own
  hand-curated event data layered on top.
- **Cross-cutting finding**: across all four categories, Wikidata itself
  is consistently a good *index* into other geometry sources (via `P402`
  for OSM relations, `P3896` for Commons geoshapes) but never a reliable
  geometry source on its own — `P625` is always a single representative
  point, never a path or polygon, for anything linear or large. This
  echoes what TODO items 6–10 already found for point coordinates.

A concrete first implementation slice was identified (Cliopatria for one
empire + the Beagle voyage GeoJSON + the Great Wall's OSM relation, three
different source types as separate proofs of concept) but was **not**
turned into a new TODO item per this project's process — it's recorded in
`PARKINGLOT.md` instead, to be moved to `TODO.md` when the user is ready
to act on it.

The corresponding brainstorm item in `PARKINGLOT.md` (about rich map
representations lacking a data source) was removed, replaced by the new,
more concrete parking-lot entry described above.

## Summary

TODO item 11 (and the related brainstorm parked in `PARKINGLOT.md` under
"The data model now supports rich map representations...") asks: where
could this project source real geographic data for four kinds of
historical phenomena that Wikipedia infoboxes / the current Wikidata
QLever queries don't meaningfully supply?

1. **Political/territorial boundaries over time** — e.g. the extent of an
   empire at various years (maps to the data model's `polygon`/
   `multipolygon` location shapes).
2. **Historical journeys** — e.g. the spread of South Pacific Island
   cultures across the Pacific, pilgrimage routes, famous scientific
   voyages (maps to `path`, with its optional `t` fractional-progress
   field for time-correlated animation).
3. **Trade routes** — e.g. the Silk Road (also `path`).
4. **Large building projects** — e.g. the Great Wall, Hadrian's Wall
   (likely `path` for wall-like linear structures, `polygon`/
   `multipolygon` for area-like ones, e.g. a canal network or a city's
   walls).

This is a research/write-up task, not a code change: the data model
(`design-docs/poc-design.md`'s `Location` union) already has shapes that
could hold this data; what's missing is knowing which real-world datasets
could feed them, in what format, under what license, and how good a fit
each is for this project's existing ingestion conventions (bespoke
scripts, no heavyweight GIS dependencies, prefers openly-licensed/no-auth
sources it can shell out to or fetch directly, as established by the
QLever/Postgres/bzip2-CLI precedents).

## Approach

Research each of the four categories independently (their candidate
datasets barely overlap, except that OpenHistoricalMap and Wikidata
plausibly touch more than one). For each category, identify candidate
datasets/projects and record, per candidate:

- What it actually contains and its rough time/geographic coverage.
- Data format and access method (downloadable file, API, scrape-only).
- License/reuse terms.
- Whether it's actively maintained or a frozen/archival project.
- A fit assessment against this project's existing conventions and data
  model shapes.

No new code, dependencies, or ingestion pipeline gets built as part of
this TODO item — that would be significant new work warranting its own
TODO item(s) and plan(s), scoped only once a concrete data source is
picked. This item's job is to produce that shortlist plus a
recommendation of what to try first.

## Affected files

- `investigations/historical-boundary-journey-trade-data-sources.md`
  (new) — the write-up.
- `PARKINGLOT.md` — remove the now-addressed brainstorm item (its
  question is answered by the new investigation doc; any concrete
  follow-on ideas surfaced by the research get their own new parking-lot
  entries or TODO items instead of leaving the original vague item in
  place).
- `TODO.md` — mark item 11 `COMPLETED`.

## Verification

Not applicable in the usual "run it and check the output" sense, since
this produces a document rather than running code. Verification here
means: every dataset claim in the write-up should be checked against a
live fetch of the source's own site (not asserted from training-data
memory alone), since project sizes/URLs/licensing for this kind of
niche GIS data churn and are exactly the sort of thing that's often
stale, dead, or renamed.
