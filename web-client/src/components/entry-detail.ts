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
  private descEl!: HTMLElement;
  private onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') this.hide(); };

  connectedCallback(): void {
    const template = document.getElementById('entry-detail-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.linkEl = shadow.getElementById('detail-link') as HTMLAnchorElement;
    this.yearsEl = shadow.getElementById('detail-years')!;
    this.catEl  = shadow.getElementById('detail-cat')!;
    this.descEl = shadow.getElementById('detail-desc')!;

    shadow.getElementById('close-btn')!.addEventListener('click', () => this.hide());
    document.addEventListener('keydown', this.onKeyDown);
    this.hide();
  }

  disconnectedCallback(): void {
    document.removeEventListener('keydown', this.onKeyDown);
  }

  show(ev: HistoricalEvent): void {
    this.linkEl.textContent = ev.title;
    this.linkEl.href = `https://en.wikipedia.org/wiki/${encodeURIComponent(ev.title)}`;
    this.yearsEl.textContent = formatYears(ev);
    const color = CATEGORY_COLORS[ev.category];
    this.catEl.textContent = ev.category.replace(/_/g, ' ');
    this.catEl.style.color = color;
    this.catEl.style.borderColor = color;
    this.descEl.textContent = ev.description;
    this.classList.remove('hidden');
  }

  // Shows a lane/laneset (name + description) instead of an entry. Reuses the
  // same panel; the title is plain text (no wiki link), no year/category.
  showLane(name: string, description: string): void {
    this.linkEl.textContent = name;
    this.linkEl.removeAttribute('href');
    this.yearsEl.textContent = '';
    this.catEl.textContent = 'lane';
    this.catEl.style.color = '#c8a060';
    this.catEl.style.borderColor = '#c8a060';
    this.descEl.textContent = description;
    this.classList.remove('hidden');
  }

  hide(): void {
    this.classList.add('hidden');
  }
}

customElements.define('entry-detail', EntryDetailElement);
