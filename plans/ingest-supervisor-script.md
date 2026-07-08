# Ingestion supervisor script (#59) — COMPLETED

## Summary

Provide a single bespoke bash script, `ingester/ingest-ctl.sh`, to start,
monitor, gracefully stop, and auto-restart the ingester, plus report status
**without disturbing the running process**. This replaces ad-hoc
`node dist/index.js … &` invocations and gives a reliable way to run the full
ingest to completion across crashes.

## Affected Files

- `ingester/ingest-ctl.sh` — new (executable)
- `ingester/.gitignore` — new: ignore `ingest.pid`, `ingester-run.log`
- `design-docs/poc-design.md` — document the supervisor workflow

## Design

Bash, no dependencies. Runs from `ingester/`. Paths: dump + index under
`../en_wiki_download/`, PID file `ingest.pid`, run log `ingester-run.log`,
status log `ingest_status.tsv`, partial `collected_entries.tsv.partial`, final
`collected_entries.tsv`.

### Launch decision (`_launch`)

- If `collected_entries.tsv.partial` exists ⇒ pass `--resume` (continue).
- Else ⇒ fresh start.
- `nohup node dist/index.js <dump> <index> [--resume] >> ingester-run.log 2>&1 &`
  then write `$!` to `ingest.pid`.

### Subcommands

- **`start`** — refuse if already running (pid alive) or already complete
  (final output present, partial absent). Otherwise `_launch`.
- **`resume`** — force `_launch` with `--resume` if a partial exists.
- **`stop`** — `kill -TERM` the pid (triggers #58 graceful shutdown), wait for
  exit, report. Leaves a resumable checkpoint.
- **`status`** — **read-only.** Report:
  - running? via `kill -0 $pid` (signal 0 does not disturb the process),
  - last status-log row parsed into: state, stream_idx/total (+percent),
    considered / collected / rejected, per-category collected,
  - partial file size, and whether the run is complete.
  Never signals beyond `kill -0`, never reads/locks the process.
- **`watch [secs]`** — loop `status` every N seconds (default 10); pure reads.
- **`supervise [maxRetries]`** — the run-to-completion mode:
  1. If complete, exit 0.
  2. `_launch`; record pid.
  3. Poll `kill -0 $pid` every ~15s. When the process exits:
     - if complete (partial gone, final present) ⇒ done, exit 0;
     - else if retries remain ⇒ `_launch --resume`, decrement;
     - else ⇒ exit non-zero.
  Backs off briefly between restarts to avoid thrash.

### Completion detection

The ingester renames `…partial` → final `collected_entries.tsv` only on a full
pass. So: **complete ⇔ final output exists AND partial does not.** This is the
single authoritative signal used by `start`, `status`, and `supervise`.

### Non-disturbing status

Liveness uses `kill -0` (existence check, no effect on the target). All status
data comes from the status log, the pid file, and `stat` of the output files —
never from touching the process's stdio or sending real signals.

## Key Decisions

- **Bash, not Node** — the supervisor must outlive and observe the Node process;
  a sibling shell is the natural fit and adds no dependency.
- **Partial-presence completion signal** — reuses existing ingester behavior
  (rename-on-complete); no new state file to keep in sync.
- **`supervise` for the actual run** — satisfies "run ingestion using the new
  script" and provides crash resilience for the multi-hour full pass.

## Verification

- `bash -n ingest-ctl.sh` parses clean; `chmod +x`.
- `ingest-ctl.sh status` on the current killed run reports "stopped, 68%,
  ~638k collected, partial 188 MB" without starting anything.
- `ingest-ctl.sh supervise` resumes from the checkpoint and runs; `status` in a
  second shell reports live progress without disturbing it.
- Killing the node pid mid-run triggers an automatic `--resume` restart.
