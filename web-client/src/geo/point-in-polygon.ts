import type { Lane, MultiPolygon } from '../types/index.js';

// Ray-casting point-in-polygon for [lng, lat] geometry. `p` is [lng, lat].

function pointInRing(px: number, py: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// A polygon is rings[0] (exterior) minus rings[1+] (holes).
function pointInPolygon(px: number, py: number, poly: Array<Array<[number, number]>>): boolean {
  if (!poly.length || !pointInRing(px, py, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) {
    if (pointInRing(px, py, poly[h])) return false;
  }
  return true;
}

export function pointInMultiPolygon(lng: number, lat: number, multi: MultiPolygon): boolean {
  for (const poly of multi) {
    if (pointInPolygon(lng, lat, poly)) return true;
  }
  return false;
}

// Returns the slug of the first lane whose geometry contains the point,
// testing lanes in order (land before ocean). A per-lane bbox prefilter
// keeps it cheap. Slug, not id: id is now a Postgres UUID used only for
// caching, while slug is the stable identifier the rest of the UI (lane
// selection, DSL) keys off.
export function assignLane(lng: number, lat: number, lanes: Lane[]): string | null {
  for (const lane of lanes) {
    const [x0, y0, x1, y1] = lane.bbox;
    if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
    if (pointInMultiPolygon(lng, lat, lane.geometry)) return lane.slug;
  }
  return null;
}
