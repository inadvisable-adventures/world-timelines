# db/

PostgreSQL + PostGIS schema and setup for the local `world_timelines`
database. See `plans/db-schema.md`, `plans/db-init-script.md`, and
`plans/install-local-postgres.md` for the full design rationale.

## One-time prerequisite

Install PostgreSQL and PostGIS via Homebrew (this repo currently targets
PostgreSQL 18, the version the installed PostGIS bottle supports):

```sh
brew install postgresql@18 postgis
```

## Files

- `schema.sql` — the DDL: `lanesets`, `lanes`, `entries` (also holds
  historical eras — see the comment at the top of the file), and
  `entry_locations`. Idempotent (`CREATE ... IF NOT EXISTS` throughout).
- `init-db.sh` — initializes a self-contained local cluster at
  `db/.pgdata/` (gitignored), starts it, creates the `world_timelines`
  database if missing, applies `schema.sql`, and seeds it by running
  `seed.mjs`. Safe to re-run.
- `seed.mjs` — reads the existing static data files
  (`web-client/public/data/collected_entries.sample.tsv`,
  `web-client/public/data/historical_eras.tsv`,
  `web-client/public/data/lanesets.json`), converts them to SQL, and loads
  them via `psql -f` (this project talks to Postgres by shelling out to the
  `psql` CLI rather than adding a driver dependency — see
  `plans/indexeddb-cache-and-server-rewrite.md`).
- `fetch-wikidata-persons.mjs` — bulk-fetches `person` records matching this
  project's QLever query filters (see
  `web-client/src/wikidata/qlever-client.ts`) directly from the public
  QLever endpoint, and loads them into the `wikidata_documents` JSONB
  document table (schema also in `schema.sql`). A one-time/occasional job,
  not run as part of `init-db.sh`. Chunks the fetch by date range (paced,
  resumable via `wikidata_fetch_progress`) rather than paginating — see
  `plans/wikidata-bulk-person-download.md` for why. Usage:
  `node db/fetch-wikidata-persons.mjs [--year-min N] [--year-max N]`
  (defaults to the app's full `-3000`..`2100` range).

## Usage

```sh
bash db/init-db.sh
```

This is safe to run more than once — it truncates and reloads the seed data
each time (fresh UUIDs, fresh `last_updated` timestamps) without dropping the
database itself.

The running cluster listens only on a Unix socket inside `db/.pgdata/` (no
TCP port claimed), so it won't conflict with any other local Postgres
install. It is **not** registered as a `brew services` background service —
it only runs when `init-db.sh` (or `pg_ctl -D db/.pgdata start`) is invoked.

To connect manually: `psql -h db/.pgdata -d world_timelines`.
