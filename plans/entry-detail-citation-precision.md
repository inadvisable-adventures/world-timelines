# Bring the entry detail citation link up to date (TODO item 15)

## Summary

Fix `entry-detail.ts`'s citation link so it points at the most specific
*data source item* available, not always Wikipedia, and surface the
required Wikipedia cross-reference (TODO item 7) as a genuine secondary
link when it adds real information beyond the primary citation — rather
than the current single-link-per-entry model, which always shows exactly
one link and (for Wikidata/QLever-sourced entries) always points that
link at Wikipedia even though the actual data source is Wikidata.

## Investigation

Traced every place `citationUrl`/`citationLabel`/`wikipediaTitle` are
set or read (`HistoricalEvent`'s three relevant fields, `types/index.ts`
lines 88/94-95):

- **`web-client/src/wikidata/qlever-client.ts`'s `bindingToEvent`**
  (live QLever query path — TODO items 6-8): `id` is already the raw
  Wikidata Q-id (extracted from the SPARQL `?item` URI a few lines
  above), but `citationUrl` is hardcoded to
  `https://en.wikipedia.org/wiki/${wikipediaTitle}` with
  `citationLabel: 'Wikipedia'`. This is the bug the TODO item names
  directly: the entry's `id` already *is* the specific Wikidata item,
  unused for citation purposes.
- **`local-concept-server/src/api/entries.ts`'s `getEntriesByIds`**
  (Postgres path — everything seeded via `db/seed.mjs`, i.e. the
  wiki-dump-ingested TSV entries plus the Cliopatria/Beagle/Great Wall
  boundary imports, all sharing one `entries` table): `citationUrl`/
  `citationLabel` are already correct here — `db/schema.sql`'s own
  comment confirms every *pre-existing* seeded entry really is
  Wikipedia-sourced, so the `citation_url = ''` fallback to a Wikipedia
  link is right, and Cliopatria/Beagle/Great Wall set both columns
  explicitly and correctly (TODO items 12-14). **But** `wikipediaTitle`
  is set unconditionally to `e.title` for every row in the shared table,
  including the boundary imports — which are not Wikipedia articles at
  all ("HMS Beagle voyage (1831–1836)" and "Great Wall of China" are not
  guaranteed to be real enwiki titles, just entry titles that happen to
  look similar). This is currently invisible (nothing reads
  `wikipediaTitle` client-side yet) but becomes a real, wrong-link bug
  the moment anything starts using it — which this plan's new secondary
  link does. Needs the same `citation_url = ''` conditional the
  citation-fallback logic already uses.
- **`entry-detail.ts`**: renders exactly one link (`#detail-link`, the
  title anchor) plus a plain-text `#detail-source` label. No use of
  `wikipediaTitle` at all today.
- **`db/fetch-wikidata-persons.mjs`** writes to a separate
  `wikidata_documents` JSONB table that's not read by any API route —
  confirmed via a repo-wide grep. Out of scope; nothing client-reachable
  depends on it yet.

## Design decisions

### Primary citation: most specific source item, per data path

- **QLever-sourced entries** (`qlever-client.ts`): `citationUrl` →
  `https://www.wikidata.org/wiki/${id}` (the entry's own id is already
  the Q-id), `citationLabel` → `'Wikidata'`. This is the actual origin
  of the structured data (coordinates, dates, category match) — Wikipedia
  is a required cross-reference (TODO item 7), not the source.
- **Postgres wiki-dump entries**: unchanged — Wikipedia genuinely is the
  source, and the existing `citation_url = ''` fallback already produces
  the right link.
- **Cliopatria/Beagle/Great Wall entries**: unchanged — already correct
  per their own plans.

### Secondary cross-reference link, not a second field

Rather than adding new `HistoricalEvent` fields, reuse `wikipediaTitle`
(already required and populated for every QLever entry) to show a small
secondary "Wikipedia ↗" link in the entry detail panel, displayed only
when it adds real information: `wikipediaTitle` is non-empty **and**
`citationLabel !== 'Wikipedia'` (i.e. don't show a redundant second
Wikipedia link when the primary citation already *is* Wikipedia). This
naturally:
- shows both links for QLever entries (Wikidata primary + Wikipedia
  secondary),
- shows only the primary for wiki-dump entries (Wikipedia primary, no
  redundant secondary),
- shows only the primary for Cliopatria/Beagle/Great Wall entries once
  the `wikipediaTitle` SQL leak above is fixed (empty `wikipediaTitle`
  → secondary hidden) — this is *why* that leak needs fixing as part of
  this change, not left as a separate cleanup: without the fix, those
  three entry types would each grow a bogus "Wikipedia ↗" link built
  from a title string that was never a real Wikipedia article title.

No `HistoricalEvent`/schema changes — `wikipediaTitle` already exists
and is already the right shape for this.

### UI: extend the existing template, reuse the existing href-toggle idiom

`entry-detail.ts` already toggles an anchor's `href` on/off
(`showLane()`'s `this.linkEl.removeAttribute('href')`) to represent
"this link isn't applicable right now" without a separate visibility
field. Reuse that for the new secondary link rather than inventing a new
mechanism: add one `<a id="detail-wiki-link">` to the `.meta` row in
`entry-detail-template` (`web-client/public/index.html`), and set/clear
its `href` + a `.hidden` class in `show()` depending on the condition
above — matches `CLAUDE.md`'s "prefer `<template>`/`<slot>`" instruction
(markup lives in the template, not constructed in TS) and the
"labels... should not be user-selectable" convention already applied
elsewhere in this template (`user-select: none` on `#close-btn`; the new
link's static "Wikipedia ↗" text should get the same treatment, though
being a normal link `<a>` inside body text is a case where
user-selectability is arguably fine — apply `user-select: none` to match
existing sibling elements' convention in this panel regardless, for
consistency).

## Affected files

- `web-client/src/wikidata/qlever-client.ts` — `bindingToEvent`'s
  `citationUrl`/`citationLabel`.
- `web-client/local-concept-server/src/api/entries.ts` —
  `getEntriesByIds`'s `wikipediaTitle` SQL expression (conditional on
  `citation_url = ''`).
- `web-client/public/index.html` — add `#detail-wiki-link` to
  `entry-detail-template`'s `.meta` row.
- `web-client/src/components/entry-detail.ts` — wire the new element in
  `connectedCallback`/`show()`.
- `TODO.md` — mark item 15 `COMPLETED` once implemented.

No schema or type changes.

## Verification (for implementation time)

1. `tsc --noEmit` clean in `web-client/`.
2. `db/init-db.sh`, then direct `/api/entries/by-ids` checks: a
   wiki-dump entry has `wikipediaTitle === title` and `citationLabel ===
   'Wikipedia'`; a Cliopatria/Beagle/Great Wall entry has `wikipediaTitle
   === ''`.
3. Exercise the live QLever path (switch data source via the settings
   gear icon) and confirm a sampled entry's `citationUrl` points at
   `wikidata.org/wiki/Q...` with `citationLabel === 'Wikidata'`, and that
   `wikipediaTitle` is still populated.
4. Visual check in a browser once one is available: confirm the primary
   title link and the new secondary Wikipedia link both render (and
   both work) for a QLever-sourced entry, and that no secondary link
   appears for wiki-dump or boundary-import entries. Same caveat as
   TODO items 12-14 if skipped.
