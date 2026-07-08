import fs from 'node:fs';
import { openDump, closeDump, readStream } from './bz2-reader.js';
import { extractPages } from './xml-parser.js';
import { decodeBzip2 } from './bzip2-cli.js';

// Decompressed enwiki index is ~1.2 GB; give generous headroom.
export const INDEX_MAX_BUFFER = 2 * 1024 * 1024 * 1024;

// Scans the decompressed multistream index for a title, returning the byte
// offset of its stream and the offset of the following stream (or null if
// it's the last one). Avoids holding the full parsed index (title -> offset
// map) in memory — a single linear byte scan is enough for a one-off lookup.
export function findTitleInIndex(
  indexPath: string,
  targetTitle: string,
): { byteOffset: number; nextByteOffset: number | null } | null {
  process.stderr.write('[article-fetch] Decompressing index (this takes ~15-20s for enwiki)...\n');
  const rawBuf = fs.readFileSync(indexPath);
  const buf = decodeBzip2(rawBuf, INDEX_MAX_BUFFER);
  process.stderr.write('[article-fetch] Index decompressed, scanning for title...\n');

  let foundOffset: number | null = null;
  let lineStart = 0;

  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0x0a) {
      if (i > lineStart) {
        const end = buf[i - 1] === 0x0d ? i - 1 : i;
        // Format: byteOffset:articleId:title
        // Find first two colons using byte scan (avoids full toString per line).
        let c1 = -1;
        let c2 = -1;
        for (let j = lineStart; j < end; j++) {
          if (buf[j] === 0x3a) {
            if (c1 < 0) { c1 = j; }
            else { c2 = j; break; }
          }
        }
        if (c1 > lineStart && c2 > c1) {
          const offset = parseInt(buf.subarray(lineStart, c1).toString('ascii'), 10);
          if (!isNaN(offset)) {
            // If we already found the target and we've moved to the next stream, stop.
            if (foundOffset !== null && offset !== foundOffset) {
              return { byteOffset: foundOffset, nextByteOffset: offset };
            }
            const title = buf.subarray(c2 + 1, end).toString('utf8');
            if (title === targetTitle) {
              foundOffset = offset;
            }
          }
        }
      }
      lineStart = i + 1;
    }
  }

  return foundOffset !== null ? { byteOffset: foundOffset, nextByteOffset: null } : null;
}

// Fetches a single article's full wikitext by title, without scanning the
// full dump — decompresses the index once, then only the one dump stream
// (typically ~100 articles) that contains the target title.
export function fetchArticleWikitext(
  dumpPath: string,
  indexPath: string,
  targetTitle: string,
): string | null {
  const streamInfo = findTitleInIndex(indexPath, targetTitle);
  if (!streamInfo) return null;

  process.stderr.write(
    `[article-fetch] Found at byte offset ${streamInfo.byteOffset}` +
    (streamInfo.nextByteOffset !== null ? ` (next: ${streamInfo.nextByteOffset})` : ' (last stream)') +
    '\n',
  );

  const { fd, fileSize } = openDump(dumpPath);
  const xml = readStream(fd, fileSize, streamInfo.byteOffset, streamInfo.nextByteOffset);
  closeDump(fd);

  const pages = extractPages(xml);
  const page = pages.find(p => p.title === targetTitle);
  return page ? page.wikitext : null;
}
