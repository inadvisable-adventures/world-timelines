# Results Count Display (TODO #20) — COMPLETED

## Summary

Add a read-only line below the query editor box that shows how many entries the current query returned (e.g. "42 entries").

## Affected Files

- `web-client/index.html` — add a `<div id="results-count">` slot below the query editor in the sidebar template
- `web-client/src/components/app-root.ts` — update the count element when results arrive from the worker

## Implementation

1. In `index.html`, add a `<div id="results-count"></div>` in the `app-root-template` sidebar, below the `<query-editor>` element. Style it as small muted text.
2. In `app-root.ts`, get a reference to `#results-count` from the shadow DOM. When a `results` message arrives from the worker, set its `textContent` to `"${msg.events.length} entries"` (or `"No entries"` for 0).

## Verification

Build with `npm run build`. Confirm the count updates as query filters change.
