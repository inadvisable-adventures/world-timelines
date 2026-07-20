# Sources for historical boundaries, journeys, trade routes, and building projects

Date: 2026-07-19. Written for TODO item 11 / `plans/investigate-boundary-journey-trade-data-sources.md`,
closing the loop on the brainstorm parked in `PARKINGLOT.md` ("What
infobox fields or categories could feed multipolygon boundaries...").

The app's data model (`design-docs/poc-design.md`'s `Location` union)
already has the shapes this data would need — `polygon`/`multipolygon`
(boundaries, building footprints) and `path` (journeys, trade routes,
linear structures), the latter with an optional per-waypoint `t` (0–1)
field for time-correlated animation. What's been missing is a real data
source. This doc surveys candidates for all four categories the user
named, found and verified via four parallel research passes (one per
category) that fetched each source live rather than relying on
memorized/potentially-stale project URLs and licensing.

**No code was written for this TODO item.** This is a sourcing survey
only; picking a specific dataset and building an ingestion path is
future work, scoped as its own TODO item(s) once a candidate is chosen
(see Recommendations below).

**A process note surfaced during research**: two of the four research
agents independently reported anomalies in their own tool environment —
one saw fabricated system-reminder content resembling a different, fake
harness ("FleetView") injected into a tool result mid-task; another was
instructed by the `deep-research` skill to call a `Workflow` tool that
doesn't exist in its environment. Both correctly disregarded the
anomalous content/instructions and fell back to direct web research
instead, and their findings were verified by live fetches, not
assertions. Flagging this for visibility, not because it changed the
substance of what follows.

## 1. Political/territorial boundaries over time

| Source | Coverage | Format/access | License | Maintained | Fit |
|---|---|---|---|---|---|
| **Cliopatria** (Seshat Global History Databank) | ~1,600–1,800 polities, 3400 BCE–2024 CE, explicit `FromYear`/`ToYear` per feature | Single downloadable GeoJSON (~14–15K records), also on Zenodo w/ DOI | **CC BY 4.0** | Active, peer-reviewed (*Scientific Data*, 2025), releases through 2026-05 | **Best overall fit** — schema (`FromYear`/`ToYear`) maps directly onto this app's model, single static file, no auth, no new dependency |
| **Chronas.org** | ~5,000 years, global, province-level | Live JSON REST API, no auth (`GET /v1/areas/{year}`, `/v1/metadata?type=g&f=provinces`) | Code MIT, **data CC BY-SA 4.0** (share-alike) | Active (commits within weeks of this research) | Good complement to Cliopatria for finer per-year resolution; share-alike terms need honoring on redistribution |
| **AWMC/geodata** (Ancient World Mapping Center) | Ancient Mediterranean/Near East, named political-extent layers incl. `roman_empire_ce_117_extent` (the app's own example) | GeoJSON + Shapefile, GitHub, no auth | ODbL | Slow but alive (last commit Apr 2024) | Best for precise ancient-world extents where Cliopatria's global scale is too coarse |
| **historical-basemaps** (GitHub, aourednik) | -123000 to 20th c., fixed snapshot years, country/region granularity, `BORDERPRECISION` uncertainty flag | Plain GeoJSON per year, git-clonable, no auth | **GPL-3.0** (copyleft — applies to data, not just code) | Active (last push 2026-01) | Easiest zero-effort static integration and broadest span, but coarse/self-disclaimed non-academic shapes; GPL terms worth weighing |
| **OpenHistoricalMap** | Global, genuinely date-tagged relations (verified: Roman Empire relation 2747248, `start_date=-0027`/`end_date=0395`, `wikidata=Q2277`, real multipolygon sub-relations) | Dedicated Overpass API, no auth, OSM XML/JSON (GeoJSON needs conversion) | **CC0** | Very active (3.6M dated elements) | Richest/most accurate if willing to write Overpass QL + do OSM→GeoJSON conversion; per-region completeness varies |
| Wikidata (P3896 geoshape) | Ad hoc — e.g. Roman Empire 117 CE has a real polygon; Mongol Empire has none | Links to Commons `Data:*.map` GeoJSON | CC BY 4.0 (per-item) | Volunteer-dependent | Not a systematic source; useful only to patch one well-documented polity/year |
| GeaCron | Global, since 3000 BCE, interactive only | **None** — no API/download; full database is a €450,000 acquisition listing | All rights reserved | N/A | Ruled out |
| Euratlas Periodis | 1–2000 CE, but bounded to 15°W–50°E/20°N–60°N (Europe/Mediterranean fringe only) | Paid Shapefile, €100–600+VAT/year | Commercial | Functional | Fails free/no-auth bar; a possible one-off paid fallback for a specific European year |
| DARMC / Mapping Past Societies | Fragmented into non-boundary datasets (coin hoards, climate) | Bot-walled UI (Akamai 403) | Per-dataset academic citation | Uncertain | Poor fit |
| Pelagios / Peripleo | Point/gazetteer only | — | — | Peripleo archived/deprecated (2021) | Not applicable — no boundary geometry |

**Recommendation**: start with **Cliopatria** as the primary source (schema fit, license, single file, active maintenance); use **AWMC/geodata** to sharpen specific ancient extents like Rome; consider **Chronas**'s live API for finer-grained or gap-filling queries.

## 2. Historical journeys

| Source | Coverage | Format/access | License | Fit |
|---|---|---|---|---|
| **HMS Beagle voyage (ClimateViewer)** | ~140 ordered waypoints, 1832–1836, journal-excerpt descriptions | Direct GeoJSON download | CC BY-NC-SA 4.0 | **Strongest single "named voyage" hit found** — ready to use today with light date-parsing from description text |
| **Camino de Santiago (OSM route relations / Waymarked Trails)** | Real, actively maintained hierarchical route relations | GPX export via Waymarked Trails/Overpass; requires stitching unordered way-segments into one ordered line | ODbL | Good "modern pilgrimage" anchor; one-time ETL to linearize |
| **Itiner-e** (Roman roads, ancient itineraries) | 14,769 Roman road segments, ~150 CE | GeoJSON/Shapefile/GeoPackage, Zenodo | **CC BY 4.0** | Good for antiquity-era journeys (e.g. Peutinger-Table-style routes); network data, not a single path — trace through it |
| Austronesian/Polynesian migration | **No structured route dataset exists** — only point "first settlement" radiocarbon data (e.g. PNAS East Polynesia colonization study, 1,434 dates) and one narrow, QGIS-bundle-only academic dataset for mainland SE Asia | — | — | **Honest negative finding**: would need to be hand-built from settlement-date literature, island-group by island-group, despite being the most narratively compelling named example |
| Cook's voyages | Real KML tracks exist (Colin Hazlehurst's personal project, per-leg, from journal noon-positions) | KML/KMZ download | **Unlicensed personal blog** — fragile, no institutional backing | Usable but risky long-term; institutional digitizations (NLA, SLNSW) are scanned documents/images, not geodata |
| CLIWOC (1750–1854 ship logbooks) | 287,114 dated ship positions, 1,891 logbooks, filterable per-voyage | `.ods`/`.tsv`/`.gpkg`, HistoricalClimatology.com + LoC mirror | License unclear ("free") | Good for generic filler voyages; **not confirmed** to include Cook/Darwin specifically — those ships are documented separately |
| Hajj / Darb Zubaydah | ~20–30 station-level coordinates from UNESCO tentative-list + EAMENA survey | No single dataset — hand-curate from cited sources | — | Small, hand-built project, not an import |
| Wikidata (P1621, expeditions list) | P1621 is a **detail-map image link, not a route property** (corrects an initial hypothesis); the bot-maintained expeditions list has only start/end points, no waypoint sequence | — | — | Dead end for route geodata |

**Recommendation**: start with the **HMS Beagle GeoJSON** as a proof of concept for the `path` shape's time-correlated animation; add **Camino de Santiago** via OSM for a second, differently-sourced example; treat Polynesian migration as a deliberate hand-curated entry (settlement points + narrative ordering) rather than an import, and say so in the UI if/when built.

## 3. Trade routes

| Source | Coverage | Format/access | License | Maintained | Fit |
|---|---|---|---|---|---|
| **Itiner-e** | 14,769 Roman road segments, ~299,171 km, ~150 CE | GeoJSON (78MB)/Shapefile/GeoPackage, Zenodo DOI, nightly ndjson export | **CC BY 4.0** | Active, peer-reviewed 2025 | **Top pick** — open, current, no-auth, direct GeoJSON; land routes only (Roman world) |
| **ORBIS v2** (Stanford) | Roman-era network incl. real maritime LineStrings (Mediterranean/Black Sea/Red Sea, ~200 CE), 679 nodes/2,209 edges | CSV (Stanford Digital Repository) + `base_routes.geojson` (GitHub) | CC BY 3.0 | Static since ~2014, stably archived | Best complement to Itiner-e for maritime segments |
| **OWTRAD** (Ciolek/ANU) | 64 route + 2 node datasets, Africa/Europe/Asia/Middle East/China, ~4000 BCE–c.1900 CE, incl. actual Silk Road/Central Asia/trans-Saharan coverage other sources lack | Inline CSV edge-lists + MapInfo Interchange ZIP per dataset; KML advertised but inconsistently available | **CC BY-NC 2.5** (non-commercial) | Frozen since ~2007–2012, site occasionally flaky | Only real coordinate source found for Silk-Road-proper/trans-Saharan routes; non-commercial license and per-dataset inconsistency are real costs |
| Harvard DARMC Roman roads | Roman road network per Barrington Atlas | Shapefile (Dataverse) + live ArcGIS FeatureServer (GeoJSON/KML/CSV export) | CC BY-NC 3.0 | Frozen ("version 2008") | Valid fallback if Itiner-e is insufficient; non-commercial, older |
| UNESCO Silk Roads Programme | Narrative only — the one WHS property that should have GIS boundaries explicitly states data "will be made available once... received," i.e. not yet published | — | — | — | Dead end |
| OpenHistoricalMap | Right architecture (CC0, Overpass-queryable) but essentially **no real trade-route coverage** — "Silk Road" hits are a modern UK street; only 2 tiny disconnected Grand Trunk Road fragments found | — | CC0 | Active | Would need to be a data *contributor*, not consumer, today |
| Wikidata | No populated route geometry for Silk Road/Amber Road/Grand Trunk Road/Trans-Saharan (P3896 exists as a property but unpopulated; P15 route maps are raster images, not vectors) | — | CC0 | — | Not usable |
| CLIWOC | 287,114 dated ship positions, reconstructible into per-ship trade voyages | `.ods`/`.tsv`/`.gpkg` | Unclear | Static | Filler maritime trade voyages, not a named-route source |

**Recommendation**: **Itiner-e** first (best license/currency/format), **ORBIS v2** to add Mediterranean sea lanes, **OWTRAD** as the only option for the Silk Road/trans-Saharan routes specifically — accept its non-commercial license and unmaintained status as the cost of the only real coordinate data found for those routes.

## 4. Large building projects

| Source | Coverage | Format/access | License | Fit |
|---|---|---|---|---|
| **OpenStreetMap** (Overpass) | Great Wall: relation 318110, verified live — **6,130 way members**, edited as recently as 2026-07-17. Hadrian's Wall: fragmented `historic=*` ways + dedicated WHS relation 933533. Grand Canal: relation 1112801. Suez Canal: relation 7719838. Panama Canal: fragmented ways only, no unified relation found | Overpass API, no auth | ODbL | **Best general-purpose source** for wall/canal geometry; Wikidata's P402 property reliably indexes into the right OSM relation for a given historical entity |
| **Itiner-e** (Roman roads as construction, not just trade) | 299,171 km, ~150 CE | GeoJSON, Zenodo | CC BY 4.0 | Best current Roman-roads source; construction/date metadata per segment not confirmed |
| **Historic England NHLE Open Data Hub** | Hadrian's Wall WHS boundary (Core Area/Buffer Zone polygons) + individual Scheduled Monument sections | Esri Feature Service, GeoJSON export, updated daily | **OGL v3** | Most turnkey source found overall — but England-only, so only covers Hadrian's Wall |
| **WallGIS / WallCAP** (Newcastle Univ., Archaeology Data Service) | Feature-level data for every Hadrian's Wall turret/milecastle/fort/mile of curtain-ditch-vallum | Shapefile/CSV | Not fully confirmed — verify before use | Richest Hadrian's-Wall-specific detail if license checks out |
| UNESCO WH GIS (2012 IUCN/UNEP-WCMC KML) | **Natural/mixed sites only** — does not cover Great Wall, Hadrian's Wall, or the Grand Canal (all cultural sites) | — | — | Common point of confusion, ruled out for these examples specifically |
| UNESCO Sites Navigator (2022, Esri-based) | Aims for verified WHS boundaries globally, piloted in Europe/N. America | No confirmed open bulk endpoint found this pass | Unclear, possibly restricted | Promising but unverified — worth another look later |
| Chinese SACH Great Wall survey (2012) | Official 21,196.18 km length figure | No open GIS release found, descriptive reporting only | — | Not usable directly |
| Hobby GeoJSON repo (Adl3rAi) | Great Wall, split by direction/passes | GeoJSON, GitHub | MIT | Lower-confidence fallback — stale (2022), self-disclosed accuracy gaps in Liaodong |
| Wikidata | P625 is always a single representative point for these entities; **P402 reliably dereferences to the correct OSM relation** in both Great Wall and Hadrian's Wall cases | — | CC0 | Use as an index into OSM, not a geometry source |

**Recommendation**: **OpenStreetMap via Overpass**, keyed off Wikidata's P402 property, as the general-purpose source for all four named/adjacent examples; **Historic England's NHLE** specifically for Hadrian's Wall's official WHS boundary; **Itiner-e** for Roman roads as construction projects. None of these carry construction-phase/date metadata — that would need to be supplied as this app's own hand-curated event data layered on top of the fetched geometry, the same way point events already work.

## Cross-cutting observations

- **Wikidata is a good index, not a geometry source, across all four categories.** P402 (OSM relation ID) reliably points to real OSM/OHM geometry when it exists; P3896 (geoshape) is real but sparsely populated; P625 is always a single point, never a path/polygon, for anything linear or large. The useful pattern is "Wikidata → P402/P3896 → real geometry elsewhere," not treating Wikidata itself as the geometry provider — this is the same conclusion TODO items 6–10's Wikidata work already reached for point coordinates, just confirmed again for shapes.
- **OpenStreetMap/OpenHistoricalMap recur as the most consistently open, no-auth, actively maintained infrastructure**, but coverage is uneven per feature (excellent for the Great Wall, essentially empty for Silk Road-style trade routes) and both require an Overpass QL query plus OSM→GeoJSON conversion step that this project doesn't currently have.
- **Licensing varies widely and matters**: CC0/CC BY are freely reusable; CC BY-SA/ODbL require share-alike/attribution on redistribution; CC BY-NC (Ciolek/OWTRAD, DARMC) blocks commercial reuse, which is likely fine for a hobby project but worth remembering if that ever changes; GPL-3.0 (historical-basemaps) is copyleft applied to data files, not just code.
- **Two of the four candidate categories (boundaries, trade routes) have a clear "best pick" that's current, well-licensed, and schema-compatible** (Cliopatria; Itiner-e). **The other two (journeys, building projects) are more of a patchwork** — a few strong individual examples (Beagle voyage, Great Wall via OSM) alongside genuine gaps (no Polynesian migration dataset exists at all) that would need to be hand-curated rather than imported.

## Suggested next step (not part of this TODO item)

If/when this gets picked up as implementation work, the natural first slice — smallest, highest-confidence, spans multiple categories — would be: **Cliopatria for one or two well-known empires** (e.g. Rome, since AWMC's `roman_empire_ce_117_extent` can cross-check it) **+ the HMS Beagle GeoJSON + the Great Wall's OSM relation**, each as a single static-file/one-off-fetch proof of concept before committing to any ongoing ingestion pipeline. That would exercise `polygon`/`multipolygon` and `path` shapes with real data from three different source types (a purpose-built academic dataset, an enthusiast GeoJSON export, and OSM/Overpass) without requiring a new TODO item's worth of pipeline work up front.
