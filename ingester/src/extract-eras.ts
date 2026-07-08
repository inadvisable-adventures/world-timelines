/**
 * World Timelines — general-purpose historical-era extraction
 *
 * Usage:
 *   node dist/extract-eras.js <dump.xml.bz2> <index.txt.bz2> "Article Title" [--output path.tsv]
 *
 * Fetches a single article by title (via the same index-lookup mechanism as
 * lookup.ts) and scans its full wikitext — not just its infobox — for
 * section-scoped historical eras with date spans, using era-extractor.ts.
 * Not specific to any one article: it works off generic heading structure
 * and date-expression patterns (BCE/CE years, century forms, ranges, "X
 * years ago"), so it can be pointed at other articles or a future revision
 * of the same one.
 *
 * Output uses the same 17-column schema as the main ingester's
 * collected_entries.tsv (category is always "historical_period",
 * infobox_type is "manual", locations is always "[]").
 */

import fs from 'node:fs';
import { fetchArticleWikitext } from './article-fetch.js';
import { extractEras } from './era-extractor.js';
import { TSV_HEADER } from './tsv-writer.js';

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function esc(s: string): string {
  return s.replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '');
}

function main(): void {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--output');
  const outputPath = outIdx >= 0 ? args[outIdx + 1] : null;
  if (outIdx >= 0) args.splice(outIdx, 2);

  const [dumpPath, indexPath, targetTitle] = args;
  if (!dumpPath || !indexPath || !targetTitle) {
    process.stderr.write(
      'Usage: node dist/extract-eras.js <dump.xml.bz2> <index.txt.bz2> "Article Title" [--output path.tsv]\n',
    );
    process.exit(1);
  }

  const wikitext = fetchArticleWikitext(dumpPath, indexPath, targetTitle);
  if (wikitext === null) {
    process.stderr.write(`[extract-eras] Title not found: "${targetTitle}"\n`);
    process.exit(1);
  }

  const eras = extractEras(wikitext);
  process.stderr.write(`[extract-eras] Found ${eras.length} era(s) with a resolvable date span.\n`);

  const seenIds = new Set<string>();
  const rows = eras.map(era => {
    let id = slugify(era.title);
    while (seenIds.has(id)) id += '-x';
    seenIds.add(id);

    return [
      esc(id),
      esc(era.title),
      '[]',
      era.startYear, 0, 0,
      era.endYear, 0, 0,
      esc(era.startExpr),
      esc(era.endExpr),
      'gregorian',
      0,
      'historical_period',
      'manual',
      esc(era.description),
      esc(JSON.stringify(['manual-extraction', 'no-coords-found'])),
    ].join('\t');
  });

  const output = [TSV_HEADER, ...rows].join('\n') + '\n';
  if (outputPath) {
    fs.writeFileSync(outputPath, output, 'utf8');
    process.stderr.write(`[extract-eras] Wrote ${eras.length} rows to ${outputPath}\n`);
  } else {
    process.stdout.write(output);
  }
}

main();
