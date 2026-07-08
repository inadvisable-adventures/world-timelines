# Implement TypeScript Types and Data Model

## Summary

Create `src/types/index.ts` with all shared TypeScript interfaces used across the main thread, components, and WebWorker.

## Affected Files

- `web-client/src/types/index.ts`

## Step-by-Step Implementation

1. Define `HistoricalEvent` interface matching the TSV schema.
2. Define `GeoBounds` interface for optional geo filtering.
3. Define `QueryRequest` and `InitRequest` (main → worker message types).
4. Define `QueryResponse` and `ReadyResponse` (worker → main message types).
5. Define `WorkerInMessage` and `WorkerOutMessage` discriminated union types.

## Key Design Decisions

- All types in one file so both the main-thread components and the worker can import from `../types/index.js` using a relative path.
- `startYear`/`endYear` are plain numbers; negative = BCE. No special BCE class needed for POC.
- Categories are a string literal union (`'person' | 'event' | 'place' | 'invention' | 'other'`) to allow exhaustive rendering switches.
