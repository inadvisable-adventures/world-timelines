# Egypt Historical Eras (TODO #50)

## Summary

Manually extract Egyptian historical periods from the History_of_Egypt Wikipedia article
into `ingester/historical_eras_egypt.tsv`. Covers predynastic Egypt through the modern
republic, including pharaonic kingdoms, intermediate periods, and successive foreign rules.

## Affected Files

- `ingester/historical_eras_egypt.tsv` — new file

## Schema

Same as `historical_eras_claude.tsv`. Tags: `["egypt-history","manual-extraction","no-coords-found"]`.

## Periods to Include

- Predynastic Egypt (~6000 BCE – 3100 BCE)
- Early Dynastic Period / Proto-Dynastic (~3100 BCE – 2686 BCE)
- Old Kingdom (~2686 BCE – 2181 BCE)
- First Intermediate Period (2181 BCE – 2055 BCE)
- Middle Kingdom (2055 BCE – 1650 BCE)
- Second Intermediate Period / Hyksos (1650 BCE – 1550 BCE)
- New Kingdom (1550 BCE – 1070 BCE)
- Third Intermediate Period (1070 BCE – 664 BCE)
- Late Period (664 BCE – 332 BCE)
- Achaemenid Egypt (525 BCE – 332 BCE, overlapping Late Period)
- Ptolemaic Kingdom (305 BCE – 30 BCE)
- Roman Egypt (30 BCE – 395 CE)
- Byzantine Egypt (395 CE – 641 CE)
- Islamic Egypt / Rashidun–Abbasid (641 CE – 969 CE)
- Fatimid Caliphate in Egypt (969 CE – 1171 CE)
- Ayyubid Sultanate (1171 CE – 1250 CE)
- Mamluk Sultanate (1250 CE – 1517 CE)
- Ottoman Egypt (1517 CE – 1798 CE)
- Muhammad Ali dynasty / Khedivate (1805 CE – 1952 CE)
- Republic of Egypt (1952 CE – present)

## Verification

- TSV parses without error; column count consistent with schema
- `npm run build` passes
