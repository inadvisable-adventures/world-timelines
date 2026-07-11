# DB init/seed script — COMPLETED (script written; run+verify is item 4)

## Result (2026-07-11)

Implemented as designed: `db/init-db.sh` and `db/seed.mjs`, plus `.gitignore`
entries for `db/.pgdata/` and `db/.generated-seed.sql`. `bash -n` and `node
--check` both pass. One simplification from the original design: SQL text
values are escaped with standard `''`-doubling rather than dollar-quoting —
equally correct for a generated file `psql -f` parses (no shell involved),
and avoids picking dollar-quote tags. Actually running the script against
the local cluster is TODO item 4 (`run-and-verify-local-db.md`).

## Summary

A script that takes the locally-installed PostgreSQL engine
(`install-local-postgres.md`) and the schema (`db-schema.md`) and produces a
running local `world_timelines` database, seeded from the existing TSV/JSON
data files. Re-runnable: running it again refreshes the schema and reloads
data rather than erroring out or requiring manual cleanup first.

## Design decisions

- **Self-contained data directory, not the global Homebrew cluster.** The
  cluster's data files live at `db/.pgdata/` (gitignored — binary runtime
  state, not source). This keeps the whole database fully contained to this
  repo checkout: nothing touches `brew services`, no login-time daemon, and
  deleting `db/.pgdata/` is a clean full reset if ever needed. The Postgres
  server listens only via a Unix socket in that same directory (no TCP port
  claimed, no conflict with any other local Postgres) unless `PGPORT` is
  explicitly set.
- **Two scripts**, both under `db/`:
  - `db/init-db.sh` — bash orchestrator: init the cluster if needed, start it
    if not running, create the `world_timelines` database if missing, apply
    `db/schema.sql`, then invoke the seed step. This is the single entry
    point item 3/4 of the TODO run.
  - `db/seed.mjs` — plain Node ESM (no npm deps, matching
    `gen-lanesets.mjs`'s style): reads the existing data files, converts them
    to SQL, and loads them by shelling out to `psql -f` — consistent with the
    project-wide decision to talk to Postgres via the `psql` CLI rather than
    a driver library.
- **Idempotent by truncate-and-reload, not row-level upsert.** At POC data
  scale (43 entries + 114 eras + a handful of lanes), the simplest correct
  behavior for a re-runnable seed is: `TRUNCATE entries, lanesets, lanes
  CASCADE` inside a transaction, then insert fresh rows. Every row gets a
  fresh UUID and `last_updated = now()` on each seed run. This is simpler and
  less error-prone than conditional upserts, and satisfies "safe to re-run"
  without needing natural-key conflict handling on the child
  `entry_locations` table (which has no natural key). Re-running the seed
  does **not** drop the database or role — only the data rows — so it never
  conflicts with "leave the database in place afterwards" (TODO item 4).
- **Geometry construction via `ST_GeomFromGeoJSON`.** The seed script
  converts each location/lane geometry into standard GeoJSON (the current
  on-disk shapes are GeoJSON-*like* but not identical — e.g. `{type:'point',
  lat,lng}` instead of `{type:'Point',coordinates:[lng,lat]}`), embeds it as a
  dollar-quoted JSON literal in the generated SQL, and wraps it with
  `ST_GeomFromGeoJSON(...)::geometry`. Dollar-quoting (`$geo$...$geo$`)
  avoids manual quote-escaping bugs for arbitrary text fields (titles,
  descriptions can contain apostrophes).
- **Safety**: this script only ever writes into `db/.pgdata/` (created by
  itself) and the `world_timelines` database within its own local cluster —
  it never touches any pre-existing Postgres install or database.

## `db/init-db.sh` steps

1. Resolve `PG_BIN` — prefer `/opt/homebrew/opt/postgresql@18/bin` if present,
   else fall back to `pg_ctl`/`psql`/`initdb` on `PATH`; exit with a clear
   error pointing at `install-local-postgres.md` if none found.
2. `PGDATA=db/.pgdata`. If `$PGDATA/PG_VERSION` doesn't exist, run `initdb
   --locale=en_US.UTF-8 -E UTF-8 -D "$PGDATA"`.
3. If the server isn't already accepting connections on this `PGDATA`
   (`pg_ctl status -D "$PGDATA"`), start it: `pg_ctl -D "$PGDATA" -l
   "$PGDATA/postgres.log" -o "-k $PGDATA -h ''" start` (Unix-socket-only,
   directory-scoped, no TCP listener) and wait via `pg_isready`.
4. Create the database if missing: `psql -h "$PGDATA" -d postgres -tAc
   "SELECT 1 FROM pg_database WHERE datname='world_timelines'"` → if empty,
   `createdb -h "$PGDATA" world_timelines`.
5. `psql -h "$PGDATA" -d world_timelines -v ON_ERROR_STOP=1 -f db/schema.sql`.
6. `node db/seed.mjs` (reads `PGDATA`/db name from the same conventions, or
   accepts them as env vars so `init-db.sh` and `seed.mjs` agree).
7. Print a summary: row counts per table (`SELECT count(*) FROM entries`,
   etc.) so the operator can see the script worked without needing a manual
   follow-up query.

## `db/seed.mjs` steps

1. Read and parse:
   - `web-client/public/data/collected_entries.sample.tsv` (entries)
   - `web-client/public/data/historical_eras.tsv` (also entries — same 17-col
     shape, see `db-schema.md`)
   - `web-client/public/data/lanesets.json` (lanesets + lanes)
2. For each entry row: convert the `locations` JSON array into
   `entry_locations` rows (kind-specific geometry/waypoints/radius per the
   mapping in `db-schema.md`), carrying over all scalar columns and `tags`.
3. For each laneset: convert `lanes[]` into `lanes` rows, converting the
   `MultiPolygon` ring data and `bbox` tuple into the schema's columns.
4. Emit one generated SQL file (`db/.generated-seed.sql`, gitignored) —
   `BEGIN; TRUNCATE ... CASCADE; INSERT ...; COMMIT;` — then run it via
   `psql -h "$PGDATA" -d world_timelines -v ON_ERROR_STOP=1 -f
   db/.generated-seed.sql`, matching the CLI-shell-out approach used
   elsewhere in this project (and the same approach `local-concept-server`
   will use per `indexeddb-cache-and-server-rewrite.md`).

## Affected files (new)

- `db/init-db.sh`
- `db/seed.mjs`
- `.gitignore` — add `db/.pgdata/` and `db/.generated-seed.sql`

## Verification

Covered by `run-and-verify-local-db.md` (running this script IS that TODO
item). This plan's own check before considering it "written": `bash -n
db/init-db.sh` (syntax check) and `node --check db/seed.mjs`.
