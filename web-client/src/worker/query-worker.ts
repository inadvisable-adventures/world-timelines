import type { DslFilter, EventCategory, GeoFilter, HistoricalEvent, WorkerInMessage, WorkerOutMessage } from '../types/index.js';
import { parseDsl } from './dsl-parser.js';
import { openCache, resolveViaCache, getCachedByIds, putCached, ENTRIES_STORE, WIKIDATA_ENTRIES_STORE } from '../cache/idb-cache.js';
import { fetchEntriesByIds, fetchSlim } from '../cache/api-client.js';
import { queryQLever } from '../wikidata/qlever-client.js';

// Matches this app's Postgres-issued entry ids — distinguishes them from
// Wikidata Q-ids, which have no by-id fetch endpoint (see below).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolves pinned ids to full entries, cache-only except for a Postgres
// fallback fetch. Q-id-shaped pins with no cache hit can't be resolved —
// there's no by-id fetch for the live QLever source in this codebase, so a
// Wikidata entry can only be pinned after a query has actually surfaced it
// this session. See plans/pin-unpin-and-dsl-line-folding.md.
async function resolvePinnedEvents(pinnedIds: string[]): Promise<HistoricalEvent[]> {
  if (pinnedIds.length === 0) return [];
  const db = await openCache();
  const [fromPostgresCache, fromWikidataCache] = await Promise.all([
    getCachedByIds<HistoricalEvent>(db, ENTRIES_STORE, pinnedIds),
    getCachedByIds<HistoricalEvent>(db, WIKIDATA_ENTRIES_STORE, pinnedIds),
  ]);

  const resolved = new Map<string, HistoricalEvent>();
  for (const id of pinnedIds) {
    const hit = fromPostgresCache.get(id) ?? fromWikidataCache.get(id);
    if (hit) resolved.set(id, hit);
  }

  const stillMissing = pinnedIds.filter(id => !resolved.has(id) && UUID_RE.test(id));
  if (stillMissing.length > 0) {
    const fetched = await fetchEntriesByIds(stillMissing);
    await putCached(db, ENTRIES_STORE, fetched);
    for (const ev of fetched) resolved.set(ev.id, ev);
  }

  return pinnedIds.map(id => resolved.get(id)).filter((ev): ev is HistoricalEvent => ev !== undefined);
}

const MAX_LIMIT = 500;

interface QueryBounds {
  yearMin: number;
  yearMax: number;
  latRange: [number, number] | null;
  lngRange: [number, number] | null;
  category: EventCategory[] | null;
  text: string | null;
  limit: number;
  // Spatial filter against an imported boundary entry, by slug — Postgres
  // only (see queryWikidata, which never reads these). TODO #19.
  insideSlug: string | null;
  outsideSlug: string | null;
}

// Combines the DSL's year/lat/lng filters with the timeline's visible range
// and the map's drag-select box (intersecting ranges) into a single set of
// bounds shared by both data-source backends.
function resolveQueryBounds(
  filters: DslFilter[],
  timeRange: [number, number],
  geoFilter: GeoFilter | null | undefined,
  limit: number,
): QueryBounds {
  let [yearMin, yearMax] = timeRange;
  let latMin: number | null = null;
  let latMax: number | null = null;
  let lngMin: number | null = null;
  let lngMax: number | null = null;
  let category: EventCategory[] | null = null;
  let text: string | null = null;
  let insideSlug: string | null = null;
  let outsideSlug: string | null = null;

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
      case 'insideBoundary':
        insideSlug = f.slug;
        break;
      case 'outsideBoundary':
        outsideSlug = f.slug;
        break;
    }
  }

  if (geoFilter) {
    latMin = latMin === null ? geoFilter.latMin : Math.max(latMin, geoFilter.latMin);
    latMax = latMax === null ? geoFilter.latMax : Math.min(latMax, geoFilter.latMax);
    lngMin = lngMin === null ? geoFilter.lngMin : Math.max(lngMin, geoFilter.lngMin);
    lngMax = lngMax === null ? geoFilter.lngMax : Math.min(lngMax, geoFilter.lngMax);
  }

  return {
    yearMin, yearMax,
    latRange: latMin !== null && latMax !== null ? [latMin, latMax] : null,
    lngRange: lngMin !== null && lngMax !== null ? [lngMin, lngMax] : null,
    category, text,
    limit: Math.min(limit, MAX_LIMIT),
    insideSlug, outsideSlug,
  };
}

function boundsToSearchParams(bounds: QueryBounds): URLSearchParams {
  const params = new URLSearchParams();
  params.set('yearMin', String(bounds.yearMin));
  params.set('yearMax', String(bounds.yearMax));
  if (bounds.category) params.set('category', bounds.category.join(','));
  if (bounds.text) params.set('text', bounds.text);
  if (bounds.latRange) { params.set('latMin', String(bounds.latRange[0])); params.set('latMax', String(bounds.latRange[1])); }
  if (bounds.lngRange) { params.set('lngMin', String(bounds.lngRange[0])); params.set('lngMax', String(bounds.lngRange[1])); }
  if (bounds.insideSlug) params.set('insideSlug', bounds.insideSlug);
  if (bounds.outsideSlug) params.set('outsideSlug', bounds.outsideSlug);
  params.set('limit', String(bounds.limit));
  return params;
}

async function queryPostgres(bounds: QueryBounds): Promise<HistoricalEvent[]> {
  const params = boundsToSearchParams(bounds);
  const slim = await fetchSlim(`/api/entries?${params.toString()}`);
  const db = await openCache();
  return resolveViaCache<HistoricalEvent>(db, ENTRIES_STORE, slim, fetchEntriesByIds);
}

async function queryWikidata(bounds: QueryBounds): Promise<HistoricalEvent[]> {
  const events = await queryQLever({
    categories: bounds.category,
    yearMin: bounds.yearMin,
    yearMax: bounds.yearMax,
    text: bounds.text,
    latRange: bounds.latRange,
    lngRange: bounds.lngRange,
    limit: bounds.limit,
  });
  // No cheap "what changed" listing for a live SPARQL source (unlike the
  // Postgres path) — write straight through to the cache. See
  // plans/wikidata-qlever-data-source.md.
  const db = await openCache();
  await putCached(db, WIKIDATA_ENTRIES_STORE, events);
  return events;
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
      const { filters, limit, pinnedIds } = parseDsl(msg.dsl);
      const bounds = resolveQueryBounds(filters, msg.timeRange, msg.geoFilter, limit);
      const [events, pinnedEvents] = await Promise.all([
        msg.dataSource === 'wikidata' ? queryWikidata(bounds) : queryPostgres(bounds),
        resolvePinnedEvents(pinnedIds),
      ]);
      const out: WorkerOutMessage = { type: 'results', events, pinnedEvents };
      self.postMessage(out);
    } catch (err) {
      console.error('[worker] Query failed:', err);
      const out: WorkerOutMessage = { type: 'results', events: [], pinnedEvents: [] };
      self.postMessage(out);
    }
  }
});
