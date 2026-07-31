# Data source licenses

Per the core principle in `CLAUDE.md` ("all ingested data needs a
citation to its origin site... a list of licenses for each data source
should also be maintained"), this file tracks the license terms for
every external data source this project ingests or has seriously
evaluated ingesting. When a new data source is added to the app (or the
ingestion pipeline), add an entry here in the same pass — don't let this
file drift out of date with the code.

## In active use

These sources are actually ingested/queried by the running app or its
ingestion scripts today.

| Source | License | Notes |
|---|---|---|
| **Wikipedia** (`en_wiki_download`, ingested via the bespoke dump ingester — see `README.md`) | Text: **CC BY-SA 4.0**, dual-licensed with **GFDL** | Per the [Wikimedia Foundation Terms of Use](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use), attribution is satisfied by a hyperlink to the source article (which the app provides — see the "Wikipedia, Wikimedia Foundation" section of `README.md`'s Acknowledgements). |
| **Wikidata** (via the public QLever SPARQL endpoint, `web-client/src/wikidata/qlever-client.ts`, and the bulk `person` download into Postgres, `db/fetch-wikidata-persons.mjs`) | **CC0 1.0** (public domain dedication) for Wikidata's own structured data (statements/entities) | Confirmed repeatedly across this project's Wikidata research (see `investigations/historical-boundary-journey-trade-data-sources.md`). Every entry sourced from Wikidata carries a `wikipediaTitle` linking back to the source Wikipedia article per TODO item 7 (`plans/qlever-require-wikipedia-page.md`) — satisfies this project's citation requirement even though CC0 itself imposes no attribution obligation. **Caveat**: media/geoshape files linked *from* Wikidata (e.g. `P3896` GeoShape maps hosted on Wikimedia Commons) can carry their own per-file license, often CC BY 4.0 — check the specific file if one is ever used, don't assume CC0 extends to it. |
| **Natural Earth** (vendored map polygons, `web-client/public/data/world-110m.geojson` and the lanesets built from it — see `design-docs/poc-design.md`) | **Public domain** | Attribution given in `README.md`'s Acknowledgements ("Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com") per Natural Earth's own (non-mandatory but requested) attribution convention. |
| **Cliopatria** (Seshat Global History Databank — Mongol Empire boundary polygons, `db/fetch-cliopatria-mongol.mjs` → `web-client/public/data/cliopatria-boundaries.json`) | **CC BY 4.0** | TODO item 12 (`plans/import-mongol-empire-boundaries-cliopatria.md`). No stable per-feature URL exists on Cliopatria's side, so each imported entry's `citationUrl` is a generic link to the [Cliopatria GitHub repository](https://github.com/Seshat-Global-History-Databank/cliopatria) rather than a specific record — satisfies `CLAUDE.md`'s "failing that, a generic link to the data source" clause. |
| **ClimateViewer** (MyReadingMapped — HMS Beagle voyage waypoints, `db/fetch-beagle-voyage.mjs` → `web-client/public/data/beagle-voyage.json`) | **CC BY-NC-SA 4.0** | TODO item 13 (`plans/import-beagle-voyage-path.md`). Non-commercial restriction; fine for this hobby project as long as it stays non-commercial. Single whole-voyage entry (not one-per-waypoint), so `citationUrl` points to the ClimateViewer map page itself rather than a per-waypoint record. |

## Researched, not yet ingested

Found during the TODO item 11 data-source survey
(`investigations/historical-boundary-journey-trade-data-sources.md`).
None of these are wired into the app yet — listed here so their license
terms are already on record if/when one is adopted, per the parking-lot
entry in `PARKINGLOT.md` proposing a first implementation slice.

| Source | License | Notes |
|---|---|---|
| **Chronas.org** (political boundaries API) | Code: MIT. Data: **CC BY-SA 4.0** | Share-alike — redistributing derived data would need the same license. |
| **AWMC/geodata** (Ancient World Mapping Center — ancient political extents) | ODbL | Share-alike/attribution obligations under ODbL. |
| **historical-basemaps** (GitHub, aourednik — coarse world boundaries by year) | **GPL-3.0** | Copyleft applied to the data files themselves, not just code — a heavier obligation than the others in this table. |
| **OpenHistoricalMap** (boundaries, buildings, some roads) | CC0 | Underlying OSM-style data; no attribution legally required, though customary. |
| Wikidata `P3896` geoshapes (ad hoc boundary polygons on specific items) | CC BY 4.0 (per-item, via Commons) | Sparse/volunteer-dependent; see the "in active use" Wikidata caveat above. |
| Cook's voyages (Colin Hazlehurst's KML tracks) | **Unlicensed personal blog** | No stated license — would need explicit permission from the author before use, not just attribution. |
| CLIWOC (1750–1854 ship logbooks) | Unclear ("free") | License terms not confirmed; clarify before use. |
| **Itiner-e** (Roman roads — trade routes and building-project framing) | CC BY 4.0 | Top pick for Roman-era trade routes/roads; attribution required. |
| **ORBIS v2** (Stanford — Roman-era maritime routes) | CC BY 3.0 | Attribution required. |
| **OWTRAD** (Ciolek/ANU — Silk Road, trans-Saharan, and other pre-modern trade routes) | **CC BY-NC 2.5** | Non-commercial restriction; the only real coordinate source found for these specific routes. |
| Harvard DARMC Roman roads | CC BY-NC 3.0 | Non-commercial restriction; older/frozen dataset, fallback only. |
| Historic England NHLE (Hadrian's Wall WHS boundary) | **OGL v3** (UK Open Government Licence) | Attribution required per OGL terms; England-only coverage. |
| WallGIS / WallCAP (Hadrian's Wall detail) | Not fully confirmed | Verify before use. |

## Maintenance notes

- "In active use" sources must always have a working citation path in
  the app itself (a link back to the source item, or failing that a
  generic link to the data source) per the `CLAUDE.md` principle — this
  file only tracks *licenses*, not whether the citation UI is actually
  wired up; verify that separately when adding a new source.
- Licenses with a **non-commercial** restriction (CC BY-NC variants) or
  **copyleft/share-alike** terms (GPL-3.0, ODbL, CC BY-SA) are flagged in
  bold above — currently fine for a non-commercial hobby project, but
  worth re-checking before any change in how this project is distributed
  or used.
