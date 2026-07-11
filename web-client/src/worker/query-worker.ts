import type { DslFilter, GeoFilter, HistoricalEvent, WorkerInMessage, WorkerOutMessage } from '../types/index.js';
import { parseDsl } from './dsl-parser.js';
import { openCache, resolveViaCache, ENTRIES_STORE } from '../cache/idb-cache.js';
import { fetchEntriesByIds, fetchSlim } from '../cache/api-client.js';

const MAX_LIMIT = 500;

// Combines the DSL's year/lat/lng filters with the timeline's visible range
// and the map's drag-select box (intersecting ranges, same semantics the old
// in-worker Array.filter applied) into query params for GET /api/entries.
function buildEntriesQuery(
  filters: DslFilter[],
  timeRange: [number, number],
  geoFilter: GeoFilter | null | undefined,
  limit: number,
): URLSearchParams {
  let [yearMin, yearMax] = timeRange;
  let latMin: number | null = null;
  let latMax: number | null = null;
  let lngMin: number | null = null;
  let lngMax: number | null = null;
  let category: string[] | null = null;
  let text: string | null = null;

  for (const f of filters) {
    switch (f.kind) {
      case 'category':
        category = f.values;
        break;
      case 'year':
        yearMin = Math.max(yearMin, f.start);
        yearMax = Math.min(yearMax, f.end);
        break;
      case 'text':
        text = f.query;
        break;
      case 'lat':
        latMin = latMin === null ? f.min : Math.max(latMin, f.min);
        latMax = latMax === null ? f.max : Math.min(latMax, f.max);
        break;
      case 'lng':
        lngMin = lngMin === null ? f.min : Math.max(lngMin, f.min);
        lngMax = lngMax === null ? f.max : Math.min(lngMax, f.max);
        break;
    }
  }

  if (geoFilter) {
    latMin = latMin === null ? geoFilter.latMin : Math.max(latMin, geoFilter.latMin);
    latMax = latMax === null ? geoFilter.latMax : Math.min(latMax, geoFilter.latMax);
    lngMin = lngMin === null ? geoFilter.lngMin : Math.max(lngMin, geoFilter.lngMin);
    lngMax = lngMax === null ? geoFilter.lngMax : Math.min(lngMax, geoFilter.lngMax);
  }

  const params = new URLSearchParams();
  params.set('yearMin', String(yearMin));
  params.set('yearMax', String(yearMax));
  if (category) params.set('category', category.join(','));
  if (text) params.set('text', text);
  if (latMin !== null) params.set('latMin', String(latMin));
  if (latMax !== null) params.set('latMax', String(latMax));
  if (lngMin !== null) params.set('lngMin', String(lngMin));
  if (lngMax !== null) params.set('lngMax', String(lngMax));
  params.set('limit', String(Math.min(limit, MAX_LIMIT)));
  return params;
}

self.addEventListener('message', async (ev: MessageEvent<WorkerInMessage>) => {
  const msg = ev.data;

  if (msg.type === 'init') {
    try {
      await openCache();
      const out: WorkerOutMessage = { type: 'ready' };
      self.postMessage(out);
    } catch (err) {
      console.error('[worker] Failed to open cache:', err);
    }
    return;
  }

  if (msg.type === 'query') {
    try {
      const { filters, limit } = parseDsl(msg.dsl);
      const params = buildEntriesQuery(filters, msg.timeRange, msg.geoFilter, limit);
      const slim = await fetchSlim(`/api/entries?${params.toString()}`);
      const db = await openCache();
      const events = await resolveViaCache<HistoricalEvent>(db, ENTRIES_STORE, slim, fetchEntriesByIds);
      const out: WorkerOutMessage = { type: 'results', events };
      self.postMessage(out);
    } catch (err) {
      console.error('[worker] Query failed:', err);
    }
  }
});
