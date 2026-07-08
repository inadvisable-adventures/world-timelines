# Improve coordinate extraction hit rate (#62) — COMPLETED

## Summary

Only 63,287 of 859,658 ingested entries (~7%) have coordinates; 796,371 carry
`no-coords-found`. The current `extractLocations` (`infobox-parser.ts`) handles
only three patterns: `{{coord|…}}`, `|lat_deg=/|lon_deg=` (DMS), and
`|latitude=/|longitude=` (decimal). Investigate a sample of no-coords entries by
pulling their wikitext from the dump, identify coordinate signals we miss, and
extend the extractor to raise the hit rate — without inventing inaccurate points.

## Affected Files

- `ingester/src/coord-sample.ts` — new: batch tool to sample no-coords titles and
  dump their wikitext + a heuristic report of coordinate-bearing markup
- `ingester/src/infobox-parser.ts` — extend `extractLocations`
- `ingester/package.json` — add a `coord-sample` script
- `design-docs/poc-design.md` — document new coordinate sources

## Investigation method

1. From `collected_entries.includes-no-coords-found.tsv`, sample titles across
   categories (person / place / event / artifact) that have `no-coords-found`.
2. For each, fetch wikitext from the dump. To avoid paying the ~25s index decode
   per title, `coord-sample.ts` reads the multistream index **once** (via the
   existing `readMultistreamIndex`), then decompresses each title's stream and
   prints: the title, its infobox types, and every line matching a broad
   coordinate/map heuristic (`coord`, `lat`, `lon`, `latd`, `location`,
   `map`, `.svg`, `{{Location map`, `geo`).
3. Categorize the misses: which are genuinely coordinate-free (e.g. a person with
   only a birthplace *name*), which have machine-readable coordinates in markup we
   don't parse yet, and which reference locator-map SVGs.
4. For SVG locator maps that recur, inspect a few (from the dump if present, else
   fetch the file description page from Wikipedia via WebFetch) to confirm whether
   they carry usable positioning data. Wikipedia locator maps position a pin via
   the `{{Location map}}` template's numeric `lat/long` args, **not** the SVG
   itself — so the extractable signal is the template, and the SVG review
   confirms we are not missing embedded geodata.

## Candidate extraction additions (validated against the sample before adding)

Add only patterns that yield accurate points on real articles:

- **`{{Location map}}` / `{{Location map+}}` family** — parse `|lat_deg=`,
  `|lon_deg=` (with min/sec/dir) and `|coordinates=`/`|coord=` args, and the
  `mark`/`label` positional forms that embed `{{coord}}`.
- **`|coordinates = {{coord|…}}` inside infoboxes** — already caught by the
  global `{{coord}}` scan; confirm and keep.
- **DMS/decimal field-name variants** we currently miss: `|latd=/|longd=`
  (with `|latm=|lats=|latNS=` / `|longm=|longs=|longEW=`), `|lat=/|long=` and
  `|lat=/|lon=` plain-decimal pairs, `|lat_d=/|lon_d=`.
- **`{{coord}}` display variants** already global; ensure `display=`/`format=`
  args don't break `parseCoordArgs`.

Person birthplace/deathplace *names* require geocoding (a name→point lookup)
which needs a gazetteer or network service; that is out of scope here and noted
as a follow-up in `PARKINGLOT.md` if the sample shows it dominates.

## Key Decisions

- **Accuracy over recall** — never emit a point we cannot derive from explicit
  markup. A wrong pin is worse than `no-coords-found`.
- **Sample-driven** — only ship extraction for patterns actually observed to be
  common and safe in the sampled wikitext; record the before/after hit-rate
  estimate from re-running `coord-sample` on the same sample.

## Verification

- `coord-sample` produces a readable report; note the observed pattern frequencies.
- New `extractLocations` unit-checks: feed captured wikitext snippets (from the
  sample) through it and confirm correct points, no regressions on the existing
  three patterns.
- Re-run `coord-sample` on the same title list and report the improved
  fraction that now yields coordinates.

## Status — COMPLETED (2026-07-06)

Investigation via `coord-sample` (sampled 855 no-coords articles across
categories) findings:

| signal | freq | extractable? |
|---|---|---|
| `{{coord …}}` present | 19.2% | **No** — almost all `{{coord missing\|Country}}` maintenance tags or empty `{{coord\|display=t}}` skeletons |
| `\|coordinates=` field | 25.7% | **Mostly no** — empty, or `{{… wikidata\|coordinates}}` (Wikidata-sourced), or empty `{{coord}}` |
| `geo-microformat` (`{{Geographic Location}}`) | 14.4% | **No** — a neighbor-places navigation compass, not coordinate data |
| `map-image/svg` | 4.7% | **No** — static "X highlighted in Y" locator SVGs; confirmed via Commons that they carry no embedded geodata |
| `{{#invoke:Coordinates\|coord\|…}}` | rare | **Yes** — Lua-module form of `{{coord}}`, added |
| `{{Location map…\|lat=\|long=}}` | ~0.4% | **Yes** — added |
| NONE (no coord markup) | 62.7% | **No** — mostly persons/events with only place names |

**Implemented** (accuracy-preserving): `extractLocations` now also parses
`{{#invoke:Coordinates|coord|…}}` (reusing `parseCoordArgs`) and decimal
`lat`/`long` inside `{{Location map…}}` templates. Unit-tested (8 cases incl.
negative cases for `coord missing`/empty/Wikidata).

**Actual full-run result (#63): negligible.** The 855-article sample suggested
~0.5% recovery, but that rested on only 4 hits (high small-count variance). The
clean fresh re-ingest measured the true effect: with-coords went 63,287 → 63,453
and the overall hit rate 7.36% → 7.37% — effectively flat. (Part of even that
delta is the fresh pass closing a kill-boundary gap in the earlier stitched
resume run, which also lifted `considered` by ~13k.) The new patterns are
genuinely rarer in the corpus than the small sample implied.

**Conclusion:** the existing extractor already captures nearly all
wikitext-embedded coordinates, and squeezing more from wikitext yields only a
few hundred entries. The dominant no-coords causes are structurally
non-extractable from article text (Wikidata-backed, maintenance tags, empty
skeletons, place names). Materially higher recall requires Wikidata (P625) or
gazetteer/geocoding resolution — recorded in `PARKINGLOT.md` as the concrete
next step. New tool `coord-sample` (`npm run coord-sample`) is kept for future
coordinate-source investigations.
