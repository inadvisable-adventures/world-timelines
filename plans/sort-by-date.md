# Sort Results by Date (TODO #29) — COMPLETED

## Summary

Query results are returned in TSV file order (effectively random). Add a `sort` DSL
directive so users can get results chronologically. This is especially useful when the
limit is active: `sort date asc` with `limit 100` gives the 100 oldest entries in the
time range rather than 100 arbitrary ones.

## DSL Syntax

```
sort date asc
sort date desc
```

Default (no sort line): original TSV order (unchanged behavior).

## Affected Files

- `web-client/src/worker/dsl-parser.ts` — parse `sort date asc/desc`; add `sort` field
  to `ParsedQuery`
- `web-client/src/worker/query-worker.ts` — apply sort after filter, before slice
- `web-client/src/components/query-editor.ts` — add `sort date asc` example to PLACEHOLDER
- `web-client/src/components/app-root.ts` — no change needed (sort is inside parseDsl result)

## Implementation

### `dsl-parser.ts`

Add `sort: 'date-asc' | 'date-desc' | null` to `ParsedQuery`.

Parse lines matching `/^sort\s+date\s+(asc|desc)$/i`.

### `query-worker.ts`

After filtering, if `sort === 'date-asc'`:
  `.sort((a, b) => a.startDate.startYear - b.startDate.startYear)`
If `sort === 'date-desc'`:
  `.sort((a, b) => b.startDate.startYear - a.startDate.startYear)`
Then `.slice(0, limit)`.

## Verification

Type `sort date asc` in the query editor. The displayed entries should be the oldest
ones visible in the current time range.
