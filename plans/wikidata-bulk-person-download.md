# Bulk-download `person` records into a Postgres document collection

## Status (2026-07-16): pipeline built and validated; full run awaiting go-ahead

`db/schema.sql` (two new tables) applied; `db/fetch-wikidata-persons.mjs`
written and validated end-to-end against a small, cheap slice
(`--year-min 1500 --year-max 1520`): 4,421 real records fetched, correctly
deduplicated (see bug below), and bulk-loaded via `\copy`; re-running
confirmed resumability (the completed chunk is skipped, no re-fetch). That
validation data (4,421 real 1500–1520 records) is legitimate output and
was left in place rather than cleaned up — it's part of the target
dataset, not throwaway test data.

One real bug caught by this small-scale test before it could hit the full
run: a person with multiple recorded places (multiple `P19` claims)
produces multiple result rows sharing one id, which violated
`wikidata_documents`' primary key on the first attempt. Fixed with the same
merge-by-id approach already used in `qlever-client.ts` for the same
underlying issue (TODO item 6).

Loading was subsequently simplified: chunks are loaded via
`jsonb_array_elements()` expanding one dollar-quoted JSON blob per chunk
(with `ON CONFLICT (id) DO UPDATE` for defensive idempotency), rather than
hand-rolled per-record CSV escaping — see the commit history for
`db/fetch-wikidata-persons.mjs`. Behavior and validation results are
unchanged.

**Scope decision (2026-07-16): for this prototype, only the pre-1900
portion is actually being downloaded**, not the full ~1.24M-record range —
see `investigations/wikidata-bulk-download-scope-decision.md` for the full
numbers (~1.24M full / ~2.6 GB estimated vs. ~423,000 pre-1900 / ~0.89 GB
estimated, ~70% of the total being 20th/21st century). This plan's design
below still describes the general, full-range capability — nothing here
changes; the constrained scope is just a specific invocation:

```sh
node db/fetch-wikidata-persons.mjs --year-min -3000 --year-max 1899
```

The full `-3000`..`2100` run remains available — no code change is needed
to run it later, it just isn't what's being run for this prototype right
now.

## Summary

Fetch the full set of ~1.24M Wikidata `person` records matching the
existing QLever query filters (TODO items 6–8: no sports figures,
required Wikipedia page, required date — see
`web-client/src/wikidata/category-map.ts`/`qlever-client.ts`), and store
them in the local Postgres database as a JSONB document collection — a new
table, separate from the app's normalized `entries`/`entry_locations`
schema, since this is a raw archive/cache of Wikidata records rather than
app-ready relational data.

This is a one-time (or occasional) bulk job, run manually from the command
line — not part of the running app's request path.

## Scoping decisions

- **"Full records" = the same shape `qlever-client.ts`'s `bindingToEvent()`
  already extracts** (title, description, date + precision, coordinates,
  Wikipedia title, category, tags) — not an open-ended "everything Wikidata
  knows about this person." This matches what's already modeled and
  avoids redesigning the extraction shape as part of a bulk-download task.
- **"No binary blobs"**: confirmed nothing to filter — every field in the
  query result is a URI or an RDF literal (string/date/number); SPARQL
  `SELECT` results cannot contain embedded binary data. Wikidata images
  (`P18`) are referenced by URL, not embedded, and this query doesn't fetch
  `P18` at all. No action needed here beyond not adding such a field later.
- **New table, not the existing schema**: `entries`/`entry_locations` are
  the app's normalized, PostGIS-backed runtime model. A "document
  collection" of raw Wikidata records is a different thing — an archive so
  ~1.24M records don't need to be re-fetched from QLever every time
  they're wanted, not something the running app queries directly (the app
  still talks to QLever live via the browser for its own use, per TODO
  item 6 — this bulk table doesn't change that).

## Why not straightforward pagination — verified directly against QLever

Tested three approaches against the live endpoint before settling on a
design (see `investigations/wikidata-query-count.md` for the related
one-off count work):

1. **`LIMIT`/`OFFSET`**: not tested directly, but well-documented to
   degrade badly at this scale (the engine still has to compute and skip
   every preceding row) — ruled out on general grounds.
2. **Keyset pagination comparing the item IRI directly**
   (`FILTER(?item > wd:Q12345)`): **doesn't work at all** — relational
   comparison operators aren't defined for IRI terms in SPARQL; QLever
   silently returns zero rows (an error in a `FILTER` expression excludes
   the row, so an invalid comparison quietly filters out everything)
   rather than erroring loudly. Easy to mistake for "we've reached the
   end."
3. **Keyset pagination comparing `STR(?item)`**: works correctly (verified:
   the returned page correctly starts right after the cursor), but is
   **not index-friendly** — measured **~40s for a 2,000-row page**, vs.
   ~10s for the equivalent unfiltered first page. At that rate, ~620 pages
   would be needed for the full 1.24M records, at ~40s each ≈ **~7 hours**
   and 620+ separate requests. Too slow, and far too many round trips
   against a shared community resource for what should be a bounded job.
4. **Chunk by date range, fetch each chunk as a single unpaginated
   streamed request** (`Accept: text/csv`, no `LIMIT`): **works well**.
   Measured directly: the full 1950s decade — 132,195 rows, ~19MB — came
   back correctly in **~30 seconds, one request**. No pagination needed
   within a chunk; QLever just streams the whole result set.

**Chosen approach: (4).** Split the ~1.24M records into date-range chunks
sized to keep each chunk's row count in a comfortable range (bisecting a
chunk further if its `COUNT` comes back too large), fetch each chunk as one
streamed CSV request, and load it into Postgres. This trades "one giant
request" (harder to checkpoint, a single very-long-lived connection, a
huge buffered response) for "a bounded number of medium requests, each
independently resumable."

## Chunking strategy

1. Before fetching, run a cheap `COUNT` per candidate date range (century
   or multi-century buckets for BCE/early history, where density is very
   low; decades for recent centuries, where density is high — informed by
   the measured 123,701-person 1950s decade). Bisect further (e.g. by
   5-year or 1-year range) if a bucket's count exceeds a safe threshold
   (~150,000 rows — comfortably under what was measured to complete in
   ~30s).
2. Fetch each chunk once its count is known to be safely bounded, via a
   single `Accept: text/csv` request with no `LIMIT`.
3. Record each completed chunk (date range + row count) in a small
   progress table so an interrupted run can resume without re-fetching
   completed chunks or re-running their `COUNT` checks.
4. Pace requests with a short courtesy delay between them (not just
   back-to-back) and send a descriptive `User-Agent` identifying this
   project — no documented QLever rate limit was found (checked headers,
   `robots.txt`, no published limit), so this is a deliberately
   conservative default rather than a response to a known constraint.

## Storage schema (new, added to `db/schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS wikidata_documents (
  id          TEXT PRIMARY KEY,        -- Wikidata Q-id, e.g. 'Q1000005'
  category    TEXT NOT NULL,           -- 'person' for this job; table is general-purpose
  data        JSONB NOT NULL,          -- the full record (same shape as HistoricalEvent)
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wikidata_documents_category_idx ON wikidata_documents (category);

CREATE TABLE IF NOT EXISTS wikidata_fetch_progress (
  category         TEXT NOT NULL,
  chunk_start_year INTEGER NOT NULL,
  chunk_end_year   INTEGER NOT NULL,
  row_count        INTEGER NOT NULL,
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (category, chunk_start_year, chunk_end_year)
);
```

## Script

New `db/fetch-wikidata-persons.mjs` (plain Node ESM, matching
`db/seed.mjs`'s style — no new dependency, duplicates the small,
stable amount of query-building/date-parsing logic already in
`web-client/src/wikidata/qlever-client.ts` rather than trying to share a
module between a browser/worker TS build and a standalone Node script):

1. Determine chunk boundaries per the strategy above, skipping any already
   present in `wikidata_fetch_progress`.
2. For each chunk: fetch as `application/sparql-results+json` (**deviation
   from the original design, which said CSV** — either way requires a full
   parse-and-transform step since QLever's raw columns don't match this
   table's shape, so there's no efficiency win from consuming CSV
   specifically; JSON reuses the exact binding shape/parsing logic already
   proven correct in `qlever-client.ts`, trading a bit of extra response
   size for not needing a new hand-rolled CSV parser and its escaping edge
   cases), parse into records, then **write this script's own output** as a
   local temp CSV file (correctly comma/quote/newline-escaped, with the
   JSONB `data` column as a JSON-encoded text field — this part is still
   CSV, just authored by us instead of parsed from QLever), and bulk-load
   via `psql ... -c "\copy wikidata_documents (id, category, data,
   fetched_at) FROM '<tempfile>' WITH (FORMAT csv)"` — `\copy` is the
   correct, efficient tool for a bulk load at this row count (vs. a giant
   generated `INSERT` statement, which risks command-line/argument-length
   issues and is much slower for six-figure row counts).
3. Record the chunk as complete in `wikidata_fetch_progress`.
4. Print running progress (chunks done / estimated remaining, rows loaded
   so far) so a long-running job is observable.

## Safety / rollback

- Entirely additive: new tables, no changes to existing schema or data.
- Fully resumable and idempotent per chunk (re-running the script only
  fetches chunks not already recorded as complete).
- Read-only against QLever; writes only to this project's own local
  Postgres database.

## Affected files

- `db/schema.sql` — the two new tables above.
- `db/fetch-wikidata-persons.mjs` — new bulk-fetch script.
- `db/README.md` — document the new script and tables.

## Verification plan

1. Apply the schema addition; confirm both tables exist.
2. Run the script against a small, cheap slice first (a single low-density
   century) to validate the full pipeline (chunking, fetch, CSV parse,
   `\copy` load, progress tracking, resumability by interrupting and
   re-running) before committing to the full ~1.24M-record run.
3. **Check in with the user with concrete numbers (estimated chunk count,
   estimated total time, estimated total storage) before kicking off the
   full run** — per the user's explicit concern about rate-limiting a
   shared resource, this is the one step in this plan that actually
   sustains load against QLever for an extended period, and deserves an
   explicit go-ahead with real numbers in hand rather than a general
   upfront approval.
4. After the full run: row count in `wikidata_documents` should be close
   to the ~1.24M baseline count (some drift expected — Wikidata is a live,
   continuously-edited graph, not a static snapshot).
