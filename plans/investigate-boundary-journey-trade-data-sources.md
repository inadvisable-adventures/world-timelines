# Investigate sources of historical boundary, journey, trade-route, and building-project data

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
