# Run and verify the local database

## Summary

Execute `db/init-db.sh` (from `db-init-script.md`) against the freshly
installed local PostgreSQL (`install-local-postgres.md`), confirm it created
a working `world_timelines` database with PostGIS enabled and all data
loaded, and leave it running/in place — this TODO item is explicitly *not*
to tear the database down afterwards, since `local-concept-server`
(`indexeddb-cache-and-server-rewrite.md`) depends on it existing going
forward for local development.

## Approach

1. `bash db/init-db.sh` from the repo root.
2. Verify success:
   - Script exits 0 and prints non-zero row counts for `entries`, `lanesets`,
     and `lanes` matching the source file sizes (43 + 114 = 157 entries, the
     laneset/lane counts from `lanesets.json`).
   - `psql -h db/.pgdata -d world_timelines -c '\dx'` shows `postgis`
     installed.
   - `psql -h db/.pgdata -d world_timelines -c '\dt'` shows `entries`,
     `entry_locations`, `lanesets`, `lanes`.
   - Spot-check a known entry: `SELECT slug, title, id, last_updated FROM
     entries WHERE slug = 'great-pyramid-giza';` returns one row with a real
     UUID and a recent timestamp.
   - Spot-check geometry: `SELECT ST_AsText(geometry) FROM entry_locations
     JOIN entries ON entries.id = entry_locations.entry_id WHERE entries.slug
     = 'great-pyramid-giza';` returns a `POINT(...)` matching the known
     lat/lng (29.9792, 31.1342 → `POINT(31.1342 29.9792)`, GeoJSON/WKT
     lng-lat order).
   - Spot-check a lane: pick any lane slug from `lanesets.json` and confirm
     `ST_IsValid(geometry)` is true and the row count of `lanes` matches the
     source JSON.
3. Re-run the script a second time to confirm idempotency (truncate-and-
   reload as designed in `db-init-script.md`) doesn't error and row counts
   stay the same.
4. Leave the Postgres process running (it was started via `pg_ctl start`,
   not `postgres` in the foreground, so it persists after the script exits).
   Do not run `pg_ctl stop` or `dropdb` — the database must remain in place
   per the TODO item.

## Verification checklist (record actual output when run)

- [ ] `db/init-db.sh` exits 0
- [ ] PostGIS extension present
- [ ] All 4 tables present
- [ ] Row counts match source files
- [ ] Known entry + its geometry round-trip correctly
- [ ] Known lane geometry is valid
- [ ] Second run is idempotent (no errors, same counts)
- [ ] Server left running, database left in place

## Affected files

None (execution/verification only; no new files beyond what
`db-init-script.md` created).
