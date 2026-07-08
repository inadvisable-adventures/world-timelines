# Detail Panel Auto-Dismiss and Escape Key (TODO #33) — COMPLETED

## Summary

The entry detail panel stays visible when:
1. A new query runs and the selected entry is no longer in results
2. The user wants to dismiss it with the keyboard (Escape)

## Fixes

### Auto-dismiss on results change
In `app-root.ts`, track `selectedId: string | null = null`.
- Set it in `onEventSelected`
- In `onWorkerMessage` when results arrive: if `selectedId` is not found in the new
  results, call `detailEl.hide()` and clear `selectedId`

### Escape key dismiss
In `entry-detail.ts`, in `connectedCallback`, add a `keydown` listener on `document`
that calls `hide()` when `event.key === 'Escape'` and the panel is not hidden.
Remove the listener in `disconnectedCallback`.

## Affected Files

- `web-client/src/components/app-root.ts`
- `web-client/src/components/entry-detail.ts`
