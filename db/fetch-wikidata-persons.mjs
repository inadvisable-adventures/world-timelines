// Bulk-fetches all Wikidata 'person' records matching this project's QLever
// query filters (see web-client/src/wikidata/qlever-client.ts, TODO items
// 6-8: real human, has a birth date, no sports figures, has an English
// Wikipedia page, not fictional) and loads them into the local Postgres
// database as a JSONB document collection (wikidata_documents). See
// plans/wikidata-bulk-person-download.md for the full design rationale.
//
// Usage:
//   node db/fetch-wikidata-persons.mjs [--year-min N] [--year-max N]
// Defaults to the app's full range (-3000 to 2100). Pass a narrower range
// to validate the pipeline cheaply before running the full job.
//
// Resumable: completed chunks are recorded in wikidata_fetch_progress and
// skipped on a re-run. Assumes db/schema.sql has already been applied.

import { execFile } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const PGDATA = process.env.PGDATA_SOCKET_DIR || path.join(REPO_ROOT, 'db', '.pgdata');
const PGDATABASE = process.env.PGDATABASE || 'world_timelines';
const PSQL = process.env.PG_BIN_DIR ? path.join(process.env.PG_BIN_DIR, 'psql')
  : '/opt/homebrew/opt/postgresql@18/bin/psql';

const QLEVER_ENDPOINT = 'https://qlever.dev/api/wikidata';
const USER_AGENT = 'world-timelines-bulk-fetch/1.0 (https://github.com/inadvisable-adventures/world-timelines)';
const REQUEST_DELAY_MS = 1500; // courtesy pacing between requests to a shared public endpoint
const MAX_CHUNK_ROWS = 100_000; // ~23s at the measured ~4,400 rows/s; see the plan for how this was calibrated
const CATEGORY = 'person';

const PREFIXES = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
`.trim();

// Same person-category shape as category-map.ts/qlever-client.ts, duplicated
// here deliberately — this is a standalone Node script, not part of the
// browser/worker TS build, and the shared shape is small and stable. See
// plans/wikidata-bulk-person-download.md.
const PERSON_PATTERN = `
  ?item wdt:P31 wd:Q5 .
  ?item p:P569/psv:P569 ?dateNode .
  ?dateNode wikibase:timeValue ?date ; wikibase:timePrecision ?datePrecision .
  OPTIONAL { ?item wdt:P19 ?placeItem . ?placeItem wdt:P625 ?coord . }
  FILTER NOT EXISTS { ?item wdt:P641 ?anySport }
  FILTER NOT EXISTS { ?item wdt:P106/wdt:P279* wd:Q2066131 }
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?wikipediaTitle .
  FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q14897293 }
  FILTER NOT EXISTS { ?item wdt:P1074 ?anyFictionalUniverse }
`.trim();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sparqlRequest(query, accept) {
  const url = `${QLEVER_ENDPOINT}?${new URLSearchParams({ query }).toString()}`;
  const res = await fetch(url, { headers: { Accept: accept, 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`QLever request failed: ${res.status} ${await res.text()}`);
  return res;
}

async function countInRange(yearMin, yearMax) {
  const query = `${PREFIXES}
SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {
  ${PERSON_PATTERN}
  FILTER(YEAR(?date) >= ${yearMin} && YEAR(?date) <= ${yearMax})
}`;
  const res = await sparqlRequest(query, 'application/sparql-results+json');
  const body = await res.json();
  return parseInt(body.results.bindings[0].count.value, 10);
}

// Recursively splits [yearMin, yearMax] until every chunk's count is safely
// under MAX_CHUNK_ROWS (or the range can't be split further). Each call is
// one QLever COUNT request, so this is deliberately not over-eager — it
// only recurses into a half once the parent range is known to be too big.
async function planChunks(yearMin, yearMax) {
  await sleep(REQUEST_DELAY_MS);
  const count = await countInRange(yearMin, yearMax);
  if (count === 0) return [];
  if (count <= MAX_CHUNK_ROWS || yearMax <= yearMin) {
    return [{ yearMin, yearMax, count }];
  }
  const mid = Math.floor((yearMin + yearMax) / 2);
  const left = await planChunks(yearMin, mid);
  const right = await planChunks(mid + 1, yearMax);
  return [...left, ...right];
}

function parseWikidataDate(value, precision) {
  const m = /^(-?\d+)-(\d{2})-(\d{2})T/.exec(value);
  if (!m) return { year: 0, month: 0, day: 0 };
  const year = parseInt(m[1], 10);
  const month = precision >= 10 ? parseInt(m[2], 10) : 0;
  const day = precision >= 11 ? parseInt(m[3], 10) : 0;
  return { year, month, day };
}

function uncertaintyYearsForPrecision(precision) {
  if (precision >= 9) return 0;
  if (precision === 8) return 5;
  if (precision === 7) return 50;
  if (precision === 6) return 500;
  if (precision === 5) return 5_000;
  if (precision === 4) return 50_000;
  if (precision === 3) return 500_000;
  return 500_000_000;
}

function parseWktPoint(wkt) {
  const m = /^POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i.exec(wkt.trim());
  if (!m) return null;
  return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

function bindingToRecord(b) {
  const idMatch = /\/(Q\d+)$/.exec(b.item.value);
  if (!idMatch) return null;
  const id = idMatch[1];

  const precision = parseInt(b.datePrecision.value, 10);
  const { year, month, day } = parseWikidataDate(b.date.value, precision);
  const uncertaintyYears = uncertaintyYearsForPrecision(precision);
  const date = {
    originalExpression: b.date.value,
    detectedCalendar: 'gregorian',
    startYear: year, startMonth: month, startDay: day,
    endYear: year, endMonth: month, endDay: day,
    uncertaintyYears,
  };

  const locations = [];
  if (b.coord) {
    const point = parseWktPoint(b.coord.value);
    if (point) locations.push({ type: 'point', lat: point.lat, lng: point.lng });
  }

  return {
    id,
    title: b.itemLabel?.value ?? id,
    locations,
    startDate: date,
    endDate: date,
    category: CATEGORY,
    infoboxType: 'wikidata:Q5',
    description: b.description?.value ?? '',
    tags: ['wikidata'],
    lastUpdated: new Date().toISOString(),
    wikipediaTitle: b.wikipediaTitle.value,
  };
}

// A person with more than one recorded place (e.g. multiple P19 birthplace
// claims) produces one result row per place — merge those into a single
// record with multiple locations, rather than duplicate records with the
// same id (which would violate wikidata_documents' primary key). Same
// issue, same fix, as qlever-client.ts's mergeDuplicateEvents.
function mergeDuplicateRecords(records) {
  const byId = new Map();
  for (const record of records) {
    const existing = byId.get(record.id);
    if (!existing) {
      byId.set(record.id, record);
      continue;
    }
    for (const loc of record.locations) {
      const isDupe = existing.locations.some(l => l.lat === loc.lat && l.lng === loc.lng);
      if (!isDupe) existing.locations.push(loc);
    }
  }
  return Array.from(byId.values());
}

async function fetchChunk(yearMin, yearMax) {
  const query = `${PREFIXES}
SELECT ?item ?itemLabel ?description ?date ?datePrecision ?coord ?wikipediaTitle WHERE {
  ${PERSON_PATTERN}
  FILTER(YEAR(?date) >= ${yearMin} && YEAR(?date) <= ${yearMax})
  OPTIONAL { ?item rdfs:label ?itemLabel . FILTER(LANG(?itemLabel) = "en") }
  OPTIONAL { ?item schema:description ?description . FILTER(LANG(?description) = "en") }
}`;
  const res = await sparqlRequest(query, 'application/sparql-results+json');
  const body = await res.json();
  const records = [];
  for (const binding of body.results.bindings) {
    const record = bindingToRecord(binding);
    if (record) records.push(record);
  }
  return mergeDuplicateRecords(records);
}

// Postgres can expand a JSON array directly into rows (jsonb_array_elements),
// so the whole chunk goes in as a single dollar-quoted JSON blob rather than
// escaping each record as a CSV line — simpler, and avoids a whole class of
// CSV-escaping bugs. Dollar-quoting needs a delimiter tag guaranteed not to
// appear in the data; pick one and verify, regenerating on the
// astronomically unlikely chance of a collision.
function dollarQuote(text) {
  let tag = '$wt_json$';
  while (text.includes(tag)) {
    tag = `$wt_json_${Math.random().toString(36).slice(2)}$`;
  }
  return `${tag}${text}${tag}`;
}

async function loadChunkIntoPostgres(records, yearMin, yearMax) {
  if (records.length === 0) return;
  const json = JSON.stringify(records);
  const sql = `
BEGIN;
INSERT INTO wikidata_documents (id, category, data, fetched_at)
SELECT elem->>'id', elem->>'category', elem, now()
FROM jsonb_array_elements(${dollarQuote(json)}::jsonb) AS elem
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at;
COMMIT;
`;
  const tmpFile = path.join(os.tmpdir(), `wikidata-chunk-${yearMin}-${yearMax}-${process.pid}.sql`);
  await writeFile(tmpFile, sql, 'utf8');
  try {
    await execFilePromise(PSQL, ['-h', PGDATA, '-d', PGDATABASE, '-v', 'ON_ERROR_STOP=1', '-q', '-f', tmpFile]);
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

function execFilePromise(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

async function recordProgress(yearMin, yearMax, rowCount) {
  const sql = `INSERT INTO wikidata_fetch_progress (category, chunk_start_year, chunk_end_year, row_count)
    VALUES ('${CATEGORY}', ${yearMin}, ${yearMax}, ${rowCount})
    ON CONFLICT (category, chunk_start_year, chunk_end_year) DO UPDATE SET row_count = EXCLUDED.row_count, completed_at = now();`;
  await execFilePromise(PSQL, ['-h', PGDATA, '-d', PGDATABASE, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql]);
}

async function loadCompletedChunks() {
  const sql = `SELECT chunk_start_year || ':' || chunk_end_year AS k FROM wikidata_fetch_progress WHERE category = '${CATEGORY}';`;
  const out = await execFilePromise(PSQL, ['-h', PGDATA, '-d', PGDATABASE, '-X', '-q', '-A', '-t', '-c', sql]);
  return new Set(out.split('\n').map(l => l.trim()).filter(Boolean));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let yearMin = -3000;
  let yearMax = 2100;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--year-min') yearMin = parseInt(args[++i], 10);
    if (args[i] === '--year-max') yearMax = parseInt(args[++i], 10);
  }
  return { yearMin, yearMax };
}

async function main() {
  const { yearMin, yearMax } = parseArgs();
  console.log(`Planning chunks for ${yearMin}..${yearMax} (max ${MAX_CHUNK_ROWS} rows/chunk)...`);
  const chunks = await planChunks(yearMin, yearMax);
  const totalRows = chunks.reduce((s, c) => s + c.count, 0);
  console.log(`Planned ${chunks.length} chunks, ~${totalRows} total rows.`);

  const completed = await loadCompletedChunks();
  let loadedRows = 0;
  let doneChunks = 0;

  for (const chunk of chunks) {
    const key = `${chunk.yearMin}:${chunk.yearMax}`;
    doneChunks++;
    if (completed.has(key)) {
      console.log(`[${doneChunks}/${chunks.length}] skip ${key} (already loaded, ${chunk.count} rows)`);
      loadedRows += chunk.count;
      continue;
    }
    console.log(`[${doneChunks}/${chunks.length}] fetching ${key} (~${chunk.count} rows)...`);
    await sleep(REQUEST_DELAY_MS);
    const records = await fetchChunk(chunk.yearMin, chunk.yearMax);
    await loadChunkIntoPostgres(records, chunk.yearMin, chunk.yearMax);
    await recordProgress(chunk.yearMin, chunk.yearMax, records.length);
    loadedRows += records.length;
    console.log(`  loaded ${records.length} rows (total so far: ${loadedRows})`);
  }

  console.log(`Done. ${loadedRows} rows loaded across ${chunks.length} chunks.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
