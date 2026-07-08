# Timeline Era Bands (TODO #54)

## Summary

Merge all six historical era TSV files into `web-client/public/data/historical_eras.tsv`,
load it in `app-root.ts`, and render the eras as vertically-stacked semi-transparent shaded
bands in the timeline. Bands are always visible regardless of the query filter. When eras
overlap in time, a greedy interval-coloring algorithm assigns them to separate horizontal
tracks so they don't visually overlap. Each band shows a short text label. Different source
regions get distinct muted colors.

## Affected Files

- `web-client/public/data/historical_eras.tsv` — new merged era file
- `web-client/src/types/index.ts` — add `HistoricalEra` interface
- `web-client/src/components/app-root.ts` — load eras, call `timeline.setEras()`
- `web-client/src/components/timeline.ts` — `setEras()` method, era band rendering

## Implementation

### 1. Merged TSV (`historical_eras.tsv`)

Concatenate all six source files:
- `historical_eras_claude.tsv` → add tag `"world-history"`
- `historical_eras_china.tsv` → already has `"china-history"` tag
- `historical_eras_egypt.tsv` → `"egypt-history"`
- `historical_eras_peru.tsv` → `"peru-history"`
- `historical_eras_rome.tsv` → `"rome-history"`
- `historical_eras_mesopotamia.tsv` → `"mesopotamia-history"`

Write header once, then all data rows. The `source` is derived from tags at parse time.

### 2. `HistoricalEra` type (`web-client/src/types/index.ts`)

```typescript
export interface HistoricalEra {
  id: string;
  title: string;
  startYear: number;
  endYear: number;
  source: string;   // "world-history" | "china-history" | ...
}
```

### 3. App-root loading

In `connectedCallback`, after setting up the worker:
```typescript
private async loadEras(): Promise<void> {
  const url = new URL('./data/historical_eras.tsv', location.href).href;
  const text = await fetch(url).then(r => r.text());
  const eras = parseErasTsv(text);
  this.timelineEl.setEras(eras);
}
```

`parseErasTsv(text)` parses by header column names:
- columns: `id`, `title`, `start_year`, `end_year`, `tags`
- derive `source` from the first tag matching `*-history`

Call `this.loadEras()` from `connectedCallback` (not awaited inline; fire-and-forget with `.catch`).

### 4. Timeline rendering

Constants:
```typescript
const ERA_PANEL_H = 80;       // pixels reserved at bottom of body for era bands
const ERA_MIN_TRACK_H = 10;   // min px per track
```

Source color map:
```typescript
const ERA_SOURCE_COLORS: Record<string, string> = {
  'world-history':        '#c8a060',
  'china-history':        '#e07070',
  'egypt-history':        '#d4b84a',
  'peru-history':         '#60b890',
  'rome-history':         '#8888d8',
  'mesopotamia-history':  '#d49060',
};
```

Layout changes in `timeline.ts`:
- `eraYBot()` = `lh() - AXIS_BOT_MARGIN` (where bottom axis line is drawn)
- `axisYBot()` = `eraYBot() - ERA_PANEL_H` (where events body ends; existing method renamed semantics)
- Events are placed between `axisTop` and `axisYBot()` (unchanged in terms of events code)
- Era panel occupies `[axisYBot(), eraYBot()]`

Stacking algorithm (called from `draw()` before era rendering):
1. Filter eras to those intersecting `[visibleStart, visibleEnd]`
2. Sort by `startYear` ascending
3. Greedy: for each era, assign to first track where `tracks[i] <= era.startYear`; else create new track
4. Track height = `ERA_PANEL_H / max(1, trackCount)`, clamped to `ERA_MIN_TRACK_H`

Band rendering per era:
- `x1 = max(0, yearToX(startYear))`, `x2 = min(lw, yearToX(endYear))`
- `y = eraTop + trackIdx * trackH`
- Fill: `color + '28'` (semi-transparent)
- Left edge stroke: 1px solid `color + '60'`
- Label: era title at `(x1 + 3, y + trackH * 0.72)`, 9px, `color + 'cc'`, clipped with `maxWidth = x2 - x1 - 6`; only drawn if `x2 - x1 > 18`

Separator line at `eraYBot` = `axisYBot()`:
- `#2a2a3a`, 1px horizontal

Bottom axis labels use `eraYBot()` instead of old `axisYBot()` in the tick/label drawing loop.

### 5. `setEras(eras: HistoricalEra[]): void`

Stores eras and calls `draw()`. No layout recalculation needed (eras don't affect event placement).

## Verification

- `npm run build` passes for both `ingester/` and `web-client/`
- Era bands visible in timeline spanning correct year ranges
- Overlapping eras (e.g., Liao + Song in 960–1125 CE) appear in separate tracks
- Bands disappear from view when scrolled out of visible range (clipped to canvas bounds)
- Labels readable at typical zoom levels
- Browser test: skipped (no automated browser in this environment)
