# Human History Eras Extraction (TODO #47) — COMPLETED

## Summary

Fetch the full wikitext of the "Human history" Wikipedia article (not just
infobox fields), manually read it and extract a set of (possibly overlapping)
named historical eras with date spans into `historical_eras_claude.tsv`, then
build a general-purpose script (`extract-eras.ts` + `era-extractor.ts`) that
does the same kind of extraction automatically from an arbitrary article's
wikitext — not hardcoded to this page's structure or content — and iterate on
it until its output on "Human history" reasonably approximates the manual
list.

## Affected Files

- `ingester/src/article-fetch.ts` — **new**: shared "fetch one article's wikitext by title" logic, factored out of `lookup.ts` so `extract-eras.ts` doesn't duplicate it
- `ingester/src/lookup.ts` — refactored to use `article-fetch.ts`; added `--raw` flag to print full wikitext instead of running the infobox pipeline
- `ingester/src/era-extractor.ts` — **new**: general section-splitting + date-mention-scanning logic
- `ingester/src/extract-eras.ts` — **new**: CLI wiring `article-fetch` + `era-extractor` to TSV output
- `ingester/historical_eras_claude.tsv` — **new**: manually-authored era list (20 rows)
- `ingester/historical_eras_auto.tsv` — **new**: script-generated era list (31 rows), for comparison

## Approach

### Manual extraction

Fetched "Human history"'s full wikitext via `lookup.ts --raw`, read the
entire body (intro through "Periodization"), and hand-picked ~20 named eras
with dates the article states explicitly (hominin origins, Paleolithic,
Neolithic, Bronze Age, Ancient period, Axial Age, Regional empires,
Hellenistic period, Pax Romana, Post-classical period, High/Late Middle Ages,
Mongol Empire, Renaissance, Early modern period, Long nineteenth century,
World wars, Cold War, Contemporary history, Modern period). Deliberately
excluded eras the article names but doesn't date explicitly (Islamic Golden
Age, Reformation, Enlightenment, Iron Age) rather than inject outside
knowledge — the deliverable is grounded in what the page itself states.

### General extraction script

1. **Section splitting** (`splitSections`): parses `==`/`===`/etc. headings:
   a heading's body runs until the next heading of the same or shallower
   depth, so a top-level heading's body includes its subsections (mirroring
   how "the Ancient period" naturally includes "Axial Age", "Regional
   empires", etc.). Subsections are qualified with their parent's title
   (`"Post-classical – Europe"`) since sibling top-level sections often reuse
   the same subsection name (e.g. "Europe" appears under both Post-classical
   and Early modern).
2. **Date-span resolution per section**, in priority order:
   - An explicit "from X to Y" / "X–Y BCE" / "63 BCE – 14 CE" range stated in
     the section's own opening ~400 characters (its "topic sentence") — the
     strongest signal, since history articles conventionally open a period's
     description with its defining span.
   - Otherwise, the earliest and latest year mentioned anywhere in the
     section (BCE/CE years, "Nth century" forms, "X million/thousand years
     ago", bare 4-digit years in 1000–2100).
3. Output uses the same 17-column schema as the main ingester's
   `collected_entries.tsv` (`category: historical_period`,
   `infobox_type: manual`, `locations: []`, tagged `manual-extraction` and
   `no-coords-found`).

### Iteration — bugs found and fixed along the way

Comparing early output against the manual file surfaced several genuine,
generalizable bugs (not overfit to this one page):

- **`&nbsp;` entities aren't whitespace.** Wikitext glues numbers to units
  with the literal 6-character string `&nbsp;` (e.g. `3300&nbsp;BCE`), not a
  real NBSP character — regex `\s` doesn't match it, so every date pattern
  silently failed on `&nbsp;`-separated dates (the majority of them) until
  normalized to a space first.
- **Self-closing `<ref name="x" />` tag ordering.** Stripping paired
  `<ref>...</ref>` blocks before self-closing `<ref .../>` tags causes the
  paired regex to misread a self-closer as an opening tag, then swallow
  everything up to the next unrelated `</ref>` later in the text — silently
  deleting large chunks of legitimate content. Fixed by stripping
  self-closing refs first. (This same bug, in the same order, exists in
  `infobox-parser.ts`'s `extractDescription`, which the main ingester uses
  for every entry's description — flagged separately below, not fixed here
  since it's outside this TODO's scope.)
- **`[[File:...jpg]]` filenames leak dates.** Upload-date-stamped filenames
  (e.g. `sept 2019 5373crop.jpg`) read as plausible bare years; stripped
  along with the rest of the file/image link.
- **Templates-as-separators.** Deleting a template like `{{snd}}` (a spaced
  en dash) with an empty string glues its neighbors together
  (`700 BCE{{snd}}1521 CE` → `700 BCE1521 CE`), breaking `\b`-boundary
  matching on the first number. Fixed by replacing stripped
  refs/templates with a single space instead of `''`.
- **Range-adjacency double-counting.** A tight range like `1766–1045 BCE`
  has its era marker only on the second number; naively scanning for bare
  4-digit years afterward misreads the first number as an unrelated bare CE
  year. Fixed by having the mention-scanner consume whole tight ranges
  (recording both endpoints with the correct sign) before running the bare
  bare-year scan on what's left.
- **First-match-wins was too eager.** Initially the "explicit range" search
  scanned the *whole* section and returned the first range-shaped match
  found anywhere — which could be a narrower sub-topic's dates (e.g. the
  Shang dynasty's `1766–1045 BCE`, mentioned in passing inside the "Cradles
  of civilization" section) rather than the section's own defining span.
  Restricted to a leading ~400-character "topic sentence" window.

### Known limitation (not fixed — inherent to the heuristic)

The min/max-of-all-mentions fallback can be thrown off by a single
long-lived entity mentioned within a section: the "Cradles of
civilization" subsection mentions the Zapotec civilization lasting
"700 BCE – 1521 CE", so its computed span stretches to 1521 CE even though
the subsection is conceptually about ~3300–2000 BCE origins. This isn't a
bug so much as a real limit of scanning for "the widest date range
mentioned" without topic modeling — flagged here rather than chased further,
since fixing it properly would need something closer to NLP topic
segmentation, out of proportion to a heuristic scanner.

## Verification

Ran `extract-eras.ts` against the real "Human history" article and compared
rows-by-row against `historical_eras_claude.tsv`. Results: exact or near-exact
matches for `historical_period`-shaped sections with a clear defining
sentence (Axial Age: -800/-200 vs. manual -800/-200; Regional empires:
-500/500 vs. manual -500/500; Prehistory: -7,000,000 start matches after the
`&nbsp;`/range fixes); reasonable approximations for most regional
subsections (post-classical/early-modern Northeast Asia, West and Central
Asia, Oceania, etc. — dates within the article's own stated bounds); a few
outliers explained by the long-lived-entity limitation above. No browser
verification needed — ingester-only change, no UI surface.

## Follow-up flagged (not part of this TODO)

The same self-closing-`<ref>`-ordering bug found in `era-extractor.ts` also
exists in `infobox-parser.ts`'s `extractDescription` (lines ~470–471, used by
the main ingest pipeline for every entry's description). Left alone here
since it's outside this TODO's scope — worth a dedicated fix later if it's
shown to affect production descriptions.
