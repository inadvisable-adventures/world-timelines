# Re-Run Ingester After Depth-Aware Field Fix (TODO #25) — COMPLETED

## Summary

Re-run the ingester to pick up the depth-aware field extraction fix (TODO #24),
which prevents inline citation templates like `{{cite web|date=2022}}` from
producing spurious end dates. Replace `web-client/public/data/collected_entries.tsv`
with the new output.

## Affected Files

- `ingester/collected_entries.tsv` — replaced by fresh run
- `ingester/infobox-catalog.tsv` — regenerated
- `ingester/ingest_status.tsv` — regenerated
- `ingester/ingest_runs.json` — appended to
- `web-client/public/data/collected_entries.tsv` — replaced with new output

## Implementation

1. Build the ingester (`npm run build` in `ingester/`).
2. Run from the `ingester/` directory against the existing dump.
3. Copy `ingester/collected_entries.tsv` → `web-client/public/data/collected_entries.tsv`.

## Verification

Spot-check artifact entries — ships like Japanese destroyer Ayanami (1929) should
no longer show 2022 as an end year.
