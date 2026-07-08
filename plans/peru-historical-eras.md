# Peru Historical Eras (TODO #51)

## Summary

Manually extract Peruvian historical periods from the History_of_Peru Wikipedia article
into `ingester/historical_eras_peru.tsv`. Covers Norte Chico through the modern republic,
including major pre-Columbian cultures, Inca Empire, Spanish colonial period, and independence.

## Affected Files

- `ingester/historical_eras_peru.tsv` — new file

## Schema

Same as `historical_eras_claude.tsv`. Tags: `["peru-history","manual-extraction","no-coords-found"]`.

## Periods to Include

- Norte Chico / Caral civilization (~3000 BCE – 1800 BCE)
- Chavín culture (~900 BCE – 200 BCE)
- Paracas culture (~800 BCE – 100 CE)
- Nazca culture (~100 BCE – 800 CE)
- Moche culture (~100 CE – 700 CE)
- Tiwanaku (~300 CE – 1000 CE)
- Wari Empire (~600 CE – 1100 CE)
- Chimu Kingdom (~900 CE – 1470 CE)
- Inca Empire (~1438 CE – 1533 CE)
- Spanish Conquest (~1532 CE – 1542 CE)
- Viceroyalty of Peru (1542 CE – 1824 CE)
- Peruvian War of Independence (1810 CE – 1824 CE)
- Republic of Peru (1821 CE – present)

## Verification

- TSV parses without error; column count consistent with schema
- `npm run build` passes
