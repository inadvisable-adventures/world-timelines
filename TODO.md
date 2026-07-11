# TODO

Items are worked in listed order, skipping any marked `PENDING`. See `development-process.md` for the full process.

<!--
Item format:
1. Description of the work. [planned: plan-name.md]
2. Description of a blocked item. PENDING
-->

1. COMPLETED. Install PostgreSQL locally on this machine, with the PostGIS extension available. [planned: install-local-postgres.md]
2. In `db/`, define a PostgreSQL schema (with PostGIS geometry columns) holding all data currently available in the app — entries, historical eras, lanesets, and lanes — with each entry, laneset, and lane given its own UUID primary key and a last-updated timestamp. [planned: db-schema.md]
3. Write a script that initializes the local PostgreSQL install with the database designed in `db/`, including seeding it from the existing TSV/JSON data files. [planned: db-init-script.md]
4. Run the initialization script and verify it created the local database correctly; leave the database in place afterwards. [planned: run-and-verify-local-db.md]
5. Rewrite the web client and `local-concept-server` so entries, eras, lanesets, and query results are cached locally in IndexedDB, used whenever present, and otherwise fetched from `local-concept-server` (which now queries the local Postgres database). Decouple result lists from full records: queries return only `{id, lastUpdated}` pairs, with a follow-up call fetching full records for a given list of ids. [planned: indexeddb-cache-and-server-rewrite.md]
