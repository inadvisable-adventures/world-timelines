# Implement WebWorker Query Engine

## Summary

Build the WebWorker that loads TSV data at startup and handles query requests from the main thread, returning filtered `HistoricalEvent` arrays.

## Affected Files

- `web-client/src/worker/tsv-parser.ts`
- `web-client/src/worker/query-worker.ts`

## Step-by-Step Implementation

1. **`tsv-parser.ts`**: Export `parseTsv(text: string): HistoricalEvent[]`.
   - Split on `\n`, skip header row.
   - Split each row on `\t`, parse numeric fields, handle escaped `\t`/`\n`.
   - Skip malformed rows silently.

2. **`query-worker.ts`**: WebWorker entry point.
   - On `init` message: `fetch(dataUrl)` → parse TSV → store in module-level array → post `ready` message.
   - On `query` message:
     - Filter by `timeRange`: keep events where `event.startYear <= endYear && event.endYear >= startYear`.
     - If `bounds` is non-null, also filter by lat/lng within bounds.
     - Post `results` message with matching events.

## Key Design Decisions

- Worker uses `self.addEventListener('message', ...)` pattern (not `onmessage =`) for clarity.
- All events are kept in memory after init; re-filtering per query is O(n) and fast enough for POC scale.
- The worker is compiled with `tsconfig.worker.json` which sets `lib: ["WebWorker", "ES2022"]` (no DOM types).

## Verification

- After build, confirm `public/worker.js` exists.
- Unit-testable: `parseTsv` can be imported and called directly in a test script if needed.
