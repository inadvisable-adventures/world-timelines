/**
 * catalog-scan: pre-processing pass that extracts all infobox types from the
 * Wikipedia multistream dump without doing full date/coordinate extraction.
 *
 * Much faster than a full ingestion run — use this first to understand what
 * infobox types are present before deciding which to include.
 *
 * Usage:
 *   node dist/catalog-scan.js <dump.xml.bz2> <index.txt.bz2> [output.tsv]
 *
 * Outputs the infobox catalog TSV to output.tsv (default: infobox-catalog.tsv).
 */

import { openDump, closeDump, readStream } from './bz2-reader.js';
import { readMultistreamOffsets } from './index-reader.js';
import { extractInfoboxTypes, DEFAULT_INCLUDE_TYPES } from './infobox-parser.js';
import { extractPages } from './xml-parser.js';
import { InboxCatalog } from './infobox-catalog.js';
import fs from 'node:fs';

function main(): void {
  const args = process.argv.slice(2);
  const [dumpPath, indexPath, outputPath = 'infobox-catalog.tsv'] = args;

  if (!dumpPath || !indexPath) {
    process.stderr.write(
      'Usage: node dist/catalog-scan.js <dump.xml.bz2> <index.txt.bz2> [output.tsv]\n',
    );
    process.exit(1);
  }

  process.stderr.write('[catalog-scan] Reading index…\n');
  const offsets = readMultistreamOffsets(indexPath);
  process.stderr.write(`[catalog-scan] Found ${offsets.length} streams\n`);

  const { fd, fileSize } = openDump(dumpPath);
  const catalog = new InboxCatalog();
  let pageCount = 0;

  for (let i = 0; i < offsets.length; i++) {
    const nextOffset = i + 1 < offsets.length ? offsets[i + 1] : null;

    if (i % 5000 === 0) {
      const pct = Math.round((i / offsets.length) * 100);
      process.stderr.write(
        `[catalog-scan] Stream ${i}/${offsets.length} (${pct}%, ${pageCount} pages scanned)\n`,
      );
    }

    const xmlChunk = readStream(fd, fileSize, offsets[i], nextOffset);
    if (!xmlChunk) continue;

    const pages = extractPages(xmlChunk);
    for (const page of pages) {
      pageCount++;
      const infoboxTypes = extractInfoboxTypes(page.wikitext);
      const wasIncluded = infoboxTypes.some(t => DEFAULT_INCLUDE_TYPES.has(t));
      for (const t of infoboxTypes) {
        catalog.record(t, wasIncluded);
      }
    }
  }

  closeDump(fd);

  fs.writeFileSync(outputPath, catalog.toTsv(), 'utf8');
  process.stderr.write(
    `[catalog-scan] Done. ${pageCount} pages scanned. Catalog written to ${outputPath}\n`,
  );
}

main();
