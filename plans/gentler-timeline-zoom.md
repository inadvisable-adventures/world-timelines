# Gentler timeline zoom (#67) — COMPLETED

## Summary

Wheel zoom on the timeline is too sensitive. Make it much gentler and
proportional to the wheel delta (so trackpads and mouse wheels both feel smooth).

## Affected Files

- `web-client/src/components/timeline.ts` (`onWheel`)

## Approach

Replace the fixed `factor = deltaY > 0 ? 1.15 : 0.87` with a small
delta-proportional factor, clamped per event to avoid large jumps:

```ts
const factor = Math.exp(clamp(e.deltaY * 0.0006, -0.25, 0.25));
```

`deltaY ≈ 100` (one mouse notch) → factor ≈ 1.06 (was 1.15). Shift-wheel lane
scrolling is unchanged.

## Verification

- `npm run build`; scrolling zooms noticeably more slowly and smoothly.
