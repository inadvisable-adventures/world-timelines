# Install local PostgreSQL + PostGIS

## Summary

Install PostgreSQL 16 and the PostGIS extension locally via Homebrew, so the
rest of this initiative (schema, init script, server rewrite) has a real
database to target. This plan covers the *engine* install only — creating the
`world_timelines` database/role and loading the schema is covered by
`db-init-script.md` and `run-and-verify-local-db.md`.

## Environment findings

- Homebrew is present at `/opt/homebrew/bin/brew` (v6.0.6) but not on `PATH` in
  the current shell — invoke it by full path, or note that a login shell may
  already have it on `PATH`.
- Xcode Command Line Tools are installed (`/Applications/Xcode.app/Contents/Developer`).
- No existing Postgres/PostGIS/Docker/MacPorts/Postgres.app install was found.
- `postgresql@16` is keg-only (bottled); `postgis` depends on `gdal`, `geos`,
  `proj`, etc. (also bottled) — expect a sizeable but fully binary (no source
  build) install. ~36 GB free disk, ample.
- Architecture: arm64 (Apple Silicon).

## Approach

1. `brew install postgresql@16 postgis`. Because `postgresql@16` is keg-only,
   Homebrew will not symlink its binaries onto `PATH` automatically.
2. Do **not** register it as a login-time background service
   (`brew services start`) — this is a local dev database for a POC, and an
   always-on system service is more than what's needed. Instead the init
   script (`db-init-script.md`) will start/stop `postgres` itself via
   `pg_ctl`, pointed at a data directory under this repo's control (or the
   default Homebrew-created cluster — decided in that plan).
3. Confirm the install:
   - `/opt/homebrew/opt/postgresql@16/bin/postgres --version`
   - `/opt/homebrew/opt/postgresql@16/bin/psql --version`
   - `brew list postgis` shows the extension's SQL/control files installed
     under `/opt/homebrew/opt/postgis`
4. No repo files change in this step — it is a one-time local machine setup,
   not something to script into `db/` (a fresh machine would need to run the
   same `brew install` command; that instruction belongs in a short README
   note in `db/`, added as part of `db-schema.md`).

## Key decisions

- **Homebrew, not Postgres.app/Docker/MacPorts** — Homebrew is already present
  on this machine and is the path of least friction; no Docker daemon is
  installed, and introducing one just for a local Postgres would be a bigger
  footprint than necessary.
- **No background service registration** — keeps this reversible and contained;
  the DB only runs when explicitly started, and nothing modifies the user's
  login items.

## Verification

- `psql --version` and `postgres --version` (via the keg-only path) report
  PostgreSQL 16.x.
- `brew list postgis` succeeds and lists installed files.

## Affected files

None (machine-level install only).
