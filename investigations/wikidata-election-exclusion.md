# Elections in the QLever `event` category: a bigger, messier finding than sports

Date: 2026-07-16. Found during the same ~1000-record stratified sample
(`-3000`..`1899`, five era buckets) that surfaced the sports-season finding
(`investigations/wikidata-sports-exclusion.md`) — this one turned out to
need real judgment calls rather than one clean blanket exclusion.

## The headline number

Of the 9,767 total events matching the `event` category's filters (real
"is some kind of event" via transitive type match, has a `P585` date, has
an English Wikipedia page, not fictional — across `-3000`..`1899`):

**5,158 (52.8%) are typed as `Q40231` ("election")** — more than half of
everything currently returned by the `event` category is elections.

## Why this isn't a clean blanket exclusion (unlike sports seasons)

Sampling the stratified set initially suggested a mix of clearly
significant events (papal elections, Holy Roman Empire imperial
elections — the medieval-heavy buckets happened to surface a lot of
these) and clearly narrow ones. Breaking down the full 5,158 by exact
Wikidata subtype (`?item wdt:P31 ?type`, grouped and counted) told a more
complete story: the total is **overwhelmingly granular, sub-national,
single-seat U.S./U.K. administrative elections**, with a smaller tail of
genuinely national/significant ones.

### Proposed for exclusion (narrow scope, high volume, low individual significance)

| Q-id | Type | Count | What it actually is |
|---|---|---|---|
| `Q15261477` | gubernatorial election | 1,022 | Election for a single U.S. state's governor |
| `Q1057954` | by-election | 993 | A special election to fill one vacant seat outside the normal election cycle (any country) |
| `Q24397514` | United States House of Representatives election | 390 | A single U.S. congressional district's House race |
| `Q26466721` | special election to the United States House of Representatives | 205 | An off-cycle U.S. House race to fill a vacancy |
| `Q15280243` | mayoral election | 150 | A single city's mayoral race |
| `Q152450` | municipal election | 111 | A city/local-government election |
| `Q7864918` | UK Parliamentary by-election | 106 | The UK-specific instance of a by-election (may already be covered transitively by `Q1057954`, listed explicitly for clarity/safety) |
| `Q24333627` | United States Senate election | 56 | A single U.S. state's Senate seat race |
| `Q112711344` | United States presidential elections in a single state | 28 each × 50 states (only PA/NJ/CT visible in the top-20 sample, but this is the shared parent class for all of them) | The state-by-state sub-article breakdown of a U.S. presidential election — **not** the national election itself, which is a separate, kept class |

Excluding these via `FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:<Q-id> }`
for each (a curated denylist, not one shared ancestor class — see below for
why) removes roughly **3,000+ of the 5,158** election items — the exact
figure depends on the state-level presidential sub-articles beyond the
three sampled, which weren't individually counted.

### Proposed to keep (national/broader scope, or genuinely mixed and risky to exclude)

| Q-id | Type | Count | Why kept |
|---|---|---|---|
| `Q26252880` | United States general election | 55 | The national presidential election itself |
| `Q22266255` | Belgian general election | 40 | National-level |
| `Q832107` | Imperial election (Holy Roman Empire) | 37 | Medieval European history, genuinely significant |
| `Q3587148` | French legislative election | 33 | National-level |
| `Q5354734` | elections in Liberia | 33 | A country-level umbrella, not sub-national |
| `Q22276038` | Norwegian parliamentary election | 30 | National-level |
| `Q2618461` | legislative election (generic/unqualified) | 105 | Ambiguous but presumed national-legislature scope by default; not confirmed to be narrow, kept absent evidence otherwise |
| `Q40231` (bare, no more specific subtype) | "public election" | 617 | **Sampled directly — see below.** A genuine mix; excluding this tier would incorrectly drop significant events |

**The bare `Q40231` tier (617 items, second-largest single bucket) was
sampled directly rather than assumed.** It turned out to be a real mix:
several **British general elections** (1708, 1710, 1713, 1715, 1722, 1727,
1734, 1741, 1747, 1754 — all lacking a more specific Wikidata subclass,
apparently just under-classified rather than actually narrow),
**Venetian doge elections** (1229, 1423 — historically significant
city-state head-of-state elections), but also a **University of Cambridge
Chancellor election** and a **British Virgin Islands Assembly election**
(narrow/institutional). Given this tier contains real, significant
national-level events (British general elections) purely because of
incomplete Wikidata subclassing, excluding it wholesale would produce
false negatives worse than the noise it would remove — so it's proposed to
stay, accepting the university/small-territory items as residual noise.

## Net effect if implemented

Excluding the "proposed for exclusion" list above removes roughly
3,000–3,600 of the 9,767 total events (~31–37%), leaving the genuinely
national/significant elections (general elections, imperial elections,
legislative elections) alongside the rest of the event dataset (military
campaigns, synods/church councils, treaties, etc., which were **not**
found to have the same kind of systematic low-value clustering as sports
seasons and narrow elections did).

## Implemented as

See `plans/qlever-improve-event-category.md` for the concrete
implementation (a curated `FILTER NOT EXISTS` list, one clause per
excluded Q-id, added to the `event` category's `excludePatterns`
alongside the sports-season exclusion from
`investigations/wikidata-sports-exclusion.md`).
