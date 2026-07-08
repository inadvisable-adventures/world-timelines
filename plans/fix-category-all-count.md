# Fix "All Categories Selected" Count (TODO #28) — COMPLETED

## Summary

`onCategoryChanged` in `app-root.ts` removes the `filter category:` DSL line when
`selected.length === 5`, but there are 9 categories. When exactly 5 are selected,
the line is incorrectly removed and all 9 categories are shown instead of the 5.

## Fix

Change the constant from `5` to `9` (number of entries in `ALL_CATEGORIES`).

## Affected Files

- `web-client/src/components/app-root.ts` line ~107: `selected.length === 5` → `=== 9`
