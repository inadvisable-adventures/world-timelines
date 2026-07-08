/**
 * World Timelines Ingester — incremental mode
 *
 * Usage:
 *   node dist/index.js <dump.xml.bz2> <index.txt.bz2> [options]
 *
 * Options:
 *   --resume             resume from the last checkpoint in --status-log
 *   --output <path>      final collected entries TSV (default: collected_entries.tsv)
 *   --partial <path>     intermediate file kept during ingestion (default: <output>.partial)
 *   --config <path>      filter config TSV (default: ingest.config.tsv)
 *   --status-log <path>  STARTING/PROGRESSING/STOPPING log (default: ingest_status.tsv)
 *   --runs-log <path>    per-run JSON log (default: ingest_runs.json)
 *   --catalog <path>     infobox catalog TSV output (default: infobox-catalog.tsv)
 */

import fs from 'node:fs';
import { openDump, closeDump, readStream } from './bz2-reader.js';
import { getStreamOffsets, DEFAULT_OFFSET_CACHE } from './offset-cache.js';
import { extractPages } from './xml-parser.js';
import {
  extractInfoboxTypes,
  extractLocations,
  extractDates,
  extractDescription,
  categoryFromInfoboxType,
  DEFAULT_INCLUDE_TYPES,
} from './infobox-parser.js';
import { InboxCatalog } from './infobox-catalog.js';
import { TSV_HEADER, tsvRow } from './tsv-writer.js';
import { parseIngestConfig } from './ingest-config.js';
import { buildIncludeSetFromCatalog } from './catalog-include.js';
import { IngestLogger, zeroCounts } from './ingest-logger.js';
import type { ExtractedEvent } from './types.js';

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

interface ParsedArgs {
  dumpPath:      string;
  indexPath:     string;
  // null means "not set on CLI" — config file or hardcoded default will fill in
  outputPath:    string | null;
  partialPath:   string | null;
  configPath:    string;
  statusLogPath: string | null;
  runsLogPath:   string | null;
  catalogPath:   string | null;
  resume:        boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];

  function takeFlag(f: string): boolean {
    const i = args.indexOf(f);
    if (i < 0) return false;
    args.splice(i, 1);
    return true;
  }
  function takeOpt(f: string): string | null {
    const i = args.indexOf(f);
    if (i < 0) return null;
    const val = args[i + 1] ?? null;
    args.splice(i, 2);
    return val;
  }
  function takeOptWithDefault(f: string, def: string): string {
    const i = args.indexOf(f);
    if (i < 0) return def;
    const val = args[i + 1] ?? def;
    args.splice(i, 2);
    return val;
  }

  const resume        = takeFlag('--resume');
  const outputPath    = takeOpt('--output');
  const partialPath   = takeOpt('--partial');
  const configPath    = takeOptWithDefault('--config', 'ingest.config.tsv');
  const statusLogPath = takeOpt('--status-log');
  const runsLogPath   = takeOpt('--runs-log');
  const catalogPath   = takeOpt('--catalog');

  const positional = args.filter(a => !a.startsWith('-'));
  const [dumpPath, indexPath] = positional;

  if (!dumpPath || !indexPath) {
    process.stderr.write(
      'Usage: node dist/index.js <dump.xml.bz2> <index.txt.bz2> [options]\n' +
      '  --resume             resume from last checkpoint\n' +
      '  --output <path>      final collected entries TSV (default: collected_entries.tsv)\n' +
      '  --partial <path>     intermediate file (default: <output>.partial)\n' +
      '  --config <path>      filter config TSV (default: ingest.config.tsv)\n' +
      '  --status-log <path>  status log (default: ingest_status.tsv)\n' +
      '  --runs-log <path>    runs JSON log (default: ingest_runs.json)\n' +
      '  --catalog <path>     catalog output (default: infobox-catalog.tsv)\n',
    );
    process.exit(1);
  }

  return { dumpPath, indexPath, outputPath, partialPath, configPath, statusLogPath, runsLogPath, catalogPath, resume };
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));

  // ── Config ───────────────────────────────────────────────────────────────
  // Parse config first so its path settings can fill in any unset CLI flags.
  const config = parseIngestConfig(parsed.configPath);
  process.stderr.write(`[ingester] Config: ${parsed.configPath}\n`);

  // Build include-types set: catalog_input overrides DEFAULT_INCLUDE_TYPES when provided.
  const includeTypes = config.catalogInput
    ? buildIncludeSetFromCatalog(config.catalogInput)
    : DEFAULT_INCLUDE_TYPES;

  // Priority: explicit CLI flag > config file setting > hardcoded default.
  const outputPath    = parsed.outputPath    ?? config.outputPath    ?? 'collected_entries.tsv';
  const partialPath   = parsed.partialPath   ?? config.partialPath   ?? outputPath + '.partial';
  const statusLogPath = parsed.statusLogPath ?? config.statusLogPath ?? 'ingest_status.tsv';
  const runsLogPath   = parsed.runsLogPath   ?? config.runsLogPath   ?? 'ingest_runs.json';
  const catalogPath   = parsed.catalogPath   ?? config.catalogPath   ?? 'infobox-catalog.tsv';
  const offsetCache   = config.offsetCache   ?? DEFAULT_OFFSET_CACHE;
  const { dumpPath, indexPath, resume } = parsed;

  // ── Logger + checkpoint ──────────────────────────────────────────────────
  const stride = config.streamStride;
  const logger = new IngestLogger(statusLogPath, runsLogPath, stride);
  // Only resume from a checkpoint produced with the same stride, so a full run
  // never picks up an incompatible sampled-run checkpoint.
  const checkpoint = resume ? logger.readLastCheckpoint(stride) : null;
  if (resume && !checkpoint) {
    process.stderr.write('[ingester] --resume: no matching checkpoint found, starting from stream 0\n');
  }
  logger.logRun(config, checkpoint);

  // ── Index ────────────────────────────────────────────────────────────────
  process.stderr.write('[ingester] Reading index…\n');
  const offsets = getStreamOffsets(indexPath, offsetCache);
  const totalStreams = offsets.length;
  process.stderr.write(`[ingester] ${totalStreams} streams\n`);

  const startStreamIdx = checkpoint ? checkpoint.streamIdx + stride : 0;

  // ── Partial output ────────────────────────────────────────────────────────
  // Open for append if resuming (header already present), write if fresh.
  const partialFd = fs.openSync(partialPath, checkpoint ? 'a' : 'w');
  if (!checkpoint) fs.writeSync(partialFd, TSV_HEADER + '\n');

  // ── Counts ───────────────────────────────────────────────────────────────
  const counts = checkpoint
    ? { ...checkpoint.counts, byCategory: { ...checkpoint.counts.byCategory } }
    : zeroCounts();

  logger.logStart(
    startStreamIdx,
    totalStreams,
    offsets[startStreamIdx] ?? 0,
    counts,
  );

  // ── Main loop ─────────────────────────────────────────────────────────────
  const { fd: dumpFd, fileSize } = openDump(dumpPath);
  const catalog = new InboxCatalog(includeTypes);
  let lastLoggedConsidered = counts.considered;
  let lastStreamIdx = startStreamIdx - stride;
  let stopReason: string | null = null;

  // Mutable per-pass state for adaptive restart.
  let currentStride = stride;
  let currentStart  = startStreamIdx;
  // Each restart increments the start offset by 1 (relative to stream 0).
  // On resume we skip restarts — the checkpoint already covers prior passes.
  let restartOffset  = 0;
  let restartsLeft   = checkpoint ? 0 : config.maxRestarts;

  // ── Interruption handling ──────────────────────────────────────────────────
  // The main loop is CPU-bound and fully synchronous (a bzip2 spawnSync per
  // stream), so it never yields to the event loop. That makes JS signal handlers
  // unreliable — worse, registering one overrides the default terminate action,
  // so a SIGTERM that can't be scheduled turns into a hang. We therefore leave
  // SIGINT/SIGTERM at their default (immediate termination) and guarantee
  // resumability via frequent, fsync'd PROGRESSING checkpoints (see the
  // checkpoint below): a kill loses at most ~100 considered articles, and
  // `--resume` continues from the last checkpoint.
  //
  // The try/catch here handles a *synchronous* fault (e.g. a malformed stream):
  // it flushes the partial, writes a STOPPING checkpoint, and exits non-zero so
  // the run stays resumable and the supervisor can distinguish it from success.
  const finalizeError = (reason: string): void => {
    try { fs.fsyncSync(partialFd); fs.closeSync(partialFd); } catch { /* already closed */ }
    try { closeDump(dumpFd); } catch { /* already closed */ }
    const stopOffset = offsets[Math.max(0, lastStreamIdx)] ?? 0;
    logger.logStop(lastStreamIdx, totalStreams, stopOffset, counts);
    logger.close();
    try { fs.writeFileSync(catalogPath, catalog.toTsv(), 'utf8'); } catch { /* best effort */ }
    process.stderr.write(
      `[ingester] Aborted (${reason}) at stream ${lastStreamIdx}. ` +
      `Partial output: ${partialPath}. Resume with --resume.\n`,
    );
    process.exit(1);
  };

  try {
  restart: while (true) {
    outer: for (let i = currentStart; i < totalStreams; i += currentStride) {
      const byteOffset = offsets[i]!;
      const nextOffset = i + 1 < totalStreams ? offsets[i + 1] : null;

      const xmlChunk = readStream(dumpFd, fileSize, byteOffset, nextOffset);
      if (!xmlChunk) { lastStreamIdx = i; continue; }

      for (const page of extractPages(xmlChunk)) {
        const infoboxTypes = extractInfoboxTypes(page.wikitext);

        // Record all types in catalog regardless of whether we collect this page.
        const wasIncluded = infoboxTypes.some(t => includeTypes.has(t));
        for (const t of infoboxTypes) catalog.record(t, wasIncluded);

        // Only articles with an included infobox type enter the considered/rejected tally.
        const primaryType = infoboxTypes.find(t => includeTypes.has(t));
        if (!primaryType) continue;

        counts.considered++;

        // ── Filters ──────────────────────────────────────────────────────
        const category = categoryFromInfoboxType(primaryType);

        if (config.excludeCategories.has(category)) { counts.rejected++; continue; }

        const locations = extractLocations(page.wikitext);
        if (config.excludeNoCoords && locations.length === 0) { counts.rejected++; continue; }

        const { startDate, endDate } = extractDates(page.wikitext, category);
        if (!startDate) { counts.rejected++; continue; }

        if (config.dateAfter  !== null && startDate.startYear < config.dateAfter)  { counts.rejected++; continue; }
        if (config.dateBefore !== null && startDate.startYear > config.dateBefore) { counts.rejected++; continue; }

        // Per-infobox-type birth-year cap (e.g. person/officeholder born ≤ 1899).
        // For a person/officeholder infobox, startDate is the birth_date field.
        const birthCap = config.maxBirthYearByType.get(primaryType);
        if (birthCap !== undefined && startDate.startYear > birthCap) { counts.rejected++; continue; }

        // ── Collect ──────────────────────────────────────────────────────
        const event: ExtractedEvent = {
          id:          slugify(page.title),
          title:       page.title,
          locations,
          startDate,
          endDate,
          category,
          infoboxType: primaryType,
          description: extractDescription(page.wikitext),
          tags:        locations.length === 0 ? ['no-coords-found'] : [],
        };

        fs.writeSync(partialFd, tsvRow(event) + '\n');
        counts.collected++;
        counts.byCategory[category] = (counts.byCategory[category] ?? 0) + 1;

        if (config.stopAfterCollecting !== null && counts.collected >= config.stopAfterCollecting) {
          stopReason = `stop_after_collecting ${config.stopAfterCollecting} reached`;
          lastStreamIdx = i;
          break outer;
        }
      }

      lastStreamIdx = i;

      // ── Progress checkpoint (at stream boundary, ≥100 considered since last) ──
      if (counts.considered - lastLoggedConsidered >= 100) {
        fs.fsyncSync(partialFd);
        logger.logProgress(i, totalStreams, byteOffset, counts);
        lastLoggedConsidered = counts.considered;
      }

      if (config.stopAfterConsidering !== null && counts.considered >= config.stopAfterConsidering) {
        stopReason = `stop_after_considering ${config.stopAfterConsidering} reached`;
        break;
      }
    }

    // ── Restart check ─────────────────────────────────────────────────────
    // Only restart if the pass completed naturally and still under the collect limit.
    if (stopReason !== null) break;
    if (config.stopAfterCollecting === null || counts.collected >= config.stopAfterCollecting) break;
    if (restartsLeft <= 0) break;

    restartsLeft--;
    currentStride = Math.ceil(currentStride / 2);
    restartOffset++;
    currentStart = restartOffset;

    logger.logRestart(currentStart, currentStride, totalStreams, counts);
    process.stderr.write(
      `[ingester] Restarting (${config.maxRestarts - restartsLeft}/${config.maxRestarts}): ` +
      `stride=${currentStride} start=${currentStart} collected=${counts.collected}\n`,
    );
  }
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    process.stderr.write(`[ingester] Uncaught error in main loop: ${msg}\n`);
    finalizeError('error');
    return;
  }

  // ── Finalize ──────────────────────────────────────────────────────────────
  closeDump(dumpFd);
  fs.fsyncSync(partialFd);
  fs.closeSync(partialFd);

  const stopOffset = offsets[Math.max(0, lastStreamIdx)] ?? 0;
  logger.logStop(lastStreamIdx, totalStreams, stopOffset, counts);
  logger.close();

  fs.writeFileSync(catalogPath, catalog.toTsv(), 'utf8');

  if (!stopReason) {
    // Completed all streams — promote partial to final output.
    fs.renameSync(partialPath, outputPath);
    process.stderr.write(`[ingester] Complete. Output: ${outputPath}\n`);
  } else {
    process.stderr.write(`[ingester] Stopped: ${stopReason}. Partial output: ${partialPath}\n`);
    process.stderr.write(`[ingester] Resume with: --resume (add to your command)\n`);
  }

  process.stderr.write(
    `[ingester] considered=${counts.considered} collected=${counts.collected} rejected=${counts.rejected}\n`,
  );
  for (const [cat, n] of Object.entries(counts.byCategory)) {
    if (n > 0) process.stderr.write(`  ${cat}: ${n}\n`);
  }
}

main();
