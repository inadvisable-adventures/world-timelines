# README for World Timelines - Prototype

World Timelines is an app that enables a deeper understanding of history by combining maps with chronologies. What technologies were developed where and when? How did borders change over time? Which historical figures from different continents overlapped? Immerse yourself in these questions and limitless others.

## Project Basics

This prototype repo has a static single-page web app (SPA), fake data, and a simple webserver.

### See CLAUDE.md for developer guidelines

I have some simple development guidelines for Claude, which are applicable to humans, too.

### See development-process.md

development-process.md describes the development process I asked Claude to use; it is probably a bit cumbersome for humans, but Claude was fine with it.
If there were other humans involved, I probably would have used a more traditional work-management system, as much as I enjoyed the nimbleness of having all of the process in one place.

### Fake backend for now

The data will be stored and transmitted to the client in compact TSV files and all queries will be run on the client.
Eventually, we'll move the data to a database in the cloud to avoid large downloads for clients.

This prototype has ingestion of wikipedia dumps.

`./en_wiki_download` - this is where we should keep the downloaded and compressed wikipedia bz2:
<https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-pages-articles-multistream-index.txt.bz2>
<https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-pages-articles-multistream.xml.bz2>
These are "multistream" bz2, so the dump can be accessed without decompressing the whole thing.

The download goes much faster as a torrent if you can do that <https://meta.wikimedia.org/wiki/Data_dump_torrents#English_Wikipedia>.


## Running the Web Client (Local)

The web client is a static SPA. A small local server is included at `web-client/local-concept-server/` that serves it correctly (proper MIME types, SPA fallback to `index.html`).

### Build

```bash
# Build the web client TypeScript
cd web-client
npm run build

# Build the local server
cd local-concept-server
npm run build
```

### Run

```bash
cd web-client/local-concept-server
npm start
```

Opens at `http://localhost:4242` by default. Override the port with `PORT=8080 npm start`.

---

## Running the Ingester

The ingester reads the Wikipedia multistream dump and produces a TSV of historical events.

### Build

```bash
cd ingester
npm run build
```

### Run

```bash
cd ingester
node dist/index.js \
  ../en_wiki_download/enwiki-20260401-pages-articles-multistream.xml.bz2 \
  ../en_wiki_download/enwiki-20260401-pages-articles-multistream-index.txt.bz2 \
  --output collected_entries.tsv \
  --config ingest.config.tsv \
  --status-log ingest_status.tsv \
  --runs-log ingest_runs.json \
  --catalog infobox-catalog.tsv
```

This writes collected entries to `collected_entries.tsv` while it runs (via `collected_entries.tsv.partial`), logging progress to `ingest_status.tsv`. If interrupted, resume from the last checkpoint with `--resume` added to the command above.

### Config

Edit `ingest.config.tsv` to control filters. Active (uncommented) settings override defaults:

| Key | Value | Effect |
|-----|-------|--------|
| `date_before` | year (e.g. `2000`) | exclude events starting after this year |
| `date_after` | year (e.g. `-3000`) | exclude events starting before this year |
| `exclude_category` | category name | skip an entire category (repeatable) |
| `stop_after_considering` | integer | stop after N considered articles |
| `stop_after_collecting` | integer | stop after N collected events |


## Acknowledgements

### This project contains and builds on public domain data from Natural Earth

Made with Natural Earth. Free vector and raster map data @ [naturalearthdata.com](https://naturalearthdata.com).

### Prototype Built using Claude Code

This prototype was built with Claude Code (Sonet, primarily), [claude.ai](https://claude.ai).

### Wikipedia, Wikimedia Foundation

This prototype contains code which ingests content from Wikipedia dumps. Per the [Wikimedia Foundation's Terms of Use](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use), when that content is shown in the app, there is a hyperlink available to the original Wikipedia page.
