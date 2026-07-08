import fs from 'node:fs';
import { decodeBzip2 } from './bzip2-cli.js';

// Reads one bzip2 stream from the multistream dump, starting at byteOffset
// and ending at nextByteOffset (or EOF if null).
// Returns the decompressed XML string for that stream.
export function readStream(
  fd: number,
  fileSize: number,
  byteOffset: number,
  nextByteOffset: number | null,
): string {
  const streamSize =
    nextByteOffset !== null ? nextByteOffset - byteOffset : fileSize - byteOffset;

  if (streamSize <= 0) return '';

  const buf = Buffer.alloc(streamSize);
  const bytesRead = fs.readSync(fd, buf, 0, streamSize, byteOffset);
  if (bytesRead === 0) return '';

  const slice = bytesRead < streamSize ? buf.subarray(0, bytesRead) : buf;
  try {
    const decompressed = decodeBzip2(slice);
    return decompressed.toString('utf8');
  } catch (e) {
    process.stderr.write(`[bz2-reader] Decode error at offset ${byteOffset}: ${e}\n`);
    return '';
  }
}

export function openDump(dumpPath: string): { fd: number; fileSize: number } {
  const fd = fs.openSync(dumpPath, 'r');
  const { size: fileSize } = fs.fstatSync(fd);
  return { fd, fileSize };
}

export function closeDump(fd: number): void {
  fs.closeSync(fd);
}
