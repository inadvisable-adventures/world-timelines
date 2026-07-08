/**
 * Build (or refresh) the stream-offset cache for the multistream index.
 *
 * Usage:
 *   node dist/build-offset-cache.js <index.txt.bz2> [cachePath]
 *
 * Decodes the bz2 index once and writes a compact binary cache of stream
 * byte-offsets so subsequent ingester starts load them in <1s instead of
 * re-decoding the ~280 MB index (~25s).
 */

import { getStreamOffsets, DEFAULT_OFFSET_CACHE } from './offset-cache.js';

function main(): void {
  const [indexPath, cacheArg] = process.argv.slice(2);
  if (!indexPath) {
    process.stderr.write('Usage: build-offset-cache <index.txt.bz2> [cachePath]\n');
    process.exit(2);
  }
  const cachePath = cacheArg ?? DEFAULT_OFFSET_CACHE;

  const t0 = Date.now();
  const offsets = getStreamOffsets(indexPath, cachePath);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const maxOffset = offsets.length > 0 ? offsets[offsets.length - 1] : 0;

  process.stderr.write(
    `[build-offset-cache] ${offsets.length} streams, max offset ${maxOffset}, ${secs}s → ${cachePath}\n`,
  );
}

main();
