# Scoping the Wikidata person bulk download to pre-1900 for this prototype

Date: 2026-07-16. Follow-on to `investigations/wikidata-query-count.md` and
`plans/wikidata-bulk-person-download.md` (TODO item 9).

## Context

TODO item 9 calls for bulk-downloading every Wikidata `person` record
matching this project's QLever query filters (real human, has a birth
date, no sports figures, has an English Wikipedia page, not fictional —
see `web-client/src/wikidata/qlever-client.ts`) into a new Postgres
document collection (`wikidata_documents`). The fetch pipeline
(`db/fetch-wikidata-persons.mjs`) was built and validated end-to-end on a
small slice (`--year-min 1500 --year-max 1520`: 4,421 real records,
correctly deduplicated and loaded). Before running it at full scale
(~1.24M records), two questions came up that changed the scope of what
gets downloaded for this prototype right now.

## Question 1: how much disk space will this actually take?

Measured directly against the already-loaded 1500–1520 validation slice
rather than guessing:

```sql
SELECT count(*), pg_size_pretty(pg_total_relation_size('wikidata_documents'))
FROM wikidata_documents;
```

**4,421 rows → 9,120 kB total (table + indexes)** — about **2,112.4
bytes/row**.

Extrapolating linearly from that baseline:

| Scope | Records | Estimated size |
|---|---|---|
| Full dataset (all matching persons, any date) | 1,241,767 | **~2.62 GB** (2.44 GiB) |
| Pre-1900 only (see below) | 423,080 | **~0.89 GB** (0.83 GiB) |

This is a rough linear extrapolation from one fairly narrow, non-random
16th-century slice — actual bytes/row could shift somewhat across eras
(e.g. modern biographical descriptions on Wikidata tend to run longer than
16th-century ones), so treat these as ballpark figures, not precise
predictions.

## Question 2: how much of the dataset is 20th/21st century?

Ran the same baseline query, restricted to `YEAR(?date) >= 1900 && YEAR(?date) <= 2100`:

**818,687 of 1,241,767 total matching persons (65.9%, ~70% rounded) have
a birth year in 1900 or later.**

That leaves **423,080 records (34.1%, ~30% rounded) born in 1899 or
earlier** — the pre-1900 share.

This matches the general expectation that Wikidata/Wikipedia biographical
coverage skews heavily toward recent history (better record-keeping, more
editors covering contemporary subjects, more living/recently-deceased
people meeting notability thresholds), but the actual concentration —
two-thirds of a 5,100-year-wide dataset packed into the last 126 years —
was worth confirming with a real count rather than assuming.

## Decision

**For this prototype, only download person records from 1899 or earlier.**
The pipeline already supports this directly via its existing CLI flags —
no code change needed:

```sh
node db/fetch-wikidata-persons.mjs --year-min -3000 --year-max 1899
```

This cuts the job from ~1.24M records (~2.6 GB) down to **~423,000
records (~0.89 GB)** — roughly a third of the size, and (per the chunking
design in `plans/wikidata-bulk-person-download.md`, which bisects a
date range further whenever its `COUNT` exceeds the 100,000-row cap)
should mean substantially fewer chunks and less total runtime too, since
excluding the 20th/21st century removes the single densest, most
chunk-heavy stretch of the whole range.

**The full-extract capability is not being removed.** `plans/wikidata-bulk-person-download.md`,
`db/fetch-wikidata-persons.mjs`, and the `wikidata_documents`/
`wikidata_fetch_progress` schema all remain exactly as built — general
enough to run the complete `-3000`..`2100` range later with the same
script, no re-design needed, just a different `--year-min`/`--year-max`
invocation (or the defaults, which still cover the full range).

See `README.md`'s "Wikidata bulk download" section for the short version
of this decision.
