# Depth-Aware Infobox Field Extraction (TODO #24) — COMPLETED

## Summary

The field scanner in `extractDates` uses a flat regex `/\|\s*([a-z_0-9]+)\s*=\s*/gi`
over the infobox text. This picks up `| key = value` patterns at any depth, including
inside nested citation templates embedded in field values:

```
| decommissioned = 15 Feb 1943 {{cite web | url=... | date=December 2022 }}
```

The `| date = December 2022` inside `{{cite web}}` is at template depth 2, but the
regex can't tell and adds `date → December 2022` to the field map. This ends up as
the `endDate` for ships (and potentially other entries) via the generic `date` pattern.

The infobox-scope fix (TODO #22) prevented maintenance templates *outside* the infobox
from leaking in, but citation templates *inside* the infobox are still a problem.

## Affected Files

- `ingester/src/infobox-parser.ts` — replace the regex field-scanning loop in
  `extractDates` with a depth-aware `buildFieldMap` helper that only captures
  field assignments at depth 1 (inside the primary infobox, not inside nested
  citation or other templates).

## Implementation

### Replace the regex scan loop with `buildFieldMap`

```typescript
function buildFieldMap(templateText: string): Map<string, string> {
  const fieldMap = new Map<string, string>();
  const len = templateText.length;
  let i = 0;
  let depth = 0;

  while (i < len) {
    if (i + 1 < len && templateText[i] === '{' && templateText[i + 1] === '{') {
      depth++; i += 2; continue;
    }
    if (i + 1 < len && templateText[i] === '}' && templateText[i + 1] === '}') {
      depth--; i += 2;
      if (depth <= 0) break;
      continue;
    }

    // Only capture field assignments at depth 1 (top level of the infobox).
    if (depth === 1 && templateText[i] === '|') {
      const rest = templateText.slice(i);
      const m = /^\|\s*([a-z_0-9]+)\s*=\s*/i.exec(rest);
      if (m) {
        const key = m[1].toLowerCase();
        const valStart = i + m[0].length;
        if (!fieldMap.has(key)) {
          const restFromVal = templateText.slice(valStart);
          let val: string;
          let advance: number;
          if (restFromVal.startsWith('{{')) {
            let d = 0, end = 0;
            for (let j = 0; j < restFromVal.length - 1; j++) {
              if (restFromVal[j] === '{' && restFromVal[j+1] === '{') { d++; j++; }
              else if (restFromVal[j] === '}' && restFromVal[j+1] === '}') { d--; j++; if (d === 0) { end = j + 1; break; } }
            }
            val = end > 0 ? restFromVal.slice(0, end) : '';
            advance = valStart + (end > 0 ? end : restFromVal.length);
          } else {
            val = /^([^\n|}{[\]]+)/.exec(restFromVal)?.[1] ?? '';
            advance = valStart + val.length;
          }
          fieldMap.set(key, val.trim());
          i = advance;
          continue;
        }
      }
    }
    i++;
  }

  return fieldMap;
}
```

In `extractDates`, replace the regex loop and `fieldMap` construction with:
```typescript
const fieldMap = buildFieldMap(scope);
```

## Design Notes

- At depth 1, `|` is a field separator for the infobox. At depth 2+, `|` is a
  parameter separator inside a nested template and must not be treated as a field.
- Value extraction for `{{...}}`-typed values is unchanged — the local depth counter
  in the value extractor is independent of the outer depth.
- `extractPrimaryInfoboxText` is still used to scope to the infobox before this
  runs (belt-and-suspenders for maintenance templates outside the infobox).

## Verification

Build with `npm run build`. After re-running the ingester, artifact entries like
Japanese destroyer Ayanami (1929) should no longer show 2022 as an end year.
