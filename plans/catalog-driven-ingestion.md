# Catalog-Driven Ingestion (TODO #17) — COMPLETED

## Summary

The ingester currently uses a hardcoded `DEFAULT_INCLUDE_TYPES` set to decide which infobox types to collect. The catalog file has an `include_in_future` column (0/1) that was intended to let users control inclusion by editing the catalog between runs, but this column is never read back — it is output-only. This means users cannot exclude infobox types like `ship` even if they set `include_in_future=0` in the catalog.

## Affected Files

- `ingester/src/ingest-config.ts` — add `catalogInput: string | null`
- `ingester/src/ingest-config.ts` — parse `catalog_input` key
- `ingester/src/index.ts` — if `catalog_input` is set, build include set from catalog; otherwise fall back to `DEFAULT_INCLUDE_TYPES`
- `ingester/ingest.config.tsv` — add commented `catalog_input` example

## Implementation

1. Add `catalogInput: string | null` to `IngestConfig` (default `null`).
2. Parse `catalog_input<TAB>path` in `parseIngestConfig`.
3. In `index.ts`, after loading config, if `config.catalogInput` is set, read the catalog TSV and build an include set from rows where `include_in_future` column is `1`. Use this set in place of `DEFAULT_INCLUDE_TYPES` throughout the main loop (`wasIncluded`, `primaryType` lookups).
4. Add a commented `# catalog_input	infobox-catalog.tsv` line to `ingest.config.tsv`.

## Design Notes

- If `catalog_input` is not set, behaviour is identical to before.
- If the catalog file is missing or malformed, warn and fall back to `DEFAULT_INCLUDE_TYPES`.
- The `include_in_future` column is the user-editable flag; `was_included` is historical and not used for filtering.

## Verification

Build with `npm run build`. Set `catalog_input` to the catalog file with `ship` rows set to `include_in_future=0` and confirm ship articles are no longer collected.
