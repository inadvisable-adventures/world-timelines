# Map Entry Labels at High Zoom (TODO #34) — COMPLETED

## Summary

At high zoom levels individual dots are well-separated but give no text context.
When `zoomScale >= 4`, draw the entry title to the right of each point dot.
Labels are clipped to the canvas width and rendered in a small, muted font so they
don't dominate the map at lower zoom levels.

## Implementation

In `world-map.ts`, at the end of `drawLocations` for `point` locations:
- If `this.zoomScale >= 4`, draw `ctx.fillText(entry.title, x + r + 4, y + 3)`
- Font: `'10px system-ui, sans-serif'`; fillStyle: `rgba(200,210,240,0.75)`
- Skip if `x < 0 || x > lw` (already off-screen)
- `ctx.save()` / `ctx.restore()` to avoid leaking fill/font state

## Affected Files

- `web-client/src/components/world-map.ts` — `drawLocations` point branch
