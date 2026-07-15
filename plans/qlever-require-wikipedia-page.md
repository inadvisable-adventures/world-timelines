# Require a Wikipedia page for QLever entries — COMPLETED

## Result (2026-07-15)

Implemented as designed. Verified end-to-end in a headless browser (not
just the standalone SPARQL check from planning): querying Wikidata for
`person` entries in 1700–1750 returned 87 entries, all with a
non-empty `wikipediaTitle` (confirming the required join works — zero
entries were missing it), and **17 of 87 (~20%)** had a `title` that
differed from `wikipediaTitle` — e.g. label "James Fearon" vs. actual
article "James Fearon (actor)", "Karl Friedrich Behrens" vs. "Carl
Friedrich Behrens". Clicking into an entry-detail panel for one of these
confirmed the "view on Wikipedia" link now correctly points at
`.../wiki/James%20Fearon%20(actor)` (the real article) rather than the old
behavior, which would have built a broken/wrong link from the display
label. The Postgres path's passthrough (`wikipediaTitle` aliasing `title`)
was also directly verified (Great Pyramid of Giza entry).

One test-harness bug surfaced and fixed along the way, not an app bug:
Playwright's `page.waitForFunction(fn, options)` two-arg form was
misinterpreting the options object as the page-function argument (the real
signature is `waitForFunction(fn, arg, options)`), making the verification
script's own timeout appear to fail at a hardcoded 30s regardless of the
requested timeout. Once fixed, the actual query completed in ~13s, in line
with prior measurements.

## Summary

Extend the SPARQL query in `web-client/src/wikidata/qlever-client.ts`
(TODO item 6) so every returned Wikidata entry is required to have an
associated English Wikipedia article, and store that article's exact title
in a new field on `HistoricalEvent` — separate from `title` (the display
label), since the two are not reliably the same string.

## Why a separate field, not reusing `title`

`entry-detail.ts`'s `show()` currently builds the "view on Wikipedia" link
as `https://en.wikipedia.org/wiki/${encodeURIComponent(ev.title)}`. This
works today because for every existing entry (hand-crafted samples, the
ingester's Wikipedia-derived entries), `title` **is** the Wikipedia page
title by construction — the ingester sets `title` directly from
`page.title`.

That invariant does **not** hold for Wikidata-sourced entries: `title`
there comes from Wikidata's `rdfs:label` (English label), which frequently
differs from the actual Wikipedia article title. **Verified directly**
against the live QLever endpoint — in one 100-row test batch, several
items had a different label than Wikipedia title, e.g. Wikidata label
"Alessandro Pico della Mirandola" vs. actual Wikipedia title "Abate Pico
della Mirandola", and "Dudul Dorje, 13th Karmapa Lama" vs. "13th Karmapa,
Dudul Dorje". Linking via `title` for these would produce a broken or
wrong link (a red-link create-page URL, or the wrong article).

So: add `wikipediaTitle: string` to `HistoricalEvent`, always populated
(required, not optional) with the real Wikipedia article title, and switch
`entry-detail.ts`'s link construction to use it instead of `title`. For the
Postgres path this is a same-value passthrough of the existing `title`
column (no schema change needed — the invariant already holds there, so
`wikipediaTitle` and `title` are identical by construction). For the
Wikidata path, it comes from a new required (non-`OPTIONAL`) SPARQL join.

## SPARQL change

Verified directly against the live QLever endpoint: adding a required
join on the standard "has an English Wikipedia sitelink" pattern —

```sparql
?article schema:about ?item ;
         schema:isPartOf <https://en.wikipedia.org/> ;
         schema:name ?wikipediaTitle .
```

— to the existing combined query (person category, date+place+fictional
filters, `LIMIT 100`) added no meaningful performance cost (measured
~12.7s cold vs. ~13–14s previously for the same shape without this join —
within run-to-run variance, not a regression). Being a non-`OPTIONAL`
pattern referencing the shared `?item` variable, it naturally excludes any
item without an English Wikipedia article — satisfying "every returned
entry has an associated Wikipedia page" without a separate `FILTER EXISTS`.

Added once, after the category `UNION` block (not duplicated per-category
branch), alongside the existing shared filters.

## Affected files

- `web-client/src/types/index.ts` — add `wikipediaTitle: string` to
  `HistoricalEvent`.
- `web-client/src/wikidata/qlever-client.ts` — add the required join to
  `buildSparqlQuery`; parse `?wikipediaTitle` in `bindingToEvent`.
- `web-client/local-concept-server/src/api/entries.ts` — `getEntriesByIds`
  adds `wikipediaTitle` to its SELECT, aliasing the existing `title`
  column (no new DB column; the invariant already holds for this path).
- `web-client/src/components/entry-detail.ts` — build the Wikipedia link
  from `ev.wikipediaTitle` instead of `ev.title`.

## Verification

- `web-client` and `local-concept-server` both build cleanly (strict
  TypeScript).
- Query the Wikidata source in a browser for a case known to have a
  label/title divergence (or any broad query) and confirm the "view on
  Wikipedia" link in the entry-detail panel resolves to a real article,
  not a red link.
- Confirm switching to the Postgres source still produces correct links
  (regression check on the passthrough).
