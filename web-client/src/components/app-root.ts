import type { DataSource, EventCategory, HistoricalEra, HistoricalEvent, Laneset, WorkerInMessage, WorkerOutMessage } from '../types/index.js';
import { parseDsl } from '../worker/dsl-parser.js';
import { openCache, resolveViaCache, ENTRIES_STORE, LANESETS_STORE } from '../cache/idb-cache.js';
import { fetchEntriesByIds, fetchLanesetsByIds, fetchSlim } from '../cache/api-client.js';
import type { GeoFilter, WorldMapElement } from './world-map.js';
import type { TimelineElement } from './timeline.js';
import type { CategoryPickerElement } from './category-picker.js';
import type { LanesetPickerElement } from './laneset-picker.js';
import type { QueryEditorElement } from './query-editor.js';
import type { EntryDetailElement } from './entry-detail.js';
import type { SettingsMenuElement } from './settings-menu.js';

export class AppRootElement extends HTMLElement {
  private worker: Worker | null = null;
  private mapEl!: WorldMapElement;
  private timelineEl!: TimelineElement;
  private pickerEl!: CategoryPickerElement;
  private lanesetPickerEl!: LanesetPickerElement;
  private editorEl!: QueryEditorElement;
  private loadingOverlay!: HTMLElement;
  private resultsCountEl!: HTMLElement;
  private detailEl!: EntryDetailElement;
  private settingsEl!: SettingsMenuElement;

  private currentTimeRange: [number, number] = [-3000, 2100];
  private timeSelection: [number, number] | null = null;
  private lastResults: HistoricalEvent[] = [];
  private selectedId: string | null = null;
  private lanesets: Laneset[] = [];
  private activeLanesetId = 'continents'; // default; 'none' hides lanes
  private dataSource: DataSource = 'postgres'; // default preserves prior behavior

  connectedCallback(): void {
    const template = document.getElementById('app-root-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.mapEl = shadow.querySelector('world-map') as WorldMapElement;
    this.timelineEl = shadow.querySelector('world-timeline') as TimelineElement;
    this.pickerEl = shadow.querySelector('category-picker') as CategoryPickerElement;
    this.lanesetPickerEl = shadow.querySelector('laneset-picker') as LanesetPickerElement;
    this.editorEl = shadow.querySelector('query-editor') as QueryEditorElement;
    this.loadingOverlay = shadow.getElementById('loading-overlay')!;
    this.resultsCountEl = shadow.getElementById('results-count')!;
    this.detailEl = shadow.getElementById('entry-detail') as EntryDetailElement;
    this.settingsEl = shadow.querySelector('settings-menu') as SettingsMenuElement;

    shadow.addEventListener('time-range-changed', this.onTimeRangeChanged.bind(this) as EventListener);
    shadow.addEventListener('time-filter-changed', this.onTimeFilterChanged.bind(this) as EventListener);
    shadow.addEventListener('event-selected', this.onEventSelected.bind(this) as EventListener);
    shadow.addEventListener('dsl-changed', this.onDslChanged.bind(this) as EventListener);
    shadow.addEventListener('category-filter-changed', this.onCategoryChanged.bind(this) as EventListener);
    shadow.addEventListener('geo-filter-changed', this.onGeoFilterChanged.bind(this) as EventListener);
    shadow.addEventListener('laneset-changed', this.onLanesetChanged.bind(this) as EventListener);
    shadow.addEventListener('global-eras-toggled', this.onGlobalErasToggled.bind(this) as EventListener);
    shadow.addEventListener('lane-selected', this.onLaneSelected.bind(this) as EventListener);
    shadow.addEventListener('data-source-changed', this.onDataSourceChanged.bind(this) as EventListener);

    this.initWorker();
    this.loadEras().catch(() => { /* era bands optional */ });
    this.loadLanesets().catch(() => { /* lanes optional */ });
  }

  private async loadEras(): Promise<void> {
    // Eras are entries with category='historical_period' and a '-history'
    // tag (see db/schema.sql) — fetched as slim {id, lastUpdated} pairs,
    // resolved via the entries cache, then reduced to the HistoricalEra
    // shape the timeline expects.
    const slim = await fetchSlim('/api/eras');
    const db = await openCache();
    const entries = await resolveViaCache<HistoricalEvent>(db, ENTRIES_STORE, slim, fetchEntriesByIds);
    this.timelineEl.setEras(entries.map(toEra));
  }

  private async loadLanesets(): Promise<void> {
    const slim = await fetchSlim('/api/lanesets');
    const db = await openCache();
    this.lanesets = await resolveViaCache<Laneset>(db, LANESETS_STORE, slim, fetchLanesetsByIds);
    this.lanesetPickerEl.setLanesets(this.lanesets);
    this.lanesetPickerEl.setSelected(this.activeLanesetId);
    this.applyActiveLaneset();
  }

  private onDataSourceChanged(e: Event): void {
    const { dataSource } = (e as CustomEvent<{ dataSource: DataSource }>).detail;
    this.dataSource = dataSource;
    this.sendQuery();
  }

  private onGlobalErasToggled(e: Event): void {
    const show = (e as CustomEvent<{ show: boolean }>).detail.show;
    this.timelineEl.setShowGlobalEras(show);
  }

  private onLanesetChanged(e: Event): void {
    const id = (e as CustomEvent<{ id: string }>).detail.id;
    this.setActiveLaneset(id);
    // Reflect into the DSL: default ('continents') → drop the line; else write it.
    const newLine = id === 'continents' ? '' : `laneset ${id}`;
    this.editorEl.setDsl(setDslLine(this.editorEl.getDsl(), /^\s*laneset\s+/i, newLine));
  }

  // Applies a laneset id from any source (picker or DSL) to state + timeline + picker.
  private setActiveLaneset(id: string): void {
    this.activeLanesetId = id;
    this.lanesetPickerEl.setSelected(id);
    this.applyActiveLaneset();
  }

  // Pushes the active laneset (or null when 'none') to the timeline.
  private applyActiveLaneset(): void {
    const active = this.activeLanesetId === 'none'
      ? null
      : this.lanesets.find(l => l.slug === this.activeLanesetId) ?? this.lanesets[0] ?? null;
    this.timelineEl.setLaneset(active);
  }

  disconnectedCallback(): void {
    this.worker?.terminate();
  }

  private initWorker(): void {
    this.worker = new Worker('./worker/query-worker.js', { type: 'module' });
    this.worker.addEventListener('message', this.onWorkerMessage.bind(this));
    const msg: WorkerInMessage = { type: 'init' };
    this.worker.postMessage(msg);
  }

  private onWorkerMessage(e: MessageEvent<WorkerOutMessage>): void {
    const msg = e.data;
    if (msg.type === 'ready') {
      this.loadingOverlay.classList.add('hidden');
      this.currentTimeRange = this.timelineEl.getVisibleRange();
      this.sendQuery();
      return;
    }
    if (msg.type === 'results') {
      this.loadingOverlay.classList.add('hidden');
      this.lastResults = msg.events;
      if (this.selectedId && !msg.events.some(ev => ev.id === this.selectedId)) {
        this.detailEl.hide();
        this.selectedId = null;
      }
      this.mapEl.setEvents(msg.events);
      this.timelineEl.setEvents(msg.events);
      const n = msg.events.length;
      this.resultsCountEl.textContent = n === 0 ? 'No entries' : `${n} ${n === 1 ? 'entry' : 'entries'}`;
    }
  }

  private sendQuery(): void {
    if (!this.worker) return;
    const dsl = this.editorEl?.getDsl() ?? '';
    const timeRange = this.timeSelection ?? this.currentTimeRange;
    // A cold Wikidata query can take 10+ seconds (see
    // plans/wikidata-qlever-data-source.md) — show the overlay while any
    // query is in flight so the UI doesn't look frozen.
    this.loadingOverlay.classList.remove('hidden');
    const msg: WorkerInMessage = {
      type: 'query',
      dsl,
      timeRange,
      geoFilter: null,
      dataSource: this.dataSource,
    };
    this.worker.postMessage(msg);
  }

  private onTimeRangeChanged(e: Event): void {
    const { startYear, endYear } = (e as CustomEvent<{ startYear: number; endYear: number }>).detail;
    this.currentTimeRange = [startYear, endYear];
    // When a time filter selection is active, view-range changes don't affect the query.
    if (!this.timeSelection) this.sendQuery();
  }

  private onTimeFilterChanged(e: Event): void {
    const detail = (e as CustomEvent<{ startYear: number; endYear: number } | null>).detail;
    this.timeSelection = detail ? [detail.startYear, detail.endYear] : null;
    const newLine = detail
      ? `filter year: ${detail.startYear} to ${detail.endYear}`
      : '';
    this.editorEl.setDsl(setDslLine(this.editorEl.getDsl(), /^\s*filter\s+year\s*:/i, newLine));
    this.sendQuery();
  }

  private onDslChanged(e: Event): void {
    const dsl = (e as CustomEvent<{ dsl: string }>).detail.dsl;
    const { filters, laneset } = parseDsl(dsl);

    // Sync active laneset (absent line → default 'continents').
    const wantLaneset = laneset ?? 'continents';
    if (wantLaneset !== this.activeLanesetId) this.setActiveLaneset(wantLaneset);

    // Sync picker
    const catFilter = filters.find(f => f.kind === 'category');
    if (catFilter && catFilter.kind === 'category') {
      this.pickerEl.setSelected(catFilter.values);
    } else {
      this.pickerEl.setSelected(['person', 'event', 'place', 'artifact', 'pol_mil_organization', 'business', 'historical_period', 'concepts', 'other']);
    }

    // Sync timeline selection
    const yearFilter = filters.find(f => f.kind === 'year');
    if (yearFilter && yearFilter.kind === 'year') {
      this.timeSelection = [yearFilter.start, yearFilter.end];
      this.timelineEl.setSelection(yearFilter.start, yearFilter.end);
    } else {
      this.timeSelection = null;
      this.timelineEl.clearSelection();
    }

    // Sync map geo filter
    const latFilter = filters.find(f => f.kind === 'lat');
    const lngFilter = filters.find(f => f.kind === 'lng');
    const lat = (latFilter && latFilter.kind === 'lat') ? [latFilter.min, latFilter.max] as [number, number] : null;
    const lng = (lngFilter && lngFilter.kind === 'lng') ? [lngFilter.min, lngFilter.max] as [number, number] : null;
    this.mapEl.setExternalFilter(lat, lng);

    this.sendQuery();
  }

  private onCategoryChanged(e: Event): void {
    const selected = (e as CustomEvent<{ selected: EventCategory[] }>).detail.selected;
    // Update DSL editor: set/replace the filter category line
    const currentDsl = this.editorEl.getDsl();
    const newLine = selected.length === 9
      ? '' // all selected — remove line
      : `filter category: ${selected.join(', ')}`;
    const newDsl = setCategoryLine(currentDsl, newLine);
    this.editorEl.setDsl(newDsl);
    this.sendQuery();
  }

  private onGeoFilterChanged(e: Event): void {
    const filter = (e as CustomEvent<GeoFilter | null>).detail;
    const dsl = this.editorEl.getDsl();
    let newDsl: string;
    if (filter === null) {
      newDsl = setDslLine(dsl, /^\s*filter\s+lat\s*:/i, '');
      newDsl = setDslLine(newDsl, /^\s*filter\s+lng\s*:/i, '');
    } else if (filter.latOnly) {
      newDsl = setDslLine(dsl, /^\s*filter\s+lat\s*:/i,
        `filter lat: ${round2(filter.latMin)} to ${round2(filter.latMax)}`);
      newDsl = setDslLine(newDsl, /^\s*filter\s+lng\s*:/i, '');
    } else if (filter.lngOnly) {
      newDsl = setDslLine(dsl, /^\s*filter\s+lat\s*:/i, '');
      newDsl = setDslLine(newDsl, /^\s*filter\s+lng\s*:/i,
        `filter lng: ${round2(filter.lngMin)} to ${round2(filter.lngMax)}`);
    } else {
      newDsl = setDslLine(dsl, /^\s*filter\s+lat\s*:/i,
        `filter lat: ${round2(filter.latMin)} to ${round2(filter.latMax)}`);
      newDsl = setDslLine(newDsl, /^\s*filter\s+lng\s*:/i,
        `filter lng: ${round2(filter.lngMin)} to ${round2(filter.lngMax)}`);
    }
    this.editorEl.setDsl(newDsl);
    this.sendQuery();
  }

  private onEventSelected(e: Event): void {
    const id = (e as CustomEvent<{ id: string }>).detail.id;
    // Entry and lane selection are mutually exclusive.
    this.mapEl.setLaneOutline(null);
    this.timelineEl.selectLane(null);
    this.selectedId = id;
    this.mapEl.highlightEvent(id);
    this.timelineEl.highlightEvent(id);
    const entry = this.lastResults.find(ev => ev.id === id);
    if (entry) this.detailEl.show(entry);
  }

  private onLaneSelected(e: Event): void {
    const { id, name, description } = (e as CustomEvent<{ id: string; name: string; description: string }>).detail;
    // Mutually exclusive with entry selection.
    this.selectedId = null;
    this.mapEl.highlightEvent(null);
    this.timelineEl.highlightEvent(null);

    this.timelineEl.selectLane(id);
    this.detailEl.showLane(name, description);
    // Outline the lane's geometry on the map (global lane spans the world → no outline).
    const active = this.lanesets.find(l => l.slug === this.activeLanesetId);
    const lane = active?.lanes.find(l => l.slug === id);
    this.mapEl.setLaneOutline(lane ? lane.geometry : null);
  }
}

// An era is an entry with category='historical_period' and a tag ending in
// '-history' (see db/schema.sql); `source` drives which lane's era band it
// renders in (default 'world-history' → the synthetic Global lane).
function toEra(entry: HistoricalEvent): HistoricalEra {
  const srcTag = entry.tags.find(t => t.endsWith('-history'));
  return {
    id: entry.id,
    title: entry.title,
    startYear: entry.startDate.startYear,
    endYear: entry.startDate.endYear,
    source: srcTag ?? 'world-history',
    lastUpdated: entry.lastUpdated,
  };
}

function setDslLine(dsl: string, pattern: RegExp, newLine: string): string {
  const lines = dsl.split('\n');
  const idx = lines.findIndex(l => pattern.test(l));
  if (newLine === '') {
    if (idx >= 0) lines.splice(idx, 1);
  } else if (idx >= 0) {
    lines[idx] = newLine;
  } else {
    lines.unshift(newLine);
  }
  return lines.join('\n').replace(/^\n+/, '');
}

function setCategoryLine(dsl: string, newLine: string): string {
  return setDslLine(dsl, /^\s*filter\s+category\s*:/i, newLine);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

customElements.define('app-root', AppRootElement);
