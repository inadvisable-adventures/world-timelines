# Timeline Density Histogram (TODO #32) — COMPLETED

## Summary

With 4,519 entries the timeline is a wall of overlapping dots. Add a density
histogram layer: draw semi-transparent vertical bars behind the axis showing how
many entries fall in each time bucket. The bar height is normalised to the tallest
bucket so the shape is readable regardless of total count.

## Bucket size

Adapt to the visible time range:
- range ≤ 200 years → 10-year buckets
- range ≤ 2000 years → 100-year buckets
- else → 1000-year buckets

## Visual

- Bars rendered below the axis (in the lower half of the canvas)
- Color: white at ~12% opacity (neutral, doesn't clash with category colors)
- Max bar height: ~40% of canvas height
- Drawn before entry dots so dots sit on top

## Affected Files

- `web-client/src/components/timeline.ts` — add `drawDensity()` called at the start
  of `draw()`, before drawing entry markers
