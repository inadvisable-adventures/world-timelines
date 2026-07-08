# [COMPLETED] Category Picker + Query DSL Editor

## Summary

Add a visual category multipicker and a text-based query DSL editor to the main view. The picker, the DSL editor, the map, and the timeline all stay in sync. The worker is updated to parse and apply DSL filter statements, replacing the previous simple time-range + bounds query.

## Affected Files

**web-client:**
- `src/types/index.ts` — add `DslFilter`, updated `QueryRequest`
- `src/worker/dsl-parser.ts` — new: parse DSL text into `DslFilter[]`
- `src/worker/query-worker.ts` — apply DSL filters; new query message format
- `src/components/category-picker.ts` — new web component
- `src/components/query-editor.ts` — new web component
- `src/components/app-root.ts` — updated layout + sync logic
- `src/main.ts` — import new components
- `public/index.html` — new templates, updated layout

## Step-by-Step Implementation

1. **`src/types/index.ts`**: Add `DslFilter` discriminated union; update `QueryRequest` to `{ type: 'query'; dsl: string; timeRange: [number, number]; limit: number }`.
2. **`src/worker/dsl-parser.ts`**: Parse DSL text line-by-line; skip blank lines and comments (`#`); parse `filter <field>: <value>` lines; return `DslFilter[]`.
3. **`src/worker/query-worker.ts`**: On `query` message, import `parseDsl`; apply each filter in sequence against all events; apply `timeRange` filter; cap at `limit`; post results.
4. **`src/components/category-picker.ts`**: Shadow DOM component with one chip per `EventCategory`. Chips are colored per category. All selected by default. Click toggles selection; dispatches `category-filter-changed` with `{ selected }`. Exposes `setSelected(cats)`.
5. **`src/components/query-editor.ts`**: Shadow DOM component wrapping a `<textarea>` with line numbers. Debounces `input` events 150 ms then dispatches `dsl-changed` with DSL text. Exposes `setDsl(text)` for programmatic updates (does not re-fire the event).
6. **`src/components/app-root.ts`**: Updated layout (map 75% + sidebar 25% + full-width timeline). New sync logic:
   - `category-filter-changed` → rewrite `filter category:` line in DSL → call `queryEditor.setDsl()` → send query.
   - `dsl-changed` → parse category filter from DSL → call `picker.setSelected()` → send query.
   - `time-range-changed` → update stored `timeRange` → send query.
   - `event-selected` → call `highlightEvent(id)` on map and timeline.
7. **`public/index.html`**: Add `<template id="category-picker-template">` and `<template id="query-editor-template">`. Update `app-root-template` for new 3-panel layout.
8. **`src/main.ts`**: Import new component files.

## DSL Grammar

```
line        = blank | comment | filter-stmt
comment     = '#' <anything>
filter-stmt = 'filter' SPACE field ':' SPACE value
field       = 'category' | 'year' | 'text' | 'lat' | 'lng'
value       = category-list | range | free-text
category-list = category (',' SPACE? category)*
range       = number 'to' number
free-text   = <rest of line>
```

**Filter semantics:**
- `category: a, b` — event category is one of the listed values.
- `year: X to Y` — event's year range overlaps `[X, Y]`.
- `text: q` — case-insensitive substring match on `title` or `description`.
- `lat: X to Y` — primary location latitude in `[X, Y]`.
- `lng: X to Y` — primary location longitude in `[X, Y]`.

All filters AND together. The `timeRange` parameter (from the timeline) also ANDs with the DSL results. Default limit = 100.

## Layout

```
┌──────────────────────────┬──────────────────┐
│                          │  Category Picker  │
│       World Map          │  (colored chips)  │
│       (Canvas)           ├──────────────────┤
│                          │   Query Editor   │
│                          │   DSL textarea   │
├──────────────────────────┴──────────────────┤
│               Timeline (full width)         │
└─────────────────────────────────────────────┘
```

Map column: flex-1. Sidebar: 260px fixed. Timeline: 180px fixed height.

## Key Design Decisions

- The DSL textarea is the single source of truth for filter text. The picker is a shortcut that generates/updates the `filter category:` line.
- `setDsl()` does not fire a new `dsl-changed` event to avoid infinite loops.
- The timeline `timeRange` is passed separately (not in the DSL) because it changes frequently (on pan/zoom) and does not need to appear as text in the editor.
- Labels in the picker chips and query editor are non-user-selectable (per CLAUDE.md).

## Verification

- `npm run build` succeeds.
- Open in browser: confirm 3-panel layout, picker chips visible, DSL textarea editable. (Browser step — skipped.)
