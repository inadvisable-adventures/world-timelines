# Finding date-related Wikidata properties: query the property metadata directly, not Help:Properties

Date: 2026-07-16. Prompted by a question about widening ancient/classical
coverage: rather than relying on item-taxonomy expansion (the transitive
type-match fix in
`investigations/wikidata-event-transitive-type-match.md`), could querying
for the properties themselves — everything with a date-shaped value,
regardless of what kind of item it's attached to — surface more ancient/
classical entries than hunting for the right item types one at a time?
The original framing was: Wikidata's `Help:Properties` page lists under
14,000 properties, and that's a small enough list for an agent to review
for date-related ones.

## Is reviewing `Help:Properties` with an agent sensible? Better option found first.

Before spinning up an agent to read a ~14,000-row wiki help page, checked
whether Wikidata exposes property datatypes as queryable data — it does.
Every Wikidata property has a formal, machine-readable datatype
(`wikibase:propertyType`), and "Time" is one of the datatype values. This
is directly queryable:

```sparql
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?prop ?propLabel WHERE {
  ?prop wikibase:propertyType wikibase:Time .
  OPTIONAL { ?prop rdfs:label ?propLabel . FILTER(LANG(?propLabel)="en") }
}
```

**This ran in 4 milliseconds and returned all 70 Time-datatype properties,
exhaustively, in one request.**

## Why this is the better approach, not just an alternative one

- **Precise and authoritative**: queries Wikidata's own formal type
  system directly — the same metadata Wikidata itself uses to validate
  what values are legal for a property — rather than a human-curated
  documentation page that may be incomplete, stale, or use different
  category boundaries than the actual data model.
- **Exhaustive, not sampled**: one query returns literally every property
  with datatype Time, with no risk of an agent missing entries while
  paging through thousands of rows of wiki markup.
- **No interpretation risk**: an agent reading `Help:Properties` would
  need to judge, per row, whether a property is "date-related" from a
  name/description — introducing both misses (properties whose purpose
  isn't obvious from the name) and false positives (properties that
  sound date-related but aren't). Filtering by the actual datatype has
  no such ambiguity.
- **Fast**: 4ms vs. an open-ended agent task reading thousands of wiki
  rows.

**Conclusion: yes, the underlying idea (enumerate date-related properties
to widen the net beyond item-taxonomy hunting) is sensible — but do it via
this direct query against Wikidata's property metadata, not by having an
agent review `Help:Properties`.**

## The 70 properties, and which look promising for ancient/classical coverage

Most of the 70 are narrow/modern/domain-specific and not relevant here
(spacecraft launch/landing dates, taxon-naming publication years,
copyright/retrieval dates, archive dates, etc.). A few stand out as
plausible candidates for surfacing more ancient/classical entries that the
currently-used properties (`P569`/`P570` birth/death, `P585` point in
time, `P580`/`P582` start/end time, `P571` inception) miss:

| Property | Label | Why it's promising |
|---|---|---|
| `P1317` | floruit | The "flourished" date — used for historical figures (especially ancient ones) whose exact birth/death dates are unknown but whose active period is documented. Likely relevant to the `person` category specifically, potentially unlocking many ancient/classical figures currently excluded by requiring `P569` (exact birth date). |
| `P576` | dissolved, abolished or demolished date | An "end" date for organizations/states/structures — could feed `historical_period` or `pol_mil_organization` end dates, or a new "end of an empire/institution" event pattern. |
| `P575` | time of discovery or invention | Could unlock `artifact`/`concepts` category coverage for ancient inventions/discoveries currently missed if they lack `P571` (inception). |
| `P1249` | time of earliest written record | Relevant to ancient concepts/artifacts/places whose actual origin is unknown but whose first documented mention is known — a very "ancient history" shaped property. |

These are candidates, not verified findings — none of them have been
tested against real query volume or checked for the same
under-classification risk found in the elections investigation (a
property being formally date-typed doesn't guarantee it's populated for
many ancient items, the same way `P585` turned out to barely be populated
for ancient events at all). Recommended next step, if this is worth
pursuing: run the same kind of direct verification already applied
throughout this investigation — count how many ancient/classical
(`person` or a new category) items actually have `P1317` (or the others)
populated with a value before -500 or so, the same way
`event`'s `P585` coverage was checked and found wanting.

## Not implemented

This investigation is a feasibility check, not a proposed change — no
code was modified. `plans/qlever-improve-event-category.md` (transitive
type match + sports/election exclusions) does not depend on this and was
implemented separately. A follow-up TODO item would be needed to actually
add any of these properties to the query design.
