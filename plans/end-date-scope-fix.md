# Fix Spurious End Dates from Maintenance Templates (TODO #22) — COMPLETED

## Summary

`extractDates` scans the **entire wikitext** for `| key = value` pairs. Wikipedia articles routinely include maintenance templates at the top of the article, e.g.:

```
{{Use dmy dates|date=January 2022}}
{{Short description|...}}
```

The `date=` field in `{{Use dmy dates}}` matches the `date` pattern in `DATE_PATTERNS_BY_KIND` (present in the `person`, `event`, and `other` lists). Because `found` is sorted by pattern priority and deduplicated by year, this maintenance-template year ends up appended after the legitimate birth/death dates, becoming the `endDate`. Result: a rugby player born in the 1880s who died in the early 1900s shows an end date of 2022.

## Affected Files

- `ingester/src/infobox-parser.ts` — scope the field scan in `extractDates` to the primary infobox only; add secondary sanity check dropping endDate if it precedes startDate.

## Implementation

### Step 1 — Add `extractPrimaryInfoboxText` helper

```typescript
function extractPrimaryInfoboxText(wikitext: string): string {
  const m = /\{\{\s*[Ii]nfobox\b/i.exec(wikitext);
  if (!m) return wikitext;           // no infobox — fall back to full text
  let depth = 0;
  for (let i = m.index; i < wikitext.length - 1; i++) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i++; }
    else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      depth--; i++;
      if (depth === 0) return wikitext.slice(m.index, i + 1);
    }
  }
  return wikitext; // unterminated infobox — fall back to full text
}
```

### Step 2 — Use the scoped text in `extractDates`

Replace `const fieldRe = /…/gi;` and subsequent `fieldRe.exec(wikitext)` with the same regex but run against `extractPrimaryInfoboxText(wikitext)`.

### Step 3 — Secondary sanity check

After deduplication, if `endDate.startYear < startDate.startYear`, drop `endDate`. This guards against any remaining edge cases where the infobox itself contains out-of-order dates.

## Design Notes

- Restricting to the infobox is the principled fix. The `date` pattern is useful for event infoboxes (e.g. `{{Infobox military conflict|date=…}}`) and should stay — it just must not be sourced from maintenance templates.
- If no infobox template is found (`{{Infobox…}}`), fall back to scanning the full wikitext (preserves existing behaviour for unusual articles).

## Verification

Build with `npm run build`. Re-run ingester on a small sample; confirm persons no longer have end dates in the current decade that conflict with their summary text.
