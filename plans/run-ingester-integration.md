# Run Ingester + Integrate Wikipedia Data

## Summary

Run the ingester against the completed Wikipedia multistream dump, review the infobox catalog output, then replace the hand-crafted `web-client/public/data/events.tsv` with the ingested output so the web client shows real historical data.

## Status: BLOCKED

Waiting for `en_wiki_download/enwiki-latest-pages-articles-multistream.xml.bz2` to finish downloading. Check progress with `ls -lh en_wiki_download/` and use `en_wiki_download/ensure-download.sh` to resume if needed.

## Affected Files

- `en_wiki_download/` — read-only inputs (dump + index bz2)
- `ingester/dist/` — compiled ingester (run `npm run build` first)
- `web-client/public/data/events.tsv` — replaced with ingester output
- `infobox-catalog.tsv` — new file written alongside events.tsv (or to project root)

## Step-by-Step

1. **Confirm download complete:**
   ```
   ls -lh en_wiki_download/enwiki-latest-pages-articles-multistream.xml.bz2
   # Should be ~26.4 GB
   ```
   Also check the index file is present:
   ```
   ls -lh en_wiki_download/enwiki-latest-pages-articles-multistream-index.txt.bz2
   ```
   If the index file is missing, download it:
   ```
   curl -L -o en_wiki_download/enwiki-latest-pages-articles-multistream-index.txt.bz2 \
     'https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-pages-articles-multistream-index.txt.bz2'
   ```

2. **Build ingester:**
   ```
   cd ingester && npm run build
   ```

3. **Run ingester (stdout → events.tsv, stderr → progress log):**
   ```
   node ingester/dist/index.js \
     en_wiki_download/enwiki-latest-pages-articles-multistream.xml.bz2 \
     en_wiki_download/enwiki-latest-pages-articles-multistream-index.txt.bz2 \
     web-client/public/data/infobox-catalog.tsv \
     > web-client/public/data/events.tsv \
     2> ingester-run.log
   ```
   This will take many minutes (26 GB dump). Monitor progress via `tail -f ingester-run.log`.

4. **Review catalog:** Open `web-client/public/data/infobox-catalog.tsv`. Check the top infobox types by count. Adjust `DEFAULT_INCLUDE_TYPES` in `ingester/src/infobox-parser.ts` if important categories are missing, then re-run.

5. **Verify TSV:** Check row count and spot-check a few rows:
   ```
   wc -l web-client/public/data/events.tsv
   head -5 web-client/public/data/events.tsv | cut -f1,2,4,14
   ```

6. **Test in browser:** Serve the web client and verify events load and display correctly on map and timeline.

7. **Mark TODO complete** and commit.

## Key Design Decisions

- The ingester writes a single flat TSV; the web client loads it entirely in the WebWorker. For very large outputs (> ~50,000 events) this may need to be chunked, but for the POC, the default limit of 100 results returned per query keeps rendering fast regardless of how many events are loaded.
- The catalog TSV is written to `web-client/public/data/` so it can be inspected alongside the events. Future runs can reference it to decide which additional infobox types to include.
