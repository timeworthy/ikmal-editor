export type IndicatorStatus = 'checking' | 'clean' | 'issues' | 'paused' | 'zen' | 'unavailable';

export interface IndicatorSnapshot {
  status: IndicatorStatus;
  issueCount: number;
  label: string;
}

export const INDICATOR_TAG = 'ikmal-writing-indicator';

export const INDICATOR_CSS = `
:host { all: initial; contain: layout style paint; display: inline-block; font-family: var(--font-sans); }
.indicator { align-items: center; background: var(--bg-pop); border: 1px solid var(--border-1); border-radius: var(--radius-pill); color: var(--fg-1); cursor: pointer; display: inline-flex; font: 600 12px/1 var(--font-sans); gap: var(--space-2); min-height: 30px; padding: 0 var(--space-3); }
.indicator:focus-visible { box-shadow: var(--shadow-focus); outline: 2px solid transparent; }
.dot { background: var(--accent); border-radius: 50%; display: inline-block; height: 8px; width: 8px; }
.indicator[data-status="checking"] .dot { animation: pulse var(--dur-modal-in) var(--ease-default) infinite alternate; }
.indicator[data-status="unavailable"] .dot { background: var(--warning); }
.indicator[data-status="paused"] .dot { background: var(--fg-4); }
.indicator[data-status="issues"] .dot { background: var(--danger); }
@keyframes pulse { from { opacity: .45; transform: scale(.8); } to { opacity: 1; transform: scale(1.15); } }
@media (prefers-reduced-motion: reduce) { .indicator[data-status="checking"] .dot { animation: none; } }
`;

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));
}

export function normalizeIndicatorSnapshot(value: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  const statuses: IndicatorStatus[] = ['checking', 'clean', 'issues', 'paused', 'zen', 'unavailable'];
  const status = statuses.includes(value.status as IndicatorStatus) ? value.status as IndicatorStatus : 'clean';
  const issueCount = Number.isFinite(value.issueCount) ? Math.max(0, Math.floor(value.issueCount as number)) : 0;
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : status === 'clean' ? 'No issues' : status;
  return { status, issueCount, label };
}

export function renderIndicator(snapshot: Partial<IndicatorSnapshot> = {}): string {
  const state = normalizeIndicatorSnapshot(snapshot);
  const count = state.issueCount ? `<span class="count" aria-hidden="true">${state.issueCount}</span>` : '';
  return `<button class="indicator" type="button" data-status="${state.status}" aria-label="${escapeHTML(state.label)}"><span class="dot" aria-hidden="true"></span><span class="label">${escapeHTML(state.label)}</span>${count}</button>`;
}

export function mountIndicator(root: { attachShadow?: (options: ShadowRootInit) => ShadowRoot }, snapshot: Partial<IndicatorSnapshot> = {}): ShadowRoot {
  if (typeof root.attachShadow !== 'function') throw new Error('Writing indicator requires a Shadow DOM-capable host.');
  const shadow = root.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = INDICATOR_CSS;
  shadow.append(style);
  const template = document.createElement('template');
  template.innerHTML = renderIndicator(snapshot);
  shadow.append(template.content.cloneNode(true));
  return shadow;
}

export function defineWritingIndicator(registry: CustomElementRegistry = customElements): void {
  if (registry.get(INDICATOR_TAG)) return;
  class WritingIndicatorElement extends HTMLElement {
    static observedAttributes = ['data-status', 'data-issue-count', 'data-label'];
    connectedCallback(): void { this.refresh(); }
    attributeChangedCallback(): void { if (this.isConnected) this.refresh(); }
    refresh(): void {
      const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
      root.replaceChildren();
      const style = document.createElement('style');
      style.textContent = INDICATOR_CSS;
      root.append(style);
      const template = document.createElement('template');
      template.innerHTML = renderIndicator({
        status: this.getAttribute('data-status') as IndicatorStatus,
        issueCount: Number(this.getAttribute('data-issue-count') || 0),
        label: this.getAttribute('data-label') || undefined,
      });
      root.append(template.content.cloneNode(true));
    }
  }
  registry.define(INDICATOR_TAG, WritingIndicatorElement);
}
