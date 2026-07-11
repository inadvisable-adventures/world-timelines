#!/usr/bin/env bash
# Initializes (or reuses) a self-contained local PostgreSQL cluster, applies
# db/schema.sql, and seeds it from the existing static data files. Safe to
# re-run: it never drops the database, only truncates and reloads the data
# rows (see plans/db-init-script.md).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$REPO_ROOT/db/.pgdata"
DBNAME="world_timelines"

if [ -x /opt/homebrew/opt/postgresql@18/bin/pg_ctl ]; then
  PG_BIN=/opt/homebrew/opt/postgresql@18/bin
elif command -v pg_ctl >/dev/null 2>&1; then
  PG_BIN="$(dirname "$(command -v pg_ctl)")"
else
  echo "error: no PostgreSQL install found. See plans/install-local-postgres.md (brew install postgresql@18 postgis)." >&2
  exit 1
fi
export PATH="$PG_BIN:$PATH"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "==> Initializing new Postgres cluster at $PGDATA"
  initdb --locale=en_US.UTF-8 -E UTF-8 -D "$PGDATA"
fi

if ! pg_ctl status -D "$PGDATA" >/dev/null 2>&1; then
  echo "==> Starting Postgres (unix socket only, in $PGDATA)"
  pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -o "-k $PGDATA -h ''" start
  for _ in $(seq 1 30); do
    if pg_isready -h "$PGDATA" >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
fi

if ! pg_isready -h "$PGDATA" >/dev/null 2>&1; then
  echo "error: Postgres did not become ready; check $PGDATA/postgres.log" >&2
  exit 1
fi

if [ -z "$(psql -h "$PGDATA" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DBNAME'")" ]; then
  echo "==> Creating database $DBNAME"
  createdb -h "$PGDATA" "$DBNAME"
fi

echo "==> Applying schema"
psql -h "$PGDATA" -d "$DBNAME" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/db/schema.sql"

echo "==> Seeding data"
PGDATA_SOCKET_DIR="$PGDATA" PGDATABASE="$DBNAME" PG_BIN_DIR="$PG_BIN" node "$REPO_ROOT/db/seed.mjs"

echo "==> Row counts"
psql -h "$PGDATA" -d "$DBNAME" -c "
  SELECT 'lanesets' AS table, count(*) FROM lanesets
  UNION ALL SELECT 'lanes', count(*) FROM lanes
  UNION ALL SELECT 'entries', count(*) FROM entries
  UNION ALL SELECT 'entry_locations', count(*) FROM entry_locations;
"

echo "==> Done. Database '$DBNAME' is running at $PGDATA (left in place)."
