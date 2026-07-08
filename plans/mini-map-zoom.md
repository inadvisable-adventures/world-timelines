# Mini-Map Zoom Control (TODO #35) — COMPLETED

## Summary

Replace the simple +/− zoom buttons with a world mini-map in the lower-right corner.
The mini-map always shows the full world at zoom=1 and overlays a dashed rectangle
showing the main map's current viewport. Users can drag a box on the mini-map to zoom
the main map to that region. Two buttons live below the mini-map:
- **Full** (only visible when zoomed in): resets to zoom=1
- **Fit** (only visible when a geo-filter box is active): zooms to fit the selection

## Layout

Mini-map canvas: 150×75 CSS pixels (2:1, matching equirectangular aspect).
Positioned absolutely bottom-right inside world-map's shadow DOM.
Buttons (22px tall) appear below the canvas in a flex row.

## Coordinate helpers (mini-map ↔ lat/lng)

- `lngToMiniX(lng, mw)` = `((lng+180)/360) * mw`
- `latToMiniY(lat, mh)` = `((90-lat)/180) * mh`
- `miniXToLng(x, mw)` = `(x/mw)*360 - 180`
- `miniYToLat(y, mh)` = `90 - (y/mh)*180`

## Viewport rect on mini-map

Convert main-map canvas corners (0,0) and (lw,lh) to lat/lng using existing
`canvasXToLng` / `canvasYToLat`, then map those to mini-map pixels.
Only shown when `zoomScale > 1`.

## Mini-map drag → zoom

`mousedown` on mini-canvas: record start pixel.
`mousemove`: update end pixel, call `drawMiniMap()`.
`mouseup`: convert box corners to lat/lng, call `fitToGeo(latMin, latMax, lngMin, lngMax)`.
Skip if box is too small (< 5° lng or < 2° lat).

## `fitToGeo(latMin, latMax, lngMin, lngMax)`

```
zoomW = 0.9 * 360 / lngRange
zoomH = 0.9 * 180 / latRange
newZoom = clamp(min(zoomW, zoomH), 1, 32)
panX = lw/2 - ((centerLng+180)/360)*lw*newZoom
panY = lh/2 - ((90-centerLat)/180)*lh*newZoom
clampPan(); draw()
```

Shared by Fit button and mini-map drag commit.

## Affected Files

- `web-client/public/index.html` — replace `.zoom-controls` with `.mini-map-wrap`
- `web-client/src/components/world-map.ts` — drawMiniMap, fitToGeo, resetZoom, mini events
