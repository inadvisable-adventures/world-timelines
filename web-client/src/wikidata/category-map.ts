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
  // 'exact' (default): ?item wdt:P31 <typeQid> — the item must be typed
  // directly as typeQid. 'transitive': ?item wdt:P31/wdt:P279* <typeQid>
  // — the item may be any subclass of typeQid. Opt-in per category (see
  // plans/qlever-improve-event-category.md) rather than a blanket switch,
  // since 'exact' is known-correct for some categories (e.g. person) and
  // transitive matching wasn't verified for those.
  matchMode?: 'exact' | 'transitive';
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

// Excludes noise from the event category (see
// plans/qlever-improve-event-category.md, investigations/wikidata-sports-exclusion.md,
// investigations/wikidata-election-exclusion.md):
// - "sports season" (Q27020041): recurring annual season-summary articles
//   (e.g. "1771 English cricket season"), not distinct historical events —
//   25.6% of the event category's results, cleanly blanket-excludable.
// - a curated list of narrow/sub-national/single-seat election subtypes
//   (gubernatorial, by-election, US House/Senate races, mayoral, municipal,
//   state-level presidential sub-articles) — NOT a blanket "election"
//   exclusion, since national/significant elections (general elections,
//   imperial elections, legislative elections) are kept.
//
// Uses EXACT (not transitive) wdt:P31 matching, combined into a single
// MINUS/VALUES block rather than one FILTER NOT EXISTS per excluded type.
// This is a deliberate, measured performance tradeoff, not a style
// preference — stacking many *transitive* (wdt:P31/wdt:P279*) FILTER NOT
// EXISTS clauses on top of the already-transitive event-type match and the
// Wikipedia-required join measured 53s-90s+ (timing out), vs. ~6s for this
// single combined exact-match MINUS. Verified correct directly (an item
// confirmed typed with an excluded Q-id is confirmed excluded); the real,
// documented cost is that some narrow elections whose Wikipedia article
// title suggests a specific subtype (e.g. "1783 Maryland gubernatorial
// election") turn out to be typed only as the generic bare "public
// election" (Q40231, deliberately kept — see
// investigations/wikidata-election-exclusion.md) rather than the specific
// Q15261477 "gubernatorial election" subtype, and so aren't caught by this
// exact-match exclusion. Accepted: Wikidata's own classification is
// inconsistent here, and transitive matching to close that gap isn't
// affordable at this performance ceiling.
const EXCLUDE_EVENT_NOISE = [
  `MINUS {
    ?item wdt:P31 ?excludedType .
    VALUES ?excludedType {
      wd:Q27020041   # sports season
      wd:Q18608583   # recurring sporting event (a competition series itself, not one edition — found during verification)
      wd:Q18536594   # Olympic sporting event (one discipline within one Olympics — found during verification)
      wd:Q15261477   # gubernatorial election
      wd:Q1057954    # by-election
      wd:Q24397514   # US House election
      wd:Q26466721   # special election to US House
      wd:Q15280243   # mayoral election
      wd:Q152450     # municipal election
      wd:Q7864918    # UK Parliamentary by-election
      wd:Q24333627   # US Senate election
      wd:Q112711344  # US presidential election in a single state
    }
  }`,
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
    matchMode: 'transitive', // exact match returns ~0 events before 1200 CE — see investigations/wikidata-event-transitive-type-match.md
    dateProp: 'P585', // point in time
    place: { kind: 'direct' },
    excludePatterns: EXCLUDE_EVENT_NOISE,
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
