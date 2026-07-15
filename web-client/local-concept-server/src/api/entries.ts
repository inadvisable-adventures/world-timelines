import { runQuery, validateUuidList, BadRequestError } from '../db.js';

const VALID_CATEGORIES = new Set([
  'person', 'event', 'place', 'artifact', 'pol_mil_organization',
  'business', 'historical_period', 'concepts', 'other',
]);

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

// An entry is an "era" (belongs on the timeline's era bands, not the
// queryable entry/marker set) iff it's category='historical_period' with a
// tag ending in '-history' — see db/schema.sql. Historical eras and regular
// entries share the entries table (same 17-column shape as the source TSVs),
// but the app's main query results (map markers, timeline entry dots) must
// exclude era rows just as the old architecture did (eras came from a wholly
// separate file, never mixed into the queryable event set).
const IS_ERA_SQL = `category = 'historical_period' AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE '%-history')`;

export interface SlimResult {
  id: string;
  lastUpdated: string;
}

function parseIntParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) throw new BadRequestError(`invalid integer: ${value}`);
  return n;
}

function parseFloatParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) throw new BadRequestError(`invalid number: ${value}`);
  return n;
}

// Slim query results — {id, lastUpdated} only. Full records are fetched
// separately via getEntriesByIds, so the client can serve cached-and-fresh
// ids straight from IndexedDB without a network round trip for their data.
export async function listEntries(params: URLSearchParams): Promise<SlimResult[]> {
  const conditions: string[] = [`NOT (${IS_ERA_SQL})`];
  const vars: Record<string, string> = {};

  const yearMin = parseIntParam(params.get('yearMin'), -10_000_000);
  const yearMax = parseIntParam(params.get('yearMax'), 10_000_000);
  conditions.push(`start_year <= ${yearMax} AND end_year >= ${yearMin}`);

  const categoryParam = params.get('category');
  if (categoryParam) {
    const values = categoryParam.split(',').map(s => s.trim());
    for (const v of values) {
      if (!VALID_CATEGORIES.has(v)) throw new BadRequestError(`invalid category: ${v}`);
    }
    vars['categories'] = values.join(',');
    conditions.push(`category = ANY(string_to_array(:'categories', ','))`);
  }

  const text = params.get('text');
  if (text) {
    vars['text'] = text;
    conditions.push(`position(lower(:'text') in lower(title) || ' ' || lower(description)) > 0`);
  }

  const latMin = params.get('latMin');
  const latMax = params.get('latMax');
  const lngMin = params.get('lngMin');
  const lngMax = params.get('lngMax');
  if (latMin !== null || latMax !== null || lngMin !== null || lngMax !== null) {
    const lm = parseFloatParam(latMin, -90);
    const lM = parseFloatParam(latMax, 90);
    const gm = parseFloatParam(lngMin, -180);
    const gM = parseFloatParam(lngMax, 180);
    // A representative point for any location kind (point/polygon/multipolygon/
    // circle) at the entry's primary (ordinal 0) location — mirrors the
    // client's old primaryLat/primaryLng helpers, now evaluated in SQL.
    conditions.push(`EXISTS (
      SELECT 1 FROM entry_locations el
      WHERE el.entry_id = entries.id AND el.ordinal = 0 AND el.geometry IS NOT NULL
        AND ST_Y(ST_PointOnSurface(el.geometry)) BETWEEN ${lm} AND ${lM}
        AND ST_X(ST_PointOnSurface(el.geometry)) BETWEEN ${gm} AND ${gM}
    )`);
  }

  const limit = Math.min(MAX_LIMIT, parseIntParam(params.get('limit'), DEFAULT_LIMIT));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT id, last_updated AS "lastUpdated"
    FROM entries
    ${where}
    ORDER BY start_year, id
    LIMIT ${limit}
  `;
  return runQuery<SlimResult>(sql, vars);
}

// Eras are entries with category='historical_period' and a tag ending in
// '-history' (see db/schema.sql) — never limited, unlike listEntries, since
// the timeline needs every era band, not a capped query result.
export async function listEras(): Promise<SlimResult[]> {
  const sql = `
    SELECT id, last_updated AS "lastUpdated"
    FROM entries
    WHERE ${IS_ERA_SQL}
    ORDER BY start_year, id
  `;
  return runQuery<SlimResult>(sql);
}

// Full HistoricalEvent-shaped records for a given list of ids, reconstructing
// the locations[] union and the start/endDate shape the client expects.
export async function getEntriesByIds(rawIds: unknown): Promise<unknown[]> {
  const ids = validateUuidList(rawIds);
  if (ids.length === 0) return [];

  const sql = `
    SELECT
      e.id,
      e.title,
      -- The Postgres path's title already IS the Wikipedia page title by
      -- construction (the ingester sets it directly from page.title) —
      -- unlike the Wikidata/QLever path, where the display label and the
      -- real article title can diverge. See
      -- plans/qlever-require-wikipedia-page.md.
      e.title AS "wikipediaTitle",
      e.category,
      e.infobox_type AS "infoboxType",
      e.description,
      e.tags,
      e.last_updated AS "lastUpdated",
      jsonb_build_object(
        'originalExpression', e.start_expr,
        'detectedCalendar', e.calendar,
        'startYear', e.start_year, 'startMonth', e.start_month, 'startDay', e.start_day,
        'endYear', e.end_year, 'endMonth', e.end_month, 'endDay', e.end_day,
        'uncertaintyYears', e.uncertainty_years
      ) AS "startDate",
      CASE WHEN e.end_year = e.start_year THEN NULL ELSE jsonb_build_object(
        'originalExpression', e.end_expr,
        'detectedCalendar', e.calendar,
        'startYear', e.end_year, 'startMonth', e.end_month, 'startDay', e.end_day,
        'endYear', e.end_year, 'endMonth', e.end_month, 'endDay', e.end_day,
        'uncertaintyYears', e.uncertainty_years
      ) END AS "endDate",
      COALESCE(loc.locations, '[]'::jsonb) AS locations
    FROM entries e
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        CASE el.kind
          WHEN 'point' THEN jsonb_build_object(
            'type', 'point', 'lat', ST_Y(el.geometry), 'lng', ST_X(el.geometry),
            'uncertain', el.uncertain, 'label', el.label)
          WHEN 'circle' THEN jsonb_build_object(
            'type', 'circle', 'centerLat', ST_Y(el.geometry), 'centerLng', ST_X(el.geometry),
            'radiusKm', el.radius_km, 'uncertain', el.uncertain, 'label', el.label)
          WHEN 'polygon' THEN jsonb_build_object(
            'type', 'polygon', 'rings', (ST_AsGeoJSON(el.geometry)::jsonb -> 'coordinates'),
            'uncertain', el.uncertain, 'label', el.label)
          WHEN 'multipolygon' THEN jsonb_build_object(
            'type', 'multipolygon', 'polygons', (ST_AsGeoJSON(el.geometry)::jsonb -> 'coordinates'),
            'uncertain', el.uncertain, 'label', el.label)
          WHEN 'path' THEN jsonb_build_object(
            'type', 'path', 'waypoints', el.waypoints, 'label', el.label)
        END
        ORDER BY el.ordinal
      ) AS locations
      FROM entry_locations el
      WHERE el.entry_id = e.id
    ) loc ON true
    WHERE e.id = ANY(string_to_array(:'ids', ',')::uuid[])
  `;
  return runQuery(sql, { ids: ids.join(',') });
}
