# China Historical Eras (TODO #49)

## Summary

Manually extract Chinese historical periods from the History_of_China Wikipedia article
into `ingester/historical_eras_china.tsv`, following the schema of `historical_eras_claude.tsv`.
Covers pre-imperial legends through the People's Republic, with overlapping macro-periods
and individual dynasties. All dates use the proleptic Gregorian calendar; BCE years are negative.

## Affected Files

- `ingester/historical_eras_china.tsv` — new file

## Schema

Same as `historical_eras_claude.tsv`:
```
id  title  locations  start_year  start_month  start_day  end_year  end_month  end_day
start_expr  end_expr  calendar  uncertainty_years  category  infobox_type  description  tags
```

- `locations`: always `[]` (eras have no point coords)
- `calendar`: `gregorian`
- `category`: `historical_period`
- `infobox_type`: `manual`
- `tags`: `["china-history","manual-extraction","no-coords-found"]`

## Periods to Include

Broad macro-periods (overlapping with specific dynasties):
- Pre-Imperial China (~2070 BCE – 221 BCE)
- Imperial China (221 BCE – 1912 CE)

Specific dynasties and periods, in order:
- Three Sovereigns and Five Emperors (legendary, ~2852 BCE – 2070 BCE)
- Xia Dynasty (~2070 BCE – ~1600 BCE)
- Shang Dynasty (~1600 BCE – 1046 BCE)
- Western Zhou (1046 BCE – 771 BCE)
- Spring and Autumn period (770 BCE – 476 BCE)
- Warring States period (475 BCE – 221 BCE)
- Qin Dynasty (221 BCE – 206 BCE)
- Western Han (206 BCE – 9 CE)
- Xin Dynasty (9 CE – 23 CE)
- Eastern Han (25 CE – 220 CE)
- Three Kingdoms (220 CE – 280 CE)
- Jin Dynasty (265 CE – 420 CE)
- Sixteen Kingdoms (304 CE – 439 CE)
- Northern and Southern Dynasties (420 CE – 589 CE)
- Sui Dynasty (581 CE – 618 CE)
- Tang Dynasty (618 CE – 907 CE)
- Five Dynasties and Ten Kingdoms (907 CE – 979 CE)
- Liao Dynasty (907 CE – 1125 CE)
- Song Dynasty (960 CE – 1279 CE)
- Jin Dynasty (Jurchen) (1115 CE – 1234 CE)
- Yuan Dynasty (1271 CE – 1368 CE)
- Ming Dynasty (1368 CE – 1644 CE)
- Qing Dynasty (1644 CE – 1912 CE)
- Republic of China (1912 CE – 1949 CE)
- People's Republic of China (1949 CE – present)

## Verification

- TSV parses without error (headers present, column count consistent)
- Date ranges are plausible and match standard reference chronology
- `npm run build` passes (no web-client changes)
