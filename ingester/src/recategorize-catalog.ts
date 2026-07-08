/**
 * recategorize-catalog: re-applies proposedCategoryName to every row in the
 * infobox catalog, updating the proposed_category column in place.
 *
 * Run this after updating proposedCategoryName in infobox-parser.ts to
 * propagate the new category assignments without re-scanning the dump.
 *
 * Usage:
 *   node dist/recategorize-catalog.js <catalog.tsv> [output.tsv]
 *
 * If output.tsv is omitted, the input file is overwritten.
 */

import fs from 'node:fs';
import { proposedCategoryName } from './infobox-parser.js';

function main(): void {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) {
    process.stderr.write('Usage: node dist/recategorize-catalog.js <catalog.tsv> [output.tsv]\n');
    process.exit(1);
  }
  const destPath = outputPath ?? inputPath;

  const content = fs.readFileSync(inputPath, 'utf8');
  const lines = content.split('\n');
  const header = lines[0].split('\t');

  const typeIdx = header.indexOf('infobox_type');
  const catIdx  = header.indexOf('proposed_category');

  if (typeIdx < 0 || catIdx < 0) {
    process.stderr.write('Error: catalog missing infobox_type or proposed_category column\n');
    process.exit(1);
  }

  const counts = new Map<string, number>();
  const outLines: string[] = [lines[0]];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const infoboxType = cols[typeIdx];
    const newCategory = proposedCategoryName(infoboxType);
    cols[catIdx] = newCategory;
    outLines.push(cols.join('\t'));
    counts.set(newCategory, (counts.get(newCategory) ?? 0) + 1);
  }

  fs.writeFileSync(destPath, outLines.join('\n') + '\n', 'utf8');

  process.stderr.write(`[recategorize] Updated ${outLines.length - 1} entries → ${destPath}\n`);
  for (const [cat, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    process.stderr.write(`  ${cat}: ${n}\n`);
  }
}

main();
