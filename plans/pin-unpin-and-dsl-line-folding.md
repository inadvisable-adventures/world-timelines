# Pin/unpin entries and result sets, plus DSL line folding (TODO item 16)

## Summary

Two related features bundled under one TODO item:

1. **Pin/unpin**: let the user mark specific entries (or the whole
   current result set) as "pinned" so they stay visible on the map and
   timeline regardless of what query runs afterward — a bookmark
   mechanism, not a filter. Buttons in the UI (entry detail panel, results
   bar) and an equivalent DSL line stay in sync, following the existing
   bidirectional-sync pattern (`plans/dsl-bidirectional-sync.md`).
2. **DSL line folding**: the query editor's `<textarea>` wraps long
   lines instead of truncating them, which gets unwieldy fast — and pin
   state is exactly the kind of thing that produces a long line (a
   `pin:` line listing several ids). Add per-line truncation with
   click-to-expand/collapse in the editor's at-rest (unfocused) view.

The two are shipped together because the first creates the exact problem
the second solves — a pinned-heavy session can easily produce a `pin:`
line with a dozen ids, and today that just wraps and eats vertical space
in the (height-capped) editor.

## Investigation

Traced the full DSL round-trip and rendering path:

- **`query-editor.ts`**: a bare `<textarea>`, not a line-structured
  editor. `getDsl()`/`setDsl()` are the only surface; `setDsl()` sets
  `_suppressEvent` to avoid firing `dsl-changed` on programmatic writes
  (the mechanism every other bidirectional sync already relies on).
  Critically, this means true per-character "folding" inside the live
  edit surface isn't possible (`<textarea>` has no rich inline markup) —
  see Design decisions below for how this shapes the folding feature.
- **`dsl-parser.ts`**: line-oriented, top-level statements (`limit N`,
  `laneset <id>`) checked before the generic `filter <field>: <value>`
  pattern. A `pin:` line fits naturally alongside `limit`/`laneset` as a
  new top-level statement (it doesn't filter results, so it doesn't
  belong under `filter`).
- **`app-root.ts`**: the orchestrator and single source of truth for
  cross-component state; `sendQuery()`/`onDslChanged()`/`setDslLine()`
  (module-level helper) are the established sync primitives every
  existing DSL-backed control uses (`plans/dsl-bidirectional-sync.md`).
  `lastResults: HistoricalEvent[]` is literally "the current result
  set" — pin-all-results reads ids from here.
- **`query-worker.ts`**: returns `{ type: 'results', events }` built
  fresh from the active query's bounds. It has no notion of "also
  always include these ids" today.
- **`idb-cache.ts`**: `resolveViaCache` already does "cache hit or fetch
  missing", but its internal `getMany` (cache-only read) isn't exported.
  Two separate stores exist: `ENTRIES_STORE` (Postgres, keyed by UUID)
  and `WIKIDATA_ENTRIES_STORE` (live QLever results, keyed by Q-id,
  write-through cached as a side effect of querying — no per-id fetch
  endpoint exists for this source).
- **`local-concept-server/src/db.ts`**: `validateUuidList` 400s on
  anything that isn't a UUID — confirms a Wikidata Q-id must never be
  sent to `/api/entries/by-ids`.
- **`world-map.ts` / `timeline.ts`**: both take `setEvents(events)` and
  already thread an `isSelected` bool into their per-event draw calls
  (`drawLocations(locations, title, color, isSelected, lw, lh)` in
  world-map.ts) — the natural place to add an `isPinned` bool for a
  parallel visual treatment.

## Design decisions

### Pin state lives in the DSL, not a new persistence layer

No `localStorage`/new IndexedDB store. Exactly like every other DSL-
backed control (category, laneset, year, geo), pinned ids round-trip
through the DSL text and app-root's in-memory state, and — like all of
those — don't survive a page reload. That's consistent with the rest of
the app's current session-only behavior, not a gap specific to this
feature.

### DSL syntax: `pin: id1, id2, id3` — a top-level statement, not a filter

Parsed in `dsl-parser.ts` alongside `limit`/`laneset` (checked before the
generic `filter <field>:` pattern), not added to the `DslFilter` union —
pinning doesn't restrict what a query returns, it adds entries back in
regardless of the query, which is a fundamentally different operation
from every existing `DslFilter` kind.

### Pinned entries are resolved cache-only, merged in by the worker

`WorkerInMessage`'s `query` variant gains `pinnedIds: string[]`. The
worker resolves them by checking `ENTRIES_STORE` and
`WIKIDATA_ENTRIES_STORE` (via a newly-exported `getCachedByIds` in
idb-cache.ts) and, for any UUID-shaped id still missing, falls back to
`fetchEntriesByIds` (the same live-fetch `resolveViaCache` already does
for query results). **Q-id-shaped pins with no cache hit cannot be
resolved** — there's no by-id fetch for the live QLever source in this
codebase. This is an accepted, documented limitation (not solved here):
a Wikidata entry can only be pinned after it's been surfaced by an
actual query at least once in the session. Worth a `PARKINGLOT.md` note
if it ever becomes annoying in practice.

`WorkerOutMessage`'s `results` variant gains `pinnedEvents:
HistoricalEvent[]` — kept **separate** from `events` (the raw query
matches) rather than pre-merged, so the results count in the sidebar
keeps meaning "how many entries matched the query," not "matched or
pinned." App-root merges the two (dedup by id) only for what it hands to
`mapEl.setEvents`/`timelineEl.setEvents`/`lastResults` (the last one
needs pinned-only entries too, so clicking a pinned marker that isn't a
query match still resolves in `onEventSelected`).

### UI: toggle button in entry detail, pin-all/unpin-all in the results bar

- `entry-detail.ts`: one toggle button (reusing the monochrome-glyph
  convention already established by `#close-btn` "×" and settings-menu's
  "⚙" — a flag glyph, "⚑"/"⚐" for pinned/unpinned, not an emoji per
  `CLAUDE.md`). Dispatches a `pin-toggled` event with `{id}`; doesn't
  touch app state directly, matching every other component's
  dumb-view-fires-event convention.
- Results bar (`#results-count`'s row in `app-root-template`): add a
  "Pin all" button (adds every id in `lastResults` to the pinned set)
  and a "Unpin all" button, shown only when the pinned count is nonzero.
  A small "N pinned" label sits next to the existing "N entries" text.

### Visual indication on map/timeline: a thin accent ring/stroke, not a new marker system

`setEvents(events, pinnedIds?: Set<string>)` on both `WorldMapElement`
and `TimelineElement`. In `world-map.ts`'s `drawLocations`, thread an
`isPinned` bool alongside the existing `isSelected` one and draw a thin
extra outline (e.g. a gold `#e8c25f` ring just outside the point marker)
when pinned-but-not-selected — mirrors the existing
`isSelected`-changes-radius-and-fill pattern rather than inventing a
separate drawing path. Timeline gets an equivalent small accent on
pinned entry dots. Scoped deliberately narrow (a stroke/outline tweak,
not new iconography) given this is one part of an already-large item.

### DSL folding: a separate at-rest rendered view, not true textarea folding

A `<textarea>` cannot host per-character interactive markup, so real
"fold this span of one line" inside the live edit surface isn't
implementable without replacing the edit surface entirely (a much larger
change than this item calls for). Instead: **while focused**, the
textarea behaves exactly as it does today — full raw text, no folding,
because you need to see what you're editing. **While blurred** (the
normal at-rest state), a sibling `<div id="folded-view">` is shown
instead, rendering one row per line via `text-overflow: ellipsis`
(native CSS truncation, automatically responsive to the actual container
width — no manual character-count math). Clicking a truncated row
toggles it into an unfolded (`white-space: normal`, wraps) state with a
small trailing "fold" control to collapse it back; clicking an
already-unfolded row's text also refolds it, so there are two easy ways
back per the TODO's "an easy way to refold it back." Clicking anywhere
in `folded-view` that isn't a line row (or a dedicated "edit" affordance)
focuses the real textarea and switches back to raw-edit mode. Per-line
unfolded state is transient component-local state (`Set<number>` of
line indices), reset whenever the DSL text changes structurally — no
new persistence needed, matches how every other piece of this feature
avoids adding one.

## Affected files

- `web-client/src/worker/dsl-parser.ts` — `pin:` statement parsing,
  `ParsedQuery.pinnedIds`.
- `web-client/src/types/index.ts` — `QueryRequest.pinnedIds`,
  `QueryResponse.pinnedEvents`.
- `web-client/src/cache/idb-cache.ts` — export `getCachedByIds`
  (renamed/exported `getMany`).
- `web-client/src/worker/query-worker.ts` — resolve `pinnedIds` →
  `pinnedEvents` per query.
- `web-client/src/components/app-root.ts` — `pinnedIds` state,
  `togglePin`/`pinAllResults`/`unpinAll`, DSL sync, results-bar wiring,
  merge-for-render logic.
- `web-client/src/components/entry-detail.ts` — pin toggle button.
- `web-client/src/components/world-map.ts` — `isPinned` visual accent.
- `web-client/src/components/timeline.ts` — `isPinned` visual accent.
- `web-client/src/components/query-editor.ts` — folded-view rendering,
  focus/blur switching, per-line unfold state.
- `web-client/public/index.html` — `entry-detail-template` (pin button),
  `app-root-template` (results-bar buttons/labels), `query-editor-
  template` (folded-view markup + styles).
- `TODO.md` — mark item 16 `COMPLETED` once implemented.

No schema/DB changes — this is entirely client-side session state.

## Verification (for implementation time)

1. `tsc --noEmit` clean in `web-client/`.
2. Pin an individual entry via the entry-detail button; confirm the DSL
   gains a `pin:` line with its id, the button shows pinned state, and
   the entry stays visible on the map/timeline after changing the query
   to something that would otherwise exclude it.
3. Edit the `pin:` DSL line directly (remove an id); confirm the
   corresponding button/marker un-pins without clicking anything.
4. Pin-all on a real result set, confirm the DSL line lists every result
   id; Unpin-all, confirm the line is removed and every marker reverts.
5. Pin several Wikidata-sourced (Q-id) entries in one session (requires
   the QLever data source active) and confirm they resolve from cache
   correctly; separately confirm a UUID pin with no prior cache hit
   still resolves via the fallback fetch.
6. Type or paste a long `pin:` line (or any long `filter text:` line)
   into the editor, blur it, confirm it truncates with an ellipsis;
   click to unfold, confirm it wraps and shows a fold-back control;
   confirm refolding and re-focusing (returning to raw edit mode) both
   work.
7. Visual check in a browser once one is available — this feature is
   unusually UI-heavy (canvas accents, focus/blur view switching) for a
   Node-side check to meaningfully substitute for. Flag explicitly if
   skipped, same as prior TODO items.
