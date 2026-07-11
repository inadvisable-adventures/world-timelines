# Install local PostgreSQL + PostGIS — COMPLETED

## Summary

Install PostgreSQL and the PostGIS extension locally via Homebrew, so the
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
- `postgis` (3.6.4, current bottle) only ships extension/library files built
  against `postgresql@17` and `postgresql@18` — **not** `postgresql@16`.
  Confirmed by inspecting `postgis`'s Cellar (`share/postgresql@17`,
  `share/postgresql@18` subdirs, no `@16`) and by `pg_config --sharedir` /
  `--pkglibdir` for each installed `postgresql@N` formula. `postgresql@16`
  was installed first, found incompatible, uninstalled, and replaced with
  `postgresql@18` (current stable, matches the bottle) before any data
  directory was created — a clean swap, nothing depended on the `@16` install
  yet.
- Architecture: arm64 (Apple Silicon).

## Approach

1. `brew install postgresql@18 postgis`. Because `postgresql@18` is keg-only,
   Homebrew will not symlink its binaries onto `PATH` automatically.
2. Do **not** register it as a login-time background service
   (`brew services start`) — this is a local dev database for a POC, and an
   always-on system service is more than what's needed. Instead the init
   script (`db-init-script.md`) starts/stops `postgres` itself via `pg_ctl`,
   pointed at a self-contained data directory under `db/.pgdata`.
3. Confirm the install:
   - `/opt/homebrew/opt/postgresql@18/bin/postgres --version`
   - `/opt/homebrew/opt/postgresql@18/bin/psql --version`
   - `pg_config --sharedir`/`--pkglibdir` for postgresql@18 list
     `extension/postgis.control` and `postgis-3.dylib` respectively.
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
- **PostgreSQL 18, not 16** — the initially-installed `postgresql@16` turned
  out to be incompatible with the current `postgis` bottle (see Environment
  findings); swapped before any data existed.

## Verification (actual results)

- `postgres --version` / `psql --version` (via the keg-only
  `postgresql@18` path) → `PostgreSQL 18.4 (Homebrew)`.
- `CREATE EXTENSION postgis;` on a scratch cluster succeeded;
  `postgis_full_version()` reported `POSTGIS="3.6.4 0" [EXTENSION]
  PGSQL="180" GEOS="3.14.1-CAPI-1.20.5" PROJ="9.8.1" ...`.
- Confirmed the eventual real socket directory, `<repo>/db/.pgdata`, is 63
  bytes — well under the ~103-byte Unix-domain-socket path limit that caused
  the scratch smoke test to fail when first tried from a long scratchpad
  path (fixed by re-testing from `/tmp` instead; not a concern for the real
  repo-relative path used in `db-init-script.md`).

## Affected files

None (machine-level install only).
