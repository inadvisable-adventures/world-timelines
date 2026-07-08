# Re-Run Ingester After Description Cleanup (TODO #31) — COMPLETED

## Summary

Re-run the ingester to pick up the description-cleanup fix (TODO #30) and replace
`web-client/public/data/collected_entries.tsv` with the new output.

## Implementation

1. Build ingester (`npm run build` in `ingester/`)
2. Run against the existing Wikipedia dump
3. Copy `ingester/collected_entries.tsv` → `web-client/public/data/collected_entries.tsv`
