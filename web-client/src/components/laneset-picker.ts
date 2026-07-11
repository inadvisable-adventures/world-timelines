import type { Laneset } from '../types/index.js';

// Sidebar control below the category picker. Shows the current laneset name;
// clicking opens a pick-list of all lanesets plus "None". Selection is
// bidirectional with the DSL `laneset` line (driven from app-root).
export class LanesetPickerElement extends HTMLElement {
  private lanesets: Laneset[] = [];
  private selectedId = 'continents';
  private currentBtn!: HTMLElement;
  private popup!: HTMLElement;
  private _suppressEvent = false;

  connectedCallback(): void {
    const template = document.getElementById('laneset-picker-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.currentBtn = shadow.getElementById('current')!;
    this.popup = shadow.getElementById('popup')!;

    this.currentBtn.addEventListener('click', (e) => { e.stopPropagation(); this.togglePopup(); });
    // Close when clicking outside.
    document.addEventListener('click', () => this.closePopup());
    this.popup.addEventListener('click', (e) => e.stopPropagation());
  }

  setLanesets(lanesets: Laneset[]): void {
    this.lanesets = lanesets;
    this.rebuildPopup();
    this.updateCurrent();
  }

  setSelected(id: string): void {
    this._suppressEvent = true;
    this.selectedId = id;
    this.updateCurrent();
    this.highlightPopup();
    this._suppressEvent = false;
  }

  getSelected(): string { return this.selectedId; }

  private options(): { id: string; name: string; description: string }[] {
    return [
      ...this.lanesets.map(l => ({ id: l.slug, name: l.name, description: l.description })),
      { id: 'none', name: 'None', description: 'Hide geographic lanes.' },
    ];
  }

  private rebuildPopup(): void {
    this.popup.textContent = '';
    for (const opt of this.options()) {
      const item = document.createElement('button');
      item.className = 'item';
      item.dataset['id'] = opt.id;
      const name = document.createElement('div');
      name.className = 'item-name';
      name.textContent = opt.name;
      const desc = document.createElement('div');
      desc.className = 'item-desc';
      desc.textContent = opt.description;
      item.append(name, desc);
      item.addEventListener('click', () => this.select(opt.id));
      this.popup.appendChild(item);
    }
    this.highlightPopup();
  }

  private updateCurrent(): void {
    const opt = this.options().find(o => o.id === this.selectedId);
    this.currentBtn.textContent = opt ? opt.name : this.selectedId;
  }

  private highlightPopup(): void {
    for (const el of Array.from(this.popup.children)) {
      (el as HTMLElement).classList.toggle('selected', (el as HTMLElement).dataset['id'] === this.selectedId);
    }
  }

  private togglePopup(): void { this.popup.classList.toggle('hidden'); }
  private closePopup(): void { this.popup.classList.add('hidden'); }

  private select(id: string): void {
    this.selectedId = id;
    this.updateCurrent();
    this.highlightPopup();
    this.closePopup();
    if (!this._suppressEvent) {
      this.dispatchEvent(new CustomEvent('laneset-changed', {
        detail: { id }, bubbles: true, composed: true,
      }));
    }
  }
}

customElements.define('laneset-picker', LanesetPickerElement);
