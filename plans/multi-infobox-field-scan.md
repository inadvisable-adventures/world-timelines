# Multi-Infobox Field Scan (TODO #26) — COMPLETED

## Root cause

`extractDates` calls `extractPrimaryInfoboxText` (returns only the first `{{Infobox…}}`
block) and then `buildFieldMap` (captures only depth-1 fields within that block).

Wikipedia ship articles use a container pattern:

```
{{Infobox ship
 | Ship name = ...
 {{Infobox ship career
  | Ship commissioned = 1943
 }}
}}
```

`extractPrimaryInfoboxText` returns the outer `{{Infobox ship…}}` block. Inside it,
`{{Infobox ship career|Ship commissioned=1943}}` is a nested sub-template at depth 2
relative to the outer infobox. `buildFieldMap` only captures depth-1 fields so
`ship_commissioned` is never seen. Result: no startDate → entry rejected.

This caused artifact count to fall from 421 (before the depth-aware fix) to 0 after it.

Citation leakage prevention is unaffected: `{{cite web|date=2022}}` does not start with
"Infobox" and will not be processed at all.

## Fix

Replace `extractPrimaryInfoboxText` + single `buildFieldMap` call with a helper that
scans the **full wikitext** for every `{{Infobox…}}` template, extracts each one's depth-1
fields, and merges them into one combined map.

```typescript
function buildAllInfoboxFields(wikitext: string): Map<string, string> {
  const combined = new Map<string, string>();
  const re = /\{\{\s*[Ii]nfobox\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    let depth = 0, end = m.index;
    for (let i = m.index; i < wikitext.length - 1; i++) {
      if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i++; }
      else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
        depth--; i++;
        if (depth === 0) { end = i; break; }
      }
    }
    const templateText = wikitext.slice(m.index, end + 1);
    for (const [k, v] of buildFieldMap(templateText)) {
      if (!combined.has(k)) combined.set(k, v);
    }
  }
  return combined;
}
```

In `extractDates`, replace:
```typescript
const scope = extractPrimaryInfoboxText(wikitext);
const fieldMap = buildFieldMap(scope);
```
with:
```typescript
const fieldMap = buildAllInfoboxFields(wikitext);
```

`extractPrimaryInfoboxText` can then be removed.

## Why this is safe

- Each infobox template is extracted as a standalone block and passed to `buildFieldMap`,
  which captures only its OWN depth-1 fields. Any `{{cite web|date=…}}` inside a field
  value is at depth 2 within that template and is still ignored.
- Both the container/nested structure and the sequential multi-template structure
  (e.g. `{{Infobox ship begin}}` … `{{Infobox ship career}}` … `{{Infobox ship end}}`)
  are handled: all matching templates are found and processed.
- First-seen wins for duplicate keys, preserving priority ordering.

## Affected files

- `ingester/src/infobox-parser.ts` — replace `extractPrimaryInfoboxText` with
  `buildAllInfoboxFields`; update `extractDates` to call it.

## Verification

Build with `npm run build`. Artifact count should recover to ~421 (the pre-#24 baseline)
without reintroducing spurious end dates from citation templates.
