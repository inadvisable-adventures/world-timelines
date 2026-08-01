# Expand/restore any panel to full viewport (TODO item 18) — COMPLETED

## Summary

An "expand" button on each major panel — map, timeline, sidebar, and the
entry-detail panel nested within the sidebar — that makes it temporarily
cover the entire app viewport, hiding everything else, with a clear way
back to the normal layout. Builds directly on TODO item 17's CSS Grid
rewrite of `app-root-template`.

## Design decisions

### Full-viewport takeover, not partial-axis expansion

The TODO text ("blow up... to take up all available space in its
relevant direction, like a slide-out/maximized view") is read here as
"maximize this one panel over the whole app," not "grow it along just
one axis" — a true maximize is unambiguous to implement and use, whereas
partial-axis expansion would need a different behavior per panel (map's
"relevant direction" vs. timeline's aren't the same) for comparatively
little benefit. All four expandable panels behave identically: expand →
full viewport, restore → back to whatever the grid/resize state
(TODO #17) already was.

### One `data-expanded` attribute on the app-root host, CSS does the rest

`this.expandedPanel: 'map' | 'timeline' | 'sidebar' | 'detail' | null`,
mirrored onto the host as `data-expanded="<value>"` (attribute removed
when `null`). All visibility/positioning is plain CSS keyed off this
attribute — no JS-driven layout math, unlike TODO #17's drag-resize
(there's nothing to compute here, just show/hide + `position: absolute;
inset: 0`).

Hiding is scoped narrowly: only `.map-col`, `.timeline-row`, the two
resizer tracks, and `.sidebar` itself ever get hidden — settings-menu,
the layout toggle, and the loading overlay stay visible/usable while
expanded (all three are corner overlays that don't conflict visually
with a full-cover panel, and keeping them reachable is a small,
harmless convenience).

**Sidebar and entry-detail share one mechanism, not two.** Naively,
"expand entry-detail" would need `.sidebar`'s ancestor box to eventually
turn `display: none` while pulling *only* `entry-detail` out to cover
the viewport — except a `display: none` ancestor unconditionally hides
its entire subtree regardless of a descendant's own `display`/`position`
values, so entry-detail can't be rescued that way. Instead: for
**both** `data-expanded="sidebar"` and `data-expanded="detail"`,
`.sidebar` itself becomes the `position: absolute; inset: 0` overlay
(it was always going to need to, for the "sidebar" case). The only
difference between the two is which of `.sidebar`'s *children* get
hidden: for `"detail"`, everything except `entry-detail` is hidden and
`entry-detail` switches from `flex: 0 0 auto` to `flex: 1 1 auto` to
fill the newly-fullscreen box; for `"sidebar"`, nothing inside changes.

### Buttons: per-panel toggle + one always-visible global restore

Each of `world-map.ts`, `timeline.ts`, and `entry-detail.ts` gets one
new button in its own template (mirroring where their existing small
controls already live — timeline's `#fit-btn`, entry-detail's header).
Clicking it dispatches a bubbling `expand-toggled` event with
`{ panel: 'map' | 'timeline' | 'detail' }` (each component hardcodes its
own panel name), the same event-up/state-down convention as
`pin-toggled`. The sidebar-as-a-whole button lives directly in
`app-root-template` (it isn't its own component) and needs no event
round-trip.

Additionally, app-root renders one **global restore button**, visible
only via `:host([data-expanded]) #restore-btn { display: flex; }`,
fixed in a spare corner — a deliberately unambiguous, always-findable
way back regardless of which panel is expanded or whether its own toggle
button is easy to relocate once everything else is hidden. Satisfies the
TODO's "a *clear* restore button" more literally than relying solely on
re-finding and re-clicking the expanding panel's own button.

Toggling a *different* panel's expand button while one is already
expanded switches directly to the new one (no stacking, no need to
restore first) — `setExpandedPanel(panel)` always replaces, never toggles
blindly; only clicking the *currently*-expanded panel's own button (or
the global restore) clears it. Each component exposes a silent
`setExpanded(bool)` (no event fired), the same "component exposes
setter, app-root drives it" pattern as `timeline.ts`'s
`setSelection`/`clearSelection` — needed so a panel's own button icon
resets correctly even when *something else* (global restore, or
switching straight to a different panel) is what actually closed it.

### Auto-restore if the expanded entry gets deselected out from under it

`onWorkerMessage`'s existing "deselect if the selected entry fell out of
the new result set" branch (`this.detailEl.hide(); this.selectedId =
null;`) needs one addition: if `expandedPanel === 'detail'` at that
moment, clear it too — otherwise the layout is left showing a full-
viewport empty sidebar box with nothing in it and no visible way to tell
what happened.

### Entry-detail's description un-clamps while expanded

`#detail-desc` is hard-clamped to 4 lines today (`-webkit-line-clamp:
4`) — reasonable for the panel's normal cramped size, actively wasteful
once it's filling the whole viewport. `setExpanded(true)` adds an
`.expanded` class that lifts the clamp and makes the description
scrollable instead. This is the one place this TODO item's UI work goes
slightly beyond pure show/hide, justified because "take up all available
space" ought to mean something for the content inside the expanded
panel, not just its outer box.

## Affected files

- `web-client/public/index.html` — `app-root-template`: `data-expanded`
  CSS rules, sidebar's own expand button, global restore button.
  `world-map-template`/`world-timeline-template`/`entry-detail-template`:
  one new button each.
- `web-client/src/components/app-root.ts` — `expandedPanel` state,
  `setExpandedPanel`, `expand-toggled` listener, auto-restore-on-
  deselect.
- `web-client/src/components/world-map.ts` — expand button wiring,
  `setExpanded(bool)`.
- `web-client/src/components/timeline.ts` — expand button wiring,
  `setExpanded(bool)`.
- `web-client/src/components/entry-detail.ts` — expand button wiring,
  `setExpanded(bool)`, description un-clamp.
- `TODO.md` — mark item 18 `COMPLETED` once implemented.

## Verification (for implementation time)

1. `tsc --noEmit` clean.
2. Expand each of the four panels in turn; confirm it covers the full
   viewport and everything else is hidden, then restore via its own
   button and confirm the prior layout (including any TODO #17 resize
   state) is exactly as it was.
3. Expand one panel, then click a *different* panel's expand button;
   confirm it switches directly without needing to restore first.
4. Expand entry-detail, confirm the description is no longer clamped to
   4 lines and scrolls if long; confirm the global restore button
   returns to normal.
5. Expand entry-detail, then trigger a query that would deselect the
   open entry; confirm the layout auto-restores rather than showing an
   empty full-viewport box.
6. Visual check in a browser once one is available — another
   layout/CSS-heavy feature poorly suited to a Node-side check. Flag
   explicitly if skipped.

## Result

Implemented as designed, with one real bug caught and fixed during
implementation and one placement adjustment.

- **Global restore button placement**: the plan didn't pin down an exact
  corner. Top-left was the first instinct (matching the "restore" =
  "start over" association) but that collides with the sidebar's own
  `.top-links` row once the sidebar itself is the fullscreen panel
  (`data-expanded="sidebar"`) — both would render at the same physical
  spot. Moved to bottom-left, the one corner not already claimed by
  settings-menu/layout-toggle-btn (top-right) or world-map's mini-map
  (bottom-right).
- **CSS cascade double-checked by hand, not assumed**: the "hide
  everything, then re-show the one expanding panel" pattern relies on
  `:host([data-expanded]) .map-col { display: none }` and
  `:host([data-expanded="map"]) .map-col { display: block; ... }`
  actually having the show-rule win. Both selectors compute to identical
  specificity (`:host([attr])` and `:host([attr="value"])` don't differ
  in specificity — only source order breaks the tie), so this only works
  because the hide rule was written *before* the show rule in the
  stylesheet. Verified this by hand-computing specificity rather than
  assuming CSS attribute-value selectors outrank attribute-presence
  selectors (they don't) — confirmed correct as written, but fragile
  enough to be worth documenting here for whoever touches this next.
- **Sidebar/entry-detail mechanism**: implemented exactly as designed —
  `.sidebar` becomes the fullscreen overlay for both `"sidebar"` and
  `"detail"`, with `.sidebar > *:not(entry-detail) { display: none }`
  only for the `"detail"` case. Confirmed via the compiled output that
  `entry-detail`'s `flex: 1 1 auto` override (specificity from the
  `:host([data-expanded="detail"]) entry-detail` type-selector chain)
  correctly outranks the base `entry-detail { flex: 0 0 auto }` rule
  regardless of source order (a type selector's inherently low
  specificity means this one didn't depend on cascade order the way the
  `.map-col`/`.timeline-row` show/hide pair does).
- **Auto-restore on deselect**: implemented in `onWorkerMessage`'s
  existing selection-invalidation branch, exactly where the plan
  identified it needed to go.
- **Verification performed**: `tsc --noEmit` clean, full build, confirmed
  all four components' compiled output reference `expand-toggled` and the
  running server serves the updated files. The CSS cascade/specificity
  correctness (the trickiest part of this feature, per the point above)
  was verified by manual selector-specificity computation rather than
  observed in a render, since no browser tool is available this session
  (confirmed via `ToolSearch`). **Not visually verified in a browser** —
  flagged explicitly, same as TODO #17 and every prior UI-heavy item this
  session.
