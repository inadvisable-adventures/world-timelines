// Generates public/data/lanesets.json from the Natural Earth countries
// (public/data/world-110m.geojson). Groups country polygons into lanes, adds
// ocean rectangles, simplifies + rounds geometry to keep the payload small.
//
// Run: node scripts/gen-lanesets.mjs   (from web-client/)
//
// Land lanes MUST precede ocean lanes in each laneset: entry→lane assignment
// tests lanes in order and takes the first hit, so land wins over the coarse
// ocean rectangles that overlap it.

import fs from 'node:fs';

const SRC = 'public/data/world-110m.geojson';
const OUT = 'public/data/lanesets.json';
const SIMPLIFY_EPS = 0.4; // degrees; coarse boundaries are fine for lanes
const ROUND = 2;          // decimal places

// ── geometry helpers ────────────────────────────────────────────────────────

function perpDist(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / len2;
  const px = x1 + t * dx, py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}

function rdp(points, eps) {
  if (points.length < 3) return points;
  let dmax = 0, idx = 0;
  const a = points[0], b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], a, b);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

const round = (n) => Math.round(n * 10 ** ROUND) / 10 ** ROUND;

// Simplify one ring (list of [lng,lat]); keep it closed; drop degenerate rings.
function simplifyRing(ring) {
  let r = rdp(ring, SIMPLIFY_EPS).map(([x, y]) => [round(x), round(y)]);
  if (r.length < 4) return null;
  const [fx, fy] = r[0], [lx, ly] = r[r.length - 1];
  if (fx !== lx || fy !== ly) r.push([fx, fy]);
  return r;
}

// Normalize a GeoJSON geometry to a MultiPolygon (array of polygons of rings),
// simplifying every ring.
function normGeom(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const out = [];
  for (const poly of polys) {
    const rings = [];
    for (const ring of poly) {
      const s = simplifyRing(ring);
      if (s) rings.push(s);
    }
    if (rings.length) out.push(rings);
  }
  return out;
}

function bboxOf(multi) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of multi) for (const ring of poly) for (const [x, y] of ring) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

// A rectangle lane (used for oceans): [lngMin, latMin, lngMax, latMax].
function rect(lngMin, latMin, lngMax, latMax) {
  return [[[
    [lngMin, latMin], [lngMax, latMin], [lngMax, latMax], [lngMin, latMax], [lngMin, latMin],
  ]]];
}

// ── load + simplify countries once ──────────────────────────────────────────

const geo = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const countries = [];
for (const f of geo.features) {
  const p = f.properties;
  if (p.CONTINENT === 'Seven seas (open ocean)') continue; // NE ocean artifact
  countries.push({
    continent: p.CONTINENT,
    subregion: p.SUBREGION,
    geom: normGeom(f.geometry),
  });
}

function lane(id, name, description, multi, eraSources) {
  const l = { id, name, description, geometry: multi, bbox: bboxOf(multi) };
  if (eraSources) l.eraSources = eraSources;
  return l;
}

// Group countries whose `key(c)` is in `members` into one lane's MultiPolygon.
function landLane(id, name, description, keyFn, members, eraSources) {
  const set = new Set(members);
  const multi = [];
  for (const c of countries) if (set.has(keyFn(c))) multi.push(...c.geom);
  return lane(id, name, description, multi, eraSources);
}

const byContinent = (c) => c.continent;
const bySubregion = (c) => c.subregion;

// A custom (non-Natural-Earth) lane from one or more rectangles.
function rectLane(id, name, description, rects, eraSources) {
  const multi = rects.flat(); // each rect() is a MultiPolygon (1 polygon); flatten to polygons
  return lane(id, name, description, multi, eraSources);
}

// Five named oceans (rough conventional rectangles; land is matched first).
const NAMED_OCEANS = [
  lane('arctic', 'Arctic Ocean', 'The smallest and shallowest ocean, around the North Pole above roughly 66°N.', rect(-180, 66, 180, 90)),
  lane('atlantic', 'Atlantic Ocean', 'The ocean between the Americas to the west and Europe/Africa to the east.', rect(-70, -60, 20, 66)),
  lane('indian', 'Indian Ocean', 'The ocean bounded by Africa, southern Asia, and Australia.', rect(20, -60, 120, 30)),
  lane('pacific', 'Pacific Ocean', 'The largest ocean, spanning from the Americas to East Asia and Australia across the antimeridian.', [
    ...rect(120, -60, 180, 66), ...rect(-180, -60, -70, 66),
  ]),
  lane('southern', 'Southern Ocean', 'The circumpolar ocean surrounding Antarctica below roughly 60°S.', rect(-180, -90, 180, -60)),
];

// ── lanesets ────────────────────────────────────────────────────────────────

const CONTINENT_ERA = {
  europe: ['rome-history'],
  asia: ['china-history', 'mesopotamia-history'],
  africa: ['egypt-history', 'west-africa-history'],
  'south-america': ['peru-history'],
};

const lanesets = [];

// 1. Traditional continents & oceans (Europe/Asia separate; five named oceans).
lanesets.push({
  id: 'continents',
  name: 'Continents & Oceans',
  description: 'Earth divided into the seven traditional continents (Europe and Asia counted separately) plus the five named oceans.',
  lanes: [
    landLane('africa', 'Africa', 'The second-largest continent, south of the Mediterranean and joined to Asia at Suez.', byContinent, ['Africa'], CONTINENT_ERA.africa),
    landLane('europe', 'Europe', 'The continent west of the Urals, Caucasus, and the Bosphorus.', byContinent, ['Europe'], CONTINENT_ERA.europe),
    landLane('asia', 'Asia', "Earth's largest continent, from the Urals and Suez eastward to the Pacific.", byContinent, ['Asia'], CONTINENT_ERA.asia),
    landLane('north-america', 'North America', 'The continent from the Arctic through Central America.', byContinent, ['North America']),
    landLane('south-america', 'South America', 'The southern continent of the Americas.', byContinent, ['South America'], CONTINENT_ERA['south-america']),
    landLane('oceania', 'Oceania', 'Australia, New Zealand, and the Pacific island groups.', byContinent, ['Oceania']),
    landLane('antarctica', 'Antarctica', 'The southernmost continent, around the South Pole.', byContinent, ['Antarctica']),
    ...NAMED_OCEANS,
  ],
});

// 2. Landmasses & oceans (Eurasia, The Americas, …; single combined ocean).
lanesets.push({
  id: 'landmasses',
  name: 'Landmasses & Oceans',
  description: 'Earth divided into its major continuous landmasses (Eurasia and the Americas each joined) plus a single combined ocean domain.',
  lanes: [
    landLane('eurasia', 'Eurasia', 'The combined European and Asian landmass, the largest on Earth.', byContinent, ['Europe', 'Asia'], ['rome-history', 'china-history', 'mesopotamia-history']),
    landLane('africa', 'Africa', 'The African continent.', byContinent, ['Africa'], ['egypt-history', 'west-africa-history']),
    landLane('americas', 'The Americas', 'North and South America, joined at the Isthmus of Panama.', byContinent, ['North America', 'South America'], ['peru-history']),
    landLane('australia', 'Australia & Oceania', 'Australia, New Zealand, and the Pacific island groups.', byContinent, ['Oceania']),
    landLane('antarctica', 'Antarctica', 'The southern polar continent.', byContinent, ['Antarctica']),
    lane('oceans', 'Oceans', "All of the world's oceans and seas as a single domain.", rect(-180, -90, 180, 90)),
  ],
});

// 3. Global regions (UN sub-regions; five named oceans).
const REGIONS = [
  ['western-europe', 'Western Europe', 'Western Europe'],
  ['northern-europe', 'Northern Europe', 'Northern Europe'],
  ['southern-europe', 'Southern Europe', 'Southern Europe', ['rome-history']],
  ['eastern-europe', 'Eastern Europe', 'Eastern Europe'],
  ['western-asia', 'Western Asia', 'Western Asia', ['mesopotamia-history']],
  ['central-asia', 'Central Asia', 'Central Asia'],
  ['southern-asia', 'Southern Asia', 'Southern Asia'],
  ['eastern-asia', 'Eastern Asia', 'Eastern Asia', ['china-history']],
  ['south-eastern-asia', 'South-Eastern Asia', 'South-Eastern Asia'],
  ['northern-africa', 'Northern Africa', 'Northern Africa', ['egypt-history']],
  ['western-africa', 'Western Africa', 'Western Africa', ['west-africa-history']],
  ['eastern-africa', 'Eastern Africa', 'Eastern Africa'],
  ['middle-africa', 'Middle Africa', 'Middle Africa'],
  ['southern-africa', 'Southern Africa', 'Southern Africa'],
  ['northern-america', 'Northern America', 'Northern America'],
  ['central-america', 'Central America', 'Central America'],
  ['caribbean', 'Caribbean', 'Caribbean'],
  ['south-america', 'South America', 'South America', ['peru-history']],
  ['australia-nz', 'Australia & New Zealand', 'Australia and New Zealand'],
  ['melanesia', 'Melanesia', 'Melanesia'],
  ['antarctica', 'Antarctica', 'Antarctica'],
];
lanesets.push({
  id: 'global-regions',
  name: 'Global Regions',
  description: 'A finer division of the continents into world regions (UN geoscheme sub-regions) plus the five named oceans.',
  lanes: [
    ...REGIONS.map(([id, name, sub, eraSources]) =>
      landLane(id, name, `The ${name} world region.`, bySubregion, [sub], eraSources)),
    ...NAMED_OCEANS,
  ],
});

// 4. Cradles of civilization (custom heartland rectangles + catch-all).
lanesets.push({
  id: 'cradles',
  name: 'Cradles of Civilization',
  description: 'A thematic division: the traditional cradles where early civilizations independently arose, with everywhere else grouped as "Outside the cradles".',
  lanes: [
    rectLane('mesopotamia', 'Mesopotamia', 'The Tigris–Euphrates river system of the Fertile Crescent, where Sumerian city-states arose from the 4th millennium BCE.', [rect(38, 29, 50, 38)], ['mesopotamia-history']),
    rectLane('egypt', 'Nile Valley (Egypt)', 'The Nile river valley, cradle of Ancient Egyptian civilization from c. 3100 BCE.', [rect(29, 22, 34, 31)], ['egypt-history']),
    rectLane('indus', 'Indus Valley', 'The Indus river basin, home of the Harappan civilization from c. 2600 BCE.', [rect(66, 24, 76, 34)]),
    rectLane('yellow-river', 'Yellow River (China)', 'The Yellow River basin of northern China, heartland of early Chinese civilization.', [rect(103, 32, 119, 41)], ['china-history']),
    rectLane('mesoamerica', 'Mesoamerica', 'The region from central Mexico through Central America, cradle of the Olmec, Maya, and Aztec civilizations.', [rect(-105, 10, -86, 22)]),
    rectLane('andes', 'Andean South America', 'The central Andes and Peruvian coast, where the Norte Chico/Caral civilization arose c. 3500 BCE.', [rect(-80, -18, -70, -5)], ['peru-history']),
    // Catch-all MUST be last (assignment takes the first matching lane).
    rectLane('outside', 'Outside the Cradles', 'Everywhere not among the traditional cradles of civilization — the rest of the world\'s land and water.', [rect(-180, -90, 180, 90)]),
  ],
});

// ── write ───────────────────────────────────────────────────────────────────

const doc = { lanesets };
fs.writeFileSync(OUT, JSON.stringify(doc));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.error(`[gen-lanesets] wrote ${lanesets.length} laneset(s), ${lanesets[0].lanes.length} lanes → ${OUT} (${kb} KB)`);
