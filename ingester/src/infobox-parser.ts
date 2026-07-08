import type { EventCategory, EventDate, EventLocation } from './types.js';
import { parseDate } from './date-parser.js';

// ---------------------------------------------------------------------------
// Infobox type detection
// ---------------------------------------------------------------------------

// Returns all infobox type names found in the wikitext (lowercased, normalized).
export function extractInfoboxTypes(wikitext: string): string[] {
  const re = /\{\{\s*[Ii]nfobox\s+([^\n|}<>{[\]]+)/g;
  const types: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    types.push(m[1].trim().toLowerCase().replace(/\s+/g, '_'));
  }
  return types;
}

// Maps an infobox type to a display category name for the catalog.
// Categories: person, event, place, artifact, pol_mil_organization, business,
//             historical_period, concepts, other
export function proposedCategoryName(infoboxType: string): string {
  // Replace underscores with spaces so \b word boundaries work correctly
  // (underscore is \w in JS regex, so "military_conflict" has no \b before "conflict")
  const t = infoboxType.toLowerCase().replace(/_/g, ' ');

  // ── Person ────────────────────────────────────────────────────────────
  if (/\bperson\b|\bbiograph|\bofficehold/.test(t)) return 'person';
  if (/\bscientist\b|\bactor\b|\bactress\b|\bmusical artist\b/.test(t)) return 'person';
  if (/\bsportsperson\b|\bathlete\b|\bcricketer\b|\bcyclist\b|\bswimmer\b/.test(t)) return 'person';
  if (/\bboxer\b|\bgolfer\b|\bgymnast\b|\bskier\b|\bfigure skat|\bdancer\b/.test(t)) return 'person';
  if (/\bwrestler\b|\bsumo\b|\bsailor\b|\bclimber\b|\bsurfer\b|\bequestrian\b/.test(t)) return 'person';
  if (/\bracing driver\b|\baviator\b|\bastronaut\b|\bnascar driver\b|\bf1 driver\b/.test(t)) return 'person';
  if (/\bjudoka\b|\bfencer\b|\bmartial artist\b/.test(t)) return 'person';
  if (/\bchess (player|biography)\b|\bgo player\b|\bsnooker player\b|\bdarts player\b/.test(t)) return 'person';
  if (/\bpool player\b|\bsquash player\b|\bbadminton player\b/.test(t)) return 'person';
  if (/\bvolleyball (player|biography)\b|\bhandball biography\b|\bwater polo biography\b/.test(t)) return 'person';
  if (/\bnetball biography\b|\bbiathlete\b|\bfield hockey player\b/.test(t)) return 'person';
  if (/\bspeedway rider\b|\bmotorcycle rider\b/.test(t)) return 'person';
  if (/\bwriter\b|\bartist\b|\bphilosopher\b|\bpoet\b|\bcomposer\b/.test(t)) return 'person';
  if (/\barchitect\b|\bhistorian\b|\btheologian\b|\bscholar\b|\bacademic\b/.test(t)) return 'person';
  if (/\beconomist\b|\bauthor\b|\bjournalist\b|\bchef\b|\bengineer\b/.test(t)) return 'person';
  if (/\bnoble\b|\bsaint\b|\bmonarch\b|\broyalty\b|\bphysician\b|\bdoctor\b/.test(t)) return 'person';
  if (/\bpharaoh\b|\bking\b|\bemperor\b|\bpope\b|\bbishop\b/.test(t)) return 'person';
  if (/\bpatriarch\b|\bclergy\b|\bmonk\b|\brebbe\b/.test(t)) return 'person';
  if (/\bpresident\b|\bprime minister\b|\bgovernor\b|\bmayor\b|\bjudge\b/.test(t)) return 'person';
  if (/\bsoldier\b|\bmilitary person\b|\bmilitary personnel\b|\bpilot\b/.test(t)) return 'person';
  if (/\bpolice officer\b|\bcomedian\b|\bmodel\b|\bserial killer\b|\bmass murderer\b/.test(t)) return 'person';
  if (/\bmurderer\b|\bcriminal\b|\bspy\b|\bpirate\b|\bbodybuilder\b/.test(t)) return 'person';
  if (/\byoutuber\b|\bsocial media personality\b|\binfluencer\b|\bstreamer\b/.test(t)) return 'person';
  if (/\bpolitician\b|\bdiplomat\b|\bambassador\b|\bminister\b/.test(t)) return 'person';
  if (/\breligious person\b|\bmedical person\b|\breligious biography\b/.test(t)) return 'person';
  if (/\bchristian leader\b|\bjewish leader\b|\bhindu leader\b|\bmuslim leader\b/.test(t)) return 'person';
  if (/\bice hockey player\b|\brugby biography\b|\brugby league biography\b/.test(t)) return 'person';
  if (/\brugby union biography\b|\bbaseball biography\b|\bbasketball biography\b/.test(t)) return 'person';
  if (/\bfootball biography\b|\bnfl biography\b|\bafl biography\b/.test(t)) return 'person';
  if (/\bcfl biography\b|\bcfl player\b|\bnfl player\b|\bmlb player\b|\bnpb player\b/.test(t)) return 'person';
  if (/\bgridiron football (biograph|person)\b/.test(t)) return 'person';
  if (/\bgaelic (games player|athletic association player)\b|\bgaa player\b/.test(t)) return 'person';
  if (/\bcollege (coach|football player)\b/.test(t)) return 'person';
  if (/\bpro gaming player\b|\besports player\b|\bvideo game player\b/.test(t)) return 'person';
  if (/\bpageant titleholder\b|\badult biography\b|\bplayboy playmate\b/.test(t)) return 'person';
  if (/\bprofessional wrestler\b|\bsport wrestler\b|\bamateur wrestler\b/.test(t)) return 'person';
  if (/\bbandy biography\b|\blacrosse player\b|\bfootballer\b/.test(t)) return 'person';
  if (/\bsoccer biography\b|\bsoccer player\b/.test(t)) return 'person';
  if (/\bmathemat|\bchemist\b|\bphysicist\b|\bpresenter\b/.test(t)) return 'person';
  if (/\broyal\b/.test(t) && !/\broyal house\b|\broyal styles\b|\broyal family\b/.test(t)) return 'person';
  if (/\bmusician\b/.test(t)) return 'person';

  // ── Historical Period ─────────────────────────────────────────────────
  if (/\bhistorical era\b|\bhistorical period\b|\bhistorical continent\b|\bgeologic timespan\b/.test(t)) return 'historical_period';
  if (/\bdynasty\b/.test(t)) return 'historical_period';

  // ── Concepts (religions, sciences, philosophies, technologies as ideas) ─
  if (/^technology$|^invention$/.test(t)) return 'concepts';
  if (/\breligion\b|\bchristian denomination\b|\bchristian branch\b|\breligious group\b/.test(t)) return 'concepts';
  if (/\blanguage\b|\blanguage family\b|\bwriting system\b/.test(t)) return 'concepts';
  if (/\bprogramming language\b|\bfile format\b|\bnetworking protocol\b/.test(t)) return 'concepts';
  if (/\balgorithm\b|\bencryption\b|\bcryptograph/.test(t)) return 'concepts';
  if (/\bmusic genre\b|\bart movement\b|\bcultural movement\b/.test(t)) return 'concepts';
  if (/^martial art$/.test(t)) return 'concepts';

  // ── Event (checked before artifact to catch aircraft occurrence etc.) ───
  if (/\baircraft occurrence\b|\baircraft accident\b|\bailiner accident\b/.test(t)) return 'event';
  if (/\brail accident\b|\bpublic transit accident\b|\bplane crash\b/.test(t)) return 'event';
  if (/\bnuclear weapons test\b|\bhurricane season\b|\bholocaust event\b/.test(t)) return 'event';
  if (/\bconflict\b|\bbattle\b|\bsiege\b/.test(t)) return 'event';
  if (/\bwar\b/.test(t) && !/\bwar faction\b/.test(t)) return 'event';
  if (/\belection\b|\breferendum\b/.test(t)) return 'event';
  if (/\bdisaster\b|\bearthquake\b|\bstorm\b|\bhurricane\b|\bflood\b|\btornado\b/.test(t)) return 'event';
  if (/\bepidemic\b|\bpandemic\b|\boutbreak\b/.test(t)) return 'event';
  if (/\bwildfire\b|\beruption\b|\bfamine\b/.test(t)) return 'event';
  if (/\bterrorist attack\b|\bcivilian attack\b|\bassassination\b/.test(t)) return 'event';
  if (/\bcivil conflict\b|\bcoup\b|\brebellion\b|\bprotest\b/.test(t)) return 'event';
  if (/\bweather event\b|\btropical cyclone\b|\bwindstorm\b/.test(t)) return 'event';
  if (/\bmilitary operation\b|\bmilitary attack\b|\bcyberattack\b/.test(t)) return 'event';
  if (/\boil spill\b|\bnews event\b|\bsummit meeting\b/.test(t)) return 'event';
  if (/\bhistorical event\b/.test(t)) return 'event';
  if (/^event$/.test(t)) return 'event';

  // ── Business (before pol_mil so record label/company beat organization) ─
  if (/\bcompany\b|\bcorporat|\bairline\b/.test(t)) return 'business';
  if (/\bpublisher\b|\brestaurant\b|\bhotel\b|\bcasino\b/.test(t)) return 'business';
  if (/\bnewspaper\b|\brecord label\b/.test(t)) return 'business';
  if (/\bbrewery\b|\bwinery\b|\blaw firm\b|\bdot-com\b/.test(t)) return 'business';

  // ── Artifact (human-made objects, art, media, vehicles) ───────────────
  if (/\bship\b|\bvessel\b|\bsailboat\b/.test(t)) return 'artifact';
  if (/\baircraft\b/.test(t)) return 'artifact'; // aircraft occurrence/accident caught above
  if (/\bautomobile\b|\blocomotiv\b/.test(t)) return 'artifact';
  if (/\btrain\b/.test(t) && !/\btrain station\b/.test(t)) return 'artifact';
  if (/\bmotorcycle\b|\bspacecraft\b/.test(t)) return 'artifact';
  if (/\brocket\b/.test(t) && !/\brocket launch\b|\brocket engine\b/.test(t)) return 'artifact';
  if (/\bweapon\b|\bfirearm\b/.test(t)) return 'artifact';
  if (/\bfilm\b/.test(t) && !/\bfilm festival\b|\bfilm award\b|\bfilm movement\b|\bfilm or theatre\b/.test(t)) return 'artifact';
  if (/\btelevision\b/.test(t) && !/\btelevision station\b|\btelevision channel\b/.test(t)) return 'artifact';
  if (/\balbum\b/.test(t)) return 'artifact';
  if (/\bsong\b/.test(t) && !/\bsong contest\b/.test(t)) return 'artifact';
  if (/\bmusical composition\b/.test(t)) return 'artifact';
  if (/\bvideo game\b/.test(t)) return 'artifact';
  if (/^software$/.test(t) || (/\bsoftware\b/.test(t) && !/\bsoftware licen/.test(t))) return 'artifact';
  if (/\bartwork\b|\bartefact\b|\bartifact\b|\bpainting\b|\bsculpture\b/.test(t)) return 'artifact';
  if (/\bbook\b/.test(t) && !/\bbook series\b/.test(t)) return 'artifact';
  if (/\bnovel\b/.test(t) && !/\bnovel series\b/.test(t)) return 'artifact';
  if (/\bshort story\b|\bgraphic novel\b|\bnovella\b/.test(t)) return 'artifact';
  if (/\bcomic book\b|\bcomic strip\b|\bmanga\b|\bmanhwa\b/.test(t)) return 'artifact';
  if (/\bopera\b|\bballet\b/.test(t)) return 'artifact';
  if (/^musical$/.test(t)) return 'artifact';
  if (/\bcamera\b|\btelescope\b|\bradar\b/.test(t)) return 'artifact';
  if (/\bcoin\b|\bbanknote\b|\bpostage stamp\b/.test(t)) return 'artifact';
  if (/\bautomobile engine\b|\baero engine\b/.test(t)) return 'artifact';
  if (/\bcomputer\b/.test(t) && !/\bcomputer virus\b|\bcomputer worm\b/.test(t)) return 'artifact';
  if (/\bmobile phone\b|\bsmartphone\b|\binformation appliance\b/.test(t)) return 'artifact';
  if (/\bsynthesizer\b|\bguitar model\b|\bmusical instrument\b/.test(t)) return 'artifact';
  if (/^play$/.test(t)) return 'artifact';

  // ── Political / Military Organization ──────────────────────────────────
  if (/\bcountry\b|\bempire\b|\bformer country\b|\bhistorical country\b/.test(t)) return 'pol_mil_organization';
  if (/\bpolitical party\b|\bindian political party\b/.test(t)) return 'pol_mil_organization';
  if (/\bmilitary unit\b|\bwar faction\b|\bnational military\b/.test(t)) return 'pol_mil_organization';
  if (/\blaw enforcement\b|\bgovernment agency\b/.test(t)) return 'pol_mil_organization';
  if (/\bcriminal organ|\bmilitant organ|\bgeopolitical organ/.test(t)) return 'pol_mil_organization';
  if (/\blegislature\b|\bparliament\b|\bconstituency\b/.test(t)) return 'pol_mil_organization';
  if (/\bgovernment cabinet\b|\bgovernment\b/.test(t)) return 'pol_mil_organization';
  if (/\bdiplomatic mission\b|\bfirst nation\b|\btribe\b|\bclan\b/.test(t)) return 'pol_mil_organization';
  if (/\bnoble house\b|\bnoble family\b|\broyal house\b/.test(t)) return 'pol_mil_organization';
  if (/\borganization\b|\borganisation\b/.test(t)) return 'pol_mil_organization';
  if (/\bunited nations\b|\bintergovernmental organ/.test(t)) return 'pol_mil_organization';
  if (/\bformer subdivision\b/.test(t)) return 'pol_mil_organization';

  // ── Place (geographic locations and infrastructure) ────────────────────
  if (/\bsettlement\b|\bcity\b|\btown\b|\bvillage\b|\bcommune\b|\bmunicip/.test(t)) return 'place';
  if (/\bbuilding\b|\barchaeolog|\bancient site\b/.test(t)) return 'place';
  if (/\briver\b|\bmountain\b|\blake\b|\bpark\b|\bprotected area\b/.test(t)) return 'place';
  if (/\bnrhp\b|\bhistoric site\b|\bhospital\b|\bprison\b|\bairport\b/.test(t)) return 'place';
  if (/\bchurch\b|\bmonastery\b|\btemple\b|\bmosque\b|\bshrine\b/.test(t)) return 'place';
  if (/\bschool\b|\buniversity\b|\bcollege\b|\bmuseum\b|\blibrary\b/.test(t)) return 'place';
  if (/\bbridge\b|\bdam\b|\btunnel\b|\bcanal\b|\blighthouse\b/.test(t)) return 'place';
  if (/\bvenue\b|\bstadium\b|\bcemetery\b|\bmilitary installation\b/.test(t)) return 'place';
  if (/\bisland\b|\bbody of water\b|\blandform\b|\bglacier\b|\bwaterfall\b/.test(t)) return 'place';
  if (/\bport\b|\bcastle\b|\bpower station\b/.test(t)) return 'place';
  if (/\bmine\b/.test(t) && !/\bmineral\b/.test(t)) return 'place';
  if (/\buk place\b|\bturkey place\b|\baustralian place\b/.test(t)) return 'place';
  if (/\bgerman loc|\bgerman place\b|\bitalian comune\b|\bfrench commune\b/.test(t)) return 'place';
  if (/\brussian inhabit|\brussian town\b|\brussian district\b/.test(t)) return 'place';
  if (/\bvalley\b|\bmountain pass\b|\bbay\b|\bcape\b|\bbeach\b/.test(t)) return 'place';
  if (/\bcave\b|\bwaterway\b|\bhistoric building\b|\bwine region\b/.test(t)) return 'place';
  if (/\bstation\b|\broad\b|\bshopping mall\b|\bamusement park\b|\bzoo\b/.test(t)) return 'place';
  if (/\bsite\b/.test(t)) return 'place';

  return 'other';
}

// High-value infobox types to include in default ingestion (per A1).
export const DEFAULT_INCLUDE_TYPES = new Set([
  // Events
  'event',
  'historical_event',
  'military_conflict',
  'war',
  'battle',
  // People
  'person',
  'biography',
  'officeholder',
  'royalty',
  'scientist',
  'military_person',
  'writer',
  'philosopher',
  'artist',
  // Places
  'settlement',
  'country',
  'historical_country',
  'empire',
  'ancient_site',
  'archaeological_site',
  // Things
  'invention',
  'ship',
]);

// Determine EventCategory from the first matching infobox type.
export function categoryFromInfoboxType(infoboxType: string): EventCategory {
  return proposedCategoryName(infoboxType) as EventCategory;
}

// ---------------------------------------------------------------------------
// Coordinate extraction
// ---------------------------------------------------------------------------

function dmsToDecimal(parts: number[], negative: boolean): number {
  if (parts.length === 0) return NaN;
  let dec = parts[0];
  if (parts.length > 1) dec += parts[1] / 60;
  if (parts.length > 2) dec += parts[2] / 3600;
  return negative ? -dec : dec;
}

// Parse the pipe-separated arguments from a {{coord|...}} template into a lat/lng pair.
// Handles decimal ({{coord|51.5|N|0.1|W}}), DMS ({{coord|51|30|N|0|7|W}}),
// and plain decimal without hemisphere ({{coord|51.5|0.1}}).
function parseCoordArgs(raw: string): { lat: number; lng: number } | null {
  // Split on | and strip trailing wiki options (type:, scale:, display:, region:, name:)
  const parts = raw.split('|').map(s => s.trim()).filter(s => s && !/[:=]/.test(s));

  const nsIdx = parts.findIndex(p => /^[NSns]$/.test(p));
  const ewIdx = parts.findIndex(p => /^[EWew]$/.test(p));

  if (nsIdx !== -1 && ewIdx !== -1) {
    // Hemisphere-suffix format
    const latNums = parts.slice(0, nsIdx).map(Number).filter(n => !isNaN(n));
    const lngNums = parts.slice(nsIdx + 1, ewIdx).map(Number).filter(n => !isNaN(n));
    const lat = dmsToDecimal(latNums, /^[Ss]$/.test(parts[nsIdx]));
    const lng = dmsToDecimal(lngNums, /^[Ww]$/.test(parts[ewIdx]));
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  } else {
    // Plain decimal format: first two numeric tokens
    const nums = parts.map(Number).filter(n => !isNaN(n));
    if (nums.length >= 2) return { lat: nums[0], lng: nums[1] };
  }
  return null;
}

function addPoint(locations: EventLocation[], lat: number, lng: number): void {
  if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
  if (locations.some(l => l.type === 'point' && Math.abs((l as { lat: number }).lat - lat) < 0.0001)) return;
  locations.push({ type: 'point', lat, lng });
}

// Returns all coordinates found in the wikitext (infobox or article-level).
export function extractLocations(wikitext: string): EventLocation[] {
  const locations: EventLocation[] = [];

  // {{coord|...}} — extract the full argument list up to the closing }}
  // Use a simple scan to handle templates without nested {{}} inside coord
  const coordSearchRe = /\{\{\s*[Cc]oord\s*\|/g;
  let cm: RegExpExecArray | null;
  while ((cm = coordSearchRe.exec(wikitext)) !== null) {
    const start = cm.index + cm[0].length;
    const end = wikitext.indexOf('}}', start);
    if (end === -1) continue;
    const args = wikitext.slice(start, end);
    const pt = parseCoordArgs(args);
    if (pt) addPoint(locations, pt.lat, pt.lng);
  }

  // {{#invoke:Coordinates|coord|51|30|N|0|7|W|…}} — the Lua-module form of
  // {{coord}}. The arguments after the `coord` keyword use the identical format,
  // so the same parser applies. Increasingly common as templates migrate to
  // Scribunto modules; the plain-template scan above misses it.
  const invokeCoordRe = /\{\{\s*#invoke:\s*Coordinates\s*\|\s*coord\s*\|/gi;
  while ((cm = invokeCoordRe.exec(wikitext)) !== null) {
    const start = cm.index + cm[0].length;
    const end = wikitext.indexOf('}}', start);
    if (end === -1) continue;
    const pt = parseCoordArgs(wikitext.slice(start, end));
    if (pt) addPoint(locations, pt.lat, pt.lng);
  }

  // {{Location map …|lat=…|long=…}} locator maps. The container ({{Location map+}})
  // carries no coordinates, but individual marks ({{Location map~|Place|lat=|long=}})
  // do. Parse a decimal lat/long pair scoped to each Location-map template body so
  // the loose |lat=/|long= field names cannot match unrelated markup elsewhere.
  const locMapRe = /\{\{\s*[Ll]ocation map/g;
  let lm: RegExpExecArray | null;
  while ((lm = locMapRe.exec(wikitext)) !== null) {
    let depth = 0, end = lm.index;
    for (let i = lm.index; i < wikitext.length - 1; i++) {
      if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i++; }
      else if (wikitext[i] === '}' && wikitext[i + 1] === '}') { depth--; i++; if (depth === 0) { end = i; break; } }
    }
    const body = wikitext.slice(lm.index, end + 1);
    const latM = /\|\s*lat(?:itude)?\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:\||\}|\n)/i.exec(body);
    const lonM = /\|\s*lo(?:n|ng)(?:gitude)?\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:\||\}|\n)/i.exec(body);
    if (latM && lonM) addPoint(locations, parseFloat(latM[1]), parseFloat(lonM[1]));
  }

  // |lat_deg= / |lon_deg= (degrees only, possibly with |lat_min= etc.)
  const latDegM = /\|\s*lat_?deg\s*=\s*(-?[\d.]+)/i.exec(wikitext);
  const lonDegM = /\|\s*lo(?:n|ng)_?deg\s*=\s*(-?[\d.]+)/i.exec(wikitext);
  if (latDegM && lonDegM) {
    const latMin = (/\|\s*lat_?min\s*=\s*([\d.]+)/i.exec(wikitext)?.[1] ?? '0');
    const latSec = (/\|\s*lat_?sec\s*=\s*([\d.]+)/i.exec(wikitext)?.[1] ?? '0');
    const lonMin = (/\|\s*lo(?:n|ng)_?min\s*=\s*([\d.]+)/i.exec(wikitext)?.[1] ?? '0');
    const lonSec = (/\|\s*lo(?:n|ng)_?sec\s*=\s*([\d.]+)/i.exec(wikitext)?.[1] ?? '0');
    const latDir = /\|\s*lat_?[Nn][Ss]\s*=\s*([SsNn])/i.exec(wikitext)?.[1] ?? 'N';
    const lonDir = /\|\s*lo(?:n|ng)_?[Ee][Ww]\s*=\s*([EeWw])/i.exec(wikitext)?.[1] ?? 'E';
    const lat = dmsToDecimal(
      [parseFloat(latDegM[1]), parseFloat(latMin), parseFloat(latSec)],
      /^[Ss]$/.test(latDir),
    );
    const lng = dmsToDecimal(
      [parseFloat(lonDegM[1]), parseFloat(lonMin), parseFloat(lonSec)],
      /^[Ww]$/.test(lonDir),
    );
    addPoint(locations, lat, lng);
  }

  // |latitude= / |longitude= (plain decimal)
  const latM2 = /\|\s*latitude\s*=\s*(-?[\d.]+)/i.exec(wikitext);
  const lonM2 = /\|\s*longitude\s*=\s*(-?[\d.]+)/i.exec(wikitext);
  if (latM2 && lonM2) addPoint(locations, parseFloat(latM2[1]), parseFloat(lonM2[1]));

  return locations;
}

// ---------------------------------------------------------------------------
// Date extraction from infobox fields
// ---------------------------------------------------------------------------

// Per-category field patterns in priority order.
// Using per-category lists avoids 'date' picking up flag-adoption years for
// country/settlement articles, while still working for event-type infoboxes.
const DATE_PATTERNS_BY_KIND: Record<string, RegExp[]> = {
  person: [
    /^birth_date$/i, /^death_date$/i,
    /^date$/i, /^start_date\d*$/i, /^end_date\d*$/i,
  ],
  event: [
    /^date$/i, /^event_date$/i,
    /^start_date\d*$/i, /^end_date\d*$/i,
    /^date_start$/i, /^date_end$/i,
    /^year_start$/i, /^year_end$/i,
  ],
  place: [
    /^founded$/i, /^inception$/i,
    /^established_date\d*$/i, /^established$/i,
    /^dissolved$/i,
    /^year_start$/i, /^year_end$/i,
  ],
  artifact: [
    // Ship-specific fields
    /^ship_commissioned$/i, /^ship_launched$/i, /^ship_laid_down$/i, /^ship_decommissioned$/i,
    /^commissioned$/i, /^launched$/i, /^laid_down$/i, /^decommissioned$/i,
    // Weapon / vehicle fields
    /^introduced$/i, /^date_introduced$/i, /^year_introduced$/i,
    /^manufactured$/i, /^date_manufactured$/i,
    /^completed$/i, /^date_completed$/i, /^production_date$/i,
    // Generic fallbacks
    /^inception$/i, /^date$/i,
  ],
  other: [
    /^date$/i, /^birth_date$/i, /^death_date$/i,
    /^start_date\d*$/i, /^end_date\d*$/i,
    /^founded$/i, /^established_date\d*$/i, /^established$/i,
    /^inception$/i, /^dissolved$/i,
  ],
};

interface ExtractedDates {
  startDate: EventDate | null;
  endDate: EventDate | null;
}

// Scans ALL {{Infobox…}} templates in wikitext and merges their depth-1 fields.
// Handles both the nested container pattern ({{Infobox ship}} wrapping
// {{Infobox ship career}}) and the sequential multi-template pattern.
// Citation templates like {{cite web|date=…}} are never named "Infobox" so
// they are never processed and cannot leak date fields.
function buildAllInfoboxFields(wikitext: string): Map<string, string> {
  const combined = new Map<string, string>();
  const re = /\{\{\s*[Ii]nfobox\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    let depth = 0;
    let end = m.index;
    for (let i = m.index; i < wikitext.length - 1; i++) {
      if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i++; }
      else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
        depth--; i++;
        if (depth === 0) { end = i; break; }
      }
    }
    const templateText = wikitext.slice(m.index, end + 1);
    for (const [k, v] of buildFieldMap(templateText)) {
      if (!combined.has(k)) combined.set(k, v);
    }
  }
  return combined;
}

// Depth-aware field extraction: only captures | key = value assignments at depth 1
// (directly inside the template), ignoring | separators inside nested templates such
// as {{cite web|date=2022}} embedded within a field's value.
function buildFieldMap(templateText: string): Map<string, string> {
  const fieldMap = new Map<string, string>();
  const len = templateText.length;
  let i = 0;
  let depth = 0;

  while (i < len) {
    if (i + 1 < len && templateText[i] === '{' && templateText[i + 1] === '{') {
      depth++; i += 2; continue;
    }
    if (i + 1 < len && templateText[i] === '}' && templateText[i + 1] === '}') {
      depth--; i += 2;
      if (depth <= 0) break;
      continue;
    }

    if (depth === 1 && templateText[i] === '|') {
      const rest = templateText.slice(i);
      const m = /^\|\s*([a-z_0-9]+)\s*=\s*/i.exec(rest);
      if (m) {
        const key = m[1].toLowerCase();
        const valStart = i + m[0].length;
        if (!fieldMap.has(key)) {
          const restFromVal = templateText.slice(valStart);
          let val: string;
          let advance: number;
          if (restFromVal.startsWith('{{')) {
            // Template value — extract to matching }}
            let d = 0, end = 0;
            for (let j = 0; j < restFromVal.length - 1; j++) {
              if (restFromVal[j] === '{' && restFromVal[j + 1] === '{') { d++; j++; }
              else if (restFromVal[j] === '}' && restFromVal[j + 1] === '}') { d--; j++; if (d === 0) { end = j + 1; break; } }
            }
            val = end > 0 ? restFromVal.slice(0, end) : '';
            advance = valStart + (end > 0 ? end : restFromVal.length);
          } else {
            // Plain value — stop at next field separator, template boundary, or newline.
            val = /^([^\n|}{[\]]+)/.exec(restFromVal)?.[1] ?? '';
            advance = valStart + val.length;
          }
          fieldMap.set(key, val.trim());
          i = advance;
          continue;
        }
      }
    }

    i++;
  }

  return fieldMap;
}

export function extractDates(wikitext: string, category: string = 'other'): ExtractedDates {
  // Scan all {{Infobox…}} templates: handles nested sub-templates (e.g. ship/career
  // inside ship) while still blocking citation leakage ({{cite web}} is not an Infobox).
  const fieldMap = buildAllInfoboxFields(wikitext);

  const patterns = DATE_PATTERNS_BY_KIND[category] ?? DATE_PATTERNS_BY_KIND.other;
  const found: EventDate[] = [];
  for (const pattern of patterns) {
    for (const [key, val] of fieldMap) {
      if (pattern.test(key)) {
        const d = parseDate(val);
        if (d) { found.push(d); break; }
      }
    }
  }

  if (found.length === 0) return { startDate: null, endDate: null };

  // Deduplicate by start year
  const seen = new Set<number>();
  const unique = found.filter(d => {
    if (seen.has(d.startYear)) return false;
    seen.add(d.startYear);
    return true;
  });

  const startDate = unique[0];
  // Secondary sanity check: drop an endDate that precedes the startDate.
  const rawEnd = unique.length > 1 ? unique[unique.length - 1] : null;
  const endDate = rawEnd && rawEnd.startYear >= startDate.startYear ? rawEnd : null;
  return { startDate, endDate };
}

// ---------------------------------------------------------------------------
// Description extraction (first sentence of the article body)
// ---------------------------------------------------------------------------

export function extractDescription(wikitext: string): string {
  let text = wikitext;

  // Self-closing <ref name="x" /> must be stripped BEFORE the paired-tag
  // regex below — otherwise the paired regex's opening-tag pattern matches
  // the self-closing tag as if it were an opener, and its non-greedy body
  // then swallows everything up to the next unrelated </ref> in the text.
  text = text.replace(/<ref\b[^>]*\/>/gi, '');
  text = text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '');

  // Strip remaining HTML/XML tags (<br>, <br/>, <nowiki>, etc.)
  text = text.replace(/<[^>]+>/g, '');

  // Iteratively remove innermost {{…}} template pairs until stable (handles nesting)
  for (let pass = 0; pass < 8; pass++) {
    const next = text.replace(/\{\{[^{}]*\}\}/g, '');
    if (next === text) break;
    text = next;
  }

  // Strip [[File:…]] and [[Image:…]]
  text = text.replace(/\[\[\s*(?:File|Image)\s*:[^\]]*\]\]/gi, '');

  // Strip labelled external links [http://… display] → display; bare [http://…] → ''
  text = text.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1');
  text = text.replace(/\[https?:\/\/[^\]]*\]/g, '');

  // Strip [[link|display]] → display; [[link]] → link
  text = text.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');

  // Strip bold/italic markers and section headings
  text = text.replace(/'{2,3}/g, '');
  text = text.replace(/==+[^=]+=+/g, '');

  // Strip category links
  text = text.replace(/\[\[Category:[^\]]*\]\]/gi, '');

  // Collapse runs of spaces/tabs (keep newlines for paragraph detection)
  text = text.replace(/[ \t]{2,}/g, ' ');

  for (const rawLine of text.split('\n')) {
    // Trim leading whitespace and stray punctuation left by template removal
    const trimmed = rawLine.replace(/^[\s,;()[\]]+/, '').trimEnd();
    if (
      trimmed.length > 40 &&
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('|') &&
      !trimmed.startsWith('{')
    ) {
      const sentence = trimmed.match(/^([^.!?]+[.!?])/)?.[1] ?? trimmed.slice(0, 150);
      return sentence.trim().slice(0, 200);
    }
  }
  return '';
}
