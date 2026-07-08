# Entry Detail Panel (TODO #27) — COMPLETED

## Summary

Clicking an entry on the map or timeline fires `event-selected` with the entry's id,
but `app-root` only highlights it — nothing is shown to the user. Add an
`<entry-detail>` component in the sidebar that displays the selected entry's title,
date range, category, description, and a Wikipedia link.

## Affected Files

- `web-client/public/index.html` — add `entry-detail-template`; wire `<entry-detail>`
  into the sidebar in `app-root-template`; add `entry-detail { flex: 0 0 auto; }` style
- `web-client/src/components/entry-detail.ts` — new component
- `web-client/src/components/app-root.ts` — store last results; look up entry on
  selection; call `detailEl.show(entry)`; import and reference `EntryDetailElement`

## Implementation

### `entry-detail.ts`

New web component. Hidden by default (`:host(.hidden) { display: none; }`).

`show(ev: HistoricalEvent)`:
- Sets anchor text + href to `https://en.wikipedia.org/wiki/${encodeURIComponent(ev.title)}`
- Formats year range: negative years → "N BCE", positive → "N"; range → "A – B"
- Sets category badge text and color (matching category-picker colors)
- Sets description text (CSS line-clamp: 4 lines)
- Removes `.hidden` from host

`hide()`: adds `.hidden` to host; called by close-button click.

### `app-root.ts` changes

- `private lastResults: HistoricalEvent[] = []`
- `private detailEl!: EntryDetailElement`
- `onWorkerMessage`: after setting map/timeline events, also `this.lastResults = msg.events`
- `onEventSelected`: look up entry, call `this.detailEl.show(entry)` if found

## Verification

Load the app, click an entry dot on the map. The sidebar panel should show the entry's
name (linked to Wikipedia), dates, category badge, and description. Close with ×.
