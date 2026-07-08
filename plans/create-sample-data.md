# Create Sample Data Files

## Summary

Populate `public/data/events.tsv` with ~40 well-known historical events spanning multiple continents and time periods, and save a simplified world map GeoJSON file.

## Affected Files

- `web-client/public/data/events.tsv`
- `web-client/public/data/world-110m.geojson`

## Step-by-Step Implementation

1. Write `events.tsv` with TSV header row followed by ~40 events covering:
   - Ancient history (e.g., construction of pyramids, founding of Rome, Battle of Marathon)
   - Medieval period (e.g., fall of Rome, Magna Carta, Black Death, Mongol Empire)
   - Early modern (e.g., Columbus voyage, Gutenberg press, Scientific Revolution figures)
   - Modern (e.g., French Revolution, Industrial Revolution, World Wars, Moon landing)
   - Geographically diverse: Europe, Asia, Americas, Africa, Middle East
2. Fetch the Natural Earth 110m world GeoJSON (`ne_110m_admin_0_countries`) and save to `public/data/world-110m.geojson`.
   - This is public domain data; ~200 KB.

## Key Design Decisions

- Events with a single point in time have `startYear === endYear`.
- Person events use birth/death years as start/end and the birthplace as lat/lng.
- Descriptions are capped at ~120 characters to avoid long lines in TSV.
- The world GeoJSON is included as a static asset (data file), not a library dependency.
