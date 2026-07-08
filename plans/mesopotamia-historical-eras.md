# Mesopotamia Historical Eras (TODO #53)

## Summary

Manually extract Mesopotamian historical periods from the History_of_Mesopotamia Wikipedia
article into `ingester/historical_eras_mesopotamia.tsv`. Covers the Ubaid period through
the Ottoman era, including Sumerian city-states, Babylonian and Assyrian empires, and
successive foreign rules (Persian, Seleucid, Parthian, Sassanid, Islamic, Mongol, Ottoman).

## Affected Files

- `ingester/historical_eras_mesopotamia.tsv` — new file

## Schema

Same as `historical_eras_claude.tsv`. Tags: `["mesopotamia-history","manual-extraction","no-coords-found"]`.

## Periods to Include

- Ubaid period (~6500 BCE – 3800 BCE)
- Uruk period (~4000 BCE – 3100 BCE)
- Jemdet Nasr period (~3100 BCE – 2900 BCE)
- Early Dynastic period (~2900 BCE – 2350 BCE)
- Akkadian Empire (2334 BCE – 2154 BCE)
- Gutian interlude (2154 BCE – 2112 BCE)
- Third Dynasty of Ur / Neo-Sumerian (2112 BCE – 2004 BCE)
- Old Babylonian period (~2000 BCE – 1595 BCE)
- Kassite Babylonia (1595 BCE – 1155 BCE)
- Middle Assyrian period (1365 BCE – 912 BCE)
- Neo-Assyrian Empire (912 BCE – 609 BCE)
- Neo-Babylonian Empire (626 BCE – 539 BCE)
- Achaemenid Mesopotamia (539 BCE – 330 BCE)
- Seleucid Mesopotamia (312 BCE – 141 BCE)
- Parthian Mesopotamia (141 BCE – 224 CE)
- Sassanid Mesopotamia (224 CE – 651 CE)
- Early Islamic Caliphates in Mesopotamia (637 CE – 750 CE)
- Abbasid Caliphate / Baghdad (750 CE – 1258 CE)
- Mongol Iraq / Ilkhanate (1258 CE – 1335 CE)
- Ottoman Iraq (1534 CE – 1918 CE)

## Verification

- TSV parses without error; column count consistent with schema
- `npm run build` passes
