# Cached stream-offset index (#57) — COMPLETED

## Summary

Every ingester start/restart spends ~25s decompressing the 280 MB multistream
bz2 index and parsing its ~24M lines just to recover the 255,166 unique stream
byte-offsets that drive the main loop (measured: `readMultistreamOffsets` =
25.3s). For a supervised run that may restart on crashes, this is repeated dead
time before any work resumes.

Pre-process the index once into a compact binary offset cache and load from it
on subsequent starts. Loading ~2 MB of packed Float64 offsets is sub-second,
cutting restart overhead from ~25s to <1s.

## Affected Files

- `ingester/src/offset-cache.ts` — new: read/write/validate the binary cache
- `ingester/src/build-offset-cache.ts` — new: standalone eager-build script
- `ingester/src/index.ts` — use `getStreamOffsets()` instead of `readMultistreamOffsets()`
- `ingester/src/ingest-config.ts` — new optional `offset_cache` path setting
- `ingester/ingest.config.tsv` — document the `offset_cache` key
- `ingester/package.json` — add `build-offset-cache` npm script
- `.gitignore` — ignore `ingester/stream-offsets.bin`
- `design-docs/poc-design.md` — document the cache step

## Design

### Cache format (`stream-offsets.bin`)

Little-endian binary:

| bytes | field        | notes                                             |
|-------|--------------|---------------------------------------------------|
| 4     | magic        | ASCII `WTOF`                                       |
| 4     | version      | uint32 = 1                                         |
| 8     | src size     | Float64 — byte size of the source index file      |
| 8     | src mtimeMs  | Float64 — mtime of the source index file          |
| 4     | count        | uint32 — number of offsets                         |
| 8×N   | offsets      | Float64 each, sorted ascending                     |

Offsets exceed 2³² (max ≈ 26.2e9), so Float64 (exact integers to 2⁵³) is used
rather than uint32. `count × 8` ≈ 2 MB.

### `offset-cache.ts`

- `cachePathFor(configPath | default): string` — default `stream-offsets.bin` in CWD.
- `loadOffsetCache(indexPath, cachePath): number[] | null` — returns offsets iff
  the cache exists, the magic/version match, and the stored src size+mtimeMs
  equal the current `fs.stat` of `indexPath` (stale/missing ⇒ `null`).
- `writeOffsetCache(indexPath, cachePath, offsets): void`.
- `getStreamOffsets(indexPath, cachePath): number[]` — try `loadOffsetCache`; on
  miss, `readMultistreamOffsets` (existing bz2 path), then `writeOffsetCache`,
  then return. Writes a one-line stderr note saying whether it hit or rebuilt.

### `build-offset-cache.ts`

CLI: `node dist/build-offset-cache.js <index.bz2> [cachePath]`. Calls
`getStreamOffsets`, prints count, max offset, and elapsed time. Idempotent.

### `index.ts` wiring

Replace `const offsets = readMultistreamOffsets(indexPath)` with
`const offsets = getStreamOffsets(indexPath, cachePath)` where `cachePath =
config.offsetCache ?? 'stream-offsets.bin'`.

## Key Decisions

- **Validate by source size + mtime**, not a content hash — stat is instant and
  the index file is immutable once downloaded. A mismatch simply rebuilds.
- **Cache in the ingester CWD, not `en_wiki_download/`** — that dir holds
  read-only source inputs; derived artifacts live with the ingester and are
  gitignored.
- Keep `readMultistreamOffsets` as the source of truth; the cache is a
  transparent accelerator, never the only path.

## Verification

- `npm run build` passes.
- `npm run build-offset-cache -- ../en_wiki_download/…index.txt.bz2` creates
  `stream-offsets.bin` (~2 MB), reports count 255166, max 26207713291.
- Re-running the script loads from cache in <1s (stderr says "cache hit").
- A normal ingester start logs the cache hit instead of a 25s index read.
