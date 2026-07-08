# Ingest restart reliability & checkpoint compatibility (#58) — COMPLETED

> **Implementation note (revised from original plan):** In-process graceful
> signal handling proved infeasible. The main loop is CPU-bound and fully
> synchronous (a `bzip2` `spawnSync` per stream) and never yields to the event
> loop, so a JS `SIGTERM`/`SIGINT` handler is starved and never runs — and merely
> *registering* a handler overrides Node's default terminate action, so an
> undeliverable signal turns into a hang (verified: the process ignored SIGTERM
> for >12s). Adding periodic `await setImmediate` yields did not help, because the
> process spends ~100% of wall-clock inside the blocking `spawnSync`.
>
> Resolution: **leave SIGINT/SIGTERM at their default (immediate termination)**
> and guarantee resumability through the existing frequent, `fsync`'d PROGRESSING
> checkpoints (written every ≥100 considered). A kill loses at most ~100
> considered articles; `--resume` continues from the last checkpoint. Part (a)
> below is therefore delivered as "kill-safe via checkpoints + a synchronous
> error finalizer" rather than a signal handler. Part (b), stride-aware resume,
> is implemented as originally planned and is the substantive correctness fix.

## Summary

Two reliability gaps make restarting a long ingest riskier than it should be:

1. **Ungraceful kill loses progress.** Checkpoints (PROGRESSING rows) are only
   written every ≥100 considered articles, and the partial output is only
   fsynced at those points. A `SIGTERM`/`SIGINT` (or the OS killing the process,
   as just happened at stream 173,460) drops everything since the last
   checkpoint and leaves no clean STOPPING marker.

2. **Incompatible resume is silent and catastrophic.** `--resume` reads the last
   PROGRESSING/STOPPING checkpoint regardless of the stride it was produced with.
   Resuming a full run (stride 1) against a *sampled* run's checkpoint (stride
   100, streamIdx 255,152) would set the start index near the end of the dump and
   silently skip almost everything.

## Affected Files

- `ingester/src/ingest-logger.ts` — stride column; stride-aware `readLastCheckpoint`
- `ingester/src/index.ts` — pass stride to checkpoint read; signal/error handlers
- `design-docs/poc-design.md` — document graceful shutdown + resume compatibility

## Design

### 1. Graceful shutdown

Wrap the main loop so that on `SIGINT`, `SIGTERM`, or an uncaught error in the
loop, the ingester:

1. Flushes and `fsync`s the partial output fd.
2. Writes a `STOPPING` checkpoint row at the current `lastStreamIdx` / counts.
3. Closes the logger and exits non-zero (so the supervisor knows it was
   interrupted, not completed).

Implement by extracting the per-stream loop body enough that a shared
`finalizeInterrupted()` closure can see `partialFd`, `logger`, `lastStreamIdx`,
and `counts`. Register handlers once, before the loop. Guard against
double-finalize with a boolean.

This bounds worst-case lost work to the single in-flight stream rather than up
to 100 considered articles, and always leaves a resumable checkpoint.

### 2. Stride-aware resume

- Add a trailing `stride` column to the status-log rows (schema extension;
  older rows simply lack it).
- `IngestLogger` learns the current stride (constructor arg or setter) and writes
  it on every row.
- `readLastCheckpoint(expectedStride)` parses the stride column, **defaulting a
  missing value to 1**, and returns the most recent checkpoint whose stride
  equals `expectedStride`. Non-matching checkpoints are skipped; if none match it
  returns `null` (fresh start) with a stderr warning.

Defaulting missing→1 is deliberate: the current recoverable partial (the killed
full run, stride 1, streamIdx 173,460) predates the new column, and we want
`--resume` to still pick it up. Older sampled rows are further back in the log
and never reached. Going forward, an explicit stride mismatch is caught.

## Key Decisions

- **`kill -0` liveness and SIGTERM stay the supervisor's job** (#59); this item
  only makes the ingester *respond* to SIGTERM cleanly.
- **Do not rotate/clear the status log** — preserving history keeps the killed
  run's checkpoint usable. Compatibility is enforced by stride matching instead.
- Exit code: 0 only on full completion (partial promoted to final); non-zero on
  any interrupted/stopped run, so the supervisor can distinguish done vs. resume.

## Verification

- `npm run build` passes.
- Unit-style check: append a synthetic stride-100 STOPPING row after a stride-1
  PROGRESSING row; `readLastCheckpoint(1)` returns the stride-1 row, `(100)`
  returns the stride-100 row. (Verify via a short node snippet, then remove it.)
- Start the ingester, send SIGTERM after a few checkpoints; confirm a STOPPING
  row is appended and the partial is intact; `--resume` continues from it.
