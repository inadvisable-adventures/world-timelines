import fs from 'node:fs';
import { readMultistreamOffsets } from './index-reader.js';

// Binary cache of the multistream index's unique stream byte-offsets, so that
// starts/restarts skip the ~25s bz2 decompress + parse of the 280 MB index.
//
// Layout (little-endian):
//   magic      4 bytes  ASCII 'WTOF'
//   version    uint32   = 1
//   srcSize    Float64  byte size of the source index file at build time
//   srcMtimeMs Float64  mtime (ms) of the source index file at build time
//   count      uint32   number of offsets
//   offsets    Float64 × count, ascending
//
// Byte offsets exceed 2^32 (max ~26.2e9), so Float64 (exact integers to 2^53)
// is used rather than uint32.

const MAGIC = 0x57544f46; // 'WTOF' big-endian read of the four bytes below
const VERSION = 1;
const HEADER_BYTES = 4 + 4 + 8 + 8 + 4; // 28

export const DEFAULT_OFFSET_CACHE = 'stream-offsets.bin';

// Attempts to read a valid cache for `indexPath`. Returns null if the cache is
// missing, malformed, a different version, or stale relative to the current
// size/mtime of the source index file.
export function loadOffsetCache(indexPath: string, cachePath: string): number[] | null {
  if (!fs.existsSync(cachePath)) return null;

  let buf: Buffer;
  let srcStat: fs.Stats;
  try {
    buf = fs.readFileSync(cachePath);
    srcStat = fs.statSync(indexPath);
  } catch {
    return null;
  }
  if (buf.length < HEADER_BYTES) return null;

  if (buf.readUInt32BE(0) !== MAGIC) return null;
  if (buf.readUInt32LE(4) !== VERSION) return null;
  const srcSize    = buf.readDoubleLE(8);
  const srcMtimeMs = buf.readDoubleLE(16);
  const count      = buf.readUInt32LE(24);

  if (srcSize !== srcStat.size) return null;
  if (srcMtimeMs !== srcStat.mtimeMs) return null;
  if (buf.length < HEADER_BYTES + count * 8) return null;

  const offsets = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    offsets[i] = buf.readDoubleLE(HEADER_BYTES + i * 8);
  }
  return offsets;
}

// Writes the offset cache for `indexPath` to `cachePath`.
export function writeOffsetCache(indexPath: string, cachePath: string, offsets: number[]): void {
  const srcStat = fs.statSync(indexPath);
  const buf = Buffer.allocUnsafe(HEADER_BYTES + offsets.length * 8);
  buf.writeUInt32BE(MAGIC, 0);
  buf.writeUInt32LE(VERSION, 4);
  buf.writeDoubleLE(srcStat.size, 8);
  buf.writeDoubleLE(srcStat.mtimeMs, 16);
  buf.writeUInt32LE(offsets.length, 24);
  for (let i = 0; i < offsets.length; i++) {
    buf.writeDoubleLE(offsets[i]!, HEADER_BYTES + i * 8);
  }
  fs.writeFileSync(cachePath, buf);
}

// Returns the stream byte-offsets for `indexPath`, using the binary cache when
// valid and otherwise decoding the bz2 index (and refreshing the cache). The
// cache is a transparent accelerator; the bz2 index remains the source of truth.
export function getStreamOffsets(indexPath: string, cachePath: string): number[] {
  const cached = loadOffsetCache(indexPath, cachePath);
  if (cached) {
    process.stderr.write(`[ingester] offset cache hit: ${cached.length} streams from ${cachePath}\n`);
    return cached;
  }
  process.stderr.write(`[ingester] offset cache miss — decoding index (${indexPath})…\n`);
  const offsets = readMultistreamOffsets(indexPath);
  try {
    writeOffsetCache(indexPath, cachePath, offsets);
    process.stderr.write(`[ingester] wrote offset cache: ${offsets.length} streams to ${cachePath}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[ingester] warning: failed to write offset cache: ${msg}\n`);
  }
  return offsets;
}
