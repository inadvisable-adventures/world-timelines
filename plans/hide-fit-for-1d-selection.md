# Hide Fit Button for 1D Geo Filter Selections (TODO #44)

## Summary

The mini-map's "Fit" button calls `fitToGeo()` which zooms the main map to the
bounding box of the committed geo filter. For a lat-only (horizontal band) or
lng-only (vertical band) selection the bounding box spans the full opposite axis,
so fitting would produce the same result as "Full" — the button is misleading.
Hide it whenever the committed filter is 1D.

## Affected Files

- `web-client/src/components/world-map.ts` — `drawMiniMap()` button visibility logic

## Implementation

In `drawMiniMap()`, replace:

```ts
this.zoomFitBtn.classList.toggle('hidden', !this.committedGeoBox);
```

with:

```ts
const showFit = !!(
  this.committedGeoBox &&
  !this.committedGeoBox.latOnly &&
  !this.committedGeoBox.lngOnly
);
this.zoomFitBtn.classList.toggle('hidden', !showFit);
```
