# Re-run the ingest with improved coordinate extraction (#63) — COMPLETED

## Result (2026-07-06)

Fresh full pass via `./ingest-ctl.sh supervise` (no restarts needed), offset
cache hit for instant startup. Completed 255,166/255,166 streams.

- collected: **860,514** (considered 1,725,025, rejected 864,511)
- with-coords: **63,453** → hit rate **7.37%** (baseline 7.36%; effectively flat)
- by category: person 757,372 · place 48,194 · artifact 33,559 · event 21,034 ·
  pol_mil_organization 352 · concepts 3

The fresh pass is also more complete than the earlier stitched resume run
(considered +13k, collected +884), having closed the kill-boundary gap. The
coordinate-extraction improvement itself is negligible in production, confirming
that meaningfully higher recall needs Wikidata/gazetteer resolution
(`PARKINGLOT.md`). Output: `ingester/collected_entries.tsv` (gitignored).

## Summary

After #62 improves `extractLocations`, re-run the full ingest so the output
reflects the better coordinate hit rate, using the same supervisor workflow.

## Approach

1. Rebuild the ingester (`npm run build`).
2. Start fresh (not `--resume`): the improved extractor changes prior rows, so the
   existing partial/checkpoint must not be reused. Remove/relocate the old
   `collected_entries.tsv.partial` and let the run start from stream 0. The
   offset cache (#57) makes startup instant; the stride-aware checkpoint (#58)
   keeps it resumable if interrupted.
3. `./ingest-ctl.sh supervise` to run to completion with auto-restart.
4. On completion, report the new coordinate hit rate (with-coords / total) and
   the category breakdown, comparing against the pre-#62 baseline
   (63,287 / 859,658 ≈ 7%).

## Key Decisions

- **Fresh run, not resume** — resuming would leave the already-processed ~86%
  of streams with the old extraction. A clean pass re-extracts everything.
- Config is unchanged from the last run (catalog_input with 43 infobox types,
  stride 1, `date_before 2000`, `exclude_category other`).

## Verification

- Supervisor reports COMPLETE; partial promoted to `collected_entries.tsv`.
- Coordinate hit rate is reported and compared to the 7% baseline.
