# Preserve the known-good sample dataset (#60) — COMPLETED

## Summary

The git-tracked `web-client/public/data/collected_entries.tsv` currently holds the
4,520-row hand-authored POC sample (restored from HEAD after an accidental
truncation). Before real ingested data is wired into the app, preserve this
known-good sample under a name that clearly marks it as sample data, keeping its
git history, and keep the app pointed at it so it still runs.

## Affected Files

- `web-client/public/data/collected_entries.tsv` → renamed (git mv, history-preserving)
- `web-client/src/components/app-root.ts` — update the `dataUrl`
- `.gitignore` — ensure the sample name is NOT ignored

## Approach

1. `git mv web-client/public/data/collected_entries.tsv
   web-client/public/data/collected_entries.sample.tsv`. `git mv` preserves the
   file's history (git records the rename), and the `.sample.` segment makes its
   nature unmistakable.
2. Update `app-root.ts`'s worker `dataUrl` to `./data/collected_entries.sample.tsv`
   so the app keeps loading the known-good sample.
3. `npm run build` (web-client) to confirm the change compiles.

## Key Decisions

- **`git mv`, not copy** — the requirement is to preserve history; a plain copy
  would appear as an unrelated new file. The rename keeps `git log --follow`
  working on the sample.
- The plain `collected_entries.tsv` name is freed up for the eventual real
  (coordinate-filtered) dataset, decided separately.

## Verification

- `git status` shows a rename R (not delete+add).
- `web-client` build passes.
- The app still references an existing data file (the sample).
