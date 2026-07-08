# Allow Location-less Entries and Add Tags Column (TODO #43)

## Summary

Remove the filter that rejects ingester entries with no detected spatial component.
Add a `tags` column (JSON string array) to the output schema and tag any collected
entry with no locations as `["no-coords-found"]`. Update the web client to parse
the new column and allow empty location arrays through.

## Affected Files

- `ingester/src/types.ts` — add `tags: string[]` to `ExtractedEvent`
- `ingester/src/tsv-writer.ts` — add `tags` to header and row serialization
- `ingester/src/index.ts` — remove `locations.length === 0` reject; populate `tags`
- `web-client/src/types/index.ts` — add `tags?: string[]` to `HistoricalEvent`
- `web-client/src/worker/tsv-parser.ts` — parse `tags` col; allow empty locations

## Implementation

### ingester/src/types.ts
Add `tags: string[]` to `ExtractedEvent`.

### ingester/src/tsv-writer.ts
- Append `'tags'` to `TSV_HEADER` array.
- In `tsvRow`, append `JSON.stringify(ev.tags)` as the last field.

### ingester/src/index.ts
- Remove the `if (locations.length === 0) { counts.rejected++; continue; }` block.
- Populate `tags: locations.length === 0 ? ['no-coords-found'] : []` on the event object.

### web-client/src/types/index.ts
Add `tags?: string[]` to `HistoricalEvent` (optional for backward compat with old TSV files).

### web-client/src/worker/tsv-parser.ts
- Remove `|| locations.length === 0` from the guard that skips empty-location rows.
- Parse `cols[16]` as `tags` (JSON array); default to `[]` if absent or unparseable.
- Pass `tags` into the pushed `HistoricalEvent`.

## Notes

- The minimum column count check stays at `< 16`; `tags` at index 16 is optional.
- Entries with no locations are invisible on the map (empty `locations` array → no draw calls) but appear on the timeline, which is correct.
- The worker's `lat`/`lng` DSL filters already return false when `primaryLat`/`primaryLng` is null, so no-location entries are correctly excluded by geo filters.
