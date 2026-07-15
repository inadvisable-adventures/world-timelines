// IndexedDB-backed cache for entries and lanesets, shared by the main thread
// (app-root.ts, for eras/lanesets) and the query worker (for entries).
// Native indexedDB — no dependency, works in both a Window and a Worker.

const DB_NAME = 'world-timelines';
const DB_VERSION = 2;

export const ENTRIES_STORE = 'entries';
export const LANESETS_STORE = 'lanesets';
// Wikidata-sourced entries get their own store (TODO #6) — keeps a Q-id
// (e.g. 'Q42') and a Postgres UUID from ever needing to be distinguished by
// shape, and lets each source's cache be reasoned about/cleared independently.
export const WIKIDATA_ENTRIES_STORE = 'wikidataEntries';

export interface CachedRecord {
  id: string;
  lastUpdated: string;
}

export interface SlimRecord {
  id: string;
  lastUpdated: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openCache(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ENTRIES_STORE)) db.createObjectStore(ENTRIES_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(LANESETS_STORE)) db.createObjectStore(LANESETS_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(WIKIDATA_ENTRIES_STORE)) db.createObjectStore(WIKIDATA_ENTRIES_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function getMany<T extends CachedRecord>(db: IDBDatabase, store: string, ids: string[]): Promise<Map<string, T>> {
  return new Promise((resolve, reject) => {
    const result = new Map<string, T>();
    if (ids.length === 0) { resolve(result); return; }
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    let remaining = ids.length;
    for (const id of ids) {
      const req = os.get(id);
      req.onsuccess = () => {
        if (req.result) result.set(id, req.result as T);
        if (--remaining === 0) resolve(result);
      };
      req.onerror = () => reject(req.error);
    }
  });
}

// Write-through cache write, exposed for sources (e.g. Wikidata via QLever)
// that have no cheap way to list "what changed" separately from fetching
// full data — see plans/wikidata-qlever-data-source.md.
export function putCached<T extends CachedRecord>(db: IDBDatabase, store: string, records: T[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (records.length === 0) { resolve(); return; }
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const record of records) os.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// The shared diff-and-fill algorithm: for each slim {id, lastUpdated} pair,
// use the cached copy if it's present and at least as fresh; otherwise fetch
// it (in one batched call) and write it through to the cache. Returns full
// records in the same order as `slim`.
export async function resolveViaCache<T extends CachedRecord>(
  db: IDBDatabase,
  store: string,
  slim: SlimRecord[],
  fetchMissing: (ids: string[]) => Promise<T[]>,
): Promise<T[]> {
  const cached = await getMany<T>(db, store, slim.map(s => s.id));

  const missingIds: string[] = [];
  for (const s of slim) {
    const hit = cached.get(s.id);
    if (!hit || new Date(hit.lastUpdated).getTime() < new Date(s.lastUpdated).getTime()) {
      missingIds.push(s.id);
    }
  }

  if (missingIds.length > 0) {
    const fresh = await fetchMissing(missingIds);
    await putCached(db, store, fresh);
    for (const record of fresh) cached.set(record.id, record);
  }

  const out: T[] = [];
  for (const s of slim) {
    const record = cached.get(s.id);
    if (record) out.push(record);
  }
  return out;
}
