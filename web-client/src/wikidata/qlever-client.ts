import type { EventCategory, EventDate, EventLocation, HistoricalEvent } from '../types/index.js';
import { CATEGORY_MAP, SUPPORTED_CATEGORIES } from './category-map.js';

const QLEVER_ENDPOINT = 'https://qlever.dev/api/wikidata';
// A cold (novel filter combination) query over a broad time range measured
// ~13-14s against the live endpoint; QLever caches server-side so repeat
// queries are far faster. 45s gives real cold queries room to finish
// without leaving the UI hung indefinitely on a stalled request. See
// plans/wikidata-qlever-data-source.md.
const FETCH_TIMEOUT_MS = 45_000;

const PREFIXES = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
`.trim();

// Excludes fictional entities (research/wikidata.md's data-quality notes):
// not a fictional entity by type (transitively), and not part of a
// fictional universe.
const FICTIONAL_EXCLUSION = [
  'FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q14897293 }',
  'FILTER NOT EXISTS { ?item wdt:P1074 ?anyFictionalUniverse }',
];

export interface QLeverQueryParams {
  categories: EventCategory[] | null; // null/empty = all supported categories
  yearMin: number;
  yearMax: number;
  text: string | null;
  latRange: [number, number] | null;
  lngRange: [number, number] | null;
  limit: number;
}

// Escapes a value for use inside a SPARQL double-quoted string literal.
function sparqlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function categoryBranch(category: EventCategory): string {
  const mapping = CATEGORY_MAP[category];
  if (!mapping) return '';
  const typePattern = mapping.matchMode === 'transitive'
    ? `?item wdt:P31/wdt:P279* ${mapping.typeQid} .`
    : `?item wdt:P31 ${mapping.typeQid} .`;
  const placePattern =
    mapping.place.kind === 'direct' ? 'OPTIONAL { ?item wdt:P625 ?coord . }'
    : mapping.place.kind === 'via' ? `OPTIONAL { ?item wdt:${mapping.place.prop} ?placeItem . ?placeItem wdt:P625 ?coord . }`
    : '';
  const excludes = (mapping.excludePatterns ?? []).join('\n      ');
  return `{
      ${typePattern}
      ?item p:${mapping.dateProp}/psv:${mapping.dateProp} ?dateNode .
      ?dateNode wikibase:timeValue ?date ; wikibase:timePrecision ?datePrecision .
      ${placePattern}
      ${excludes}
      BIND(${sparqlString(category)} AS ?matchedCategory)
    }`;
}

// The categories this query can actually contribute to a UNION (filters out
// unmapped categories like 'other', and any not requested).
export function queryableCategories(requested: EventCategory[] | null): EventCategory[] {
  const wanted = requested && requested.length > 0 ? requested : SUPPORTED_CATEGORIES;
  return wanted.filter(c => CATEGORY_MAP[c] !== undefined);
}

export function buildSparqlQuery(params: QLeverQueryParams): string {
  const categories = queryableCategories(params.categories);
  if (categories.length === 0) {
    throw new Error('no queryable Wikidata categories selected');
  }

  const branches = categories.map(categoryBranch).join('\n    UNION\n    ');

  const filters = [
    `FILTER(YEAR(?date) >= ${Math.trunc(params.yearMin)} && YEAR(?date) <= ${Math.trunc(params.yearMax)})`,
    ...FICTIONAL_EXCLUSION,
  ];
  if (params.text) {
    const needle = sparqlString(params.text.toLowerCase());
    filters.push(
      `FILTER(CONTAINS(LCASE(COALESCE(?itemLabel,"")), ${needle}) || CONTAINS(LCASE(COALESCE(?description,"")), ${needle}))`,
    );
  }
  if (params.latRange) {
    filters.push(`FILTER(geof:latitude(?coord) >= ${params.latRange[0]} && geof:latitude(?coord) <= ${params.latRange[1]})`);
  }
  if (params.lngRange) {
    filters.push(`FILTER(geof:longitude(?coord) >= ${params.lngRange[0]} && geof:longitude(?coord) <= ${params.lngRange[1]})`);
  }

  return `${PREFIXES}

SELECT ?item ?itemLabel ?description ?matchedCategory ?date ?datePrecision ?coord ?wikipediaTitle WHERE {
  {
    ${branches}
  }
  ?article schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> ;
           schema:name ?wikipediaTitle .
  ${filters.join('\n  ')}
  OPTIONAL { ?item rdfs:label ?itemLabel . FILTER(LANG(?itemLabel) = "en") }
  OPTIONAL { ?item schema:description ?description . FILTER(LANG(?description) = "en") }
}
LIMIT ${Math.trunc(params.limit)}`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface SparqlBinding {
  item: { value: string };
  itemLabel?: { value: string };
  description?: { value: string };
  matchedCategory: { value: string };
  date: { value: string };
  datePrecision: { value: string };
  coord?: { value: string };
  wikipediaTitle: { value: string };
}

interface SparqlResponse {
  results: { bindings: SparqlBinding[] };
}

// Wikidata time precision codes (wikibase:timePrecision): 11=day, 10=month,
// 9=year, 8=decade, 7=century, 6=millennium, 5=10k years, 4=100k, 3=1M,
// 0-2=10M/100M/1B+ years. Maps to this app's uncertaintyYears convention.
function uncertaintyYearsForPrecision(precision: number): number {
  if (precision >= 9) return 0;       // day/month/year precision
  if (precision === 8) return 5;      // decade
  if (precision === 7) return 50;     // century
  if (precision === 6) return 500;    // millennium
  if (precision === 5) return 5_000;  // 10,000 years
  if (precision === 4) return 50_000; // 100,000 years
  if (precision === 3) return 500_000; // 1,000,000 years
  return 500_000_000; // 10M/100M/1B+ years
}

// Parses "1745-02-21T00:00:00Z" or "-0500-01-01T00:00:00Z" (BCE) without
// Date parsing, which is unreliable for extreme/negative years.
function parseWikidataDate(value: string, precision: number): { year: number; month: number; day: number } {
  const m = /^(-?\d+)-(\d{2})-(\d{2})T/.exec(value);
  if (!m) return { year: 0, month: 0, day: 0 };
  const year = parseInt(m[1], 10);
  const month = precision >= 10 ? parseInt(m[2], 10) : 0;
  const day = precision >= 11 ? parseInt(m[3], 10) : 0;
  return { year, month, day };
}

// Parses "POINT(-71.057778 42.360278)" (lng lat order, per WKT/GeoJSON).
function parseWktPoint(wkt: string): { lat: number; lng: number } | null {
  const m = /^POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i.exec(wkt.trim());
  if (!m) return null;
  return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

function bindingToEvent(b: SparqlBinding): HistoricalEvent | null {
  const idMatch = /\/(Q\d+)$/.exec(b.item.value);
  if (!idMatch) return null;
  const id = idMatch[1];

  const precision = parseInt(b.datePrecision.value, 10);
  const { year, month, day } = parseWikidataDate(b.date.value, precision);
  const uncertaintyYears = uncertaintyYearsForPrecision(precision);

  const date: EventDate = {
    originalExpression: b.date.value,
    detectedCalendar: 'gregorian', // known v1 simplification — see plan
    startYear: year, startMonth: month, startDay: day,
    endYear: year, endMonth: month, endDay: day,
    uncertaintyYears,
  };

  const locations: EventLocation[] = [];
  if (b.coord) {
    const point = parseWktPoint(b.coord.value);
    if (point) locations.push({ type: 'point', lat: point.lat, lng: point.lng });
  }

  const category = b.matchedCategory.value as EventCategory;
  const typeQid = CATEGORY_MAP[category]?.typeQid ?? '';

  return {
    id,
    title: b.itemLabel?.value ?? id,
    locations,
    startDate: date,
    endDate: date, // point-events only in v1 — see plan
    category,
    infoboxType: `wikidata:${typeQid.replace(/^wd:/, '')}`,
    description: b.description?.value ?? '',
    tags: ['wikidata'],
    lastUpdated: new Date().toISOString(), // when we fetched it, not a Wikidata edit time — see plan
    // The Wikipedia page title, not the (possibly different) Wikidata
    // label — see plans/qlever-require-wikipedia-page.md. Required by the
    // query itself (non-OPTIONAL join), so always present here.
    wikipediaTitle: b.wikipediaTitle.value,
  };
}

// An item with more than one recorded place (e.g. multiple P19 birthplace
// claims) produces one result row per place — merge those into a single
// event with multiple locations, rather than duplicate events with the
// same id (which would show duplicate map/timeline markers for one person,
// and only the last would survive the id-keyed IndexedDB cache anyway).
function mergeDuplicateEvents(events: HistoricalEvent[]): HistoricalEvent[] {
  const byId = new Map<string, HistoricalEvent>();
  for (const event of events) {
    const existing = byId.get(event.id);
    if (!existing) {
      byId.set(event.id, event);
      continue;
    }
    for (const loc of event.locations) {
      const isDupe = existing.locations.some(l =>
        l.type === 'point' && loc.type === 'point' && l.lat === loc.lat && l.lng === loc.lng);
      if (!isDupe) existing.locations.push(loc);
    }
  }
  return Array.from(byId.values());
}

export async function queryQLever(params: QLeverQueryParams): Promise<HistoricalEvent[]> {
  const sparql = buildSparqlQuery(params);
  const url = `${QLEVER_ENDPOINT}?${new URLSearchParams({ query: sparql }).toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`QLever query failed: ${res.status}`);
    const body = await res.json() as SparqlResponse;
    const events: HistoricalEvent[] = [];
    for (const binding of body.results.bindings) {
      const event = bindingToEvent(binding);
      if (event) events.push(event);
    }
    return mergeDuplicateEvents(events);
  } finally {
    clearTimeout(timeout);
  }
}
