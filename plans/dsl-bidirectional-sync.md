# DSL Bidirectional Sync with Map and Timeline (TODO #38) — COMPLETED

## Summary

Bidirectionally sync the query DSL with the timeline time-filter selection and the
map geo selection. The DSL is the authoritative source; UI controls read from and
write to it. Geo filtering moves entirely into the DSL (`filter lat:` / `filter lng:`);
the separate `geoFilter` parameter is no longer passed to the worker.

## Sync Directions

### Timeline → DSL
`onTimeFilterChanged` (body-drag selection committed or cleared):
- Write/remove `filter year: START to END` in DSL via `setDslLine()`.
- `setDsl()` (silent, no feedback loop).

### DSL → Timeline
`onDslChanged` parses the `year` filter:
- If present: `timelineEl.setSelection(start, end)` (new public method, no event fired).
- If absent: `timelineEl.clearSelection()` (new public method, no event fired).
- Sets `this.timeSelection` accordingly for query override.

### Map → DSL
`onGeoFilterChanged` receives the updated GeoFilter (now includes `latOnly?/lngOnly?`):
- Write `filter lat:` and/or `filter lng:` based on filter type.
- 1D lat-only: write only `filter lat:`; remove `filter lng:`.
- 1D lng-only: write only `filter lng:`; remove `filter lat:`.
- Clear: remove both lines.
- `setDsl()` (silent).

### DSL → Map
`onDslChanged` parses `lat` and `lng` filters:
- Calls `mapEl.setExternalFilter(lat, lng)` (new public method, no event fired).
- Updates `committedGeoBox` for 2D, 1D lat, or 1D lng visualizations.

## 1D Snapping (world-map.ts)

In `onMouseUp`, after computing pixel dimensions of the drawn box:
- If `pixW < lw * 0.12 && pixW < pixH * 0.4` → lat-only (narrow longitude strip).
- Else if `pixH < lh * 0.12 && pixH < pixW * 0.4` → lng-only (narrow latitude strip).
- Commit `GeoFilter` with `latOnly: true` or `lngOnly: true` accordingly.

## 1D Visualization (world-map.ts)

Drawing the committed geo box:
- **lat-only**: horizontal band — `x1=0, x2=lw`, `y1=mapLatToY(latMax)`, `y2=mapLatToY(latMin)`
- **lng-only**: vertical band — `y1=0, y2=lh`, `x1=mapLngToX(lngMin)`, `x2=mapLngToX(lngMax)`
- **2D**: existing rectangle logic
- Same applied in `drawMiniMap()` (at mini scale)

## GeoFilter interface additions

```ts
export interface GeoFilter {
  latMin: number; latMax: number;
  lngMin: number; lngMax: number;
  latOnly?: boolean;  // only lat is constrained
  lngOnly?: boolean;  // only lng is constrained
}
```

## New public methods

`WorldMapElement.setExternalFilter(lat, lng)` — sets committedGeoBox, redraws, no event
`WorldMapElement` (existing `clearGeoFilter` logic via `onClearBox` still fires event)
`TimelineElement.setSelection(start, end)` — sets selectionStart/End, redraws, no event
`TimelineElement.clearSelection()` — clears selection, redraws, no event

## sendQuery() changes

Remove `geoFilter` argument (always `null`); lat/lng filtering via DSL only.
Remove `this.geoFilter` field from app-root.

## Helper (app-root.ts)

```ts
function setDslLine(dsl: string, pattern: RegExp, newLine: string): string
function round2(n: number): number  // Math.round(n * 100) / 100
```

## Affected Files

- `web-client/src/components/world-map.ts` — GeoFilter, 1D snapping, visualization, setExternalFilter
- `web-client/src/components/timeline.ts` — setSelection, clearSelection
- `web-client/src/components/app-root.ts` — bidirectional sync, remove geoFilter
