// Settings composites: the group, the service health card, and the style-guide
// card. These are what Phase D builds the canonical settings page from, and what
// the compact launcher reuses for its status surface.
//
// Composed from primitives — `.cnt-accordion`, `.cnt-panel`, `.cnt-status-dot`,
// `.cnt-tag`, `.cnt-alert`, `.cnt-btn`. The layout CSS here is layout only; a
// colour or radius belongs to a token, not to this file.

export interface SettingsGroupState {
  id: string;
  title: string;
  description: string;
  /** Short right-hand label: Optional, Control, Display, New. */
  badge?: string;
  open?: boolean;
  /** Rendered inside the body. Callers pass already-escaped markup. */
  body?: string;
}

export type HealthState = 'ready' | 'starting' | 'stopped' | 'unavailable';

export interface ServiceHealthState {
  name: string;
  state: HealthState;
  /** What the service is, in the user's terms, not the process name. */
  detail?: string;
  endpoint?: string;
  /** Who started it: the app, or something already running. */
  managed?: boolean;
}

export interface StyleGuideCardState {
  guides: { id: string; name: string; ruleCount?: number }[];
  selectedId?: string;
  enabled: boolean;
}

export const SETTINGS_CSS = `
.writing-settings { display: grid; gap: var(--space-4); }
.writing-setting-head { display: grid; gap: 2px; text-align: left; }
.writing-setting-title { color: var(--fg-1); font: 600 13px/1.2 var(--font-sans); }
.writing-setting-description { color: var(--fg-4); font: 400 12px/1.4 var(--font-sans); }
.writing-health { display: grid; gap: var(--space-3); }
.writing-health-row { align-items: center; display: flex; gap: var(--space-3); justify-content: space-between; }
.writing-health-name { align-items: center; display: flex; gap: var(--space-2); }
.writing-health-endpoint { color: var(--fg-4); font: 400 11px/1.3 var(--font-mono); }
.writing-guide-row { align-items: center; display: flex; gap: var(--space-3); justify-content: space-between; }
`;

const HEALTH_LABELS: Record<HealthState, string> = {
  ready: 'Ready',
  starting: 'Starting',
  stopped: 'Stopped',
  unavailable: 'Unavailable',
};

const HEALTH_INTENT: Record<HealthState, string> = {
  ready: 'success',
  starting: 'info',
  stopped: 'warning',
  unavailable: 'danger',
};

function escapeHTML(value: string): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));
}

/**
 * One collapsible settings section. The badge sits with the chevron on the
 * right; the title block grows, so the badge lands in the same place on every
 * row rather than wherever the description happens to end.
 */
export function renderSettingsGroup(group: SettingsGroupState): string {
  const badge = group.badge ? `<span class="cnt-tag">${escapeHTML(group.badge)}</span>` : '';
  return `<div class="cnt-acc-item" data-group="${escapeHTML(group.id)}">`
    + `<button class="cnt-acc-head" type="button" aria-expanded="${group.open === true}" aria-controls="${escapeHTML(group.id)}-body">`
    + `<span class="writing-setting-head">`
    + `<span class="writing-setting-title">${escapeHTML(group.title)}</span>`
    + `<span class="writing-setting-description">${escapeHTML(group.description)}</span>`
    + `</span>${badge}</button>`
    + `<div class="cnt-acc-body" id="${escapeHTML(group.id)}-body"${group.open === true ? '' : ' hidden'}>${group.body || ''}</div>`
    + '</div>';
}

export function renderSettingsGroups(groups: SettingsGroupState[]): string {
  const valid = Array.isArray(groups) ? groups.filter((group) => group && typeof group.id === 'string') : [];
  return `<div class="cnt-accordion writing-settings-groups">${valid.map(renderSettingsGroup).join('')}</div>`;
}

/**
 * Service health. Reports what is running, not what is installed — those are
 * different questions, and answering only the second is how a panel ends up
 * telling a user a feature is on when it is not.
 */
export function renderServiceHealth(services: ServiceHealthState[]): string {
  const valid = Array.isArray(services) ? services.filter((service) => service && typeof service.name === 'string') : [];
  const rows = valid.map((service) => {
    const state: HealthState = ['ready', 'starting', 'stopped', 'unavailable'].includes(service.state) ? service.state : 'unavailable';
    const endpoint = service.endpoint ? `<span class="writing-health-endpoint">${escapeHTML(service.endpoint)}</span>` : '';
    // Whether the app started it decides what a restart can do, so it is stated
    // rather than left for the reader to infer.
    const owner = service.managed === undefined ? '' : `<span class="cnt-tag">${service.managed ? 'managed' : 'existing'}</span>`;
    return '<div class="writing-health-row">'
      + `<span class="writing-health-name"><span class="cnt-status-dot" data-state="${state}"></span>${escapeHTML(service.name)}`
      + (service.detail ? `<span class="writing-setting-description">${escapeHTML(service.detail)}</span>` : '')
      + '</span>'
      + `<span class="writing-health-name">${endpoint}${owner}<span class="cnt-tag" data-intent="${HEALTH_INTENT[state]}">${HEALTH_LABELS[state]}</span></span>`
      + '</div>';
  }).join('');
  return `<div class="cnt-panel writing-health">${rows || '<div class="cnt-empty"><div class="cnt-empty-text">No services reported.</div></div>'}</div>`;
}

/**
 * Style guides. A guide can be selected and separately enabled, because turning
 * one off should not mean deleting it.
 */
export function renderStyleGuideCard(state: Partial<StyleGuideCardState> = {}): string {
  const guides = Array.isArray(state.guides) ? state.guides.filter((guide) => guide && typeof guide.id === 'string') : [];
  if (!guides.length) {
    return '<div class="cnt-panel"><div class="cnt-empty">'
      + '<div class="cnt-empty-title">No style guide imported</div>'
      + '<div class="cnt-empty-text">Import one to add its rules to the review queue.</div>'
      + '</div><button class="cnt-btn" type="button" data-action="import-guide">Import a guide</button></div>';
  }
  const options = guides.map((guide) => {
    const rules = typeof guide.ruleCount === 'number' ? ` (${guide.ruleCount} rules)` : '';
    return `<option value="${escapeHTML(guide.id)}"${state.selectedId === guide.id ? ' selected' : ''}>${escapeHTML(guide.name)}${rules}</option>`;
  }).join('');
  return '<div class="cnt-panel writing-guide">'
    + '<div class="writing-guide-row">'
    + `<label class="cnt-field"><span class="cnt-label">Active guide</span><select class="cnt-select" data-action="select-guide">${options}</select></label>`
    + `<label class="cnt-switch"><input type="checkbox" data-action="enable-guide"${state.enabled ? ' checked' : ''}><span class="cnt-switch-track"></span>Use selected guide</label>`
    + '</div>'
    + '<button class="cnt-btn" type="button" data-action="import-guide">Import another</button>'
    + '</div>';
}
