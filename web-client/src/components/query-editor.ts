const DEBOUNCE_MS = 150;
const MIN_HEIGHT = 60;
const MAX_HEIGHT = 200;

const HINTS = [
  'filter category: person, event, place, artifact, pol_mil_organization, business, historical_period, concepts, other',
  'filter year: -500 to 1500',
  'filter text: rome',
  'filter lat: 0 to 90',
  'filter lng: -10 to 50',
  'limit 100',
];

export class QueryEditorElement extends HTMLElement {
  private textarea!: HTMLTextAreaElement;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _suppressEvent = false;

  connectedCallback(): void {
    const template = document.getElementById('query-editor-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.textarea = shadow.getElementById('dsl-textarea') as HTMLTextAreaElement;
    this.textarea.addEventListener('input', () => { this.autoResize(); this.onInput(); });

    const hintsEl = shadow.getElementById('hints')!;
    for (const hint of HINTS) {
      const div = document.createElement('div');
      div.className = 'hint';
      div.textContent = hint;
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const current = this.textarea.value.trimEnd();
        this.textarea.value = current.length > 0 ? `${current}\n${hint}` : hint;
        this.autoResize();
        this.fireChanged();
      });
      hintsEl.appendChild(div);
    }

    this.autoResize();
  }

  private autoResize(): void {
    this.textarea.style.height = '0';
    const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, this.textarea.scrollHeight));
    this.textarea.style.height = `${h}px`;
  }

  private onInput(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => { this.fireChanged(); }, DEBOUNCE_MS);
  }

  private fireChanged(): void {
    if (!this._suppressEvent) {
      this.dispatchEvent(new CustomEvent('dsl-changed', {
        detail: { dsl: this.textarea.value },
        bubbles: true,
        composed: true,
      }));
    }
  }

  getDsl(): string {
    return this.textarea?.value ?? '';
  }

  setDsl(text: string): void {
    if (!this.textarea) return;
    this._suppressEvent = true;
    this.textarea.value = text;
    this.autoResize();
    this._suppressEvent = false;
  }
}

customElements.define('query-editor', QueryEditorElement);
