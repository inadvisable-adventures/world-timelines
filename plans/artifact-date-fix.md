# Fix Artifact Date Ranges (TODO #16) — COMPLETED

## Summary

Entries in the `artifact` category (primarily ships) are getting nonsensical start dates (e.g. year 9, 5, 4). The `artifact` category has no entry in `DATE_PATTERNS_BY_KIND`, so `extractDates` falls back to the `other` patterns, which are generic and can match maintenance-template fields (e.g. `|date=September 2013` → yearM fires on "2013") or other numeric fields that parse as small years. Ship infoboxes have their own date field naming conventions that are not covered.

## Affected Files

- `ingester/src/infobox-parser.ts` — add `artifact` entry to `DATE_PATTERNS_BY_KIND`

## Implementation

Add an `artifact` key to `DATE_PATTERNS_BY_KIND` covering:

- Ship fields: `ship_commissioned`, `ship_launched`, `ship_laid_down`, `ship_decommissioned`, `commissioned`, `launched`, `laid_down`, `decommissioned`
- Weapon/vehicle fields: `introduced`, `date_introduced`, `year_introduced`, `manufactured`, `date_manufactured`, `completed`, `date_completed`, `production_date`
- Generic fallbacks: `inception`, `date`

## Verification

Build with `npm run build`. Re-run ingester on a small sample and confirm artifact entries no longer have implausible start years (< 100 CE for modern ships).
