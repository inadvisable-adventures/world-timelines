/**
 * coord-sample — investigate `no-coords-found` entries to find coordinate
 * signals the ingester currently misses.
 *
 * Usage:
 *   node dist/coord-sample.js <dump.xml.bz2> <index.txt.bz2> <entries.tsv> [sampleN]
 *
 * Samples rows tagged `no-coords-found` (spread across categories), fetches each
 * article's wikitext from the dump, runs the current extractLocations (to
 * confirm it finds nothing), and reports coordinate/map markup found by a broad
 * heuristic — plus a tally of which signal types appear. Read-only analysis.
 */

import fs from 'node:fs';
import { openDump, closeDump, readStream } from './bz2-reader.js';
import { decodeBzip2 } from './bzip2-cli.js';
import { extractPages } from './xml-parser.js';
import { extractLocations } from './infobox-parser.js';

const INDEX_MAX_BUFFER = 2 * 1024 * 1024 * 1024;

interface Row { title: string; category: string; }

// Heuristic signal detectors — used only for the report, not for extraction.
const SIGNALS: { name: string; re: RegExp }[] = [
  { name: 'coord-template',   re: /\{\{\s*coord/i },
  { name: 'location-map',     re: /\{\{\s*location\s*map/i },
  { name: 'latd/longd',       re: /\|\s*lat[_ ]?d\s*=|\|\s*long?[_ ]?d\s*=/i },
  { name: 'lat_deg/lon_deg',  re: /\|\s*lat_?deg\s*=|\|\s*lo(?:n|ng)_?deg\s*=/i },
  { name: 'latitude/longitude', re: /\|\s*latitude\s*=|\|\s*longitude\s*=/i },
  { name: 'lat/long-plain',   re: /\|\s*lat\s*=\s*-?[\d.]|\|\s*long?\s*=\s*-?[\d.]/i },
  { name: 'coordinates-field',re: /\|\s*coordinates\s*=/i },
  { name: 'map-image/svg',    re: /\|\s*(?:image[_ ]?map|map[_ ]?image|map)\s*=.*\.svg/i },
  { name: 'geo-microformat',  re: /\{\{\s*geo|class\s*=\s*"geo"/i },
];

function readSample(tsvPath: string, sampleN: number): Row[] {
  const lines = fs.readFileSync(tsvPath, 'utf8').split('\n');
  const header = lines[0].split('\t');
  const ti = header.indexOf('title');
  const ci = header.indexOf('category');
  const gi = header.indexOf('tags');

  // Bucket no-coords rows by category, then round-robin to spread the sample.
  const byCat = new Map<string, Row[]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length <= gi) continue;
    if (!cols[gi].includes('no-coords-found')) continue;
    const row: Row = { title: cols[ti], category: cols[ci] };
    if (!byCat.has(row.category)) byCat.set(row.category, []);
    byCat.get(row.category)!.push(row);
  }

  // Deterministic spread: take every Kth row from each category bucket.
  const out: Row[] = [];
  const cats = [...byCat.keys()];
  const perCat = Math.max(1, Math.ceil(sampleN / cats.length));
  for (const cat of cats) {
    const rows = byCat.get(cat)!;
    const step = Math.max(1, Math.floor(rows.length / perCat));
    for (let i = 0, taken = 0; i < rows.length && taken < perCat; i += step, taken++) {
      out.push(rows[i]);
    }
  }
  return out.slice(0, sampleN);
}

// Build title -> {offset, nextOffset} for the sampled titles in one index pass.
function locateTitles(indexPath: string, titles: Set<string>): Map<string, { offset: number; next: number | null }> {
  process.stderr.write('[coord-sample] decoding index…\n');
  const buf = decodeBzip2(fs.readFileSync(indexPath), INDEX_MAX_BUFFER);
  const allOffsets: number[] = [];
  const seenOffset = new Set<number>();
  const found = new Map<string, number>();

  let lineStart = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0x0a) {
      if (i > lineStart) {
        const end = buf[i - 1] === 0x0d ? i - 1 : i;
        let c1 = -1, c2 = -1;
        for (let j = lineStart; j < end; j++) {
          if (buf[j] === 0x3a) { if (c1 < 0) c1 = j; else { c2 = j; break; } }
        }
        if (c1 > lineStart && c2 > c1) {
          const offset = parseInt(buf.subarray(lineStart, c1).toString('ascii'), 10);
          if (!isNaN(offset)) {
            if (!seenOffset.has(offset)) { seenOffset.add(offset); allOffsets.push(offset); }
            const title = buf.subarray(c2 + 1, end).toString('utf8');
            if (titles.has(title)) found.set(title, offset);
          }
        }
      }
      lineStart = i + 1;
    }
  }

  allOffsets.sort((a, b) => a - b);
  const nextOf = (o: number): number | null => {
    let lo = 0, hi = allOffsets.length - 1, ans: number | null = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (allOffsets[mid] > o) { ans = allOffsets[mid]; hi = mid - 1; } else lo = mid + 1; }
    return ans;
  };

  const result = new Map<string, { offset: number; next: number | null }>();
  for (const [title, offset] of found) result.set(title, { offset, next: nextOf(offset) });
  return result;
}

function main(): void {
  const [dumpPath, indexPath, tsvPath, sampleArg] = process.argv.slice(2);
  if (!dumpPath || !indexPath || !tsvPath) {
    process.stderr.write('Usage: coord-sample <dump.xml.bz2> <index.txt.bz2> <entries.tsv> [sampleN]\n');
    process.exit(2);
  }
  const sampleN = sampleArg ? parseInt(sampleArg, 10) : 150;

  const sample = readSample(tsvPath, sampleN);
  process.stderr.write(`[coord-sample] sampled ${sample.length} no-coords rows across categories\n`);

  const titleSet = new Set(sample.map(r => r.title));
  const located = locateTitles(indexPath, titleSet);

  // Group by stream offset so each stream is decompressed once.
  const byStream = new Map<number, { next: number | null; titles: string[] }>();
  for (const [title, loc] of located) {
    if (!byStream.has(loc.offset)) byStream.set(loc.offset, { next: loc.next, titles: [] });
    byStream.get(loc.offset)!.titles.push(title);
  }

  const catOf = new Map(sample.map(r => [r.title, r.category]));
  const tally: Record<string, number> = {};
  for (const s of SIGNALS) tally[s.name] = 0;
  tally['NONE'] = 0;
  tally['extractLocations-now'] = 0;

  const { fd, fileSize } = openDump(dumpPath);
  let reported = 0;
  for (const [offset, grp] of byStream) {
    const xml = readStream(fd, fileSize, offset, grp.next);
    if (!xml) continue;
    const pages = extractPages(xml);
    for (const title of grp.titles) {
      const page = pages.find(p => p.title === title);
      if (!page) continue;
      reported++;
      const wt = page.wikitext;
      const nowFound = extractLocations(wt).length > 0;
      if (nowFound) tally['extractLocations-now']++;

      const hits = SIGNALS.filter(s => s.re.test(wt));
      for (const h of hits) tally[h.name]++;
      if (hits.length === 0) tally['NONE']++;

      process.stdout.write(`\n### ${title}  [${catOf.get(title)}]  nowFound=${nowFound}\n`);
      process.stdout.write(`signals: ${hits.map(h => h.name).join(', ') || '(none)'}\n`);
      for (const h of hits) {
        const m = wt.match(new RegExp('.{0,40}' + h.re.source + '.{0,60}', 'i'));
        if (m) process.stdout.write(`  ${h.name}: …${m[0].replace(/\n/g, ' ')}…\n`);
      }
    }
  }
  closeDump(fd);

  process.stderr.write(`\n[coord-sample] === signal tally over ${reported} articles ===\n`);
  for (const [k, v] of Object.entries(tally)) {
    process.stderr.write(`  ${k.padEnd(22)} ${v}\t(${((v / reported) * 100).toFixed(1)}%)\n`);
  }
}

main();
