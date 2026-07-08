# Re-Run Ingester After Date Fixes (TODO #23) — COMPLETED

## Summary

Re-run the ingester with the current config to produce a clean output that
incorporates the artifact date fix (TODO #16) and the end-date infobox-scope
fix (TODO #22). Replace `web-client/public/data/collected_entries.tsv` with
the new output.

## Affected Files

- `ingester/collected_entries.tsv` — replaced by fresh run
- `ingester/infobox-catalog.tsv` — regenerated
- `ingester/ingest_status.tsv` — regenerated
- `ingester/ingest_runs.json` — appended to
- `web-client/public/data/collected_entries.tsv` — replaced with new output

## Implementation

1. Build the ingester (`npm run build` in `ingester/`).
2. Run from the `ingester/` directory:
   ```
   node dist/index.js \
     ../en_wiki_download/enwiki-20260401-pages-articles-multistream.xml.bz2 \
     ../en_wiki_download/enwiki-20260401-pages-articles-multistream-index.txt.bz2
   ```
   Config: stride 100, stop after collecting 10 000 entries, exclude `other`,
   date before 2000 CE. Adaptive restart (up to 2 halving passes) fills in
   gaps if the first pass falls short.
3. Copy `ingester/collected_entries.tsv` →
   `web-client/public/data/collected_entries.tsv`.

## Verification

Check that the output file is non-empty and that spot-checking a few artifact
entries no longer shows implausible start/end dates.
