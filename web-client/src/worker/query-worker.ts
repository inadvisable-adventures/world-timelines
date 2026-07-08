import type { DslFilter, GeoFilter, HistoricalEvent, WorkerInMessage, WorkerOutMessage } from '../types/index.js';
import { primaryLat, primaryLng } from '../types/index.js';
import { parseTsv } from './tsv-parser.js';
import { parseDsl } from './dsl-parser.js';

let allEvents: HistoricalEvent[] = [];

function applyFilters(
  events: HistoricalEvent[],
  filters: DslFilter[],
  timeRange: [number, number],
  limit: number,
  geoFilter: GeoFilter | null | undefined,
): HistoricalEvent[] {
  const [tStart, tEnd] = timeRange;

  const filtered = events.filter(ev => {
      // Time range (always applied from the timeline)
      const evStart = ev.startDate.startYear;
      const evEnd = ev.endDate?.startYear ?? ev.startDate.endYear;
      if (evStart > tEnd || evEnd < tStart) return false;

      // Geographic box filter from map drag-select
      if (geoFilter) {
        const lat = primaryLat(ev);
        const lng = primaryLng(ev);
        if (lat === null || lng === null) return false;
        if (lat < geoFilter.latMin || lat > geoFilter.latMax) return false;
        if (lng < geoFilter.lngMin || lng > geoFilter.lngMax) return false;
      }

      // DSL filters (all must pass)
      for (const f of filters) {
        switch (f.kind) {
          case 'category':
            if (!f.values.includes(ev.category)) return false;
            break;
          case 'year': {
            if (evStart > f.end || evEnd < f.start) return false;
            break;
          }
          case 'text': {
            const haystack = (ev.title + ' ' + ev.description).toLowerCase();
            if (!haystack.includes(f.query)) return false;
            break;
          }
          case 'lat': {
            const lat = primaryLat(ev);
            if (lat === null || lat < f.min || lat > f.max) return false;
            break;
          }
          case 'lng': {
            const lng = primaryLng(ev);
            if (lng === null || lng < f.min || lng > f.max) return false;
            break;
          }
        }
      }

      return true;
    });

  return filtered.slice(0, limit);
}

self.addEventListener('message', async (ev: MessageEvent<WorkerInMessage>) => {
  const msg = ev.data;

  if (msg.type === 'init') {
    try {
      const response = await fetch(msg.dataUrl);
      const text = await response.text();
      allEvents = parseTsv(text);
      const out: WorkerOutMessage = { type: 'ready', count: allEvents.length };
      self.postMessage(out);
    } catch (err) {
      console.error('[worker] Failed to load data:', err);
    }
    return;
  }

  if (msg.type === 'query') {
    const { filters, limit } = parseDsl(msg.dsl);
    const results = applyFilters(allEvents, filters, msg.timeRange, limit, msg.geoFilter);
    const out: WorkerOutMessage = { type: 'results', events: results };
    self.postMessage(out);
  }
});
