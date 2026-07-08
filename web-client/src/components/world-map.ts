import type { EventLocation, HistoricalEvent, MultiPolygon } from '../types/index.js';

type GeoCoord = [number, number];
type Ring = GeoCoord[];

interface GeoFeature {
  geometry: { type: string; coordinates: unknown };
}

export interface GeoFilter {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  latOnly?: boolean;
  lngOnly?: boolean;
}

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

const MINI_W = 150;
const MINI_H = 75;

function extractRings(geometry: { type: string; coordinates: unknown }): Ring[][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as Ring[]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as Ring[][];
  return [];
}

function formatYears(startYear: number, endYear: number): string {
  const fmt = (y: number) => y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
  return startYear === endYear ? fmt(startYear) : `${fmt(startYear)} – ${fmt(endYear)}`;
}

export class WorldMapElement extends HTMLElement {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private miniCanvas!: HTMLCanvasElement;
  private miniCtx!: CanvasRenderingContext2D;
  private tooltip!: HTMLElement;
  private tooltipTitle!: HTMLElement;
  private tooltipYears!: HTMLElement;
  private tooltipDesc!: HTMLElement;
  private boxClearBtn!: HTMLElement;
  private zoomFullBtn!: HTMLButtonElement;
  private zoomFitBtn!: HTMLButtonElement;

  private events: HistoricalEvent[] = [];
  private selectedId: string | null = null;
  private laneOutline: MultiPolygon | null = null; // selected lane geometry (#65)
  private geoFeatures: GeoFeature[] = [];
  private dpr = 1;
  private resizeObserver!: ResizeObserver;

  // Main map zoom / pan state
  private zoomScale = 1;
  private panX = 0;
  private panY = 0;

  // Main map drag / box-selection state
  private dragStart: [number, number] | null = null;
  private dragEnd: [number, number] | null = null;
  private isDragging = false;
  // Stored in geographic coords so it reprojects correctly on zoom/pan.
  private committedGeoBox: GeoFilter | null = null;

  // Mini-map drag state
  private miniDragStart: [number, number] | null = null;
  private miniDragEnd: [number, number] | null = null;

  connectedCallback(): void {
    const template = document.getElementById('world-map-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.canvas = shadow.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.miniCanvas = shadow.getElementById('mini-canvas') as HTMLCanvasElement;
    this.miniCtx = this.miniCanvas.getContext('2d')!;
    this.tooltip = shadow.getElementById('tooltip')!;
    this.tooltipTitle = shadow.getElementById('tooltip-title')!;
    this.tooltipYears = shadow.getElementById('tooltip-years')!;
    this.tooltipDesc = shadow.getElementById('tooltip-desc')!;
    this.boxClearBtn = shadow.getElementById('box-clear')!;
    this.zoomFullBtn = shadow.getElementById('zoom-full') as HTMLButtonElement;
    this.zoomFitBtn = shadow.getElementById('zoom-fit') as HTMLButtonElement;

    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(this);

    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));
    this.boxClearBtn.addEventListener('click', this.onClearBox.bind(this));

    this.miniCanvas.addEventListener('mousedown', this.onMiniMouseDown.bind(this));
    this.miniCanvas.addEventListener('mousemove', this.onMiniMouseMove.bind(this));
    this.miniCanvas.addEventListener('mouseup', this.onMiniMouseUp.bind(this));
    this.miniCanvas.addEventListener('mouseleave', this.onMiniMouseLeave.bind(this));

    this.zoomFullBtn.addEventListener('click', () => this.resetZoom());
    this.zoomFitBtn.addEventListener('click', () => {
      if (this.committedGeoBox) {
        const b = this.committedGeoBox;
        this.fitToGeo(b.latMin, b.latMax, b.lngMin, b.lngMax);
      }
    });

    this.syncSize();
    this.loadGeo();
  }

  disconnectedCallback(): void { this.resizeObserver.disconnect(); }

  private syncSize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.miniCanvas.width = MINI_W * this.dpr;
    this.miniCanvas.height = MINI_H * this.dpr;
    this.draw();
  }

  private async loadGeo(): Promise<void> {
    try {
      const res = await fetch('./data/world-110m.geojson');
      const geo = await res.json() as { features: GeoFeature[] };
      this.geoFeatures = geo.features;
      this.draw();
    } catch (e) {
      console.error('[world-map] Failed to load GeoJSON:', e);
    }
  }

  setEvents(events: HistoricalEvent[]): void { this.events = events; this.draw(); }
  highlightEvent(id: string | null): void { this.selectedId = id; this.draw(); }
  // Outlines a selected lane's geometry (null clears it).
  setLaneOutline(geom: MultiPolygon | null): void { this.laneOutline = geom; this.draw(); }

  private lw(): number { return this.canvas.width / this.dpr; }
  private lh(): number { return this.canvas.height / this.dpr; }

  private mapLngToX(lng: number, lw: number): number {
    return ((lng + 180) / 360) * lw * this.zoomScale + this.panX;
  }
  private mapLatToY(lat: number, lh: number): number {
    return ((90 - lat) / 180) * lh * this.zoomScale + this.panY;
  }
  private canvasXToLng(x: number): number {
    return ((x - this.panX) / (this.lw() * this.zoomScale)) * 360 - 180;
  }
  private canvasYToLat(y: number): number {
    return 90 - ((y - this.panY) / (this.lh() * this.zoomScale)) * 180;
  }

  // Mini-map coordinate helpers (zoom=1, pan=0)
  private lngToMiniX(lng: number): number { return ((lng + 180) / 360) * MINI_W; }
  private latToMiniY(lat: number): number { return ((90 - lat) / 180) * MINI_H; }
  private miniXToLng(x: number): number { return (x / MINI_W) * 360 - 180; }
  private miniYToLat(y: number): number { return 90 - (y / MINI_H) * 180; }

  private clampPan(): void {
    const lw = this.lw();
    const lh = this.lh();
    this.panX = Math.min(0, Math.max((1 - this.zoomScale) * lw, this.panX));
    this.panY = Math.min(0, Math.max((1 - this.zoomScale) * lh, this.panY));
  }

  private zoomBy(factor: number, cx?: number, cy?: number): void {
    const lw = this.lw();
    const lh = this.lh();
    const fx = cx ?? lw / 2;
    const fy = cy ?? lh / 2;
    const newZoom = Math.min(32, Math.max(1, this.zoomScale * factor));
    const ratio = newZoom / this.zoomScale;
    this.panX = fx - (fx - this.panX) * ratio;
    this.panY = fy - (fy - this.panY) * ratio;
    this.zoomScale = newZoom;
    this.clampPan();
    this.draw();
  }

  private resetZoom(): void {
    this.zoomScale = 1;
    this.panX = 0;
    this.panY = 0;
    this.draw();
  }

  private fitToGeo(latMin: number, latMax: number, lngMin: number, lngMax: number): void {
    const lw = this.lw();
    const lh = this.lh();
    const lngRange = lngMax - lngMin;
    const latRange = latMax - latMin;
    if (lngRange <= 0 || latRange <= 0) return;
    const newZoom = Math.min(32, Math.max(1, Math.min(
      (360 / lngRange) * 0.88,
      (180 / latRange) * 0.88,
    )));
    const centerLng = (lngMin + lngMax) / 2;
    const centerLat = (latMin + latMax) / 2;
    this.zoomScale = newZoom;
    this.panX = lw / 2 - ((centerLng + 180) / 360) * lw * newZoom;
    this.panY = lh / 2 - ((90 - centerLat) / 180) * lh * newZoom;
    this.clampPan();
    this.draw();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const [cx, cy] = this.canvasXY(e);
    this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, cx, cy);
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.dragStart = this.canvasXY(e);
    this.dragEnd = null;
    this.isDragging = false;
  }

  private onMouseMove(e: MouseEvent): void {
    const [cx, cy] = this.canvasXY(e);

    if (this.dragStart && (e.buttons & 1)) {
      const [sx, sy] = this.dragStart;
      if (!this.isDragging && (Math.abs(cx - sx) > 4 || Math.abs(cy - sy) > 4)) {
        this.isDragging = true;
        this.tooltip.classList.remove('visible');
      }
      if (this.isDragging) {
        this.dragEnd = [cx, cy];
        this.canvas.style.cursor = 'crosshair';
        this.draw();
        return;
      }
    }

    const hit = this.hitTest(cx, cy);
    if (hit) {
      const evStart = hit.startDate.startYear;
      const evEnd = hit.endDate?.startYear ?? hit.startDate.endYear;
      this.tooltipTitle.textContent = hit.title;
      this.tooltipYears.textContent = formatYears(evStart, evEnd);
      this.tooltipDesc.textContent = hit.description;
      this.tooltip.classList.add('visible');
      const rect = this.canvas.getBoundingClientRect();
      let tx = e.clientX - rect.left + 12;
      let ty = e.clientY - rect.top + 12;
      if (tx + 230 > rect.width) tx -= 250;
      if (ty + 100 > rect.height) ty -= 110;
      this.tooltip.style.left = `${tx}px`;
      this.tooltip.style.top = `${ty}px`;
      this.canvas.style.cursor = 'pointer';
    } else {
      this.tooltip.classList.remove('visible');
      this.canvas.style.cursor = 'crosshair';
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    const [cx, cy] = this.canvasXY(e);

    if (this.isDragging && this.dragStart) {
      const [sx, sy] = this.dragStart;
      const x1 = Math.min(sx, cx);
      const y1 = Math.min(sy, cy);
      const x2 = Math.max(sx, cx);
      const y2 = Math.max(sy, cy);
      const pixW = x2 - x1;
      const pixH = y2 - y1;
      const lw = this.lw();
      const lh = this.lh();

      const latA = this.canvasYToLat(y1);
      const latB = this.canvasYToLat(y2);
      const lngA = this.canvasXToLng(x1);
      const lngB = this.canvasXToLng(x2);

      const latOnly = pixW < lw * 0.12 && pixW < pixH * 0.4;
      const lngOnly = !latOnly && pixH < lh * 0.12 && pixH < pixW * 0.4;

      this.committedGeoBox = {
        latMin: Math.min(latA, latB),
        latMax: Math.max(latA, latB),
        lngMin: Math.min(lngA, lngB),
        lngMax: Math.max(lngA, lngB),
        ...(latOnly ? { latOnly: true } : lngOnly ? { lngOnly: true } : {}),
      };

      this.dispatchEvent(new CustomEvent<GeoFilter>('geo-filter-changed', {
        detail: this.committedGeoBox,
        bubbles: true,
        composed: true,
      }));
    } else if (!this.isDragging && this.dragStart) {
      const hit = this.hitTest(cx, cy);
      if (hit) {
        this.dispatchEvent(new CustomEvent('event-selected', {
          detail: { id: hit.id },
          bubbles: true,
          composed: true,
        }));
      }
    }

    this.dragStart = null;
    this.dragEnd = null;
    this.isDragging = false;
    this.draw();
  }

  private onMouseLeave(): void {
    this.tooltip.classList.remove('visible');
    if (!this.isDragging) this.canvas.style.cursor = 'crosshair';
  }

  private onClearBox(): void {
    this.committedGeoBox = null;
    this.boxClearBtn.style.display = 'none';
    this.dispatchEvent(new CustomEvent('geo-filter-changed', {
      detail: null,
      bubbles: true,
      composed: true,
    }));
    this.draw();
  }

  // Mini-map mouse events
  private miniCanvasXY(e: MouseEvent): [number, number] {
    const rect = this.miniCanvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private onMiniMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.miniDragStart = this.miniCanvasXY(e);
    this.miniDragEnd = null;
  }

  private onMiniMouseMove(e: MouseEvent): void {
    if (this.miniDragStart && (e.buttons & 1)) {
      this.miniDragEnd = this.miniCanvasXY(e);
      this.drawMiniMap();
    }
  }

  private onMiniMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    if (this.miniDragStart && this.miniDragEnd) {
      const [sx, sy] = this.miniDragStart;
      const [ex, ey] = this.miniDragEnd;
      const x1 = Math.min(sx, ex), x2 = Math.max(sx, ex);
      const y1 = Math.min(sy, ey), y2 = Math.max(sy, ey);
      const lngMin = this.miniXToLng(x1);
      const lngMax = this.miniXToLng(x2);
      const latMax = this.miniYToLat(y1);
      const latMin = this.miniYToLat(y2);
      if (x2 - x1 > 3 && y2 - y1 > 2) {
        this.fitToGeo(latMin, latMax, lngMin, lngMax);
      }
    }
    this.miniDragStart = null;
    this.miniDragEnd = null;
    this.drawMiniMap();
  }

  private onMiniMouseLeave(): void {
    this.miniDragStart = null;
    this.miniDragEnd = null;
    this.drawMiniMap();
  }

  private draw(): void {
    const { ctx } = this;
    const lw = this.lw();
    const lh = this.lh();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    ctx.fillStyle = '#1a2035';
    ctx.fillRect(0, 0, lw, lh);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, lw, lh);
    ctx.clip();

    ctx.fillStyle = '#2a3048';
    ctx.strokeStyle = '#4a5070';
    ctx.lineWidth = 0.5;
    for (const feature of this.geoFeatures) {
      for (const poly of extractRings(feature.geometry)) {
        for (const ring of poly) {
          if (ring.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(this.mapLngToX(ring[0][0], lw), this.mapLatToY(ring[0][1], lh));
          for (let i = 1; i < ring.length; i++) {
            ctx.lineTo(this.mapLngToX(ring[i][0], lw), this.mapLatToY(ring[i][1], lh));
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    if (this.laneOutline) this.drawLaneOutline(lw, lh);

    for (const ev of this.events) {
      const color = CATEGORY_COLORS[ev.category] ?? CATEGORY_COLORS.other;
      const isSelected = ev.id === this.selectedId;
      this.drawLocations(ev.locations, ev.title, color, isSelected, lw, lh);
    }

    ctx.restore();

    // Draw selection rectangle (in-progress drag or committed box).
    // During drag, snap the preview shape to the same lat/lng-only rules as onMouseUp.
    let dragBox: { x1: number; y1: number; x2: number; y2: number } | null = null;
    if (this.isDragging && this.dragStart && this.dragEnd) {
      const rx1 = Math.min(this.dragStart[0], this.dragEnd[0]);
      const ry1 = Math.min(this.dragStart[1], this.dragEnd[1]);
      const rx2 = Math.max(this.dragStart[0], this.dragEnd[0]);
      const ry2 = Math.max(this.dragStart[1], this.dragEnd[1]);
      const pixW = rx2 - rx1;
      const pixH = ry2 - ry1;
      const willLatOnly = pixW < lw * 0.12 && pixW < pixH * 0.4;
      const willLngOnly = !willLatOnly && pixH < lh * 0.12 && pixH < pixW * 0.4;
      dragBox = willLatOnly
        ? { x1: 0, y1: ry1, x2: lw, y2: ry2 }
        : willLngOnly
          ? { x1: rx1, y1: 0, x2: rx2, y2: lh }
          : { x1: rx1, y1: ry1, x2: rx2, y2: ry2 };
    }

    const committedBox = this.committedGeoBox
      ? (() => {
          const b = this.committedGeoBox!;
          if (b.latOnly) {
            return { x1: 0, y1: this.mapLatToY(b.latMax, lh), x2: lw, y2: this.mapLatToY(b.latMin, lh) };
          } else if (b.lngOnly) {
            return { x1: this.mapLngToX(b.lngMin, lw), y1: 0, x2: this.mapLngToX(b.lngMax, lw), y2: lh };
          } else {
            return {
              x1: this.mapLngToX(b.lngMin, lw), y1: this.mapLatToY(b.latMax, lh),
              x2: this.mapLngToX(b.lngMax, lw), y2: this.mapLatToY(b.latMin, lh),
            };
          }
        })()
      : null;

    const box = dragBox ?? committedBox;
    if (box) {
      ctx.fillStyle = 'rgba(126,184,247,0.10)';
      ctx.fillRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
      ctx.strokeStyle = 'rgba(126,184,247,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
      ctx.setLineDash([]);

      if (committedBox && !dragBox) {
        const b = this.committedGeoBox!;
        let btnX: number, btnY: number;
        if (b.latOnly) {
          btnX = lw - 22; btnY = committedBox.y1;
        } else if (b.lngOnly) {
          btnX = committedBox.x2 - 22; btnY = 4;
        } else {
          btnX = committedBox.x2 - 22; btnY = committedBox.y1;
        }
        this.boxClearBtn.style.left = `${Math.max(0, btnX)}px`;
        this.boxClearBtn.style.top = `${Math.max(0, btnY)}px`;
        this.boxClearBtn.style.display = 'flex';
      }
    }

    if (!committedBox) this.boxClearBtn.style.display = 'none';

    this.drawMiniMap();
  }

  private drawMiniMap(): void {
    const mCtx = this.miniCtx;
    const mw = MINI_W;
    const mh = MINI_H;

    mCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    mCtx.fillStyle = '#1a2035';
    mCtx.fillRect(0, 0, mw, mh);

    // World outline
    mCtx.fillStyle = '#2a3048';
    mCtx.strokeStyle = '#4a5070';
    mCtx.lineWidth = 0.4;
    for (const feature of this.geoFeatures) {
      for (const poly of extractRings(feature.geometry)) {
        for (const ring of poly) {
          if (ring.length < 2) continue;
          mCtx.beginPath();
          mCtx.moveTo(this.lngToMiniX(ring[0][0]), this.latToMiniY(ring[0][1]));
          for (let i = 1; i < ring.length; i++) {
            mCtx.lineTo(this.lngToMiniX(ring[i][0]), this.latToMiniY(ring[i][1]));
          }
          mCtx.closePath();
          mCtx.fill();
          mCtx.stroke();
        }
      }
    }

    // Committed geo-filter box on mini-map
    if (this.committedGeoBox) {
      const b = this.committedGeoBox;
      let bx1: number, bx2: number, by1: number, by2: number;
      if (b.latOnly) {
        bx1 = 0; bx2 = mw;
        by1 = this.latToMiniY(b.latMax); by2 = this.latToMiniY(b.latMin);
      } else if (b.lngOnly) {
        bx1 = this.lngToMiniX(b.lngMin); bx2 = this.lngToMiniX(b.lngMax);
        by1 = 0; by2 = mh;
      } else {
        bx1 = this.lngToMiniX(b.lngMin); bx2 = this.lngToMiniX(b.lngMax);
        by1 = this.latToMiniY(b.latMax); by2 = this.latToMiniY(b.latMin);
      }
      mCtx.fillStyle = 'rgba(126,184,247,0.15)';
      mCtx.fillRect(bx1, by1, bx2 - bx1, by2 - by1);
      mCtx.strokeStyle = 'rgba(126,184,247,0.55)';
      mCtx.lineWidth = 1;
      mCtx.setLineDash([3, 2]);
      mCtx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);
      mCtx.setLineDash([]);
    }

    // Viewport rect (when zoomed in)
    if (this.zoomScale > 1) {
      const lw = this.lw();
      const lh = this.lh();
      const vx1 = Math.max(0, this.lngToMiniX(this.canvasXToLng(0)));
      const vx2 = Math.min(mw, this.lngToMiniX(this.canvasXToLng(lw)));
      const vy1 = Math.max(0, this.latToMiniY(this.canvasYToLat(0)));
      const vy2 = Math.min(mh, this.latToMiniY(this.canvasYToLat(lh)));
      mCtx.fillStyle = 'rgba(126,184,247,0.12)';
      mCtx.fillRect(vx1, vy1, vx2 - vx1, vy2 - vy1);
      mCtx.strokeStyle = 'rgba(126,184,247,0.85)';
      mCtx.lineWidth = 1;
      mCtx.setLineDash([3, 2]);
      mCtx.strokeRect(vx1, vy1, vx2 - vx1, vy2 - vy1);
      mCtx.setLineDash([]);
    }

    // In-progress drag box on mini-map
    if (this.miniDragStart && this.miniDragEnd) {
      const [sx, sy] = this.miniDragStart;
      const [ex, ey] = this.miniDragEnd;
      const dx1 = Math.min(sx, ex), dx2 = Math.max(sx, ex);
      const dy1 = Math.min(sy, ey), dy2 = Math.max(sy, ey);
      mCtx.fillStyle = 'rgba(126,184,247,0.18)';
      mCtx.fillRect(dx1, dy1, dx2 - dx1, dy2 - dy1);
      mCtx.strokeStyle = 'rgba(126,184,247,0.9)';
      mCtx.lineWidth = 1;
      mCtx.setLineDash([3, 2]);
      mCtx.strokeRect(dx1, dy1, dx2 - dx1, dy2 - dy1);
      mCtx.setLineDash([]);
    }

    // Button visibility
    this.zoomFullBtn.classList.toggle('hidden', this.zoomScale <= 1);
    const showFit = !!(
      this.committedGeoBox &&
      !this.committedGeoBox.latOnly &&
      !this.committedGeoBox.lngOnly
    );
    this.zoomFitBtn.classList.toggle('hidden', !showFit);
  }

  private drawLocations(
    locations: EventLocation[],
    title: string,
    color: string,
    isSelected: boolean,
    lw: number,
    lh: number,
  ): void {
    const { ctx } = this;
    for (const loc of locations) {
      const uncertain = 'uncertain' in loc && loc.uncertain === true;
      ctx.globalAlpha = uncertain ? 0.45 : 1;
      if (uncertain) { ctx.setLineDash([4, 3]); } else { ctx.setLineDash([]); }

      if (loc.type === 'point') {
        const x = this.mapLngToX(loc.lng, lw);
        const y = this.mapLatToY(loc.lat, lh);
        const r = isSelected ? 7 : 5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (isSelected) {
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        if (this.zoomScale >= 4 && x >= 0 && x <= lw) {
          ctx.save();
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(200,210,240,0.75)';
          ctx.fillText(title, x + r + 4, y + 3);
          ctx.restore();
        }

      } else if (loc.type === 'polygon') {
        this.drawRings(loc.rings, color, isSelected, lw, lh);

      } else if (loc.type === 'multipolygon') {
        for (const rings of loc.polygons) this.drawRings(rings, color, isSelected, lw, lh);

      } else if (loc.type === 'path') {
        const pts = loc.waypoints;
        if (pts.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(this.mapLngToX(pts[0].lng, lw), this.mapLatToY(pts[0].lat, lh));
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(this.mapLngToX(pts[i].lng, lw), this.mapLatToY(pts[i].lat, lh));
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

      } else if (loc.type === 'circle') {
        const cx = this.mapLngToX(loc.centerLng, lw);
        const cy = this.mapLatToY(loc.centerLat, lh);
        const pxPerDeg = (lw * this.zoomScale) / 360;
        const degRadius = loc.radiusKm / 111;
        const r = Math.max(4, degRadius * pxPerDeg);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = color + '40';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
  }

  private drawLaneOutline(lw: number, lh: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    for (const poly of this.laneOutline!) {
      for (const ring of poly) {
        if (ring.length < 2) continue;
        ctx.moveTo(this.mapLngToX(ring[0][0], lw), this.mapLatToY(ring[0][1], lh));
        for (let i = 1; i < ring.length; i++) {
          ctx.lineTo(this.mapLngToX(ring[i][0], lw), this.mapLatToY(ring[i][1], lh));
        }
        ctx.closePath();
      }
    }
    ctx.fillStyle = 'rgba(200,160,96,0.13)';
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(232,204,128,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  private drawRings(
    rings: Array<Array<[number, number]>>,
    color: string,
    isSelected: boolean,
    lw: number,
    lh: number,
  ): void {
    const { ctx } = this;
    ctx.beginPath();
    for (const ring of rings) {
      if (ring.length < 2) continue;
      ctx.moveTo(this.mapLngToX(ring[0][0], lw), this.mapLatToY(ring[0][1], lh));
      for (let i = 1; i < ring.length; i++) {
        ctx.lineTo(this.mapLngToX(ring[i][0], lw), this.mapLatToY(ring[i][1], lh));
      }
      ctx.closePath();
    }
    ctx.fillStyle = color + '40';
    ctx.fill('evenodd');
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();
  }

  private hitTest(cx: number, cy: number): HistoricalEvent | null {
    const lw = this.lw();
    const lh = this.lh();
    const HIT_SQ = 100;
    let best: HistoricalEvent | null = null;
    let bestDist = HIT_SQ;
    for (const ev of this.events) {
      for (const loc of ev.locations) {
        let lat: number | null = null;
        let lng: number | null = null;
        if (loc.type === 'point') { lat = loc.lat; lng = loc.lng; }
        else if (loc.type === 'circle') { lat = loc.centerLat; lng = loc.centerLng; }
        else if (loc.type === 'polygon') { lat = loc.rings[0]?.[0]?.[1] ?? null; lng = loc.rings[0]?.[0]?.[0] ?? null; }
        else if (loc.type === 'multipolygon') { lat = loc.polygons[0]?.[0]?.[0]?.[1] ?? null; lng = loc.polygons[0]?.[0]?.[0]?.[0] ?? null; }
        else if (loc.type === 'path') { lat = loc.waypoints[0]?.lat ?? null; lng = loc.waypoints[0]?.lng ?? null; }
        if (lat === null || lng === null) continue;
        const x = this.mapLngToX(lng, lw);
        const y = this.mapLatToY(lat, lh);
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bestDist) { bestDist = d; best = ev; }
      }
    }
    return best;
  }

  private canvasXY(e: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  setExternalFilter(lat: [number, number] | null, lng: [number, number] | null): void {
    if (lat === null && lng === null) {
      this.committedGeoBox = null;
    } else if (lat !== null && lng !== null) {
      this.committedGeoBox = { latMin: lat[0], latMax: lat[1], lngMin: lng[0], lngMax: lng[1] };
    } else if (lat !== null) {
      this.committedGeoBox = { latMin: lat[0], latMax: lat[1], lngMin: -180, lngMax: 180, latOnly: true };
    } else {
      this.committedGeoBox = { latMin: -90, latMax: 90, lngMin: lng![0], lngMax: lng![1], lngOnly: true };
    }
    this.draw();
  }
}

customElements.define('world-map', WorldMapElement);
