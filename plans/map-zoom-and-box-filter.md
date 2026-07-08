# Map Zoom and Geographic Box Filter (TODO #18) — COMPLETED

## Summary

Add two features to the `<world-map>` component:
1. **Zoom**: scroll wheel / trackpad pinch zooms the map in/out; a hover control (+ / − buttons) in the lower-right corner also controls zoom.
2. **Box filter**: click-and-drag draws an axis-aligned selection rectangle; releasing the mouse dispatches a custom `geo-filter-changed` event with lat/lng bounds; an × button in the upper-right of the box clears the selection and dispatches `geo-filter-changed` with null bounds.

`app-root` listens to `geo-filter-changed` and adds a geographic constraint to the worker query.

## Affected Files

- `web-client/src/components/world-map.ts` — zoom state, pan, drag-select, zoom control UI, × button, revised projection
- `web-client/src/components/app-root.ts` — listen for `geo-filter-changed`, pass lat/lng bounds to worker
- `web-client/src/worker/query-worker.ts` — apply lat/lng bounds filter
- `web-client/index.html` — add zoom control markup to `world-map-template`

## Implementation

### Zoom

- Add `zoomScale = 1` and `panX = 0, panY = 0` state to `WorldMapElement`.
- Update `lngToX` / `latToY` to accept zoom/pan parameters and apply them.
- Listen for `wheel` events: adjust `zoomScale` by `e.deltaY`, clamp to [1, 32], recalculate `panX/panY` so the point under the cursor stays fixed, redraw.
- Zoom control: two `<button>` elements (+/−) rendered in the shadow DOM, positioned absolute lower-right; clicking adjusts `zoomScale` and recenters pan.

### Box Filter

- On `mousedown` (no modifier needed): begin drag, record `dragStart`.
- On `mousemove` while dragging: update `dragEnd`, redraw box outline on canvas.
- On `mouseup`: compute lat/lng bounds from drag corners, dispatch `geo-filter-changed` CustomEvent with `{ latMin, latMax, lngMin, lngMax }`.
- Draw an × button as a small overlay div (or drawn on canvas) at the upper-right of the selection rectangle; clicking it dispatches `geo-filter-changed` with `null` and clears the box.
- Redraw loop: after drawing the map and event dots, if a box is active, draw it as a semi-transparent rect with a solid border.

### app-root

- Listen for `geo-filter-changed` on the `world-map` element.
- Store `geoFilter: { latMin, latMax, lngMin, lngMax } | null`.
- Include it in the worker query message.

### query-worker

- Accept optional `geoFilter` in query messages; filter events by `primaryLat` / `primaryLng` bounds before returning results.

## Verification

Build with `npm run build`. Launch local server and verify in browser (browser launch skipped per plan — note here that this step requires manual verification).
