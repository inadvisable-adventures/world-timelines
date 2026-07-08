# Implement `<world-map>` Web Component

## Summary

Build a Canvas-based world map web component that draws country outlines from GeoJSON using an equirectangular projection and renders event markers with hover and click interaction.

## Affected Files

- `web-client/src/components/world-map.ts`
- `web-client/public/index.html` (template tag)

## Step-by-Step Implementation

1. Define `WorldMapElement extends HTMLElement` and register as `customElements.define('world-map', ...)`.
2. Use a `<template>` + `<slot>` in `public/index.html` for the component's shadow DOM structure (canvas element + styles).
3. In `connectedCallback`: attach shadow DOM from template, create a `ResizeObserver` to keep canvas resolution in sync with layout size, fetch and parse `world-110m.geojson`.
4. **Equirectangular projection helpers**:
   - `lngToX(lng: number, width: number): number` → `(lng + 180) / 360 * width`
   - `latToY(lat: number, height: number): number` → `(90 - lat) / 180 * height`
5. **`drawMap()`**: clear canvas, iterate GeoJSON features, stroke polygon/multipolygon rings using projection helpers.
6. **`setEvents(events: HistoricalEvent[])`** (public method): store events, redraw, computing pixel positions for each.
7. **`drawMarkers()`**: draw a colored circle for each event at its projected position. Color by category.
8. **Mouse events on canvas**:
   - `mousemove`: find nearest marker within hit radius → show tooltip div (positioned absolutely).
   - `click`: find nearest marker → dispatch `event-selected` custom event with event id.
9. Expose `highlightEvent(id: string | null)` to draw a selection ring.

## Key Design Decisions

- Canvas chosen over SVG for performance (100K+ markers eventually).
- Shadow DOM used for style encapsulation; canvas sizing handled via `ResizeObserver` to avoid blurry rendering on HiDPI.
- GeoJSON parsed manually (coordinates arrays) — no external geo library.
- Country fill is flat light grey; borders are darker grey. Water is the canvas background color.

## Verification

- After build, open `public/index.html` in a browser and confirm the world map renders with country outlines.
- (Skipped: requires browser launch.)
