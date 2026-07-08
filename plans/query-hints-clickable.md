# Clickable Persistent Query Hints (TODO #37) — COMPLETED

## Summary

Replace the `textarea.placeholder` string with always-visible clickable hint rows
rendered below the textarea. Hints never disappear, lighten on hover, and clicking
one appends its text to the current query.

## Layout

Within the query-editor shadow DOM (flex column):
- "Query" label (existing)
- `<textarea>` — auto-resizes to content height (60–200 px), `resize: none`
- `<div class="hints">` — fills remaining space, scrollable, built in JS

## Hint rows

Each row is a `<div class="hint">` created in `connectedCallback` from the `HINTS` array.
Click handler: `textarea.value = current.trimEnd() + '\n' + hint` (or just `hint` if empty),
then auto-resize and fire `dsl-changed` immediately (no debounce, it's a discrete action).

## CSS

- `.hint`: monospace, 0.72rem, `color: #2a3050`, cursor pointer, no user-select
- `.hint:hover`: `color: #4a5880`, faint blue background
- `.hints`: `border-top: 1px solid #1e2030`, `overflow-y: auto`

## Affected Files

- `web-client/public/index.html` — query-editor template
- `web-client/src/components/query-editor.ts` — remove placeholder, add hints + auto-resize
