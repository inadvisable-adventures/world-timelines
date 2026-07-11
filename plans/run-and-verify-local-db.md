# Run and verify the local database — COMPLETED

## Result (2026-07-11)

Ran `bash db/init-db.sh` for real (first run initialized the cluster at
`db/.pgdata`, started it, created `world_timelines`, applied the schema, and
seeded it). Verification checklist below all passed. One finding, logged to
`PARKINGLOT.md` rather than blocking this item: the `africa` and `europe`
lanes load as invalid PostGIS geometry (`ST_IsValid` = false,
self-intersection) — a pre-existing property of the source
`lanesets.json` ring data (grouped-not-dissolved country polygons + RDP
simplification, already a known/documented limitation), not something the
seed conversion introduced — confirmed by the point-location geometry
round-tripping exactly (`POINT(31.1342 29.9792)` for the Great Pyramid,
matching source `lat:29.9792, lng:31.1342`). Database left running
(PID confirmed via `pg_ctl status`) and in place, per the TODO item.

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

## Verification checklist (actual results)

- [x] `db/init-db.sh` exits 0
- [x] PostGIS extension present (`postgis 3.6.4`, `\dx`)
- [x] All 4 tables present (`entries`, `entry_locations`, `lanes`, `lanesets`, plus PostGIS's own `spatial_ref_sys`)
- [x] Row counts match source files: 156 entries (43 sample + 113 eras,
      matching `historical_eras.tsv`'s 114 lines minus header), 43
      `entry_locations` (only the sample entries carry locations; eras have
      `locations: []`), 4 lanesets, 51 lanes
- [x] Known entry + its geometry round-trip correctly (`great-pyramid-giza` →
      real UUID + recent `last_updated`; geometry → `POINT(31.1342 29.9792)`)
- [~] Lane geometry — 49/51 lanes valid; 2 (`africa`, `europe`) invalid, a
      pre-existing source-data issue (see Result above and `PARKINGLOT.md`),
      not a seeding defect
- [x] Second run is idempotent (no errors, identical row counts)
- [x] Server left running (`pg_ctl status` confirmed PID), database left in place

## Affected files

None (execution/verification only; no new files beyond what
`db-init-script.md` created).
