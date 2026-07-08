import { extractDescription } from './infobox-parser.js';

export interface ExtractedEra {
  title: string;
  level: number;        // heading depth: "==" is 2, "===" is 3, etc.
  startYear: number;
  endYear: number;
  startExpr: string;
  endExpr: string;
  description: string;
}

interface Section {
  title: string;      // breadcrumb-qualified, e.g. "Post-classical – Europe"
  level: number;
  body: string;
}

// Trailer sections that are never era content, regardless of article.
const NON_CONTENT_HEADING =
  /^(see also|references?|notes?|explanatory notes|citations?|bibliography|external links|further reading|sources|footnotes|academic research|periodization)$/i;

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

// Splits wikitext into headed sections ("== Heading ==" or deeper). Each
// section's body runs until the next heading of the same or shallower depth
// (i.e. it includes any nested subsections), so a top-level heading's body
// covers everything under it — mirroring how a reader would scope "the
// Ancient period" to include its "Axial Age" and "Regional empires"
// subsections. Trailer sections (references, etc.) are dropped.
export function splitSections(wikitext: string): Section[] {
  const headingRe = /^(={2,6})\s*([^=\n]+?)\s*\1\s*$/gm;
  const matches: Array<{ level: number; title: string; bodyStart: number; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(wikitext)) !== null) {
    matches.push({
      level: m[1].length,
      title: m[2].trim(),
      bodyStart: m.index + m[0].length,
      index: m.index,
    });
  }

  // Track open ancestor headings by level so nested subsections can be
  // qualified with their parent's title (e.g. "Europe" appears as a
  // subsection of both "Post-classical" and "Early modern" — without
  // qualification these would collide and lose their distinct meaning).
  const ancestorStack: string[] = [];
  const sections: Section[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    while (ancestorStack.length >= cur.level - 1) ancestorStack.pop();
    const qualifiedTitle = [...ancestorStack, cur.title].join(' – ');
    ancestorStack.push(cur.title);

    if (NON_CONTENT_HEADING.test(cur.title)) continue;

    let bodyEnd = wikitext.length;
    for (let j = i + 1; j < matches.length; j++) {
      if (matches[j].level <= cur.level) { bodyEnd = matches[j].index; break; }
    }
    sections.push({ title: qualifiedTitle, level: cur.level, body: wikitext.slice(cur.bodyStart, bodyEnd) });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Date-mention scanning
// ---------------------------------------------------------------------------

function eraSign(era: string | undefined): number {
  return era && /^(BCE|BC)$/i.test(era) ? -1 : 1;
}

function num(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10);
}

// Wikipedia prose is saturated with citation noise that looks like a plausible
// calendar year but isn't one: {{harvnb|Author|2015}} publication years,
// {{cite web|access-date=2024-11-23}}, page ranges, ISBNs. Left in, these
// dominate the min/max date scan (e.g. an "access-date=2024" reliably becomes
// the "latest" year mentioned in nearly every section). Stripping refs and
// templates before date-scanning removes the vast majority of this noise, at
// the cost of occasionally losing a genuine date embedded in a {{circa|...}}
// or {{efn|...}} template — an acceptable trade for a heuristic scanner.
export function stripCitationNoise(text: string): string {
  // Self-closing <ref name="x" /> must be stripped BEFORE the paired-tag
  // regex below — otherwise the paired regex's opening-tag pattern matches
  // the self-closing tag as if it were an opener, and its non-greedy body
  // then swallows everything up to the next unrelated </ref> in the text.
  // Wikitext uses the literal "&nbsp;" entity (not a real NBSP character) to
  // glue a number to its unit, e.g. "3300&nbsp;BCE" — regex \s won't match
  // that text, so every date pattern below would silently fail without this.
  let out = text.replace(/&nbsp;/gi, ' ');
  // Every strip below replaces with a single space, not '' — templates like
  // {{snd}} (a spaced en-dash) sit directly between two date tokens with no
  // surrounding whitespace of their own (e.g. "700 BCE{{snd}}1521 CE");
  // deleting them outright glues the tokens into "BCE1521", which breaks
  // \b-boundary matching on the first number and silently drops it.
  out = out.replace(/<ref\b[^>]*\/>/gi, ' ').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, ' ');
  for (let pass = 0; pass < 8; pass++) {
    const next = out.replace(/\{\{[^{}]*\}\}/g, ' ');
    if (next === out) break;
    out = next;
  }
  // File/image links often carry an upload-date-stamped filename (e.g.
  // "sept 2019 5373crop.jpg") that reads as a plausible bare year but has
  // nothing to do with the era being described.
  out = out.replace(/\[\[\s*(?:File|Image)\s*:[^\]]*\]\]/gi, ' ');
  return out;
}

// How far into a section's (cleaned) text to look for its defining range
// statement. History articles conventionally open a period's description
// with its overall span — searching only this "topic sentence" window keeps
// a range mentioned deep in a supporting detail (e.g. a specific dynasty's
// dates, cited in passing) from being mistaken for the whole section's span.
const TOPIC_SENTENCE_WINDOW = 400;

// An explicit "from X to Y" / "X–Y BCE" / "63 BCE – 14 CE" style range,
// stated directly in a section's opening prose — the strongest signal for
// its overall span.
export function findExplicitRange(text: string): { start: number; end: number; startExpr: string; endExpr: string } | null {
  // Tight form: NUM [ERA]? (to|-|–|—) NUM ERA — era on the second number
  // applies to the first too, unless the first already has its own.
  const tightRe = /(\d{1,7}(?:,\d{3})*)\s*(BCE|BC|CE|AD)?\s*(?:to|-|–|—)\s*(\d{1,7}(?:,\d{3})*)\s*(BCE|BC|CE|AD)?/i;
  // Loose "from ... to/until ..." form within a single sentence, allowing
  // words in between (e.g. "starts ... in 1789 ... until ... 1914").
  const looseRe = /\bfrom\s+(?:about\s+|around\s+|c\.\s*)?(\d{1,7}(?:,\d{3})*)\s*(BCE|BC|CE|AD)?\b[\s\S]{0,120}?\b(?:to|until)\s+(?:about\s+|around\s+)?(\d{1,7}(?:,\d{3})*)\s*(BCE|BC|CE|AD)?\b/i;

  const windowed = text.slice(0, TOPIC_SENTENCE_WINDOW);
  const sentences = windowed.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const loose = looseRe.exec(sentence);
    if (loose) {
      const [, y1, e1, y2, e2] = loose;
      const plausibleBareYear = (y: string): boolean => { const n = num(y); return n >= 1000 && n <= 2100; };
      if (!e1 && !e2 && !(plausibleBareYear(y1) && plausibleBareYear(y2))) continue;
      const era1 = e1 ?? e2;
      const era2 = e2 ?? e1;
      return {
        start: num(y1) * eraSign(era1),
        end: num(y2) * eraSign(era2),
        startExpr: `${y1}${e1 ? ' ' + e1 : ''}`,
        endExpr: `${y2}${e2 ? ' ' + e2 : ''}`,
      };
    }
    const tight = tightRe.exec(sentence);
    if (tight) {
      const [, y1, e1, y2, e2] = tight;
      if (!e1 && !e2) continue; // bare "X-Y" with no era marker is too ambiguous (likely a citation, not a date range)
      const era1 = e1 ?? e2;
      const era2 = e2 ?? e1;
      return {
        start: num(y1) * eraSign(era1),
        end: num(y2) * eraSign(era2),
        startExpr: `${y1}${e1 ? ' ' + e1 : ''}`,
        endExpr: `${y2}${e2 ? ' ' + e2 : ''}`,
      };
    }
  }
  return null;
}

interface Mention { year: number; raw: string; }

// Collects every plausible year mention in a block of text: explicit
// BCE/CE/AD years (single or ranged), "Nth century" forms, bare years in a
// plausible calendar range, and deep-time "X million/thousand years ago"
// expressions (single or ranged, e.g. "7-5 million years ago").
export function findAllMentions(text: string): Mention[] {
  const mentions: Mention[] = [];
  let remaining = text;

  // Ranged deep-time mentions first ("7-5 million years ago"), so the tight
  // range's second number doesn't later get treated as a lone mention.
  const yearsAgoRangeRe = /([\d.,]+)\s*[-–—]\s*([\d.,]+)\s*(million|thousand)?\s*years?\s+ago/gi;
  remaining = remaining.replace(yearsAgoRangeRe, (m, a: string, b: string, unit?: string) => {
    const mult = unit?.toLowerCase() === 'million' ? 1_000_000 : unit?.toLowerCase() === 'thousand' ? 1_000 : 1;
    for (const part of [a, b]) {
      const n = parseFloat(part.replace(/,/g, ''));
      if (!isNaN(n)) mentions.push({ year: -Math.round(n * mult), raw: `${part} ${unit ?? ''} years ago`.trim() });
    }
    return ' '.repeat(m.length);
  });

  const yearsAgoRe = /([\d.,]+)\s*(million|thousand)?\s*years?\s+ago/gi;
  remaining = remaining.replace(yearsAgoRe, (m, num_: string, unit?: string) => {
    const n = parseFloat(num_.replace(/,/g, ''));
    const mult = unit?.toLowerCase() === 'million' ? 1_000_000 : unit?.toLowerCase() === 'thousand' ? 1_000 : 1;
    if (!isNaN(n)) mentions.push({ year: -Math.round(n * mult), raw: m });
    return ' '.repeat(m.length);
  });

  // Tight BCE/CE ranges ("1766-1045 BCE", "63 BCE - 14 CE") consumed whole,
  // both endpoints recorded with their resolved sign — otherwise the bare
  // 4-digit scan below would misread a range's first number (no era marker
  // of its own) as an unrelated bare CE year.
  const tightRangeRe = /(\d{1,7}(?:,\d{3})*)\s*(BCE|BC|CE|AD)?\s*(?:to|-|–|—)\s*(\d{1,7}(?:,\d{3})*)\s*(BCE|BC|CE|AD)\b/gi;
  remaining = remaining.replace(tightRangeRe, (m, y1: string, e1: string | undefined, y2: string, e2: string) => {
    const era1 = e1 ?? e2;
    mentions.push({ year: num(y1) * eraSign(era1), raw: `${y1}${e1 ? ' ' + e1 : ''}` });
    mentions.push({ year: num(y2) * eraSign(e2), raw: `${y2} ${e2}` });
    return ' '.repeat(m.length);
  });

  const centuryRe = /(\d{1,2})(?:st|nd|rd|th)\s+century\s*(BCE|BC|CE|AD)?/gi;
  remaining = remaining.replace(centuryRe, (m, c: string, era?: string) => {
    const century = parseInt(c, 10);
    const sign = eraSign(era);
    const year = sign < 0 ? -(century * 100) : (century - 1) * 100 + 50;
    mentions.push({ year, raw: m });
    return ' '.repeat(m.length);
  });

  const eraYearRe = /(\d{1,7}(?:,\d{3})*)\s*(BCE|BC|CE|AD)\b/gi;
  remaining = remaining.replace(eraYearRe, (m, y: string, era: string) => {
    mentions.push({ year: num(y) * eraSign(era), raw: m });
    return ' '.repeat(m.length);
  });

  // Bare 4-digit years without an era marker, only accepted in a plausible
  // calendar range (1000-2100) to avoid misreading arbitrary numbers
  // (page counts, populations, etc.) as years.
  const bareYearRe = /\b(1[0-9]{3}|20[0-2][0-9])\b/g;
  for (const m of remaining.matchAll(bareYearRe)) {
    mentions.push({ year: num(m[1]), raw: m[0] });
  }

  return mentions;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Extracts a (possibly overlapping) set of eras from an article's wikitext:
// one candidate per section heading, with a date span derived either from an
// explicit range stated in the section's prose, or (failing that) the
// earliest and latest year mentioned anywhere in the section.
export function extractEras(wikitext: string): ExtractedEra[] {
  const sections = splitSections(wikitext);
  const eras: ExtractedEra[] = [];

  for (const section of sections) {
    const cleanBody = stripCitationNoise(section.body);
    const explicit = findExplicitRange(cleanBody);
    let startYear: number, endYear: number, startExpr: string, endExpr: string;

    if (explicit) {
      startYear = Math.min(explicit.start, explicit.end);
      endYear = Math.max(explicit.start, explicit.end);
      startExpr = explicit.start <= explicit.end ? explicit.startExpr : explicit.endExpr;
      endExpr = explicit.start <= explicit.end ? explicit.endExpr : explicit.startExpr;
    } else {
      const mentions = findAllMentions(cleanBody);
      if (mentions.length === 0) continue;
      let minM = mentions[0], maxM = mentions[0];
      for (const m of mentions) {
        if (m.year < minM.year) minM = m;
        if (m.year > maxM.year) maxM = m;
      }
      startYear = minM.year;
      endYear = maxM.year;
      startExpr = minM.raw;
      endExpr = maxM.raw;
    }

    eras.push({
      title: section.title,
      level: section.level,
      startYear,
      endYear,
      startExpr,
      endExpr,
      description: extractDescription(section.body),
    });
  }

  return eras;
}
