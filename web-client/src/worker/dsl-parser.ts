import type { DslFilter, EventCategory } from '../types/index.js';

const VALID_CATEGORIES = new Set<string>(['person', 'event', 'place', 'artifact', 'pol_mil_organization', 'business', 'historical_period', 'concepts', 'other']);

const DEFAULT_LIMIT = 100;

export interface ParsedQuery {
  filters: DslFilter[];
  limit:   number;
  laneset: string | null; // active laneset id, 'none', or null (= app default)
}

export function parseDsl(dsl: string): ParsedQuery {
  const filters: DslFilter[] = [];
  let limit = DEFAULT_LIMIT;
  let laneset: string | null = null;

  for (const rawLine of dsl.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // limit N
    const limitM = /^limit\s+(\d+)$/i.exec(line);
    if (limitM) {
      limit = Math.max(1, parseInt(limitM[1], 10));
      continue;
    }

    // laneset <id|none>
    const laneM = /^laneset\s+([\w-]+)$/i.exec(line);
    if (laneM) {
      laneset = laneM[1].toLowerCase();
      continue;
    }

    const m = /^filter\s+(\w+)\s*:\s*(.+)$/i.exec(line);
    if (!m) continue;

    const field = m[1].toLowerCase();
    const value = m[2].trim();

    switch (field) {
      case 'category': {
        const values = value
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(s => VALID_CATEGORIES.has(s)) as EventCategory[];
        if (values.length > 0) filters.push({ kind: 'category', values });
        break;
      }

      case 'year': {
        const range = parseRange(value);
        if (range) filters.push({ kind: 'year', start: range[0], end: range[1] });
        break;
      }

      case 'text': {
        if (value) filters.push({ kind: 'text', query: value.toLowerCase() });
        break;
      }

      case 'lat': {
        const range = parseRange(value);
        if (range) filters.push({ kind: 'lat', min: range[0], max: range[1] });
        break;
      }

      case 'lng': {
        const range = parseRange(value);
        if (range) filters.push({ kind: 'lng', min: range[0], max: range[1] });
        break;
      }
    }
  }

  return { filters, limit, laneset };
}

function parseRange(s: string): [number, number] | null {
  const m = /^(-?[\d.]+)\s+to\s+(-?[\d.]+)$/i.exec(s);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (isNaN(a) || isNaN(b)) return null;
  return [Math.min(a, b), Math.max(a, b)];
}
