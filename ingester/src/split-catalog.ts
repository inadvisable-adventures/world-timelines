/**
 * split-catalog: splits infobox-catalog.tsv into per-category TSV files.
 *
 * Reads the catalog, groups rows by proposed_category, and writes one file
 * per category into <catalog-dir>/infobox-by-category/. Rows with count <= 1
 * are excluded. The proposed_category column is omitted from output files.
 *
 * Usage:
 *   node dist/split-catalog.js <catalog.tsv>
 */

import fs from 'node:fs';
import path from 'node:path';

function main(): void {
  const [catalogPath] = process.argv.slice(2);
  if (!catalogPath) {
    process.stderr.write('Usage: node dist/split-catalog.js <catalog.tsv>\n');
    process.exit(1);
  }

  const outputDir = path.join(path.dirname(catalogPath), 'infobox-by-category');
  fs.mkdirSync(outputDir, { recursive: true });

  const content = fs.readFileSync(catalogPath, 'utf8');
  const lines = content.split('\n');
  const header = lines[0].split('\t');

  const typeIdx  = header.indexOf('infobox_type');
  const catIdx   = header.indexOf('proposed_category');
  const countIdx = header.indexOf('count');
  const wasIdx   = header.indexOf('was_included');
  const futureIdx = header.indexOf('include_in_future');

  const groups = new Map<string, string[]>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split('\t');
    const count = parseInt(cols[countIdx], 10);
    if (count <= 1) continue;

    const category = cols[catIdx];
    const row = [cols[typeIdx], cols[countIdx], cols[wasIdx], cols[futureIdx]].join('\t');
    let group = groups.get(category);
    if (!group) { group = []; groups.set(category, group); }
    group.push(row);
  }

  const outputHeader = 'infobox_type\tcount\twas_included\tinclude_in_future\n';

  for (const [category, rows] of groups) {
    const outPath = path.join(outputDir, `${category}.tsv`);
    fs.writeFileSync(outPath, outputHeader + rows.join('\n') + '\n', 'utf8');
    process.stderr.write(`  ${category}.tsv — ${rows.length} entries\n`);
  }

  process.stderr.write(`Done. ${groups.size} files written to ${outputDir}\n`);
}

main();
