import fs from 'node:fs';
import { DEFAULT_INCLUDE_TYPES } from './infobox-parser.js';

// Reads an existing catalog TSV and returns a Set of infobox types where
// include_in_future = 1. Falls back to DEFAULT_INCLUDE_TYPES on any error.
export function buildIncludeSetFromCatalog(catalogPath: string): Set<string> {
  try {
    const lines = fs.readFileSync(catalogPath, 'utf8').split('\n');
    const set = new Set<string>();
    // Skip header (index 0)
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      // Columns: infobox_type, proposed_category, count, was_included, include_in_future
      if (cols.length < 5) continue;
      const infoboxType    = cols[0].trim();
      const includeInFuture = cols[4].trim();
      if (infoboxType && includeInFuture === '1') set.add(infoboxType);
    }
    if (set.size === 0) {
      process.stderr.write(`[ingester] catalog_input produced empty include set — falling back to defaults\n`);
      return DEFAULT_INCLUDE_TYPES;
    }
    process.stderr.write(`[ingester] catalog_input: ${set.size} infobox types included\n`);
    return set;
  } catch (err) {
    process.stderr.write(`[ingester] catalog_input: failed to read ${catalogPath} — falling back to defaults\n`);
    return DEFAULT_INCLUDE_TYPES;
  }
}
