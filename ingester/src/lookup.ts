/**
 * World Timelines — single-article lookup
 *
 * Usage:
 *   node dist/lookup.js <dump.xml.bz2> <index.txt.bz2> "Article Title" [--raw]
 *
 * Decompresses the multistream index once to locate the article's stream,
 * then decompresses only that stream and runs the same extraction pipeline
 * as the main ingester. Prints the resulting entry as JSON to stdout.
 * Rejection reasons are written to stderr.
 *
 * --raw prints the article's full wikitext to stdout instead of running the
 * infobox-based extraction pipeline — useful for articles with no infobox,
 * or when the whole page body (not just infobox fields) is needed.
 */

import { fetchArticleWikitext } from './article-fetch.js';
import {
  extractInfoboxTypes,
  extractLocations,
  extractDates,
  extractDescription,
  categoryFromInfoboxType,
  DEFAULT_INCLUDE_TYPES,
} from './infobox-parser.js';

function main(): void {
  const args = process.argv.slice(2);
  const rawIdx = args.indexOf('--raw');
  const raw = rawIdx >= 0;
  if (raw) args.splice(rawIdx, 1);

  const [dumpPath, indexPath, targetTitle] = args;
  if (!dumpPath || !indexPath || !targetTitle) {
    process.stderr.write(
      'Usage: node dist/lookup.js <dump.xml.bz2> <index.txt.bz2> "Article Title" [--raw]\n',
    );
    process.exit(1);
  }

  const wikitext = fetchArticleWikitext(dumpPath, indexPath, targetTitle);
  if (wikitext === null) {
    process.stderr.write(`[lookup] Title not found: "${targetTitle}"\n`);
    process.exit(1);
  }

  if (raw) {
    process.stdout.write(wikitext);
    return;
  }

  process.stderr.write(`[lookup] Article found. Running extraction pipeline…\n`);

  const infoboxTypes = extractInfoboxTypes(wikitext);
  process.stderr.write(`[lookup] Infobox types: ${infoboxTypes.length > 0 ? infoboxTypes.join(', ') : '(none)'}\n`);

  const primaryType = infoboxTypes.find(t => DEFAULT_INCLUDE_TYPES.has(t));
  if (!primaryType) {
    if (infoboxTypes.length === 0) {
      process.stderr.write('[lookup] REJECTED: no infobox found\n');
    } else {
      process.stderr.write(
        `[lookup] REJECTED: no included infobox type (found: ${infoboxTypes.join(', ')})\n`,
      );
    }
    process.exit(1);
  }

  process.stderr.write(`[lookup] Primary infobox type: ${primaryType}\n`);

  const category = categoryFromInfoboxType(primaryType);
  process.stderr.write(`[lookup] Category: ${category}\n`);

  const locations = extractLocations(wikitext);
  process.stderr.write(`[lookup] Locations: ${locations.length}\n`);

  const { startDate, endDate } = extractDates(wikitext, category);
  if (!startDate) {
    process.stderr.write('[lookup] REJECTED: no parseable start date\n');
    process.exit(1);
  }

  const description = extractDescription(wikitext);
  const tags = locations.length === 0 ? ['no-coords-found'] : [];

  const entry = {
    title: targetTitle,
    category,
    infoboxType: primaryType,
    allInfoboxTypes: infoboxTypes,
    locations,
    startDate,
    endDate,
    description,
    tags,
  };

  process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
}

main();
