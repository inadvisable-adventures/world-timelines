import type { HistoricalEra, HistoricalEvent, Lane, Laneset } from '../types/index.js';
import { primaryLat, primaryLng } from '../types/index.js';
import { assignLane } from '../geo/point-in-polygon.js';

const CATEGORY_COLORS: Record<string, string> = {
  person:              '#7eb8f7',
  event:               '#f7a07e',
  place:               '#7ef7a0',
  artifact:            '#f7e07e',
  pol_mil_organization:'#f77e7e',
  business:            '#7edef7',
  historical_period:   '#d4a07e',
  concepts:            '#b07ef7',
  other:               '#c0b0e0',
};

// Palette cycled across lanes (regions). Kept muted; bands render very dark.
const LANE_PALETTE = [
  '#e07070', '#d4b840', '#50b880', '#8888d8', '#d49060',
  '#90c040', '#70c0d0', '#c070c0', '#c8a060', '#88b0e0',
  '#b0c060', '#e09060',
];
const GLOBAL_LANE_COLOR = '#c8a060';

const DEBOUNCE_MS = 50;
const AXIS_TOP = 20;
const AXIS_BOT = 20;
const LANE_HDR_H = 15;   // lane header row (collapsed height)
const LANE_ERA_H = 14;   // era row within an expanded lane
const ENTRY_ROW_H = 11;  // packed entry row height
const MAX_ENTRY_ROWS = 8;
const MARKER_R = 4;
const TITLE_MAX_W = 120;
const MAX_ERA_TRACKS = 2;

interface PlacedEntry {
  event: HistoricalEvent;
  x: number;       // start px
  x2: number;      // end px (== x for instants)
  laneIdx: number;
  row: number;     // packed row within the lane
  startYear: number;
  endYear: number;
}

interface EraPlaced { era: HistoricalEra; track: number; }

interface LaneRow {
  id: string;
  name: string;
  description: string;
  color: string;
  isGlobal: boolean;
  eras: EraPlaced[];
  eraTracks: number;
  entries: PlacedEntry[];
  entryRows: number;
  collapsed: boolean;
  y: number;       // top within the lane stack (stack coords)
  height: number;
}

function formatYears(start: number, end: number): string {
  const fmt = (y: number) => y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

function tickInterval(span: number): number {
  for (const t of [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]) {
    if (t >= span / 8) return t;
  }
  return 5000;
}

export class TimelineElement extends HTMLElement {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private tooltip!: HTMLElement;
  private tooltipTitle!: HTMLElement;
  private tooltipYears!: HTMLElement;
  private selClearBtn!: HTMLElement;
  private fitBtn!: HTMLElement;

  private visibleStart = -3000;
  private visibleEnd = 2100;
  private events: HistoricalEvent[] = [];
  private eras: HistoricalEra[] = [];
  private laneset: Laneset | null = null;
  private showGlobalEras = false;

  private laneRows: LaneRow[] = [];
  private collapsed = new Set<string>(); // lane ids collapsed by the user (global lane is special)
  private scrollY = 0;

  private selectedId: string | null = null;
  private selectedLaneId: string | null = null;
  private dpr = 1;

  // Drag state
  private dragMode: 'pan' | 'select' | null = null;
  private dragStartX = 0;
  private dragLastX = 0;
  private selDragStartYear: number | null = null;
  private selDragCurrentYear: number | null = null;
  private isSelDragging = false;

  private selectionStart: number | null = null;
  private selectionEnd: number | null = null;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver!: ResizeObserver;

  connectedCallback(): void {
    const template = document.getElementById('world-timeline-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.canvas = shadow.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.tooltip = shadow.getElementById('tooltip')!;
    this.tooltipTitle = shadow.getElementById('tooltip-title')!;
    this.tooltipYears = shadow.getElementById('tooltip-years')!;
    this.selClearBtn = shadow.getElementById('time-sel-clear')!;
    this.fitBtn = shadow.getElementById('fit-btn')!;
    this.fitBtn.addEventListener('click', () => this.onFit());

    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(this);

    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.selClearBtn.addEventListener('click', () => {
      this.selectionStart = null;
      this.selectionEnd = null;
      this.emitFilter();
      this.draw();
    });

    this.syncSize();
  }

  disconnectedCallback(): void { this.resizeObserver.disconnect(); }

  private syncSize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.layout();
    this.draw();
  }

  // ── public API ──────────────────────────────────────────────────────────
  setEvents(events: HistoricalEvent[]): void { this.events = events; this.layout(); this.draw(); }
  setEras(eras: HistoricalEra[]): void { this.eras = eras; this.layout(); this.draw(); }
  setLaneset(laneset: Laneset | null): void { this.laneset = laneset; this.layout(); this.draw(); }
  setShowGlobalEras(show: boolean): void { this.showGlobalEras = show; this.layout(); this.draw(); }
  highlightEvent(id: string | null): void { this.selectedId = id; if (id) this.selectedLaneId = null; this.draw(); }
  selectLane(id: string | null): void { this.selectedLaneId = id; if (id) this.selectedId = null; this.draw(); }

  setSelection(start: number, end: number): void { this.selectionStart = start; this.selectionEnd = end; this.draw(); }
  clearSelection(): void { this.selectionStart = null; this.selectionEnd = null; this.draw(); }
  getVisibleRange(): [number, number] { return [Math.floor(this.visibleStart), Math.ceil(this.visibleEnd)]; }

  // ── geometry helpers ──────────────────────────────────────────────────────
  private lw(): number { return this.canvas.width / this.dpr; }
  private lh(): number { return this.canvas.height / this.dpr; }
  private laneAreaTop(): number { return AXIS_TOP; }
  private laneAreaBot(): number { return this.lh() - AXIS_BOT; }
  private laneAreaH(): number { return this.laneAreaBot() - this.laneAreaTop(); }
  private stackH(): number { return this.laneRows.reduce((s, l) => s + l.height, 0); }
  private maxScroll(): number { return Math.max(0, this.stackH() - this.laneAreaH()); }

  private yearToX(year: number): number {
    return ((year - this.visibleStart) / (this.visibleEnd - this.visibleStart)) * this.lw();
  }
  private xToYear(x: number): number {
    return this.visibleStart + (x / this.lw()) * (this.visibleEnd - this.visibleStart);
  }
  private eventYears(ev: HistoricalEvent): [number, number] {
    const s = ev.startDate.startYear;
    const e = ev.endDate?.startYear ?? ev.startDate.endYear;
    return [s, e];
  }

  // ── layout ────────────────────────────────────────────────────────────────

  private layout(): void {
    const lanes = this.buildLaneList();

    // Assign entries to lanes by coordinate (result set is small, ≤ limit).
    const byLane = new Map<string, HistoricalEvent[]>();
    for (const l of lanes) byLane.set(l.id, []);
    for (const ev of this.events) {
      const lng = primaryLng(ev), lat = primaryLat(ev);
      let id: string | null = null;
      if (lng !== null && lat !== null) {
        id = this.laneset ? assignLane(lng, lat, this.laneset.lanes) : 'all';
      }
      if (id && byLane.has(id)) byLane.get(id)!.push(ev);
    }

    // Assign eras to lanes by source.
    const erasByLane = new Map<string, HistoricalEra[]>();
    for (const l of lanes) erasByLane.set(l.id, []);
    for (const era of this.eras) {
      const target = lanes.find(l =>
        l.isGlobal ? era.source === 'world-history'
                   : (l.eraSourceSet.has(era.source)),
      );
      if (target) erasByLane.get(target.id)!.push(era);
    }

    // Build LaneRows with packing + heights.
    this.laneRows = [];
    let y = 0;
    for (const l of lanes) {
      const laneEras = erasByLane.get(l.id) ?? [];

      // The Global lane is special: single line (label + eras inline), never
      // collapses, no entries — so it takes minimal vertical space.
      if (l.isGlobal) {
        const { placed: eras, tracks } = this.packEras(laneEras);
        const eraTracks = Math.max(1, tracks);
        const height = eraTracks * LANE_ERA_H;
        this.laneRows.push({
          id: l.id, name: l.name, description: l.description, color: l.color,
          isGlobal: true, eras, eraTracks, entries: [], entryRows: 0,
          collapsed: false, y, height,
        });
        y += height;
        continue;
      }

      const collapsed = this.collapsed.has(l.id);
      const laneEvents = byLane.get(l.id) ?? [];

      const { placed: entries, rows: entryRows } = collapsed
        ? { placed: [], rows: 0 }
        : this.packEntries(laneEvents, this.laneRows.length);
      const { placed: eras, tracks: eraTracks } = collapsed
        ? { placed: [], tracks: 0 }
        : this.packEras(laneEras);

      const contentH = collapsed ? 0
        : (eras.length ? eraTracks * LANE_ERA_H : 0) + entryRows * ENTRY_ROW_H + 4;
      const height = LANE_HDR_H + contentH;

      this.laneRows.push({
        id: l.id, name: l.name, description: l.description, color: l.color,
        isGlobal: l.isGlobal, eras, eraTracks, entries, entryRows,
        collapsed, y, height,
      });
      y += height;
    }

    // Re-point entry laneIdx now that laneRows is final.
    this.laneRows.forEach((lr, idx) => lr.entries.forEach(e => { e.laneIdx = idx; }));

    this.scrollY = Math.min(this.scrollY, this.maxScroll());
  }

  // The ordered lanes to render: optional Global lane, then the laneset's lanes.
  // With no laneset ('none'), a single implicit 'all' lane holds every entry.
  private buildLaneList(): Array<{
    id: string; name: string; description: string; color: string;
    isGlobal: boolean; eraSourceSet: Set<string>;
  }> {
    if (!this.laneset) {
      return [{ id: 'all', name: '', description: '', color: '#8899bb', isGlobal: false, eraSourceSet: new Set() }];
    }
    const out: Array<{ id: string; name: string; description: string; color: string; isGlobal: boolean; eraSourceSet: Set<string> }> = [];
    if (this.showGlobalEras) {
      out.push({
        id: 'global', name: 'Global Eras',
        description: 'World-spanning historical periods not tied to a single region.',
        color: GLOBAL_LANE_COLOR, isGlobal: true, eraSourceSet: new Set(['world-history']),
      });
    }
    this.laneset.lanes.forEach((lane: Lane, i) => {
      out.push({
        id: lane.id, name: lane.name, description: lane.description,
        color: LANE_PALETTE[i % LANE_PALETTE.length], isGlobal: false,
        eraSourceSet: new Set(lane.eraSources ?? []),
      });
    });
    return out;
  }

  // Greedy vertical packing of entries into rows (by x, capped).
  private packEntries(events: HistoricalEvent[], laneIdx: number): { placed: PlacedEntry[]; rows: number } {
    const items = events.map(ev => {
      const [startYear, endYear] = this.eventYears(ev);
      return { ev, startYear, endYear, x: this.yearToX(startYear), x2: this.yearToX(endYear) };
    }).sort((a, b) => a.x - b.x);

    const rowEnds: number[] = [];
    const placed: PlacedEntry[] = [];
    for (const it of items) {
      const left = it.x - MARKER_R;
      const right = Math.max(it.x2, it.x + MARKER_R) + 40; // reserve label-ish gap
      let row = rowEnds.findIndex(e => e <= left);
      if (row < 0) {
        if (rowEnds.length >= MAX_ENTRY_ROWS) row = rowEnds.length - 1; // overflow onto last row
        else { row = rowEnds.length; rowEnds.push(right); }
      }
      rowEnds[row] = right;
      placed.push({ event: it.ev, x: it.x, x2: it.x2, laneIdx, row, startYear: it.startYear, endYear: it.endYear });
    }
    return { placed, rows: rowEnds.length };
  }

  // Era sub-track assignment, capped at MAX_ERA_TRACKS. When more overlap than
  // fit, keep the latest-ending eras (evict the earliest-ending).
  private packEras(eras: HistoricalEra[]): { placed: EraPlaced[]; tracks: number } {
    const sorted = [...eras].sort((a, b) => a.startYear - b.startYear);
    const active: (HistoricalEra | null)[] = new Array(MAX_ERA_TRACKS).fill(null);
    const placed: EraPlaced[] = [];
    let usedTracks = 0;
    for (const era of sorted) {
      // Free any track whose era ended before this one starts.
      for (let t = 0; t < MAX_ERA_TRACKS; t++) {
        if (active[t] && active[t]!.endYear <= era.startYear) active[t] = null;
      }
      let track = active.findIndex(a => a === null);
      if (track < 0) {
        // All tracks busy (deep overlap): evict the earliest-ending if this era ends later.
        let minT = 0;
        for (let t = 1; t < MAX_ERA_TRACKS; t++) if (active[t]!.endYear < active[minT]!.endYear) minT = t;
        if (era.endYear > active[minT]!.endYear) {
          // Remove the evicted era's placement.
          const ev = active[minT]!;
          const idx = placed.findIndex(p => p.era === ev);
          if (idx >= 0) placed.splice(idx, 1);
          track = minT;
        } else {
          continue; // drop this era (an earlier-ending one already covers the crowd)
        }
      }
      active[track] = era;
      placed.push({ era, track });
      usedTracks = Math.max(usedTracks, track + 1);
    }
    return { placed, tracks: usedTracks };
  }

  // ── drawing ─────────────────────────────────────────────────────────────

  private draw(): void {
    const { ctx } = this;
    const lw = this.lw();
    const lh = this.lh();
    const top = this.laneAreaTop();
    const bot = this.laneAreaBot();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, lw, lh);

    this.drawAxes(ctx, lw, top, bot);

    // Lane stack (clipped + scrolled).
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, lw, bot - top);
    ctx.clip();
    for (const lane of this.laneRows) this.drawLane(ctx, lw, lane);
    // Sticky titles drawn last so they sit above content.
    for (const lane of this.laneRows) this.drawLaneTitle(ctx, lane);
    ctx.restore();

    // Time selection overlay (spans the lane area).
    const selRange = this.isSelDragging && this.selDragStartYear !== null && this.selDragCurrentYear !== null
      ? [Math.min(this.selDragStartYear, this.selDragCurrentYear), Math.max(this.selDragStartYear, this.selDragCurrentYear)]
      : (this.selectionStart !== null && this.selectionEnd !== null
          ? [Math.min(this.selectionStart, this.selectionEnd), Math.max(this.selectionStart, this.selectionEnd)]
          : null);
    if (selRange) {
      const x1 = this.yearToX(selRange[0]), x2 = this.yearToX(selRange[1]);
      ctx.fillStyle = 'rgba(126,184,247,0.10)';
      ctx.fillRect(x1, top, x2 - x1, bot - top);
      ctx.strokeStyle = 'rgba(126,184,247,0.55)';
      ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.strokeRect(x1, top, x2 - x1, bot - top);
      ctx.setLineDash([]);
    }

    // Selection clear button.
    if (!this.isSelDragging && this.selectionStart !== null && this.selectionEnd !== null) {
      const x2 = this.yearToX(Math.max(this.selectionStart, this.selectionEnd));
      this.selClearBtn.style.left = `${Math.max(2, Math.min(lw - 22, x2 - 20))}px`;
      this.selClearBtn.style.display = 'flex';
    } else {
      this.selClearBtn.style.display = 'none';
    }

    // Scroll hint (bottom-left, clear of the fit button).
    if (this.maxScroll() > 0) {
      ctx.fillStyle = '#454b63';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('⇅ shift-scroll', 6, bot - 4);
    }
  }

  private drawAxes(ctx: CanvasRenderingContext2D, lw: number, top: number, bot: number): void {
    ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(lw, top); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, bot); ctx.lineTo(lw, bot); ctx.stroke();

    const span = this.visibleEnd - this.visibleStart;
    const interval = tickInterval(span);
    const startTick = Math.ceil(this.visibleStart / interval) * interval;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let y = startTick; y <= this.visibleEnd; y += interval) {
      const x = this.yearToX(y);
      if (x < 0 || x > lw) continue;
      ctx.strokeStyle = 'rgba(40,42,58,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
      const label = y === 0 ? '0' : y < 0 ? `${Math.abs(y)} BCE` : `${y}`;
      ctx.fillStyle = '#606070';
      ctx.fillText(label, x, top - 6);
      ctx.fillText(label, x, bot + 14);
    }
  }

  private laneScreenY(lane: LaneRow): number { return this.laneAreaTop() - this.scrollY + lane.y; }

  private drawLane(ctx: CanvasRenderingContext2D, lw: number, lane: LaneRow): void {
    const sy = this.laneScreenY(lane);
    if (sy > this.laneAreaBot() || sy + lane.height < this.laneAreaTop()) return; // offscreen

    const selected = lane.id === this.selectedLaneId;
    // Very dark band, faintly tinted by the lane color; selected lanes read brighter.
    ctx.fillStyle = selected ? lane.color + '22' : lane.color + '10';
    ctx.fillRect(0, sy, lw, lane.height);
    // Divider between lanes.
    ctx.strokeStyle = '#1c1f2e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, sy + lane.height); ctx.lineTo(lw, sy + lane.height); ctx.stroke();
    if (selected) {
      ctx.strokeStyle = lane.color + 'aa'; ctx.lineWidth = 1.5;
      ctx.strokeRect(0.75, sy + 0.75, lw - 1.5, lane.height - 1.5);
    }

    if (lane.collapsed) return;

    // Global lane has no header row — eras sit on the same line as the label.
    const bodyTop = sy + (lane.isGlobal ? 0 : LANE_HDR_H);

    // Eras: dotted separators + view-centered labels.
    const eraBlockH = lane.eras.length ? lane.eraTracks * LANE_ERA_H : 0;
    for (const { era, track } of lane.eras) {
      if (era.endYear < this.visibleStart || era.startYear > this.visibleEnd) continue;
      const x1 = this.yearToX(era.startYear);
      const x2 = this.yearToX(era.endYear);
      const ey = bodyTop + track * LANE_ERA_H;
      // Faint fill for the era span.
      ctx.fillStyle = lane.color + '1e';
      ctx.fillRect(Math.max(0, x1), ey, Math.min(lw, x2) - Math.max(0, x1), LANE_ERA_H - 2);
      // Dotted boundary lines at start and end.
      ctx.strokeStyle = lane.color + '99'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      for (const bx of [x1, x2]) {
        if (bx >= 0 && bx <= lw) { ctx.beginPath(); ctx.moveTo(bx, ey); ctx.lineTo(bx, ey + LANE_ERA_H - 2); ctx.stroke(); }
      }
      ctx.setLineDash([]);
      // View-centered label: center within the visible portion of the era.
      const visL = Math.max(0, x1), visR = Math.min(lw, x2);
      if (visR - visL > 24) {
        ctx.font = '8px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = lane.color + 'dd';
        ctx.fillText(era.title, (visL + visR) / 2, ey + (LANE_ERA_H - 2) * 0.72, visR - visL - 6);
      }
    }

    // Entries packed below the era block.
    const entryTop = bodyTop + eraBlockH;
    for (const p of lane.entries) {
      const cy = entryTop + p.row * ENTRY_ROW_H + ENTRY_ROW_H / 2;
      const color = CATEGORY_COLORS[p.event.category] ?? CATEGORY_COLORS.other;
      const isSel = p.event.id === this.selectedId;
      // Duration shaded region (border brighter than fill).
      if (p.endYear !== p.startYear && p.x2 - p.x > 1) {
        ctx.fillStyle = color + '33';
        ctx.fillRect(p.x, cy - MARKER_R, p.x2 - p.x, MARKER_R * 2);
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.strokeRect(p.x, cy - MARKER_R, p.x2 - p.x, MARKER_R * 2);
      }
      // Marker: dark fill, bright border.
      ctx.beginPath();
      ctx.arc(p.x, cy, isSel ? MARKER_R + 2 : MARKER_R, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? '#ffffff' : color + '66';
      ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = isSel ? 2 : 1.4;
      ctx.stroke();
    }
  }

  private drawLaneTitle(ctx: CanvasRenderingContext2D, lane: LaneRow): void {
    if (!lane.name) return; // implicit 'all' lane has no title
    const sy = this.laneScreenY(lane);
    const rowH = lane.isGlobal ? lane.height : LANE_HDR_H;
    if (sy > this.laneAreaBot() || sy + rowH < this.laneAreaTop()) return;
    // Global lane: label only (no chevron), on the same row as its eras.
    const text = lane.isGlobal ? lane.name : `${lane.collapsed ? '▶' : '▼'} ${lane.name}`;
    ctx.font = 'bold 9px system-ui, sans-serif';
    const w = Math.min(TITLE_MAX_W, ctx.measureText(text).width + 10);
    // Sticky chip at viewport left.
    ctx.fillStyle = 'rgba(10,12,18,0.82)';
    ctx.fillRect(0, sy, w, rowH);
    ctx.fillStyle = lane.color + 'cc';
    ctx.fillRect(0, sy, 3, rowH);
    ctx.textAlign = 'left';
    ctx.fillStyle = lane.id === this.selectedLaneId ? '#ffffff' : lane.color + 'ee';
    ctx.fillText(text, 7, sy + rowH * 0.72, TITLE_MAX_W - 8);
  }

  // ── hit testing ───────────────────────────────────────────────────────────

  private laneTitleWidth(lane: LaneRow): number {
    const { ctx } = this;
    ctx.font = 'bold 9px system-ui, sans-serif';
    const text = lane.isGlobal ? lane.name : `${lane.collapsed ? '▶' : '▼'} ${lane.name}`;
    return Math.min(TITLE_MAX_W, ctx.measureText(text).width + 10);
  }

  private laneAt(cy: number): LaneRow | null {
    if (cy < this.laneAreaTop() || cy > this.laneAreaBot()) return null;
    for (const lane of this.laneRows) {
      const sy = this.laneScreenY(lane);
      if (cy >= sy && cy < sy + lane.height) return lane;
    }
    return null;
  }

  private titleAt(cx: number, cy: number): LaneRow | null {
    const lane = this.laneAt(cy);
    if (!lane || !lane.name) return null;
    const sy = this.laneScreenY(lane);
    const rowH = lane.isGlobal ? lane.height : LANE_HDR_H;
    if (cy > sy + rowH) return null;
    return cx <= this.laneTitleWidth(lane) ? lane : null;
  }

  private entryAt(cx: number, cy: number): PlacedEntry | null {
    let best: PlacedEntry | null = null, bestD = 60;
    for (const lane of this.laneRows) {
      if (lane.collapsed) continue;
      const sy = this.laneScreenY(lane);
      const entryTop = sy + LANE_HDR_H + (lane.eras.length ? lane.eraTracks * LANE_ERA_H : 0);
      for (const p of lane.entries) {
        const ey = entryTop + p.row * ENTRY_ROW_H + ENTRY_ROW_H / 2;
        const d = (p.x - cx) ** 2 + (ey - cy) ** 2;
        if (d < bestD) { bestD = d; best = p; }
      }
    }
    return best;
  }

  private canvasXY(e: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }
  private inLaneArea(cy: number): boolean { return cy >= this.laneAreaTop() && cy <= this.laneAreaBot(); }

  // ── mouse ───────────────────────────────────────────────────────────────

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const [cx, cy] = this.canvasXY(e);

    // Lane title: chevron toggles collapse, rest selects the lane.
    const title = this.titleAt(cx, cy);
    if (title) {
      if (!title.isGlobal && cx <= 14) {
        // Chevron zone toggles collapse (Global lane never collapses).
        if (this.collapsed.has(title.id)) this.collapsed.delete(title.id);
        else this.collapsed.add(title.id);
        this.layout(); this.draw();
      } else {
        this.dispatchEvent(new CustomEvent('lane-selected', {
          detail: { id: title.id, name: title.name, description: title.description, geometrySource: title.id },
          bubbles: true, composed: true,
        }));
      }
      return;
    }

    this.dragStartX = e.clientX;
    this.dragLastX = e.clientX;
    if (this.inLaneArea(cy)) {
      this.dragMode = 'select';
      this.selDragStartYear = this.xToYear(cx);
      this.selDragCurrentYear = this.xToYear(cx);
      this.isSelDragging = false;
    } else {
      this.dragMode = 'pan';
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const [cx, cy] = this.canvasXY(e);

    if (this.dragMode === 'pan' && (e.buttons & 1)) {
      const dx = e.clientX - this.dragLastX; this.dragLastX = e.clientX;
      const delta = -dx * (this.visibleEnd - this.visibleStart) / this.lw();
      this.visibleStart += delta; this.visibleEnd += delta;
      this.layout(); this.draw(); this.emitRange();
      this.tooltip.classList.remove('visible');
      return;
    }
    if (this.dragMode === 'select' && (e.buttons & 1)) {
      if (Math.abs(e.clientX - this.dragStartX) > 4) {
        this.isSelDragging = true;
        this.selDragCurrentYear = this.xToYear(cx);
        this.draw();
      }
      return;
    }

    // Hover cursor + tooltip.
    if (this.titleAt(cx, cy)) { this.canvas.style.cursor = 'pointer'; this.tooltip.classList.remove('visible'); return; }
    const hit = this.entryAt(cx, cy);
    if (hit) {
      this.tooltipTitle.textContent = hit.event.title;
      this.tooltipYears.textContent = formatYears(hit.startYear, hit.endYear);
      this.tooltip.classList.add('visible');
      const rect = this.canvas.getBoundingClientRect();
      let tx = e.clientX - rect.left + 12, ty = e.clientY - rect.top - 50;
      if (tx + 230 > rect.width) tx -= 250;
      if (ty < 0) ty = 8;
      this.tooltip.style.left = `${tx}px`; this.tooltip.style.top = `${ty}px`;
      this.canvas.style.cursor = 'pointer';
    } else {
      this.tooltip.classList.remove('visible');
      this.canvas.style.cursor = this.inLaneArea(cy) ? 'crosshair' : 'ew-resize';
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    if (this.dragMode === 'select') {
      if (this.isSelDragging && this.selDragStartYear !== null && this.selDragCurrentYear !== null) {
        this.selectionStart = Math.min(this.selDragStartYear, this.selDragCurrentYear);
        this.selectionEnd = Math.max(this.selDragStartYear, this.selDragCurrentYear);
        this.emitFilter();
      } else {
        const [cx, cy] = this.canvasXY(e);
        const hit = this.entryAt(cx, cy);
        if (hit) {
          this.dispatchEvent(new CustomEvent('event-selected', {
            detail: { id: hit.event.id }, bubbles: true, composed: true,
          }));
        }
      }
    }
    this.dragMode = null; this.isSelDragging = false;
    this.selDragStartYear = null; this.selDragCurrentYear = null;
    this.draw();
  }

  private onMouseLeave(): void {
    this.dragMode = null; this.isSelDragging = false;
    this.selDragStartYear = null; this.selDragCurrentYear = null;
    this.tooltip.classList.remove('visible');
    this.canvas.style.cursor = 'ew-resize';
    this.draw();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    // Shift-wheel scrolls the lane stack vertically; plain wheel zooms time.
    if (e.shiftKey && this.maxScroll() > 0) {
      this.scrollY = Math.max(0, Math.min(this.maxScroll(), this.scrollY + e.deltaY));
      this.draw();
      return;
    }
    const [cx] = this.canvasXY(e);
    const pivotYear = this.xToYear(cx);
    // Gentle, delta-proportional zoom (clamped per event). ~1.06 for one wheel notch.
    const factor = Math.exp(Math.max(-0.25, Math.min(0.25, e.deltaY * 0.0006)));
    const ns = pivotYear + (this.visibleStart - pivotYear) * factor;
    const ne = pivotYear + (this.visibleEnd - pivotYear) * factor;
    if (ne - ns < 5) return;
    this.visibleStart = ns; this.visibleEnd = ne;
    this.layout(); this.draw(); this.emitRange();
  }

  // "Fit" button: if a selection exists, set the view to it; otherwise select
  // the current view (create a filter matching what's shown).
  private onFit(): void {
    if (this.selectionStart !== null && this.selectionEnd !== null) {
      let a = Math.min(this.selectionStart, this.selectionEnd);
      let b = Math.max(this.selectionStart, this.selectionEnd);
      if (b - a < 1) { a -= 1; b += 1; } // avoid a zero-width view
      this.visibleStart = a; this.visibleEnd = b;
      this.layout(); this.draw(); this.emitRange();
    } else {
      this.selectionStart = Math.floor(this.visibleStart);
      this.selectionEnd = Math.ceil(this.visibleEnd);
      this.emitFilter();
      this.draw();
    }
  }

  private emitRange(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.dispatchEvent(new CustomEvent('time-range-changed', {
        detail: { startYear: Math.floor(this.visibleStart), endYear: Math.ceil(this.visibleEnd) },
        bubbles: true, composed: true,
      }));
    }, DEBOUNCE_MS);
  }

  private emitFilter(): void {
    const detail = this.selectionStart !== null && this.selectionEnd !== null
      ? { startYear: Math.round(this.selectionStart), endYear: Math.round(this.selectionEnd) }
      : null;
    this.dispatchEvent(new CustomEvent('time-filter-changed', { detail, bubbles: true, composed: true }));
  }
}

customElements.define('world-timeline', TimelineElement);
