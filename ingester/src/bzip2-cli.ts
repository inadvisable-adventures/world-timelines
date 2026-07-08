import { spawnSync } from 'node:child_process';

// Shells out to the system `bzip2` binary to decompress a buffer. Bzip2
// natively supports concatenated streams, but we don't rely on that — each
// buffer passed in is already a single, self-contained bzip2 stream sliced
// out by byte offset (see bz2-reader.ts / index-reader.ts).
export function decodeBzip2(input: Buffer, maxBuffer = 256 * 1024 * 1024): Buffer {
  const result = spawnSync('bzip2', ['-dc'], { input, maxBuffer });
  if (result.error) {
    throw new Error(`bzip2 decode failed to spawn: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`bzip2 decode exited ${result.status}: ${result.stderr.toString('utf8')}`);
  }
  return result.stdout;
}
