export type EventCategory = 'person' | 'event' | 'place' | 'artifact' | 'pol_mil_organization' | 'business' | 'historical_period' | 'concepts' | 'other';

// ---------------------------------------------------------------------------
// Locations (A3: multiple coordinates per event, with rich map representations)
// ---------------------------------------------------------------------------

export interface PointLocation {
  type: 'point';
  lat: number;
  lng: number;
  uncertain?: boolean; // renders half-alpha; use for disputed or approximate points
  label?: string;
}

export interface PolygonLocation {
  type: 'polygon';
  // Rings in GeoJSON [lng, lat] order. rings[0] = exterior; rings[1+] = holes.
  // Use for a single contiguous territory that may have internal exclusions.
  rings: Array<Array<[number, number]>>;
  uncertain?: boolean;
  label?: string;
}

export interface MultiPolygonLocation {
  type: 'multipolygon';
  // Each element is one polygon represented as rings (exterior + holes).
  // Use for non-contiguous territories (e.g. empires with separated regions).
  polygons: Array<Array<Array<[number, number]>>>;
  uncertain?: boolean;
  label?: string;
}

export interface PathLocation {
  type: 'path';
  // Ordered waypoints forming a route or journey.
  // t (0–1) is fractional progress through the event's time span; omit if unknown.
  waypoints: Array<{ lat: number; lng: number; t?: number; label?: string }>;
  label?: string;
}

export interface CircleLocation {
  type: 'circle';
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  uncertain?: boolean; // renders half-alpha for approximate or general-area locations
  label?: string;
}

export type EventLocation =
  | PointLocation
  | PolygonLocation
  | MultiPolygonLocation
  | PathLocation
  | CircleLocation;

// ---------------------------------------------------------------------------
// Dates (A2: denormalized, original expression preserved, calendar detected)
// ---------------------------------------------------------------------------

export interface EventDate {
  originalExpression: string;
  detectedCalendar: string;   // 'gregorian' | 'julian' | 'islamic' | 'hebrew' | 'unknown'
  startYear: number;          // signed int, negative = BCE
  startMonth: number;         // 1–12, or 0 = unknown
  startDay: number;           // 1–31, or 0 = unknown
  endYear: number;
  endMonth: number;
  endDay: number;
  uncertaintyYears: number;   // LUT-estimated
}

// ---------------------------------------------------------------------------
// Historical event
// ---------------------------------------------------------------------------

export interface HistoricalEvent {
  id: string;                   // Postgres UUID
  title: string;
  locations: EventLocation[];   // zero or more; first = primary (if any)
  startDate: EventDate;
  endDate: EventDate | null;    // null when start === end
  category: EventCategory;
  infoboxType: string;          // Wikipedia infobox type; '' for hand-crafted
  description: string;
  tags: string[];               // e.g. ['no-coords-found']
  lastUpdated: string;          // ISO 8601; drives the IndexedDB cache
}

// ---------------------------------------------------------------------------
// Helpers for rendering code that needs a single lat/lng
// ---------------------------------------------------------------------------

export function primaryLat(event: HistoricalEvent): number | null {
  const loc = event.locations[0];
  if (!loc) return null;
  if (loc.type === 'point') return loc.lat;
  if (loc.type === 'circle') return loc.centerLat;
  if (loc.type === 'polygon') return loc.rings[0]?.[0]?.[1] ?? null;
  if (loc.type === 'multipolygon') return loc.polygons[0]?.[0]?.[0]?.[1] ?? null;
  if (loc.type === 'path') return loc.waypoints[0]?.lat ?? null;
  return null;
}

export function primaryLng(event: HistoricalEvent): number | null {
  const loc = event.locations[0];
  if (!loc) return null;
  if (loc.type === 'point') return loc.lng;
  if (loc.type === 'circle') return loc.centerLng;
  if (loc.type === 'polygon') return loc.rings[0]?.[0]?.[0] ?? null;
  if (loc.type === 'multipolygon') return loc.polygons[0]?.[0]?.[0]?.[0] ?? null;
  if (loc.type === 'path') return loc.waypoints[0]?.lng ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// Historical era (an entry with category='historical_period' and a tag
// ending in '-history' — see db/schema.sql; fetched via /api/eras)
// ---------------------------------------------------------------------------

export interface HistoricalEra {
  id: string;
  title: string;
  startYear: number;
  endYear: number;
  source: string;  // e.g. "world-history" | "china-history" | "egypt-history" | ...
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Lanes / lanesets (timeline geographic lanes — TODO #65)
// ---------------------------------------------------------------------------

// A GeoJSON-style MultiPolygon in [lng, lat] order: array of polygons, each a
// list of rings (rings[0] = exterior, rings[1+] = holes).
export type MultiPolygon = Array<Array<Array<[number, number]>>>;

export interface Lane {
  id: string;    // Postgres UUID — cache key / by-ids fetch only
  slug: string;  // stable human-referenced id, e.g. 'africa' — used by the DSL/UI
  name: string;
  description: string;
  geometry: MultiPolygon;
  bbox: [number, number, number, number]; // [lngMin, latMin, lngMax, latMax] prefilter
  // Optional: era sources that map to this lane (e.g. ['rome-history']). The
  // synthetic top lane 'global' carries world-history eras.
  eraSources?: string[];
  lastUpdated: string;
}

export interface Laneset {
  id: string;    // Postgres UUID — cache key / by-ids fetch only
  slug: string;  // stable human-referenced id, e.g. 'continents' — used by the DSL/picker
  name: string;
  description: string;
  lanes: Lane[];
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// DSL filter types
// ---------------------------------------------------------------------------

export type DslFilter =
  | { kind: 'category'; values: EventCategory[] }
  | { kind: 'year';     start: number; end: number }
  | { kind: 'text';     query: string }
  | { kind: 'lat';      min: number; max: number }
  | { kind: 'lng';      min: number; max: number }
;

// ---------------------------------------------------------------------------
// Data source (TODO #6 — Wikidata via QLever, alongside local-concept-server)
// ---------------------------------------------------------------------------

export type DataSource = 'postgres' | 'wikidata';

// ---------------------------------------------------------------------------
// Worker message types
// ---------------------------------------------------------------------------

export interface InitRequest {
  type: 'init';
}

export interface GeoFilter {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

export interface QueryRequest {
  type: 'query';
  dsl: string;
  timeRange: [number, number];
  geoFilter?: GeoFilter | null;
  dataSource: DataSource;
}

export type WorkerInMessage = InitRequest | QueryRequest;

export interface ReadyResponse {
  type: 'ready';
}

export interface QueryResponse {
  type: 'results';
  events: HistoricalEvent[];
}

export type WorkerOutMessage = ReadyResponse | QueryResponse;
