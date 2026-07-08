# West Africa Historical Eras (TODO #55)

## Summary

Manually extract West African historical periods from the History_of_West_Africa Wikipedia
article into `ingester/historical_eras_west_africa.tsv`, following the schema of
`historical_eras_claude.tsv`. Fold the new file into the merged
`web-client/public/data/historical_eras.tsv` and register a color for the
`"west-africa-history"` source in the timeline's `ERA_SOURCE_COLORS` map.

## Affected Files

- `ingester/historical_eras_west_africa.tsv` — new file
- `web-client/public/data/historical_eras.tsv` — append new rows
- `web-client/src/components/timeline.ts` — add `'west-africa-history'` color entry

## Schema

Same as `historical_eras_claude.tsv`. Tags: `["west-africa-history","manual-extraction","no-coords-found"]`.

## Periods to Include

- Nok culture (~1000 BCE – 300 CE)
- Djenné-Djenno (~250 BCE – 1400 CE)
- Ghana Empire (~300 CE – 1235 CE)
- Mali Empire (~1235 CE – 1600 CE)
- Songhai Empire (~1430 CE – 1591 CE)
- Kanem-Bornu Empire (~700 CE – 1900 CE)
- Jolof Empire (~1350 CE – 1549 CE)
- Benin Kingdom (~1180 CE – 1897 CE)
- Oyo Empire (~1400 CE – 1836 CE)
- Dahomey Kingdom (~1600 CE – 1894 CE)
- Ashanti Empire (~1701 CE – 1902 CE)
- Trans-Saharan trade era (~800 CE – 1600 CE)
- Atlantic slave trade (~1500 CE – 1807 CE)
- Sokoto Caliphate (1804 CE – 1903 CE)
- Colonial period / Scramble for Africa (~1880 CE – 1960 CE)
- Post-independence modern era (1957 CE – present)

## Color

`'west-africa-history': '#90c040'` (yellow-green; distinct from Peru's teal and Egypt's gold)

## Verification

- TSV parses without error; column count consistent with schema
- Merged `historical_eras.tsv` row count increases by the number of new entries
- `npm run build` passes
