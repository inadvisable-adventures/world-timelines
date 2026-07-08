# Timeline Era Sections (TODO #56)

## Summary

Replace the single shared track pool in the era panel with per-source sections.
Each region (World, Mesopotamia, Egypt, Rome, China, West Africa, Peru) gets its
own labelled horizontal strip. Within a strip, greedy interval-coloring assigns
tracks using only that region's eras, so same-chronology periods always share
consistent lanes. Strips have a clickable header that collapses/expands them;
all are collapsed by default. Timeline CSS height increases from 180px to 380px.

## Affected Files

- `web-client/src/components/timeline.ts` — era layout, drawing, mouse handling
- `web-client/public/index.html` — `.timeline-row { flex: 0 0 380px }`

## Implementation

### Constants

```typescript
const ERA_SECTION_HEADER_H = 13;  // px per section header
const ERA_TRACK_H = 11;           // px per track row inside a section
const MIN_EVENTS_H = 60;          // minimum events body height (px)

const ERA_SOURCE_ORDER = [
  'world-history', 'mesopotamia-history', 'egypt-history', 'rome-history',
  'china-history', 'west-africa-history', 'peru-history',
];

const ERA_SOURCE_LABELS: Record<string, string> = { … };
```

Remove `ERA_PANEL_H` and `ERA_MIN_TRACK_H`.

### `EraSection` interface

```typescript
interface EraSection {
  source: string;
  eras: HistoricalEra[];
  trackAssignment: Map<string, number>;
  trackCount: number;
  yOffset: number;   // within the era panel (relative to axisYBot)
  height: number;    // header + (expanded ? trackCount * ERA_TRACK_H : 0)
}
```

### New fields

```typescript
private collapsedSources = new Set<string>(ERA_SOURCE_ORDER); // all collapsed
private eraSections: EraSection[] = [];
```

### `computeEraSections()`

For each source in `ERA_SOURCE_ORDER`:
1. Collect that source's eras.
2. Greedy interval-coloring (sort by `startYear`, assign to first track whose
   end ≤ era.startYear, else new track).
3. Compute `height = ERA_SECTION_HEADER_H + (expanded ? trackCount * ERA_TRACK_H : 0)`.
4. Accumulate `yOffset`.

### `eraPanelH()`

`sum of section.height` across all sections.

### `axisYBot()`

```typescript
private axisYBot(): number {
  const maxEraH = this.eraYBot() - this.axisYTop() - MIN_EVENTS_H;
  return this.eraYBot() - Math.min(this.eraPanelH(), Math.max(0, maxEraH));
}
```

This ensures the events body is never below MIN_EVENTS_H.

### `setEras()` update

Call `computeEraSections()`, then `layout()`, then `draw()`.

### `drawEras()` rewrite

For each section:
- Draw header background (`color + '18'`), a 3px left color tab, collapse arrow + label.
- Draw a thin bottom border on the header.
- If expanded: iterate `section.eras`, clip to visible range, draw bands at
  `bandTop + track * ERA_TRACK_H`, same semi-transparent fill + left accent + label.

### Mouse interaction

`onMouseDown`: if click falls in era panel (cy between axisBot and eraBot), check
which section header was hit (by comparing `cy - axisBot` to `section.yOffset`
and `section.yOffset + ERA_SECTION_HEADER_H`). Toggle collapse, recompute,
re-layout, redraw.

`onMouseMove`: if hovering over a section header, set cursor to `pointer`.

### HTML change

`.timeline-row { flex: 0 0 380px }`

## Verification

- `npm run build` passes
- Browser: collapsed state shows 7 labelled strips, events body is uncluttered
- Expanding China shows Chinese dynasties only in China's section
- Expanding two regions shows them in separate, non-interleaved sections
