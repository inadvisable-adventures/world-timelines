import type { EventCategory } from '../types/index.js';

const ALL_CATEGORIES: EventCategory[] = [
  'person', 'event', 'place', 'artifact', 'pol_mil_organization',
  'business', 'historical_period', 'concepts', 'other',
];

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

const GLOBAL_ERAS_COLOR = '#c8a060';

export class CategoryPickerElement extends HTMLElement {
  private selected = new Set<EventCategory>(ALL_CATEGORIES);
  private chips = new Map<EventCategory, HTMLElement>();
  private globalErasChip!: HTMLElement;
  private globalEras = false; // synthetic 'Global Eras' toggle (not a real category)
  private _suppressEvent = false;

  connectedCallback(): void {
    const template = document.getElementById('category-picker-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    const list = shadow.getElementById('chip-list')!;

    for (const cat of ALL_CATEGORIES) {
      const chip = document.createElement('button');
      chip.className = 'chip selected';
      chip.dataset['category'] = cat;
      chip.style.setProperty('--color', CATEGORY_COLORS[cat]);
      chip.textContent = cat;
      chip.addEventListener('click', () => this.toggleCategory(cat));
      list.appendChild(chip);
      this.chips.set(cat, chip);
    }

    // Synthetic 'Global Eras' chip — toggles the timeline's top Global lane.
    const g = document.createElement('button');
    g.className = 'chip';
    g.dataset['synthetic'] = 'global-eras';
    g.style.setProperty('--color', GLOBAL_ERAS_COLOR);
    g.textContent = 'global eras';
    g.addEventListener('click', () => this.toggleGlobalEras());
    list.appendChild(g);
    this.globalErasChip = g;
  }

  private toggleGlobalEras(): void {
    this.globalEras = !this.globalEras;
    this.globalErasChip.classList.toggle('selected', this.globalEras);
    this.dispatchEvent(new CustomEvent('global-eras-toggled', {
      detail: { show: this.globalEras }, bubbles: true, composed: true,
    }));
  }

  private toggleCategory(cat: EventCategory): void {
    if (this.selected.has(cat)) {
      if (this.selected.size === 1) return; // keep at least one
      this.selected.delete(cat);
    } else {
      this.selected.add(cat);
    }
    this.updateChips();
    this.emitChange();
  }

  private updateChips(): void {
    for (const [cat, chip] of this.chips) {
      chip.classList.toggle('selected', this.selected.has(cat));
    }
  }

  private emitChange(): void {
    if (this._suppressEvent) return;
    this.dispatchEvent(new CustomEvent('category-filter-changed', {
      detail: { selected: [...this.selected] },
      bubbles: true,
      composed: true,
    }));
  }

  setSelected(cats: EventCategory[]): void {
    this._suppressEvent = true;
    this.selected = new Set(cats);
    this.updateChips();
    this._suppressEvent = false;
  }

  getSelected(): EventCategory[] {
    return [...this.selected];
  }
}

customElements.define('category-picker', CategoryPickerElement);
