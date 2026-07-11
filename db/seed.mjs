// Reads the existing static data files (entries, historical eras, lanesets)
// and loads them into the local Postgres database, by generating a SQL file
// and running it via `psql -f` (this project talks to Postgres via the psql
// CLI rather than adding a driver dependency — see
// plans/indexeddb-cache-and-server-rewrite.md).
//
// Idempotent: truncates and reloads the seeded tables every run (fresh
// UUIDs, fresh last_updated timestamps) rather than upserting by natural
// key — see plans/db-init-script.md for the rationale.

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'web-client', 'public', 'data');

const PGDATA = process.env.PGDATA_SOCKET_DIR || path.join(REPO_ROOT, 'db', '.pgdata');
const PGDATABASE = process.env.PGDATABASE || 'world_timelines';
const PSQL = process.env.PG_BIN_DIR ? path.join(process.env.PG_BIN_DIR, 'psql') : 'psql';

const VALID_CATEGORIES = new Set([
  'person', 'event', 'place', 'artifact', 'pol_mil_organization',
  'business', 'historical_period', 'concepts', 'other',
]);

// ---------------------------------------------------------------------------
// SQL literal builders — plain '' escaping (this writes a SQL file that psql
// later parses; standard string-literal escaping is correct and sufficient
// here, no shell involved).
// ---------------------------------------------------------------------------

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function sqlStringOrNull(s) {
  return s === null || s === undefined ? 'NULL' : sqlString(s);
}

function sqlNumber(n) {
  if (!Number.isFinite(n)) throw new Error(`non-finite number in seed data: ${n}`);
  return String(n);
}

function sqlBool(b) {
  return b ? 'true' : 'false';
}

function sqlTextArray(arr) {
  if (!arr || arr.length === 0) return 'ARRAY[]::text[]';
  return `ARRAY[${arr.map(sqlString).join(', ')}]::text[]`;
}

function sqlGeoJson(geojson) {
  return `ST_GeomFromGeoJSON(${sqlString(JSON.stringify(geojson))})`;
}

function sqlJsonb(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

// ---------------------------------------------------------------------------
// TSV parsing — mirrors web-client/src/worker/tsv-parser.ts's column layout
// (17 tab-separated columns: id title locations start_year start_month
// start_day end_year end_month end_day start_expr end_expr calendar
// uncertainty_years category infobox_type description tags), producing raw
// rows rather than the TS HistoricalEvent shape.
// ---------------------------------------------------------------------------

function unescapeTsvField(s) {
  return s.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
}

function parseEntriesTsv(text) {
  const lines = text.split('\n');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split('\t');
    if (cols.length < 16) continue;

    const [
      id, title, locationsRaw,
      startYearStr, startMonthStr, startDayStr,
      endYearStr, endMonthStr, endDayStr,
      startExpr, endExpr, calendar, uncertaintyStr,
      categoryRaw, infoboxType, description,
    ] = cols;

    const startYear = parseInt(startYearStr, 10);
    const startMonth = parseInt(startMonthStr, 10);
    const startDay = parseInt(startDayStr, 10);
    const endYear = parseInt(endYearStr, 10);
    const endMonth = parseInt(endMonthStr, 10);
    const endDay = parseInt(endDayStr, 10);
    const uncertaintyYears = parseInt(uncertaintyStr, 10) || 0;
    if (Number.isNaN(startYear) || Number.isNaN(endYear)) continue;

    let locations;
    try {
      locations = JSON.parse(locationsRaw);
    } catch {
      continue;
    }
    if (!Array.isArray(locations)) continue;

    let tags = [];
    const tagsRaw = cols[16];
    if (tagsRaw) {
      try { tags = JSON.parse(unescapeTsvField(tagsRaw)); } catch { /* leave empty */ }
    }

    rows.push({
      slug: unescapeTsvField(id),
      title: unescapeTsvField(title),
      locations,
      startYear, startMonth, startDay,
      endYear, endMonth, endDay,
      startExpr: unescapeTsvField(startExpr),
      endExpr: unescapeTsvField(endExpr),
      calendar: calendar || 'gregorian',
      uncertaintyYears,
      category: VALID_CATEGORIES.has(categoryRaw) ? categoryRaw : 'other',
      infoboxType: unescapeTsvField(infoboxType ?? ''),
      description: unescapeTsvField(description ?? ''),
      tags,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Location -> SQL row (see db/schema.sql: entry_locations)
// ---------------------------------------------------------------------------

function locationToSql(loc, entryIdSql, ordinal) {
  const uncertain = sqlBool(!!loc.uncertain);
  const label = sqlStringOrNull(loc.label ?? null);
  let geometryExpr = 'NULL';
  let radiusExpr = 'NULL';
  let waypointsExpr = 'NULL';

  switch (loc.type) {
    case 'point':
      geometryExpr = sqlGeoJson({ type: 'Point', coordinates: [loc.lng, loc.lat] });
      break;
    case 'circle':
      geometryExpr = sqlGeoJson({ type: 'Point', coordinates: [loc.centerLng, loc.centerLat] });
      radiusExpr = sqlNumber(loc.radiusKm);
      break;
    case 'polygon':
      geometryExpr = sqlGeoJson({ type: 'Polygon', coordinates: loc.rings });
      break;
    case 'multipolygon':
      geometryExpr = sqlGeoJson({ type: 'MultiPolygon', coordinates: loc.polygons });
      break;
    case 'path':
      waypointsExpr = sqlJsonb(loc.waypoints);
      break;
    default:
      throw new Error(`unknown location kind: ${loc.type}`);
  }

  return `(${entryIdSql}, ${ordinal}, ${sqlString(loc.type)}, ${geometryExpr}, ${radiusExpr}, ${waypointsExpr}, ${uncertain}, ${label})`;
}

// ---------------------------------------------------------------------------
// Build the seed SQL
// ---------------------------------------------------------------------------

async function main() {
  const [entriesTsv, erasTsv, lanesetsJsonRaw] = await Promise.all([
    readFile(path.join(DATA_DIR, 'collected_entries.sample.tsv'), 'utf8'),
    readFile(path.join(DATA_DIR, 'historical_eras.tsv'), 'utf8'),
    readFile(path.join(DATA_DIR, 'lanesets.json'), 'utf8'),
  ]);
  const lanesetsData = JSON.parse(lanesetsJsonRaw);

  // Entries also holds historical eras — see db/schema.sql for why.
  const entryRows = [...parseEntriesTsv(entriesTsv), ...parseEntriesTsv(erasTsv)];

  const entryValues = [];
  const locationValues = [];
  for (const row of entryRows) {
    const idSql = sqlString(randomUUID());
    entryValues.push(`(${idSql}, ${sqlString(row.slug)}, ${sqlString(row.title)}, ` +
      `${sqlNumber(row.startYear)}, ${sqlNumber(row.startMonth)}, ${sqlNumber(row.startDay)}, ` +
      `${sqlNumber(row.endYear)}, ${sqlNumber(row.endMonth)}, ${sqlNumber(row.endDay)}, ` +
      `${sqlString(row.startExpr)}, ${sqlString(row.endExpr)}, ${sqlString(row.calendar)}, ` +
      `${sqlNumber(row.uncertaintyYears)}, ${sqlString(row.category)}, ${sqlString(row.infoboxType)}, ` +
      `${sqlString(row.description)}, ${sqlTextArray(row.tags)}, now())`);

    row.locations.forEach((loc, ordinal) => {
      locationValues.push(locationToSql(loc, idSql, ordinal));
    });
  }

  const lanesetValues = [];
  const laneValues = [];
  for (const laneset of lanesetsData.lanesets) {
    const lanesetIdSql = sqlString(randomUUID());
    lanesetValues.push(`(${lanesetIdSql}, ${sqlString(laneset.id)}, ${sqlString(laneset.name)}, ` +
      `${sqlString(laneset.description)}, now())`);

    for (const lane of laneset.lanes) {
      const laneIdSql = sqlString(randomUUID());
      const geo = { type: 'MultiPolygon', coordinates: lane.geometry };
      laneValues.push(`(${laneIdSql}, ${lanesetIdSql}, ${sqlString(lane.id)}, ${sqlString(lane.name)}, ` +
        `${sqlString(lane.description)}, ${sqlGeoJson(geo)}, ` +
        `${sqlNumber(lane.bbox[0])}, ${sqlNumber(lane.bbox[1])}, ${sqlNumber(lane.bbox[2])}, ${sqlNumber(lane.bbox[3])}, ` +
        `${sqlTextArray(lane.eraSources || [])}, now())`);
    }
  }

  const sqlParts = ['BEGIN;', 'TRUNCATE entries, lanesets, lanes CASCADE;'];

  if (entryValues.length) {
    sqlParts.push(
      'INSERT INTO entries (id, slug, title, start_year, start_month, start_day, ' +
      'end_year, end_month, end_day, start_expr, end_expr, calendar, uncertainty_years, ' +
      'category, infobox_type, description, tags, last_updated) VALUES\n' +
      entryValues.join(',\n') + ';',
    );
  }
  if (locationValues.length) {
    sqlParts.push(
      'INSERT INTO entry_locations (entry_id, ordinal, kind, geometry, radius_km, waypoints, uncertain, label) VALUES\n' +
      locationValues.join(',\n') + ';',
    );
  }
  if (lanesetValues.length) {
    sqlParts.push(
      'INSERT INTO lanesets (id, slug, name, description, last_updated) VALUES\n' +
      lanesetValues.join(',\n') + ';',
    );
  }
  if (laneValues.length) {
    sqlParts.push(
      'INSERT INTO lanes (id, laneset_id, slug, name, description, geometry, ' +
      'bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat, era_sources, last_updated) VALUES\n' +
      laneValues.join(',\n') + ';',
    );
  }
  sqlParts.push('COMMIT;');

  const generatedPath = path.join(REPO_ROOT, 'db', '.generated-seed.sql');
  await writeFile(generatedPath, sqlParts.join('\n\n') + '\n', 'utf8');

  execFileSync(PSQL, ['-h', PGDATA, '-d', PGDATABASE, '-v', 'ON_ERROR_STOP=1', '-f', generatedPath], { stdio: 'inherit' });

  console.log(
    `Seeded ${entryRows.length} entries (${locationValues.length} locations), ` +
    `${lanesetValues.length} lanesets, ${laneValues.length} lanes.`,
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
