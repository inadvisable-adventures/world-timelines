import type { DataSource } from '../types/index.js';

// Gear icon in the app's upper-right. Clicking opens a small popup letting
// the user pick the active data source. Mirrors laneset-picker.ts's
// button+popup interaction pattern.
const OPTIONS: Array<{ id: DataSource; name: string }> = [
  { id: 'postgres', name: 'World Timelines test data' },
  { id: 'wikidata', name: 'Wikidata (QLever)' },
];

export class SettingsMenuElement extends HTMLElement {
  private popup!: HTMLElement;
  private listEl!: HTMLElement;
  private selected: DataSource = 'postgres';

  connectedCallback(): void {
    const template = document.getElementById('settings-menu-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    const gearBtn = shadow.getElementById('gear-btn')!;
    this.popup = shadow.getElementById('popup')!;
    this.listEl = shadow.getElementById('source-list')!;

    gearBtn.addEventListener('click', (e) => { e.stopPropagation(); this.togglePopup(); });
    document.addEventListener('click', () => this.closePopup());
    this.popup.addEventListener('click', (e) => e.stopPropagation());

    this.rebuildList();
  }

  getSelected(): DataSource { return this.selected; }

  setSelected(id: DataSource): void {
    this.selected = id;
    this.highlightList();
  }

  private rebuildList(): void {
    this.listEl.textContent = '';
    for (const opt of OPTIONS) {
      const item = document.createElement('button');
      item.className = 'item';
      item.dataset['id'] = opt.id;
      item.textContent = opt.name;
      item.addEventListener('click', () => this.select(opt.id));
      this.listEl.appendChild(item);
    }
    this.highlightList();
  }

  private highlightList(): void {
    for (const el of Array.from(this.listEl.children)) {
      (el as HTMLElement).classList.toggle('selected', (el as HTMLElement).dataset['id'] === this.selected);
    }
  }

  private togglePopup(): void { this.popup.classList.toggle('hidden'); }
  private closePopup(): void { this.popup.classList.add('hidden'); }

  private select(id: DataSource): void {
    this.closePopup();
    if (id === this.selected) return;
    this.selected = id;
    this.highlightList();
    this.dispatchEvent(new CustomEvent('data-source-changed', {
      detail: { dataSource: id }, bubbles: true, composed: true,
    }));
  }
}

customElements.define('settings-menu', SettingsMenuElement);
