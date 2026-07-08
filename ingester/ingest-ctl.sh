#!/usr/bin/env bash
# ingest-ctl.sh — start / monitor / stop / auto-restart the Wikipedia ingester.
#
# Runs from the ingester/ directory. Reports status read-only (via `kill -0`
# liveness + the status log) without disturbing a running ingest.
#
# Subcommands:
#   start              launch (fresh, or --resume if a partial exists)
#   resume             force a --resume launch
#   stop               SIGTERM the ingester (immediate; leaves a resumable checkpoint)
#   status             one-shot read-only status report
#   watch [secs]       repeat status every N seconds (default 10)
#   supervise [max]    run to completion, auto-restarting on crash (default max 1000)
#
# The ingester renames the partial to the final output only on a full pass, so:
#   complete  <=>  final output exists AND partial does not.

set -u

cd "$(dirname "$0")" || exit 1

# ── Paths (match the ingester's defaults) ───────────────────────────────────
DUMP_GLOB='../en_wiki_download/'*'-pages-articles-multistream.xml.bz2'
IDX_GLOB='../en_wiki_download/'*'-pages-articles-multistream-index.txt.bz2'
PID_FILE='ingest.pid'
RUN_LOG='ingester-run.log'
STATUS_LOG='ingest_status.tsv'
PARTIAL='collected_entries.tsv.partial'
FINAL='collected_entries.tsv'
POLL_SECS=15
RESTART_BACKOFF_SECS=3

# ── Helpers ─────────────────────────────────────────────────────────────────

_resolve_inputs() {
  # Expand globs; require exactly one match each.
  local dumps idxs
  dumps=( $DUMP_GLOB ); idxs=( $IDX_GLOB )
  if [ ! -e "${dumps[0]:-}" ]; then echo "error: dump not found ($DUMP_GLOB)" >&2; return 1; fi
  if [ ! -e "${idxs[0]:-}"  ]; then echo "error: index not found ($IDX_GLOB)" >&2; return 1; fi
  DUMP="${dumps[0]}"; IDX="${idxs[0]}"
}

_pid() { [ -f "$PID_FILE" ] && cat "$PID_FILE" 2>/dev/null; }

_is_running() {
  # Non-disturbing liveness: signal 0 only checks existence.
  local p; p="$(_pid)"
  [ -n "$p" ] && kill -0 "$p" 2>/dev/null
}

_is_complete() { [ -f "$FINAL" ] && [ ! -f "$PARTIAL" ]; }

_launch() {
  _resolve_inputs || exit 1
  local args=( "$DUMP" "$IDX" )
  if [ -f "$PARTIAL" ]; then
    args+=( --resume )
    echo "[ctl] launching (resume; partial present)"
  else
    echo "[ctl] launching (fresh)"
  fi
  nohup node dist/index.js "${args[@]}" >> "$RUN_LOG" 2>&1 &
  echo $! > "$PID_FILE"
  echo "[ctl] pid $(cat "$PID_FILE"), logging to $RUN_LOG"
}

# ── Subcommands ─────────────────────────────────────────────────────────────

cmd_start() {
  if _is_complete; then echo "[ctl] already complete ($FINAL present, no partial)."; return 0; fi
  if _is_running; then echo "[ctl] already running (pid $(_pid))."; return 0; fi
  _launch
}

cmd_resume() {
  if _is_running; then echo "[ctl] already running (pid $(_pid))."; return 0; fi
  if [ ! -f "$PARTIAL" ]; then echo "[ctl] no partial to resume; use start."; return 1; fi
  _launch
}

cmd_stop() {
  if ! _is_running; then echo "[ctl] not running."; return 0; fi
  local p; p="$(_pid)"
  echo "[ctl] SIGTERM pid $p …"
  kill -TERM "$p" 2>/dev/null
  for _ in $(seq 1 20); do kill -0 "$p" 2>/dev/null || { echo "[ctl] stopped."; return 0; }; sleep 0.5; done
  echo "[ctl] still alive; SIGKILL."; kill -KILL "$p" 2>/dev/null
}

cmd_status() {
  # Read-only. No signals beyond kill -0.
  if _is_complete; then
    echo "state:     COMPLETE ($FINAL, $(wc -l < "$FINAL" 2>/dev/null | tr -d ' ') rows)"
  elif _is_running; then
    echo "state:     RUNNING (pid $(_pid))"
  else
    echo "state:     STOPPED (no live process)"
  fi

  if [ -f "$STATUS_LOG" ]; then
    tail -1 "$STATUS_LOG" | awk -F'\t' '
      {
        pct = ($4 > 0) ? sprintf("%.1f%%", $3*100/$4) : "?"
        printf "checkpoint: %s  stream %s/%s (%s)  stride %s\n", $1, $3, $4, pct, ($18==""?"1":$18)
        printf "counts:    considered %s  collected %s  rejected %s\n", $6, $7, $8
        printf "by-cat:    person %s  event %s  place %s  artifact %s  polmil %s  business %s  period %s  concepts %s  other %s\n", \
               $9,$10,$11,$12,$13,$14,$15,$16,$17
        printf "updated:   %s\n", $2
      }'
  else
    echo "checkpoint: (no status log yet)"
  fi

  if [ -f "$PARTIAL" ]; then
    echo "partial:   $PARTIAL ($(du -h "$PARTIAL" | cut -f1), $(wc -l < "$PARTIAL" | tr -d ' ') rows)"
  fi
}

cmd_watch() {
  local secs="${1:-10}"
  while true; do
    clear 2>/dev/null || true
    echo "=== ingest status @ $(date '+%H:%M:%S') (every ${secs}s; Ctrl-C to stop watching) ==="
    cmd_status
    _is_complete && { echo; echo "[ctl] complete."; break; }
    sleep "$secs"
  done
}

cmd_supervise() {
  local max="${1:-1000}" retries=0
  if _is_complete; then echo "[ctl] already complete."; return 0; fi
  _is_running || _launch
  echo "[ctl] supervising (max restarts: $max, poll ${POLL_SECS}s)"
  while true; do
    local p; p="$(_pid)"
    while [ -n "$p" ] && kill -0 "$p" 2>/dev/null; do sleep "$POLL_SECS"; done
    if _is_complete; then echo "[ctl] COMPLETE."; return 0; fi
    retries=$((retries + 1))
    if [ "$retries" -gt "$max" ]; then echo "[ctl] max restarts ($max) reached; giving up."; return 1; fi
    echo "[ctl] ingester exited without completing; restart $retries/$max after ${RESTART_BACKOFF_SECS}s."
    sleep "$RESTART_BACKOFF_SECS"
    _launch
  done
}

# ── Dispatch ────────────────────────────────────────────────────────────────

case "${1:-}" in
  start)     cmd_start ;;
  resume)    cmd_resume ;;
  stop)      cmd_stop ;;
  status)    cmd_status ;;
  watch)     shift; cmd_watch "$@" ;;
  supervise) shift; cmd_supervise "$@" ;;
  *)
    echo "usage: $0 {start|resume|stop|status|watch [secs]|supervise [maxRestarts]}" >&2
    exit 2 ;;
esac
