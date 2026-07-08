# Global eras lane on a single line (#66) — COMPLETED

## Summary

The Global lane is special: it should not collapse/expand and should not have a
separate header row for its "Global Eras" label. The label and the eras share one
line, minimizing vertical space (the trimmed world-history eras are
non-overlapping, so they fit on a single track).

## Affected Files

- `web-client/src/components/timeline.ts`

## Approach

- In `layout()`, treat the global lane specially: not collapsible, no entries,
  eras packed onto a single track; `height = LANE_ERA_H` (one row, ~14px) instead
  of header + era block.
- In `drawLane()`, for the global lane draw the eras at the top of the band (no
  `LANE_HDR_H` offset) and overlay the "Global Eras" label chip on the same row
  with no chevron.
- In mouse handling, the global label click selects the lane (no
  collapse-toggle chevron zone); `collapsed` never applies to it.

## Verification

- `npm run build`; screenshot with the Global lane enabled shows a single compact
  row: "Global Eras" label + the five macro-period eras inline, no chevron, not
  collapsible.
