# Article Lookup Script (TODO #45)

## Summary

A standalone script that fetches and extracts a single Wikipedia article by title
without scanning the full corpus. Reads the multistream index once to locate the
article's byte offset, decompresses only that stream (~100 articles), runs the
same extraction pipeline as the main ingester, and prints the result to stdout as
JSON. Useful for spot-checking why an article is rejected or what data it produces.

## Affected Files

- `ingester/src/lookup.ts` — new script (entry point via `node dist/lookup.js`)
- `ingester/package.json` — add `lookup` script entry

## Implementation

### Index scan (`findTitleInIndex`)

Stream through the decompressed index buffer line by line (same format as
`readMultistreamIndex`). On each line, parse `byteOffset:articleId:title`. Once
the target title is found, record its `byteOffset`. Continue scanning until a line
with a different `byteOffset` appears — that's `nextByteOffset`. Return early.
This avoids materializing the full title map.

### Main flow

1. Parse args: `<dump.xml.bz2> <index.txt.bz2> "Article Title"`
2. Call `findTitleInIndex` — logs progress to stderr.
3. Call `readStream(fd, fileSize, byteOffset, nextByteOffset)`.
4. Call `extractPages(xml)` and find the matching page by title.
5. Run `extractInfoboxTypes`, `categoryFromInfoboxType`, `extractLocations`,
   `extractDates`, `extractDescription` — same calls as `index.ts`.
6. Build the entry object (same shape as `ExtractedEvent`, including `tags`).
7. Print JSON to stdout; rejection reason (if any) to stderr.

### Output

On success: pretty-printed JSON of the extracted entry to stdout.
On rejection: prints which stage rejected the article and why to stderr; exits
with code 1.

Rejection stages to report:
- No infobox found
- Infobox type not in `DEFAULT_INCLUDE_TYPES` (and which types were found)
- Category excluded by default config
- No start date parseable
