// Fetches Charles Darwin's HMS Beagle voyage (1831-1836) waypoints from
// ClimateViewer's GeoJSON (MyReadingMapped project) and writes a single
// entry with a `path` location to
// web-client/public/data/beagle-voyage.json, for db/seed.mjs to load.
// See plans/import-beagle-voyage-path.md.
//
// The source file is a flat FeatureCollection of 169 Point features, only
// 149 of which are real voyage waypoints (named "#N = <place>"); the rest
// are unrelated "bonus content" markers (book links, essay pages) and are
// filtered out by name prefix. Waypoint dates are embedded as inconsistently
// formatted prose fragments inside each feature's description -- see
// extractDateFragment below for the parsing approach.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'web-client', 'public', 'data', 'beagle-voyage.json');

const SOURCE_URL = 'https://climateviewer.org/layers/MRM/Explorers/charles-darwin-voyage-of-the-beagle-1832-1836.geojson';
const CITATION_URL = 'https://climateviewer.org/history-and-science/explorers/maps/charles-darwin-voyage-of-the-beagle-1832-1836/';
const CITATION_LABEL = 'ClimateViewer (MyReadingMapped)';

// Well-documented historical anchor dates for the whole voyage, used for
// the entry's own start/end -- more reliable than trusting prose-text
// extraction for the two dates that matter most (see plan).
const VOYAGE_START = { year: 1831, month: 12, day: 27 };
const VOYAGE_END = { year: 1836, month: 10, day: 2 };

// ---------------------------------------------------------------------------
// Date-fragment extraction
// ---------------------------------------------------------------------------

const MONTH_MAP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

// Restricted to actual month-name words (not a generic [A-Za-z]+): a
// generic word group greedily matches false positives like "Page 74" or
// "the 6th" *before* the regex engine ever reaches the real "6th of
// January" a few characters later, since JS regex scanning tries the
// leftmost starting position first. Two shapes: "<day> of <Month> [year]"
// and "<Month> <day>[, year]" -- covers "6th of January", "December 27,
// 1831", "JULY 24th 1833" and similar.
const MONTH_WORD = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun[e]?|jul[y]?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const COMBINED_DATE_RE = new RegExp(
  `(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+(${MONTH_WORD})\\.?,?\\s*(\\d{4})?)` +
  `|(?:(${MONTH_WORD})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?)`,
  'i',
);
// Fallback for fragments with no month at all (e.g. "29th and 30th. --",
// "16th. -- The mayor domo..."), relying entirely on the running cursor.
const DAY_ONLY_RE = /\b(\d{1,2})(?:st|nd|rd|th)\b/;

function monthNum(word) {
  return MONTH_MAP[word.toLowerCase()] ?? null;
}

// Returns { day, month?, year? } for the first date-like fragment found in
// the text, or null if none. `month`/`year` are omitted when the fragment
// doesn't state them (resolved later via the running cursor).
function extractDateFragment(text) {
  const m = COMBINED_DATE_RE.exec(text);
  if (m) {
    if (m[2]) return { day: parseInt(m[1], 10), month: monthNum(m[2]), year: m[3] ? parseInt(m[3], 10) : undefined };
    return { day: parseInt(m[5], 10), month: monthNum(m[4]), year: m[6] ? parseInt(m[6], 10) : undefined };
  }
  const dayOnly = DAY_ONLY_RE.exec(text);
  if (dayOnly) return { day: parseInt(dayOnly[1], 10) };
  return null;
}

// Resolves each waypoint's date fragment against a running month/year
// cursor (most fragments only restate month+day, relying on an earlier
// passage for the year, true to how Darwin's own journal reads) and
// returns { year, month, day } | null per waypoint, in input order.
function resolveDates(waypoints) {
  let cursorYear = null;
  let cursorMonth = null;
  return waypoints.map(wp => {
    const frag = extractDateFragment(wp.description);
    if (!frag) return null;
    if (frag.year) {
      cursorYear = frag.year;
    } else if (frag.month && cursorMonth !== null && frag.month < cursorMonth) {
      // No explicit year on this fragment, but its month precedes the
      // cursor's current month (e.g. cursor at December, fragment says
      // "February") -- the narrative crossed a new year's boundary
      // without restating it.
      cursorYear += 1;
    }
    if (frag.month) cursorMonth = frag.month;
    if (cursorYear === null || cursorMonth === null) return null;
    return { year: cursorYear, month: cursorMonth, day: frag.day };
  });
}

// Fills in null (undated) entries by linear interpolation between the
// nearest dated neighbors by sequence position -- the voyage's pace was
// very uneven (weeks docked at some ports, long open-ocean crossings
// between others), but this is still meaningfully better than pretending
// false precision for waypoints where the source text has no date at all.
// Every waypoint in `resolved` is dated in this dataset (#1 and the last
// waypoint both parse), so there's never a leading/trailing gap to fill.
function interpolateGaps(resolved) {
  const toDayNumber = d => Date.UTC(d.year, d.month - 1, d.day) / 86400000;
  const fromDayNumber = n => new Date(n * 86400000);

  const filled = resolved.slice();
  let i = 0;
  while (i < filled.length) {
    if (filled[i] !== null) { i++; continue; }
    const gapStart = i;
    while (filled[i] === null) i++;
    const gapEnd = i; // first non-null index after the gap
    const prevIdx = gapStart - 1;
    const d1 = toDayNumber(filled[prevIdx]);
    const d2 = toDayNumber(filled[gapEnd]);
    for (let j = gapStart; j < gapEnd; j++) {
      const frac = (j - prevIdx) / (gapEnd - prevIdx);
      const interpolated = fromDayNumber(d1 + (d2 - d1) * frac);
      filled[j] = { year: interpolated.getUTCFullYear(), month: interpolated.getUTCMonth() + 1, day: interpolated.getUTCDate() };
    }
  }
  return filled;
}

function fractionalProgress(d) {
  const start = Date.UTC(VOYAGE_START.year, VOYAGE_START.month - 1, VOYAGE_START.day);
  const end = Date.UTC(VOYAGE_END.year, VOYAGE_END.month - 1, VOYAGE_END.day);
  const t = (Date.UTC(d.year, d.month - 1, d.day) - start) / (end - start);
  return Math.min(1, Math.max(0, t));
}

// ---------------------------------------------------------------------------
// Feature filtering / transform
// ---------------------------------------------------------------------------

const WAYPOINT_NAME_RE = /^#(\d+)\s*=\s*(.+)$/;

function toWaypointFeatures(features) {
  const named = [];
  for (const f of features) {
    const m = WAYPOINT_NAME_RE.exec((f.properties?.name || '').trim());
    if (!m) continue; // "bonus content" marker (book link, essay page, etc.) -- not a real waypoint
    named.push({
      number: parseInt(m[1], 10),
      label: m[2].trim(),
      description: f.properties?.description || '',
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    });
  }
  // Stable sort by the "#N" prefix -- numbering has a real duplicate (#106
  // used for two distinct waypoints); ties keep their original relative
  // order (Array.prototype.sort is stable), which happens to be
  // geographically/chronologically sensible for the one duplicate here.
  named.sort((a, b) => a.number - b.number);
  return named;
}

function monthDayYearExpr(d) {
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${MONTH_NAMES[d.month - 1]} ${d.day}, ${d.year}`;
}

async function main() {
  console.log(`==> Fetching ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const geojson = await res.json();

  const waypoints = toWaypointFeatures(geojson.features);
  console.log(`==> ${waypoints.length} real waypoints found (of ${geojson.features.length} total features)`);
  if (waypoints.length !== 149) {
    throw new Error(`expected 149 real waypoints, found ${waypoints.length} -- did the source file change?`);
  }

  const resolved = interpolateGaps(resolveDates(waypoints));

  const pathWaypoints = waypoints.map((wp, i) => ({
    lat: wp.lat,
    lng: wp.lng,
    t: fractionalProgress(resolved[i]),
    label: wp.label,
  }));

  const description =
    'The route of HMS Beagle\'s second survey voyage (1831–1836), during which naturalist ' +
    'Charles Darwin gathered the observations that would eventually lead to On the Origin of ' +
    'Species. Departed Plymouth, England on 27 December 1831 and returned to Falmouth on 2 ' +
    `October 1836. ${pathWaypoints.length} waypoints reconstructed from the ClimateViewer ` +
    '"Voyage of the Beagle" map, with dates extracted from Darwin\'s own journal excerpts where ' +
    'stated and linearly interpolated between the nearest dated waypoints otherwise.';

  const entry = {
    slug: 'hms-beagle-voyage',
    title: 'HMS Beagle voyage (1831–1836)',
    startYear: VOYAGE_START.year, startMonth: VOYAGE_START.month, startDay: VOYAGE_START.day,
    endYear: VOYAGE_END.year, endMonth: VOYAGE_END.month, endDay: VOYAGE_END.day,
    startExpr: monthDayYearExpr(VOYAGE_START),
    endExpr: monthDayYearExpr(VOYAGE_END),
    calendar: 'gregorian',
    uncertaintyYears: 0,
    category: 'event',
    infoboxType: '',
    description,
    tags: ['climateviewer'],
    citationUrl: CITATION_URL,
    citationLabel: CITATION_LABEL,
    locations: [{ type: 'path', waypoints: pathWaypoints }],
  };

  await writeFile(OUTPUT_PATH, JSON.stringify([entry], null, 2) + '\n', 'utf8');
  console.log(`==> Wrote 1 entry (${pathWaypoints.length} waypoints) to ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
