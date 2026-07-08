import { proposedCategoryName } from './infobox-parser.js';

interface CatalogEntry {
  infoboxType: string;
  proposedCategory: string;
  count: number;
  wasIncluded: boolean;
  includeInFuture: boolean;
}

export class InboxCatalog {
  private entries = new Map<string, CatalogEntry>();
  private readonly includeSet: Set<string>;

  // `includeSet` is the set of infobox types the run treats as included (i.e.
  // the human-reviewed `include_in_future=1` set read via catalog_input). The
  // written-back catalog preserves these flags instead of deriving them from
  // co-occurrence — otherwise `include_in_future` grows every run as sub- and
  // sibling-templates on included pages get marked, and hand-removed types (e.g.
  // `ship`) silently reappear. Newly-discovered types default to 0 (surfaced via
  // `was_included` for human review, never auto-included).
  constructor(includeSet: Set<string> = new Set()) {
    this.includeSet = includeSet;
  }

  record(infoboxType: string, wasIncluded: boolean): void {
    let entry = this.entries.get(infoboxType);
    if (!entry) {
      entry = {
        infoboxType,
        proposedCategory: proposedCategoryName(infoboxType),
        count: 0,
        wasIncluded,
        includeInFuture: this.includeSet.has(infoboxType),
      };
      this.entries.set(infoboxType, entry);
    }
    entry.count++;
    if (wasIncluded) entry.wasIncluded = true;
  }

  toTsv(): string {
    const header = 'infobox_type\tproposed_category\tcount\twas_included\tinclude_in_future\n';
    const rows = [...this.entries.values()]
      .sort((a, b) => b.count - a.count)
      .map(e =>
        [
          e.infoboxType,
          e.proposedCategory,
          e.count,
          e.wasIncluded ? '1' : '0',
          e.includeInFuture ? '1' : '0',
        ].join('\t'),
      );
    return header + rows.join('\n') + '\n';
  }
}
