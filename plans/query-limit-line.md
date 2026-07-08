# Query Limit Line (TODO #19) — COMPLETED

## Summary

The maximum number of results returned by a query is currently hardcoded to 100 in the query worker. It should instead be controlled by a `limit N` line in the query DSL, making it visible and adjustable in the query editor.

## Affected Files

- `web-client/src/worker/dsl-parser.ts` — parse `limit N` line into query IR
- `web-client/src/worker/query-worker.ts` — apply `limit` from parsed query instead of hardcoded value
- `web-client/index.html` — update the default/placeholder query text to include a `limit` line

## Implementation

1. In `dsl-parser.ts`, add a `limit` field to the parsed query object (default `100`). Parse lines matching `/^limit\s+(\d+)$/i` and set the limit.
2. In `query-worker.ts`, replace the hardcoded `100` (or `slice(0, 100)`) with `query.limit`.
3. In `index.html`, add `limit 100` to the default query text shown in the query editor so users see it immediately.

## Verification

Build with `npm run build`. Confirm `limit 50` in the query returns at most 50 results.
