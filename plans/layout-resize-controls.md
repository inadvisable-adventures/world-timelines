# Layout resize controls (TODO item 17)

## Summary

Two related layout controls, both scoped to `app-root-template`'s
top-level layout (`web-client/public/index.html`):

(a) A toggle switching between the current arrangement — sidebar spans
    only the map row's height, timeline spans the full viewport width
    below it — and an alternate arrangement where the sidebar spans the
    full viewport height and the timeline only spans the map's width.
(b) Drag handles to resize the proportions between adjacent sections:
    map vs. sidebar (a vertical divider), and the top area vs. timeline
    (a horizontal divider).

## Investigation

Current layout (`app-root-template`) is nested flexbox: `:host` is a
flex column containing `.main-row` (flex row: `.map-col` + `.sidebar`)
then `.timeline-row` (a full-width sibling below `.main-row`). This
nesting is literally why the timeline is already full-width today — it
sits outside `.main-row` entirely, so the sidebar (inside `.main-row`)
structurally cannot reach the timeline's row.

Confirmed both child components' internal sizing is resize-agnostic:
`world-map.ts` and `timeline.ts` both size their `<canvas>` via a
`ResizeObserver` watching their own host element
(`new ResizeObserver(() => this.syncSize())`), which fires on *any*
layout-engine-caused size change — flex, grid, drag-driven inline
styles, whatever. No changes needed in either component for resizing to
work; this de-risked the whole approach.

## Design decisions

### CSS Grid with two `grid-template-areas` layouts, not DOM reparenting

Physically moving `.sidebar`/`.timeline-row` between different parent
containers per mode would risk disturbing the mounted web components
inside them (event listeners survive a reparent in practice, but it's
an unnecessary risk for zero benefit). Instead: switch `:host` from
flex to **CSS Grid**, give each section a named `grid-area`, and toggle
between two `grid-template-areas` strings via a class on the host. No
element ever moves in the DOM; only which grid cell it's assigned to
changes.

Default (today's arrangement, "timeline full width"):
```
"map      colgap sidebar"
"rowgap   rowgap rowgap"
"timeline timeline timeline"
```
`:host(.sidebar-full-height)`:
```
"map      colgap sidebar"
"rowgap   colgap sidebar"
"timeline colgap sidebar"
```
`colgap`/`rowgap` are the drag handles (see below) — giving them their
own named area (rather than absolutely positioning them over a
border) means they naturally relocate with everything else when the
arrangement toggles, no separate positioning logic per mode.

### Drag-resize via CSS custom properties, not JS-computed `grid-template` strings

`grid-template-columns: 1fr 6px var(--sidebar-w, 260px)` and
`grid-template-rows: 1fr 6px var(--timeline-h, 380px)` — the resize
drag handlers only ever update `--sidebar-w`/`--timeline-h` (via
`style.setProperty` on the host), never touch `grid-template-areas`
itself. This keeps the arrangement toggle (part a) and the proportion
drag (part b) fully orthogonal, matching how the TODO item itself
describes them as two independent controls — the same two size
variables apply unchanged under either arrangement.

Drag math: on `colgap` mousedown, track `mousemove` and set `--sidebar-w
= totalWidth - mouseX` (clamped to a sane range, e.g. 180px..60% of
total width so neither side can be squeezed to nothing); analogous for
`rowgap` using `mouseY` from the bottom edge, clamped similarly. Both
handles work identically in either arrangement (only *what's* on each
side of the divider changes, not the sizing mechanism).

### Session-only state, no persistence

Consistent with every other piece of UI state added so far (pin
selections, DSL filters, laneset choice) — none of it survives a page
reload today, and this doesn't either. Not a gap specific to this
feature; matches established project behavior.

### Toggle control placement

A small button near `settings-menu` (top-right chrome), following the
same "small icon/glyph button in a fixed corner" convention as the
gear icon and the timeline's `#fit-btn`. Toggles the
`sidebar-full-height` class on the app-root host; no DSL/query
involvement (this is a layout preference, not a data filter — doesn't
belong in the query DSL any more than window size would).

## Affected files

- `web-client/public/index.html` — `app-root-template`: grid rewrite,
  resizer element markup + styles, toggle button.
- `web-client/src/components/app-root.ts` — drag handlers for both
  resizers, toggle click handler.
- `TODO.md` — mark item 17 `COMPLETED` once implemented.

No changes to `world-map.ts`, `timeline.ts`, or any other child
component — confirmed via the ResizeObserver investigation above.

## Verification (for implementation time)

1. `tsc --noEmit` clean.
2. Confirm the default (unset) grid produces byte-identical visual
   proportions to today's flex layout (1fr map, 260px sidebar, 380px
   timeline) — this is a pure refactor at default settings, not just a
   new feature bolted on.
3. Toggle the arrangement; confirm the timeline narrows to the map's
   width and the sidebar extends to full height, and toggling back
   restores the original layout.
4. Drag each resizer through a real range; confirm both the dragged
   section and its neighbor resize smoothly, canvases stay correctly
   proportioned (no stretched/blurry map or timeline), and clamping
   prevents either side collapsing to zero.
5. Visual check in a browser once one is available — this is a pure
   layout/CSS feature, about as poorly suited to a Node-side check as
   any change in this project gets. Flag explicitly if skipped.
