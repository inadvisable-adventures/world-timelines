# Timeline Filter Selection (TODO #36) — COMPLETED

## Summary

Improve the timeline so it has axis labels both above and below, and lets users draw
a filter selection inside the body — just like the geo box on the map. Panning/scrolling
the timeline in the label zones (above or below the axis) keeps the existing behavior.
When a filter selection exists, the visible range is purely cosmetic; only the selection
drives the time filter sent to the worker.

## Layout

- `axisYTop = 28` — top axis line
- `axisYBot = lh() - 28` — bottom axis line (replacing single axis)
- Labels: same tick positions drawn ABOVE `axisYTop` (at `axisYTop - 6`) AND BELOW `axisYBot` (at `axisYBot + 16`)
- Density histogram and event dots fill the body between the two axes
- Event lane y: `axisYBot - MARKER_R - 4 - lane * LANE_H` (stacks upward from bottom)

## Interaction Zones

- **Pan zone**: `cy < axisYTop` or `cy > axisYBot` — panning/scrolling (existing behavior)
- **Body zone**: `axisYTop ≤ cy ≤ axisYBot` — draw selection on drag; click to select event

## State Changes

Replace `dragging: boolean, dragLastX` with:
```
dragMode: 'pan' | 'body' | null
dragStartX: number          // clientX at mousedown (threshold check)
dragLastX: number           // for pan delta
bodyDragStartYear: number | null
bodyDragCurrentYear: number | null
isBodyDragging: boolean
selectionStart: number | null   // committed selection (years)
selectionEnd: number | null
```

## Mouse Handling

`mousedown`:
- record `dragStartX = clientX`, determine zone
- pan zone → `dragMode = 'pan'`
- body zone → `dragMode = 'body'`, init bodyDragStartYear

`mousemove` (buttons held):
- pan: shift visible range by dx, emit range
- body: if moved > 4px, set `isBodyDragging = true`, update bodyDragCurrentYear, draw

`mouseup`:
- body + isBodyDragging → commit selection, `emitFilter()`
- body + !isBodyDragging → hit-test, emit `event-selected` if hit

Remove `onClick` handler (handled in `mouseup`).

## New `emitFilter()` Event

```
CustomEvent('time-filter-changed', {
  detail: { startYear, endYear } | null
})
```

## Selection Visuals

When committed selection exists (and not currently dragging a new one):
- Semi-transparent blue rect from `yearToX(selStart)` to `yearToX(selEnd)`, spanning axisYTop → axisYBot
- Dashed blue border
- `#time-sel-clear` button at right edge of selection, top of component

When body drag in progress: show same rect using `bodyDragStartYear` / `bodyDragCurrentYear`.

## Clear Button

`#time-sel-clear` overlaid HTML div (similar to `#box-clear` on map). 
Click → set `selectionStart = selectionEnd = null`, `emitFilter(null)`, redraw.

## App-Root Changes

New field: `private timeSelection: [number, number] | null = null`

- Listen for `time-filter-changed` → `onTimeFilterChanged`: update `timeSelection`, `sendQuery()`
- `onTimeRangeChanged`: update `currentTimeRange`, call `sendQuery()` **only if `!this.timeSelection`**
- `sendQuery()`: use `this.timeSelection ?? this.currentTimeRange` as the time range

## Affected Files

- `web-client/public/index.html` — add `#time-sel-clear` to timeline template
- `web-client/src/components/timeline.ts` — dual axes, body/pan zones, selection state
- `web-client/src/components/app-root.ts` — timeSelection field, modified handlers
