# Implement `<app-root>` and Main Entry Point

## Summary

Wire together the WebWorker, world-map, and timeline components in `<app-root>`. Create `main.ts` as the ES module entry point that imports all components and bootstraps the app.

## Affected Files

- `web-client/src/components/app-root.ts`
- `web-client/src/main.ts`
- `web-client/public/index.html` (template tag for app-root)

## Step-by-Step Implementation

1. **`app-root.ts`** — `AppRootElement extends HTMLElement`:
   - Shadow DOM from template: flex-column layout, `<world-map>` on top (~60% height), `<world-timeline>` below (~40% height).
   - In `connectedCallback`:
     - Instantiate `Worker` pointing to `./worker.js`.
     - Send `{ type: 'init', dataUrl: './data/events.tsv' }`.
     - Listen for worker messages → on `ready`, send initial query with full time range; on `results`, call `setEvents()` on both children.
   - Listen for `time-range-changed` from timeline → send new `query` to worker.
   - Listen for `event-selected` from either child → call `highlightEvent()` on both children.
   - Show loading state while worker is initializing.

2. **`main.ts`**:
   - Import all component files (side effects: registers custom elements).
   - No other logic needed; the `<app-root>` in `index.html` is self-contained.

3. **`public/index.html`**:
   - Add `<template id="app-root-template">` with the layout structure.
   - Add `<template id="world-map-template">` with canvas + styles.
   - Add `<template id="timeline-template">` with canvas + styles.

## Key Design Decisions

- Templates live in `index.html` (not inline strings in JS) per CLAUDE.md guidance.
- `<app-root>` manages the Worker lifetime — it creates and owns the Worker.
- Worker path is relative to `index.html` so it works from any subdirectory.
- Labels (titles, axis labels) use CSS `user-select: none` to prevent accidental text selection.

## Verification

- `npm run build` succeeds with no TypeScript errors.
- Open `public/index.html` via a local HTTP server; confirm both panels render.
- (Browser launch step skipped per development-process.md guidance.)
