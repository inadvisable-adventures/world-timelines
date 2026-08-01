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
  private foldedView!: HTMLElement;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _suppressEvent = false;
  // Line indices shown expanded in the folded (at-rest) view. Transient —
  // reset whenever the DSL text changes, structurally or otherwise; see
  // plans/pin-unpin-and-dsl-line-folding.md.
  private unfoldedLines = new Set<number>();

  connectedCallback(): void {
    const template = document.getElementById('query-editor-template') as HTMLTemplateElement;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this.textarea = shadow.getElementById('dsl-textarea') as HTMLTextAreaElement;
    this.foldedView = shadow.getElementById('folded-view')!;
    this.textarea.addEventListener('input', () => { this.unfoldedLines.clear(); this.autoResize(); this.onInput(); });
    this.textarea.addEventListener('blur', () => this.showFoldedView());
    this.foldedView.addEventListener('click', (e) => this.onFoldedViewClick(e));

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
        this.showTextarea();
        this.fireChanged();
      });
      hintsEl.appendChild(div);
    }

    this.autoResize();
    this.showFoldedView();
  }

  // ── focus/blur view switching ───────────────────────────────────────────
  // The textarea is the real edit surface (shown while focused, full raw
  // text, no folding — you need to see what you're editing). folded-view is
  // a rendered stand-in shown at rest, one row per line, truncated via CSS
  // ellipsis so long lines (e.g. a `pin:` line listing several ids) don't
  // blow out the editor's height.

  private showTextarea(): void {
    this.foldedView.classList.add('hidden');
    this.textarea.classList.remove('hidden');
    this.textarea.focus();
  }

  private showFoldedView(): void {
    this.textarea.classList.add('hidden');
    this.foldedView.classList.remove('hidden');
    this.renderFoldedView();
  }

  private renderFoldedView(): void {
    this.foldedView.textContent = '';
    const text = this.textarea.value;
    if (text.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'dsl-line placeholder';
      placeholder.textContent = 'Click to edit query…';
      this.foldedView.appendChild(placeholder);
      return;
    }
    text.split('\n').forEach((line, i) => {
      const row = document.createElement('div');
      row.className = 'dsl-line';
      row.dataset['index'] = String(i);
      if (this.unfoldedLines.has(i)) {
        row.classList.add('unfolded');
        const textSpan = document.createElement('span');
        textSpan.textContent = line;
        const foldBtn = document.createElement('span');
        foldBtn.className = 'fold-btn';
        foldBtn.textContent = '[fold]';
        row.append(textSpan, foldBtn);
      } else {
        row.textContent = line.length > 0 ? line : ' ';
      }
      this.foldedView.appendChild(row);
    });
  }

  private onFoldedViewClick(e: MouseEvent): void {
    const row = (e.target as HTMLElement).closest('.dsl-line') as HTMLElement | null;
    if (!row || row.classList.contains('placeholder')) {
      this.showTextarea();
      return;
    }
    const idx = parseInt(row.dataset['index'] ?? '', 10);
    if (Number.isNaN(idx)) return;

    if (row.classList.contains('unfolded')) {
      this.unfoldedLines.delete(idx);
      this.renderFoldedView();
      return;
    }
    // Only lines actually truncated by the ellipsis are worth unfolding —
    // clicking a line that already fits just enters edit mode, matching
    // the natural expectation of clicking into a text field.
    const isTruncated = row.scrollWidth > row.clientWidth;
    if (isTruncated) {
      this.unfoldedLines.add(idx);
      this.renderFoldedView();
    } else {
      this.showTextarea();
    }
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
    this.unfoldedLines.clear();
    this.autoResize();
    // Keep the at-rest view in sync even when it's not currently shown, so
    // whatever's displayed next (blur, or immediately if already blurred)
    // reflects this write rather than stale content.
    if (!this.foldedView.classList.contains('hidden')) this.renderFoldedView();
    this._suppressEvent = false;
  }
}

customElements.define('query-editor', QueryEditorElement);
