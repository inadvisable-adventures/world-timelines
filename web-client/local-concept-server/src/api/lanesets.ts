import { runQuery, validateUuidList } from '../db.js';

export interface SlimResult {
  id: string;
  slug: string;
  lastUpdated: string;
}

export async function listLanesets(): Promise<SlimResult[]> {
  return runQuery<SlimResult>(`SELECT id, slug, last_updated AS "lastUpdated" FROM lanesets ORDER BY slug`);
}

// Full Laneset-shaped records (with nested lanes[], geometry as GeoJSON
// MultiPolygon coordinates) for a given list of laneset ids.
export async function getLanesetsByIds(rawIds: unknown): Promise<unknown[]> {
  const ids = validateUuidList(rawIds);
  if (ids.length === 0) return [];

  const sql = `
    SELECT
      ls.id, ls.slug, ls.name, ls.description, ls.last_updated AS "lastUpdated",
      COALESCE(lane_agg.lanes, '[]'::jsonb) AS lanes
    FROM lanesets ls
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', l.id, 'slug', l.slug, 'name', l.name, 'description', l.description,
          'geometry', (ST_AsGeoJSON(l.geometry)::jsonb -> 'coordinates'),
          'bbox', jsonb_build_array(l.bbox_min_lng, l.bbox_min_lat, l.bbox_max_lng, l.bbox_max_lat),
          'eraSources', to_jsonb(l.era_sources),
          'lastUpdated', l.last_updated
        ) ORDER BY l.slug
      ) AS lanes
      FROM lanes l
      WHERE l.laneset_id = ls.id
    ) lane_agg ON true
    WHERE ls.id = ANY(string_to_array(:'ids', ',')::uuid[])
  `;
  return runQuery(sql, { ids: ids.join(',') });
}
