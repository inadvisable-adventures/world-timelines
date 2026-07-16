import type { EventCategory } from '../types/index.js';

// Maps this app's 9-category model onto Wikidata. Each category gets a
// wdt:P31 (instance of) type, a single anchor date property, and an
// optional place-lookup strategy. See plans/wikidata-qlever-data-source.md
// for the v1 scoping decisions (one date property per category, no
// start/end range extraction — point-events only).
//
// 'other' has no clean Wikidata mapping and is deliberately unsupported: a
// query for it contributes nothing (see qlever-client.ts).

export type PlaceStrategy =
  | { kind: 'direct' }                 // wdt:P625 on the item itself
  | { kind: 'via'; prop: string }      // wdt:<prop> to a place item, then wdt:P625 on that
  | { kind: 'none' };                  // no place lookup for this category

export interface CategoryMapping {
  typeQid: string;       // e.g. 'wd:Q5'
  dateProp: string;      // e.g. 'P569'
  place: PlaceStrategy;
  // Additional `FILTER NOT EXISTS { ... }` (or similar) fragments included
  // inside this category's UNION branch — see qlever-client.ts's
  // categoryBranch(). Config-driven so other categories can gain their own
  // exclusions later without touching qlever-client.ts.
  excludePatterns?: string[];
}

// Excludes sports figures (see plans/qlever-exclude-sports-figures.md):
// P641 (sport) directly, and P106 (occupation) transitively subclassing
// "athlete" (Q2066131) — verified against live data to reliably catch
// sport-specific occupations (association football player, basketball
// player, etc.) without enumerating individual sports. Also excludes mind
// sports (e.g. chess) as a known, accepted side effect — Wikidata classes
// those under the same "athlete" ancestor.
const EXCLUDE_SPORTS_FIGURES = [
  'FILTER NOT EXISTS { ?item wdt:P641 ?anySport }',
  'FILTER NOT EXISTS { ?item wdt:P106/wdt:P279* wd:Q2066131 }',
];

export const CATEGORY_MAP: Partial<Record<EventCategory, CategoryMapping>> = {
  person: {
    typeQid: 'wd:Q5', // human
    dateProp: 'P569', // date of birth
    place: { kind: 'via', prop: 'P19' }, // place of birth
    excludePatterns: EXCLUDE_SPORTS_FIGURES,
  },
  event: {
    typeQid: 'wd:Q1656682', // event
    dateProp: 'P585', // point in time
    place: { kind: 'direct' },
  },
  place: {
    typeQid: 'wd:Q618123', // geographic location
    dateProp: 'P571', // inception
    place: { kind: 'direct' },
  },
  artifact: {
    typeQid: 'wd:Q838948', // creative work
    dateProp: 'P571', // inception
    place: { kind: 'direct' },
  },
  pol_mil_organization: {
    typeQid: 'wd:Q43229', // organization
    dateProp: 'P571', // inception
    place: { kind: 'via', prop: 'P159' }, // headquarters location
  },
  business: {
    typeQid: 'wd:Q4830453', // business
    dateProp: 'P571', // inception
    place: { kind: 'via', prop: 'P159' }, // headquarters location
  },
  historical_period: {
    typeQid: 'wd:Q11514315', // historical period
    dateProp: 'P580', // start time
    place: { kind: 'none' },
  },
  concepts: {
    typeQid: 'wd:Q151885', // concept
    dateProp: 'P571', // inception
    place: { kind: 'none' },
  },
  // 'other' intentionally omitted.
};

export const SUPPORTED_CATEGORIES = Object.keys(CATEGORY_MAP) as EventCategory[];
