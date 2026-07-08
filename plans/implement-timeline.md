# Implement `<timeline>` Web Component

## Summary

Build a scrollable horizontal Canvas timeline component where the X-axis represents time and event dots appear at their corresponding positions. Users can pan/zoom to change the visible time range.

## Affected Files

- `web-client/src/components/timeline.ts`
- `web-client/public/index.html` (template tag)

## Step-by-Step Implementation

1. Define `TimelineElement extends HTMLElement`, register as `'world-timeline'`.
2. Shadow DOM from `<template>`: canvas element + minimal CSS (full width, fixed height ~160px).
3. **State**: `visibleStart: number`, `visibleEnd: number` (years), default −3000 to 2025. `events: HistoricalEvent[]`.
4. **`yearToX(year, width)`**: linear interpolation between `visibleStart` and `visibleEnd`.
5. **`draw()`**:
   - Clear canvas.
   - Draw time axis line (horizontal, middle of canvas).
   - Draw tick marks at sensible intervals (every 100y, 500y, 1000y depending on range).
   - Draw year labels at ticks.
   - For each event, draw a colored circle at `(yearToX(startYear), midY - radius - stackOffset)`. Stack overlapping events vertically.
6. **Pan interaction** (`mousedown` + `mousemove` + `mouseup`):
   - Track drag delta in pixels → convert to years → update `visibleStart`/`visibleEnd`.
   - Dispatch `time-range-changed` custom event with `{ startYear, endYear }`.
7. **Wheel zoom**: zoom in/out around cursor x position. Dispatch `time-range-changed`.
8. **Click**: find clicked event dot → dispatch `event-selected` custom event.
9. **`setEvents(events)`** (public method): store + redraw.
10. **`highlightEvent(id)`** (public method): draw a ring around selected event.

## Key Design Decisions

- Stacking of simultaneous events is done by bucketing events into year-bins at the current zoom level and offsetting vertically within each bucket.
- Minimum visible range enforced at 1 year to prevent infinite zoom.
- `time-range-changed` is debounced 50 ms to avoid flooding the worker with queries during fast pan.

## Verification

- After build, open in browser and confirm timeline renders with ticks and labels, and panning changes the visible range.
- (Skipped: requires browser launch.)
