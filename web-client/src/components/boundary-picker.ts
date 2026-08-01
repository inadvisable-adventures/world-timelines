import type { BoundaryOption } from '../types/index.js';

// Sidebar control below the laneset picker. Lets the user pick an imported
// boundary polygon (e.g. TODO #12's Cliopatria entries) to filter results
// by "inside"/"outside", bidirectional with the DSL `filter inside:`/
// `filter outside:` lines (driven from app-root) — same button+popup
// pattern as laneset-picker.ts, except each row has two independent
// toggles rather than one click-to-select, since inside and outside are
// independent selections. See plans/boundary-geometry-spatial-filter.md.
export class BoundaryPickerElement extends HTMLElement {
  private boundaries: BoundaryOption[] = [];
  private insideSlug: string | null = null;
  private outsideSlug: string | null = null;
  private currentBtn!: HTMLElement;
  private popup!: HTMLElement;
  private _suppressEvent = false;

  connectedCallback(): void {
    const template = document.getElementById('boundary-picker-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.currentBtn = shadow.getElementById('current')!;
    this.popup = shadow.getElementById('popup')!;

    this.currentBtn.addEventListener('click', (e) => { e.stopPropagation(); this.togglePopup(); });
    document.addEventListener('click', () => this.closePopup());
    this.popup.addEventListener('click', (e) => e.stopPropagation());

    this.updateCurrent();
  }

  setBoundaries(boundaries: BoundaryOption[]): void {
    this.boundaries = boundaries;
    this.rebuildPopup();
    this.updateCurrent();
  }

  setSelected(selection: { inside: string | null; outside: string | null }): void {
    this._suppressEvent = true;
    this.insideSlug = selection.inside;
    this.outsideSlug = selection.outside;
    this.updateCurrent();
    this.highlightPopup();
    this._suppressEvent = false;
  }

  getSelected(): { inside: string | null; outside: string | null } {
    return { inside: this.insideSlug, outside: this.outsideSlug };
  }

  private rebuildPopup(): void {
    this.popup.textContent = '';
    if (this.boundaries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No imported boundaries yet.';
      this.popup.appendChild(empty);
      return;
    }
    for (const b of this.boundaries) {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset['slug'] = b.slug;
      const name = document.createElement('div');
      name.className = 'row-name';
      name.textContent = b.title;
      const inBtn = document.createElement('button');
      inBtn.className = 'toggle in';
      inBtn.textContent = 'In';
      inBtn.title = `Only show entries inside ${b.title}`;
      inBtn.addEventListener('click', () => this.toggleInside(b.slug));
      const outBtn = document.createElement('button');
      outBtn.className = 'toggle out';
      outBtn.textContent = 'Out';
      outBtn.title = `Only show entries outside ${b.title}`;
      outBtn.addEventListener('click', () => this.toggleOutside(b.slug));
      row.append(name, inBtn, outBtn);
      this.popup.appendChild(row);
    }
    this.highlightPopup();
  }

  private updateCurrent(): void {
    if (!this.insideSlug && !this.outsideSlug) {
      this.currentBtn.textContent = 'None';
      return;
    }
    const nameFor = (slug: string) => this.boundaries.find(b => b.slug === slug)?.title ?? slug;
    const parts: string[] = [];
    if (this.insideSlug) parts.push(`Inside ${nameFor(this.insideSlug)}`);
    if (this.outsideSlug) parts.push(`Outside ${nameFor(this.outsideSlug)}`);
    this.currentBtn.textContent = parts.join(', ');
  }

  private highlightPopup(): void {
    for (const el of Array.from(this.popup.children)) {
      const row = el as HTMLElement;
      const slug = row.dataset['slug'];
      const inBtn = row.querySelector('.toggle.in');
      const outBtn = row.querySelector('.toggle.out');
      inBtn?.classList.toggle('selected', slug === this.insideSlug);
      outBtn?.classList.toggle('selected', slug === this.outsideSlug);
    }
  }

  private togglePopup(): void { this.popup.classList.toggle('hidden'); }
  private closePopup(): void { this.popup.classList.add('hidden'); }

  private toggleInside(slug: string): void {
    this.insideSlug = this.insideSlug === slug ? null : slug;
    this.updateCurrent();
    this.highlightPopup();
    this.fireChanged();
  }

  private toggleOutside(slug: string): void {
    this.outsideSlug = this.outsideSlug === slug ? null : slug;
    this.updateCurrent();
    this.highlightPopup();
    this.fireChanged();
  }

  private fireChanged(): void {
    if (this._suppressEvent) return;
    this.dispatchEvent(new CustomEvent('boundary-filter-changed', {
      detail: { inside: this.insideSlug, outside: this.outsideSlug },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('boundary-picker', BoundaryPickerElement);
