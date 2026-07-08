# Archive the full ingest output (#61) — COMPLETED

## Summary

The completed full ingest produced `ingester/collected_entries.tsv` (242 MB,
859,658 rows), of which ~93% carry the `no-coords-found` tag. This file is
git-tracked (a small version was committed earlier). Rename it to a name that
records that it still contains the no-coordinate entries, and gitignore it (and
future ingest outputs) so the 242 MB artifact never enters git history — it is
regenerable from the dump.

## Affected Files

- `ingester/collected_entries.tsv` → `ingester/collected_entries.includes-no-coords-found.tsv`
- `ingester/.gitignore` — ignore both the archived name and the working output name
- git index — untrack the previously committed `collected_entries.tsv`

## Approach

1. `git rm --cached ingester/collected_entries.tsv` (stop tracking; keep on disk).
2. Rename on disk to `collected_entries.includes-no-coords-found.tsv`.
3. Add to `ingester/.gitignore`:
   - `collected_entries.tsv`
   - `collected_entries.tsv.partial`
   - `collected_entries.includes-no-coords-found.tsv`
4. Confirm `git status` shows the old path deleted-from-index and no large file staged.

## Key Decisions

- **Gitignore, don't commit** — 242 MB regenerable build output does not belong
  in git; committing it bloats every clone.
- Keep the file on disk under the descriptive name so #62 can sample it and #63
  can be compared against it.

## Verification

- `git status` shows `collected_entries.tsv` removed from the index, nothing
  large staged.
- The archived file exists on disk with the new name and full row count.
