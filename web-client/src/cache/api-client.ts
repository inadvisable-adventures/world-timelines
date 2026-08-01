// Small fetch helpers for local-concept-server's JSON API, shared by
// app-root.ts (main thread) and query-worker.ts (worker) so the request
// shape isn't duplicated between them.

import type { BoundaryOption, HistoricalEvent, Laneset } from '../types/index.js';
import type { SlimRecord } from './idb-cache.js';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function postIds<T>(url: string, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return [];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
  return res.json() as Promise<T[]>;
}

export function fetchSlim(url: string): Promise<SlimRecord[]> {
  return getJson<SlimRecord[]>(url);
}

export function fetchEntriesByIds(ids: string[]): Promise<HistoricalEvent[]> {
  return postIds<HistoricalEvent>('/api/entries/by-ids', ids);
}

export function fetchLanesetsByIds(ids: string[]): Promise<Laneset[]> {
  return postIds<Laneset>('/api/lanesets/by-ids', ids);
}

// Small, uncached fetch (see plans/boundary-geometry-spatial-filter.md —
// the picker only ever needs slug/title, never the actual polygon
// coordinates, so this bypasses the slim-list-plus-IndexedDB-cache
// machinery entirely).
export function fetchBoundaries(): Promise<BoundaryOption[]> {
  return getJson<BoundaryOption[]>('/api/entries/boundaries');
}
