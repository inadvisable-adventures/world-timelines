import fs from 'node:fs';
import type { ArticleStream } from './types.js';
import { decodeBzip2 } from './bzip2-cli.js';

// Decompressed enwiki index is ~1.2 GB; give generous headroom.
const INDEX_MAX_BUFFER = 2 * 1024 * 1024 * 1024;

// Parse the multistream index bz2 file.
// The index contains lines: <byte_offset>:<article_id>:<title>
// Multiple consecutive lines with the same byte_offset belong to the same stream.
export function readMultistreamIndex(indexPath: string): ArticleStream[] {
  const rawBuf = fs.readFileSync(indexPath);
  const decompressed = decodeBzip2(rawBuf, INDEX_MAX_BUFFER);

  // The decompressed enwiki index can be several GB, exceeding Node's string
  // length limit. Parse line-by-line from the Buffer directly.
  const streamsMap = new Map<number, ArticleStream>();
  const lineRe = /^(\d+):(\d+):(.+)$/;
  let lineStart = 0;

  for (let i = 0; i <= decompressed.length; i++) {
    if (i === decompressed.length || decompressed[i] === 0x0a) {
      if (i > lineStart) {
        const end = decompressed[i - 1] === 0x0d ? i - 1 : i;
        const line = decompressed.subarray(lineStart, end).toString('utf8');
        const m = lineRe.exec(line);
        if (m) {
          const byteOffset = parseInt(m[1], 10);
          const articleId = parseInt(m[2], 10);
          const title = m[3];
          let stream = streamsMap.get(byteOffset);
          if (!stream) {
            stream = { byteOffset, articles: [] };
            streamsMap.set(byteOffset, stream);
          }
          stream.articles.push({ articleId, title });
        }
      }
      lineStart = i + 1;
    }
  }

  // Return sorted by byte offset
  return [...streamsMap.values()].sort((a, b) => a.byteOffset - b.byteOffset);
}

// Lightweight variant for passes that only need byte offsets (e.g. catalog-scan).
// Avoids storing article IDs and titles, which for enwiki amounts to ~2 GB of V8 heap.
export function readMultistreamOffsets(indexPath: string): number[] {
  const rawBuf = fs.readFileSync(indexPath);
  const decompressed = decodeBzip2(rawBuf, INDEX_MAX_BUFFER);

  const offsets = new Set<number>();
  let lineStart = 0;

  for (let i = 0; i <= decompressed.length; i++) {
    if (i === decompressed.length || decompressed[i] === 0x0a) {
      if (i > lineStart) {
        // Find the first colon to extract just the byte offset field.
        let colonIdx = -1;
        for (let j = lineStart; j < i; j++) {
          if (decompressed[j] === 0x3a) { colonIdx = j; break; }
        }
        if (colonIdx > lineStart) {
          const offset = parseInt(
            decompressed.subarray(lineStart, colonIdx).toString('ascii'), 10,
          );
          if (!isNaN(offset)) offsets.add(offset);
        }
      }
      lineStart = i + 1;
    }
  }

  return [...offsets].sort((a, b) => a - b);
}
