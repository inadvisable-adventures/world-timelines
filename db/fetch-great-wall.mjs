// Fetches the Great Wall of China's geometry from OpenStreetMap (relation
// 318110) and writes a single entry with multiple `path` locations to
// web-client/public/data/great-wall.json, for db/seed.mjs to load. See
// plans/import-great-wall-boundary.md.
//
// The relation is a large, genuinely fragmented network (~8,200 ways once
// its nested sub-relations are included) rather than one contiguous line --
// real history, not a data-quality problem (the wall was built/rebuilt
// across many non-contiguous sections over ~2,000 years). This script (a)
// recursively fetches full geometry for the relation and every relation it
// nests (the plain OSM `/full.json` endpoint resolves one level of
// sub-relations per call, so a handful of the deepest sub-relations need
// their own fetch), (b) merges ways that share an endpoint node into longer
// contiguous polylines, and (c) keeps only sections long enough to be
// individually meaningful at world-map zoom -- see MIN_SECTION_LENGTH_KM.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'web-client', 'public', 'data', 'great-wall.json');

const RELATION_ID = 318110;
const CITATION_URL = 'https://www.openstreetmap.org/relation/318110';
const CITATION_LABEL = 'OpenStreetMap contributors';
const USER_AGENT = 'world-timelines-hobby-project/1.0 (personal research)';
const REQUEST_PACING_MS = 1500; // be a polite, low-volume client of the plain OSM API

// Merged sections shorter than this are dropped. Chosen empirically (see
// plan's Result section): the real length distribution is dominated by
// thousands of sub-1km fragments that wouldn't be visually distinguishable
// at world-map zoom anyway, while the top ~75 sections (this threshold)
// are each independently recognizable, substantial stretches of wall.
const MIN_SECTION_LENGTH_KM = 10;

// ---------------------------------------------------------------------------
// Recursive OSM relation fetch
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchRelationFullWithRetry(id, attempt = 1) {
  const url = `https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if ((res.status === 429 || res.status === 504) && attempt <= 5) {
    const backoff = REQUEST_PACING_MS * 2 ** attempt;
    console.log(`  ${res.status} on relation ${id}, backing off ${backoff}ms (attempt ${attempt})`);
    await sleep(backoff);
    return fetchRelationFullWithRetry(id, attempt + 1);
  }
  if (!res.ok) throw new Error(`fetch relation ${id} failed: ${res.status}`);
  return res.json();
}

// Fetches `rootId` and every relation nested within it (recursively, since
// /full.json only resolves one level of sub-relations per call), returning
// the union of all node/way/relation elements encountered, deduplicated by
// id. Ways and nodes come bundled with whichever relation fetch first
// referenced them, needing no separate requests.
async function fetchRelationTree(rootId) {
  const visited = new Set();
  const nodes = new Map();
  const ways = new Map();
  const relations = new Map();

  async function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const data = await fetchRelationFullWithRetry(id);
    const nestedIds = [];
    for (const el of data.elements) {
      if (el.type === 'node') nodes.set(el.id, el);
      else if (el.type === 'way') ways.set(el.id, el);
      else if (el.type === 'relation') {
        relations.set(el.id, el);
        for (const m of el.members) {
          if (m.type === 'relation' && !visited.has(m.ref)) nestedIds.push(m.ref);
        }
      }
    }
    console.log(`==> Fetched relation ${id}: ${data.elements.length} elements, ${nestedIds.length} nested sub-relation(s)`);
    for (const nid of nestedIds) {
      await sleep(REQUEST_PACING_MS);
      await visit(nid);
    }
  }

  await visit(rootId);
  return { nodes, ways, relations };
}

// ---------------------------------------------------------------------------
// Line merging: chain ways that share an endpoint coordinate into longer
// contiguous polylines. Endpoint identity is keyed by exact coordinate
// (physically-joined OSM ways share the same node, hence the same lat/lon;
// keying by coordinate rather than node id also catches independently-
// digitized segments that happen to touch at the same point).
// ---------------------------------------------------------------------------

function haversineKm(a, b) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function polylineLengthKm(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineKm(coords[i - 1], coords[i]);
  return total;
}

function coordKey(pt) {
  return `${pt.lat.toFixed(7)},${pt.lon.toFixed(7)}`;
}

function mergeConnectedPolylines(polylines) {
  const endpointIndex = new Map(); // coordKey -> [{p, end: 'start'|'end'}]
  const addToIndex = (k, entry) => {
    if (!endpointIndex.has(k)) endpointIndex.set(k, []);
    endpointIndex.get(k).push(entry);
  };
  const removeFromIndex = (k, p, end) => {
    const list = endpointIndex.get(k);
    if (!list) return;
    const idx = list.findIndex(e => e.p === p && e.end === end);
    if (idx >= 0) list.splice(idx, 1);
  };
  for (const p of polylines) {
    addToIndex(coordKey(p.coords[0]), { p, end: 'start' });
    addToIndex(coordKey(p.coords[p.coords.length - 1]), { p, end: 'end' });
  }

  const used = new Set();
  const merged = [];

  for (const start of polylines) {
    if (used.has(start)) continue;
    used.add(start);
    removeFromIndex(coordKey(start.coords[0]), start, 'start');
    removeFromIndex(coordKey(start.coords[start.coords.length - 1]), start, 'end');
    let chain = start.coords.slice();

    let extended = true;
    while (extended) {
      extended = false;
      const candidates = endpointIndex.get(coordKey(chain[chain.length - 1])) || [];
      const next = candidates.find(e => !used.has(e.p));
      if (next) {
        used.add(next.p);
        removeFromIndex(coordKey(next.p.coords[0]), next.p, 'start');
        removeFromIndex(coordKey(next.p.coords[next.p.coords.length - 1]), next.p, 'end');
        const nextCoords = next.end === 'start' ? next.p.coords : next.p.coords.slice().reverse();
        chain = chain.concat(nextCoords.slice(1));
        extended = true;
      }
    }
    extended = true;
    while (extended) {
      extended = false;
      const candidates = endpointIndex.get(coordKey(chain[0])) || [];
      const next = candidates.find(e => !used.has(e.p));
      if (next) {
        used.add(next.p);
        removeFromIndex(coordKey(next.p.coords[0]), next.p, 'start');
        removeFromIndex(coordKey(next.p.coords[next.p.coords.length - 1]), next.p, 'end');
        const nextCoords = next.end === 'end' ? next.p.coords : next.p.coords.slice().reverse();
        chain = nextCoords.slice(0, -1).concat(chain);
        extended = true;
      }
    }

    merged.push(chain);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`==> Fetching relation ${RELATION_ID} and its sub-relation tree from the OSM API`);
  const { nodes, ways } = await fetchRelationTree(RELATION_ID);
  console.log(`==> Total: ${ways.size} ways, ${nodes.size} nodes`);

  const polylines = [];
  for (const way of ways.values()) {
    const coords = [];
    for (const nid of way.nodes) {
      const n = nodes.get(nid);
      if (n) coords.push({ lat: n.lat, lon: n.lon });
    }
    if (coords.length >= 2) polylines.push({ wayId: way.id, coords });
  }

  const merged = mergeConnectedPolylines(polylines);
  console.log(`==> Merged ${polylines.length} ways into ${merged.length} contiguous polylines`);

  const sections = merged
    .map(coords => ({ coords, lengthKm: polylineLengthKm(coords) }))
    .filter(s => s.lengthKm >= MIN_SECTION_LENGTH_KM)
    .sort((a, b) => b.lengthKm - a.lengthKm);

  const totalMergedLengthKm = merged.reduce((sum, coords) => sum + polylineLengthKm(coords), 0);
  const keptLengthKm = sections.reduce((sum, s) => sum + s.lengthKm, 0);
  console.log(
    `==> Kept ${sections.length} sections >= ${MIN_SECTION_LENGTH_KM}km ` +
    `(${keptLengthKm.toFixed(0)}km of ${totalMergedLengthKm.toFixed(0)}km total merged length, ` +
    `${(100 * keptLengthKm / totalMergedLengthKm).toFixed(1)}%)`,
  );
  if (sections.length === 0) {
    throw new Error(`no sections >= ${MIN_SECTION_LENGTH_KM}km found -- did the source data change?`);
  }

  const locations = sections.map((s, i) => ({
    type: 'path',
    waypoints: s.coords.map(c => ({ lat: c.lat, lng: c.lon })),
    label: `Section ${i + 1} (${s.lengthKm.toFixed(0)} km)`,
  }));

  const description =
    'The Great Wall of China, a network of fortifications built and rebuilt across roughly two ' +
    'thousand years -- the earliest sections date to the 8th century BCE Spring and Autumn period, ' +
    'later joined together under the Qin dynasty; most of what survives and is mapped today was ' +
    'built by the Ming dynasty (1368-1644 CE). Geometry is reconstructed from OpenStreetMap, whose ' +
    `mapping of the wall is itself a large, disconnected network of thousands of separate segments; ` +
    `this entry keeps the ${locations.length} longest contiguous sections (each at least ` +
    `${MIN_SECTION_LENGTH_KM}km) rather than every mapped fragment, for both fidelity to the wall's ` +
    'real non-contiguous structure and to keep this entry\'s location count manageable.';

  const entry = {
    slug: 'great-wall-of-china',
    title: 'Great Wall of China',
    startYear: -800, startMonth: 0, startDay: 0,
    endYear: 1644, endMonth: 0, endDay: 0,
    startExpr: '8th century BCE',
    endExpr: '1644 CE (end of Ming dynasty construction)',
    calendar: 'gregorian',
    uncertaintyYears: 100,
    category: 'place',
    infoboxType: '',
    description,
    tags: ['openstreetmap'],
    citationUrl: CITATION_URL,
    citationLabel: CITATION_LABEL,
    locations,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify([entry], null, 2) + '\n', 'utf8');
  console.log(`==> Wrote 1 entry (${locations.length} path locations) to ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
