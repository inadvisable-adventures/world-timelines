# [COMPLETED] Implement Full Ingester (A1–A4 Resolved)

## Summary

Update the web-client types and components to support the new A2/A3 data model (multi-location events, denormalized dates, infobox type field), then implement the complete Wikipedia ingestion pipeline with seek-bzip, infobox discovery, denormalized date parsing, uncertainty LUT, and infobox catalog output.

## Affected Files

**web-client:**
- `src/types/index.ts` — new `EventLocation`, `EventDate`, updated `HistoricalEvent`
- `public/data/events.tsv` — updated to 16-column schema
- `src/worker/tsv-parser.ts` — parse new schema
- `src/worker/query-worker.ts` — no change needed (operates on typed events)
- `src/components/world-map.ts` — render all locations per event (point/polygon/circle)
- `src/components/timeline.ts` — use `startDate.startYear` instead of flat `startYear`

**ingester:**
- `src/types.ts` — updated with new types
- `package.json` — add `seek-bzip` runtime dependency
- `src/bz2-reader.ts` — seek-bzip integration for reading stream chunks
- `src/index-reader.ts` — parse multistream index, group articles by stream offset
- `src/xml-parser.ts` — extract `<title>` and `<text>` from XML chunk
- `src/infobox-parser.ts` — regex extraction of infobox type, coords, date fields
- `src/date-parser.ts` — normalize to `EventDate` with precision and calendar detection
- `src/uncertainty-lut.ts` — LUT-based uncertainty estimation
- `src/infobox-catalog.ts` — accumulate infobox types; output catalog TSV
- `src/tsv-writer.ts` — write 16-column event rows; write catalog rows
- `src/index.ts` — full pipeline orchestration

## Step-by-Step Implementation

1. **Update web-client types** (`src/types/index.ts`): add `EventLocation`, `EventDate`, update `HistoricalEvent` to use them; add helper functions `primaryLat(event)` and `primaryLng(event)`.
2. **Update events.tsv**: rewrite all 43 rows to 16-column schema with JSON locations, 6 date fields, calendar, uncertainty, and empty `infobox_type`.
3. **Update tsv-parser.ts**: parse new columns; deserialize `locations` JSON.
4. **Update world-map.ts**: use `locations` array; render all locations; use `primaryLat/Lng` helpers for tooltip positioning.
5. **Update timeline.ts**: use `event.startDate.startYear` and `event.endDate?.startYear ?? event.startDate.endYear` for positioning.
6. **Update ingester types**.
7. **Add seek-bzip** to ingester `package.json` and install.
8. **Implement bz2-reader.ts**: read raw bytes at offset from file, call `seekBzip.decode()`.
9. **Implement index-reader.ts**: decompress index bz2; parse lines; group by byte offset.
10. **Implement xml-parser.ts**: extract all `<page>` blocks from a decompressed chunk.
11. **Update infobox-parser.ts**: extract all infobox template names; extract coords; extract date field values.
12. **Implement date-parser.ts**: parse all common date formats; detect calendar; output `EventDate`.
13. **Implement uncertainty-lut.ts**: era × expression-style → uncertainty years.
14. **Implement infobox-catalog.ts**: accumulate counts; output catalog TSV on demand.
15. **Update tsv-writer.ts**: write 16-column events + separate catalog TSV to stderr (or a second file path).
16. **Update index.ts**: orchestrate full pipeline.
17. **Verify**: `npm run build` in both projects passes.

## Key Design Decisions

- `locations` is serialized as compact single-line JSON in the TSV column. No quoting needed since JSON characters do not include tabs.
- The ingester outputs event TSV to stdout and catalog TSV to a file path (second CLI argument).
- Infobox type is stored as-is (lowercased, spaces normalized) to avoid aliasing.
- The multistream bz2 requires knowing stream boundaries. The index gives start offsets; the next entry's offset gives the end. The last stream reads until EOF.
- seek-bzip's `decode(buffer)` API is used; we read specific byte ranges using `fs.readSync` at known offsets.

## Verification

- `npm run build` succeeds in web-client.
- `npm run build` succeeds in ingester.
- Open `public/index.html` via a local server; confirm map renders with new multi-location support. (Browser step — skipped.)
- Ingester: `node dist/index.js ../en_wiki_download/...bz2 ../en_wiki_download/...index.bz2` — not testable until download completes.
