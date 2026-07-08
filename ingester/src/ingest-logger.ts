import fs from 'node:fs';
import { DEFAULT_INCLUDE_TYPES, proposedCategoryName } from './infobox-parser.js';
import type { IngestConfig } from './ingest-config.js';

export const ALL_CATEGORIES = [
  'person', 'event', 'place', 'artifact', 'pol_mil_organization',
  'business', 'historical_period', 'concepts', 'other',
] as const;

export type CategoryName = (typeof ALL_CATEGORIES)[number];

export interface ProgressCounts {
  considered: number;
  collected:  number;
  rejected:   number;
  byCategory: Record<string, number>;
}

export function zeroCounts(): ProgressCounts {
  const byCategory: Record<string, number> = {};
  for (const cat of ALL_CATEGORIES) byCategory[cat] = 0;
  return { considered: 0, collected: 0, rejected: 0, byCategory };
}

export interface Checkpoint {
  streamIdx:  number;
  byteOffset: number;
  counts:     ProgressCounts;
}

// The trailing `stride` column lets `readLastCheckpoint` reject checkpoints
// produced by a run with a different stride. Rows written before this column
// existed simply lack it and are treated as stride 1 (see readLastCheckpoint).
const STATUS_HEADER = [
  'status', 'timestamp', 'stream_idx', 'total_streams', 'stream_byte_offset',
  'considered', 'collected', 'rejected',
  ...ALL_CATEGORIES,
  'stride',
].join('\t');

const STRIDE_COL = 8 + ALL_CATEGORIES.length;

export class IngestLogger {
  private readonly statusPath: string;
  private readonly runsPath: string;
  private readonly statusFd: number;
  private readonly stride: number;

  constructor(statusPath: string, runsPath: string, stride = 1) {
    this.statusPath = statusPath;
    this.runsPath   = runsPath;
    this.stride     = stride;

    const isNew = !fs.existsSync(statusPath);
    this.statusFd = fs.openSync(statusPath, 'a');
    if (isNew) fs.writeSync(this.statusFd, STATUS_HEADER + '\n');
  }

  private writeRow(
    status: 'STARTING' | 'PROGRESSING' | 'STOPPING' | 'RESTARTING',
    streamIdx: number,
    totalStreams: number,
    byteOffset: number,
    counts: ProgressCounts,
  ): void {
    const row = [
      status,
      new Date().toISOString(),
      streamIdx,
      totalStreams,
      byteOffset,
      counts.considered,
      counts.collected,
      counts.rejected,
      ...ALL_CATEGORIES.map(c => counts.byCategory[c] ?? 0),
      this.stride,
    ].join('\t');
    fs.writeSync(this.statusFd, row + '\n');
    fs.fsyncSync(this.statusFd);
  }

  logStart(streamIdx: number, totalStreams: number, byteOffset: number, counts: ProgressCounts): void {
    this.writeRow('STARTING', streamIdx, totalStreams, byteOffset, counts);
  }

  logProgress(streamIdx: number, totalStreams: number, byteOffset: number, counts: ProgressCounts): void {
    this.writeRow('PROGRESSING', streamIdx, totalStreams, byteOffset, counts);
  }

  logStop(streamIdx: number, totalStreams: number, byteOffset: number, counts: ProgressCounts): void {
    this.writeRow('STOPPING', streamIdx, totalStreams, byteOffset, counts);
  }

  // RESTARTING row repurposes columns: stream_idx → new start stream, stream_byte_offset → new stride.
  logRestart(newStart: number, newStride: number, totalStreams: number, counts: ProgressCounts): void {
    this.writeRow('RESTARTING', newStart, totalStreams, newStride, counts);
  }

  // Appends one entry to the JSON runs log describing this run and its filters.
  logRun(config: IngestConfig, resumeFrom: Checkpoint | null): void {
    const includeByCategory: Record<string, string[]> = {};
    for (const t of DEFAULT_INCLUDE_TYPES) {
      const cat = proposedCategoryName(t);
      (includeByCategory[cat] ??= []).push(t);
    }

    const entry = {
      started_at:             new Date().toISOString(),
      resuming_from_stream:   resumeFrom?.streamIdx  ?? null,
      resuming_from_offset:   resumeFrom?.byteOffset ?? null,
      filters: {
        include_infoboxes:       includeByCategory,
        exclude_categories:      [...config.excludeCategories],
        date_after:              config.dateAfter,
        date_before:             config.dateBefore,
        stop_after_considering:  config.stopAfterConsidering,
        stop_after_collecting:   config.stopAfterCollecting,
      },
    };

    let runs: unknown[] = [];
    if (fs.existsSync(this.runsPath)) {
      try { runs = JSON.parse(fs.readFileSync(this.runsPath, 'utf8')) as unknown[]; } catch { /* first run */ }
    }
    runs.push(entry);
    fs.writeFileSync(this.runsPath, JSON.stringify(runs, null, 2) + '\n', 'utf8');
  }

  // Returns the most recent PROGRESSING or STOPPING checkpoint whose stride
  // matches `expectedStride`, or null if none exists. A checkpoint produced by a
  // run with a different stride is skipped, so a full run (stride 1) never
  // silently resumes against a sampled run's checkpoint (e.g. stride 100 near the
  // end of the dump). Rows lacking the stride column are treated as stride 1.
  readLastCheckpoint(expectedStride = 1): Checkpoint | null {
    if (!fs.existsSync(this.statusPath)) return null;
    const lines = fs.readFileSync(this.statusPath, 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 1; i--) {
      const cols = lines[i].split('\t');
      if (cols[0] !== 'PROGRESSING' && cols[0] !== 'STOPPING') continue;
      const rowStride = cols.length > STRIDE_COL ? (parseInt(cols[STRIDE_COL], 10) || 1) : 1;
      if (rowStride !== expectedStride) continue;
      const streamIdx  = parseInt(cols[2], 10);
      const byteOffset = parseInt(cols[4], 10);
      const considered = parseInt(cols[5], 10);
      const collected  = parseInt(cols[6], 10);
      const rejected   = parseInt(cols[7], 10);
      const byCategory: Record<string, number> = {};
      ALL_CATEGORIES.forEach((cat, j) => { byCategory[cat] = parseInt(cols[8 + j], 10) || 0; });
      return { streamIdx, byteOffset, counts: { considered, collected, rejected, byCategory } };
    }
    return null;
  }

  close(): void {
    fs.closeSync(this.statusFd);
  }
}
