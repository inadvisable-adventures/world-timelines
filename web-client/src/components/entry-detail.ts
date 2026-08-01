import type { EventCategory, HistoricalEvent } from '../types/index.js';

const CATEGORY_COLORS: Record<EventCategory, string> = {
  person:              '#7eb8f7',
  event:               '#f7a07e',
  place:               '#7ef7a0',
  artifact:            '#f7e07e',
  pol_mil_organization:'#f77e7e',
  business:            '#7edef7',
  historical_period:   '#d4a07e',
  concepts:            '#b07ef7',
  other:               '#c0b0e0',
};

function formatYear(y: number): string {
  return y < 0 ? `${-y} BCE` : `${y}`;
}

function formatYears(ev: HistoricalEvent): string {
  const start = formatYear(ev.startDate.startYear);
  if (!ev.endDate) return start;
  const end = formatYear(ev.endDate.startYear);
  return start === end ? start : `${start} – ${end}`;
}

export class EntryDetailElement extends HTMLElement {
  private linkEl!: HTMLAnchorElement;
  private yearsEl!: HTMLElement;
  private catEl!: HTMLElement;
  private sourceEl!: HTMLElement;
  private wikiLinkEl!: HTMLAnchorElement;
  private pinBtnEl!: HTMLButtonElement;
  private expandBtnEl!: HTMLButtonElement;
  private descEl!: HTMLElement;
  private currentEntryId: string | null = null;
  private onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') this.hide(); };

  connectedCallback(): void {
    const template = document.getElementById('entry-detail-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.linkEl = shadow.getElementById('detail-link') as HTMLAnchorElement;
    this.yearsEl = shadow.getElementById('detail-years')!;
    this.catEl  = shadow.getElementById('detail-cat')!;
    this.sourceEl = shadow.getElementById('detail-source')!;
    this.wikiLinkEl = shadow.getElementById('detail-wiki-link') as HTMLAnchorElement;
    this.pinBtnEl = shadow.getElementById('pin-btn') as HTMLButtonElement;
    this.expandBtnEl = shadow.getElementById('expand-btn') as HTMLButtonElement;
    this.descEl = shadow.getElementById('detail-desc')!;

    shadow.getElementById('close-btn')!.addEventListener('click', () => this.hide());
    this.pinBtnEl.addEventListener('click', () => {
      if (!this.currentEntryId) return;
      this.dispatchEvent(new CustomEvent('pin-toggled', {
        detail: { id: this.currentEntryId },
        bubbles: true,
        composed: true,
      }));
    });
    this.expandBtnEl.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('expand-toggled', {
        detail: { panel: 'detail' }, bubbles: true, composed: true,
      }));
    });
    document.addEventListener('keydown', this.onKeyDown);
    this.hide();
  }

  disconnectedCallback(): void {
    document.removeEventListener('keydown', this.onKeyDown);
  }

  show(ev: HistoricalEvent, isPinned: boolean): void {
    this.currentEntryId = ev.id;
    this.linkEl.textContent = ev.title;
    this.linkEl.href = ev.citationUrl;
    this.yearsEl.textContent = formatYears(ev);
    const color = CATEGORY_COLORS[ev.category];
    this.catEl.textContent = ev.category.replace(/_/g, ' ');
    this.catEl.style.color = color;
    this.catEl.style.borderColor = color;
    this.sourceEl.textContent = `· ${ev.citationLabel}`;
    this.pinBtnEl.classList.remove('hidden');
    this.expandBtnEl.classList.remove('hidden');
    this.setPinned(isPinned);
    // Secondary cross-reference to Wikipedia (TODO item 7), shown only
    // when it adds real information beyond the primary citation above —
    // i.e. not for entries whose primary citation already is Wikipedia.
    // See plans/entry-detail-citation-precision.md.
    if (ev.wikipediaTitle && ev.citationLabel !== 'Wikipedia') {
      this.wikiLinkEl.href = `https://en.wikipedia.org/wiki/${encodeURIComponent(ev.wikipediaTitle)}`;
      this.wikiLinkEl.classList.remove('hidden');
    } else {
      this.wikiLinkEl.removeAttribute('href');
      this.wikiLinkEl.classList.add('hidden');
    }
    this.descEl.textContent = ev.description;
    this.classList.remove('hidden');
  }

  // Shows a lane/laneset (name + description) instead of an entry. Reuses the
  // same panel; the title is plain text (no wiki link), no year/category.
  showLane(name: string, description: string): void {
    this.currentEntryId = null;
    this.linkEl.textContent = name;
    this.linkEl.removeAttribute('href');
    this.yearsEl.textContent = '';
    this.catEl.textContent = 'lane';
    this.catEl.style.color = '#c8a060';
    this.catEl.style.borderColor = '#c8a060';
    this.sourceEl.textContent = '';
    this.wikiLinkEl.removeAttribute('href');
    this.wikiLinkEl.classList.add('hidden');
    this.pinBtnEl.classList.add('hidden'); // lanes aren't pinnable
    this.expandBtnEl.classList.add('hidden'); // lanes aren't expandable either
    this.descEl.textContent = description;
    this.classList.remove('hidden');
  }

  // Updates just the pin button's visual state — used both by show() and by
  // app-root when pin state changes elsewhere (e.g. the DSL was edited
  // directly) while this same entry is already open.
  setPinned(isPinned: boolean): void {
    this.pinBtnEl.classList.toggle('pinned', isPinned);
    this.pinBtnEl.title = isPinned ? 'Unpin this entry' : 'Pin this entry';
  }

  // Reflects expand/restore state driven by app-root (TODO #18). Toggling
  // the host's own .expanded class (not just the button's) lets the
  // template's CSS lift #detail-desc's line-clamp while expanded — more
  // space should show more of the description, not waste it.
  setExpanded(isExpanded: boolean): void {
    this.expandBtnEl.classList.toggle('expanded', isExpanded);
    this.classList.toggle('expanded', isExpanded);
  }

  hide(): void {
    this.classList.add('hidden');
  }
}

customElements.define('entry-detail', EntryDetailElement);
