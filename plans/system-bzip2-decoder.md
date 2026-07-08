# Swap seek-bzip for System bzip2 (TODO #46) — COMPLETED

## Summary

Replace the `seek-bzip` npm package (a pure-JS bzip2 decoder) with shelling out to
the system `bzip2` binary via `child_process`. Measured evidence: `bzcat` on the
280MB multistream index decompresses in ~18s vs. ~44s for `seek-bzip.decode` on
the same file — a large, free speedup, since the bottleneck is decompression
throughput, not anything about Node/V8 itself. Bzip2's concatenated-stream
support is a native, documented feature of the format (verified directly: `dd`
+ `bzcat` on a single extracted stream range decoded correctly), so no
multistream-specific handling is needed — we already compute stream byte
offsets from the index ourselves.

## Affected Files

- `ingester/src/bzip2-cli.ts` — **new**: shared helper wrapping `bzip2 -dc` via `spawnSync`
- `ingester/src/bz2-reader.ts` — per-stream decode (small buffers, ~1-10MB)
- `ingester/src/index-reader.ts` — full-index decode (large buffer, ~1.2GB decompressed), two call sites
- `ingester/src/lookup.ts` — has its own inline index-decode duplicate of `index-reader.ts`'s logic; switch to the shared helper
- `ingester/package.json` — remove `seek-bzip` dependency
- `design-docs/poc-design.md` — update the "seek-bzip" section to describe the system-binary approach

## Implementation

### ingester/src/bzip2-cli.ts (new)

```ts
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
```

`maxBuffer` defaults to 256MB (comfortably above any single dump stream's
decompressed size). The full-index decode in `index-reader.ts` passes an
explicit larger value (2GB — decompressed index is ~1.2GB).

### ingester/src/bz2-reader.ts
Remove the `createRequire`/`seekBzip` import. In `readStream`, replace
`seekBzip.decode(slice)` with `decodeBzip2(slice)`. Keep the existing
try/catch around it (rename the caught-error log message from "Decode error"
generically, still fine as-is).

### ingester/src/index-reader.ts
Remove the `createRequire`/`seekBzip` import. Replace both
`seekBzip.decode(rawBuf)` calls (in `readMultistreamIndex` and
`readMultistreamOffsets`) with `decodeBzip2(rawBuf, 2 * 1024 * 1024 * 1024)`.

### ingester/src/lookup.ts
Remove its local `createRequire`/`seekBzip` duplicate and the inline
`seekBzip.decode(rawBuf)` call in `findTitleInIndex`; use the shared
`decodeBzip2` from `bzip2-cli.ts` instead (same 2GB maxBuffer as
`index-reader.ts`, since it decompresses the same index file).

### ingester/package.json
Remove `"seek-bzip": "^1.0.6"` from `dependencies`. Run `npm uninstall
seek-bzip` to also update `package-lock.json` and remove it from
`node_modules`.

### design-docs/poc-design.md
Update the "seek-bzip" subsection (and the two "Approach" bullet points that
name `seek-bzip`) to describe shelling out to the system `bzip2` binary
instead of a bundled npm package.

## Verification

- `npm run build` — clean strict-mode compile.
- `npm run lookup -- ../test-data/simplewiki-dump.xml.bz2 ../test-data/simplewiki-index.txt.bz2 "<some known title>"` — confirms end-to-end single-article lookup still works through the new decoder path.
- Re-run the full ingester against `test-data/` (small dump) and diff row count / spot-check a few rows against a pre-swap run to confirm no behavioral change, only speed.
- No browser verification needed — this is a backend/ingester-only change with no UI surface.

## Risk / Tradeoff

- Adds a hard runtime dependency on the `bzip2` binary being present on PATH (true of essentially all Unix systems, including this one — verified via `which bzip2`). This trades "any Node.js host can run it" for "must have bzip2 installed," which is an acceptable tradeoff for a local ingestion tool that already assumes a Unix-like dev environment, and removes an npm dependency in the process (net dependency count goes down, consistent with the project's "avoid adding dependencies" preference).
