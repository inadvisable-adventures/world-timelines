# Rome Historical Eras (TODO #52)

## Summary

Manually extract Roman historical periods from the History_of_Rome Wikipedia article
into `ingester/historical_eras_rome.tsv`. Covers the Roman Kingdom through the fall of
the Western Empire and the Byzantine successor, with sub-periods of the Republic and Empire.

## Affected Files

- `ingester/historical_eras_rome.tsv` — new file

## Schema

Same as `historical_eras_claude.tsv`. Tags: `["rome-history","manual-extraction","no-coords-found"]`.

## Periods to Include

- Roman Kingdom (~753 BCE – 509 BCE)
- Roman Republic (509 BCE – 27 BCE)
  - Early Roman Republic (509 BCE – 264 BCE)
  - Middle Roman Republic (264 BCE – 133 BCE)
  - Late Roman Republic (133 BCE – 27 BCE)
- Roman Empire (27 BCE – 476 CE)
  - Principate / Pax Romana (27 BCE – 180 CE)
  - Crisis of the Third Century (235 CE – 284 CE)
  - Dominate (284 CE – 476 CE)
- Western Roman Empire (395 CE – 476 CE)
- Eastern Roman Empire / Byzantine (395 CE – 1453 CE)

## Verification

- TSV parses without error; column count consistent with schema
- `npm run build` passes
