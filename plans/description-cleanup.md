# Description Cleanup (TODO #30) — COMPLETED

## Problem

`extractDescription` in the ingester leaves wikitext markup artifacts that are now
visible in the `<entry-detail>` panel. Examples:

- `Algeria,{{efn| ;<br>,<br><br><br> .`
- `Amman{{efn| ,  ; , <ref name="Lipiński"></ref><ref></ref>}} is the capital…`
- `Kachemak, locally known as Kachemak City, is a small second-class<ref></ref> city…`

Root causes:
1. `{{…}}` stripping regex only handles 2 levels of nesting — `{{efn|…}}` survives
2. `<ref>…</ref>` and self-closing `<ref …/>` are not stripped
3. `<br>` and other HTML tags are not stripped
4. External links `[http://…]` are not stripped
5. Leftover leading commas/punctuation after stripping are not cleaned up

## Fix

Rewrite `extractDescription` in `ingester/src/infobox-parser.ts`:

1. Strip `<ref>…</ref>` (including named refs and multi-line) and `<ref …/>` first
2. Strip all remaining HTML tags (`<br>`, `<br/>`, etc.)
3. Iteratively remove innermost `{{…}}` pairs (up to 6 passes) until stable
4. Strip `[[File:…]]` / `[[Image:…]]`
5. Strip bare and labelled external links
6. Existing: strip wiki links → display text, bold/italic, section headings, categories
7. Trim leading punctuation artifacts (`,`, `;`) from the candidate line

## Affected Files

- `ingester/src/infobox-parser.ts` — `extractDescription` function only
