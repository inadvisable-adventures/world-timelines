# Fix Self-Closing `<ref>` Ordering Bug in extractDescription (TODO #48) — COMPLETED

## Summary

`extractDescription` in `ingester/src/infobox-parser.ts` strips paired
`<ref>…</ref>` blocks before self-closing `<ref …/>` tags. The paired-tag
regex's opening-tag pattern (`<ref\b[^>]*>`) matches a self-closing tag
(`<ref name="x" />`) just as well as a genuine opener, since `[^>]*` happily
consumes the trailing `/` before the final `>`. Once matched as an "opener",
its non-greedy `[\s\S]*?<\/ref>` body then searches forward for the *next*
`</ref>` in the text — which, for a self-closing tag, is unrelated and could
be paragraphs later — silently deleting everything in between.

This exact bug was found and fixed in `era-extractor.ts`'s
`stripCitationNoise` while building the era-extraction tool (TODO #47); this
item applies the same fix to the original, production code path.

## Affected Files

- `ingester/src/infobox-parser.ts` — `extractDescription`, lines ~469-471

## Implementation

Swap the order: strip self-closing `<ref …/>` tags first, then paired
`<ref>…</ref>` blocks.

```ts
// Self-closing <ref name="x" /> must be stripped BEFORE the paired-tag
// regex below — otherwise the paired regex's opening-tag pattern matches
// the self-closing tag as if it were an opener, and its non-greedy body
// then swallows everything up to the next unrelated </ref> in the text.
text = text.replace(/<ref\b[^>]*\/>/gi, '');
text = text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '');
```

No other changes needed — unlike `era-extractor.ts`'s equivalent fix, there's
no need to replace with a space instead of `''` here, since `extractDescription`
only needs one clean sentence and isn't sensitive to two words becoming
glued together across a removed ref (it already collapses whitespace runs
and splits on sentence-ending punctuation).

## Verification

Construct a wikitext snippet with a self-closing named ref appearing before
an unrelated later `</ref>`, confirm the paragraph after the self-closing
ref is preserved (not deleted) in the extracted description, before and
after the fix. Re-run the ingester against `test-data/` and confirm
`collected_entries.tsv` descriptions aren't broken (spot check row count and
a few descriptions for the affected categories). `npm run build` must stay
clean. No browser verification needed — ingester-only change, no UI surface.

**Result:** Built a repro case (a short early line with a self-closing named
ref, followed by the real description paragraph ending in a later, unrelated
paired ref). Confirmed via `git stash` that it fails pre-fix (empty
description — the entire real paragraph was deleted) and passes post-fix
(correct description extracted). Re-ran the ingester against `test-data/`:
identical `considered`/`collected` counts (35123/22827) to the pre-fix
baseline, confirming no regression — the fix only affects which text
survives into a description, not filtering/counting.
