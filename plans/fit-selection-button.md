# Fit-selection button (#68) — COMPLETED

## Summary

Add a "fit" button in the lower-right of the timeline's lane area (the non-date
portion). Clicking it:
- if a time selection exists → set the timeline view to the selection range;
- if no selection → create a selection equal to the current view.

## Affected Files

- `web-client/public/index.html` (world-timeline template: new `#fit-btn`)
- `web-client/src/components/timeline.ts`

## Approach

- Add an HTML button `#fit-btn` to the timeline template, absolutely positioned
  bottom-right just above the bottom date axis, styled like `#time-sel-clear`.
- On click:
  - If `selectionStart`/`selectionEnd` set: `visibleStart/End = selection` (pad a
    tiny amount if the span is ~0), then `layout(); draw(); emitRange()`.
  - Else: set `selectionStart/End` to the current visible range, `emitFilter()`,
    `draw()`.
- Keep it out of the way of the existing shift-scroll hint (move the hint or place
  the button clear of it).

## Verification

- `npm run build`; with a selection, clicking fits the view to it; with no
  selection, clicking creates a selection matching the view (and the clear "×"
  appears).
