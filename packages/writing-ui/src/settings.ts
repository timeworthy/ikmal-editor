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
  /**
   * What this section is currently set to, in the user's terms — "Automatic",
   * "1 of 4 configured", "Not installed".
   *
   * This slot used to hold a category: Optional, Control, Display. Seven of the
   * product's eleven sections said "Optional", so the label was identical on
   * most of the page and carried nearly nothing; and it mixed two axes, since
   * Control and Display describe what a section is about while Optional
   * describes whether you need it. A collapsed row should answer the only
   * question being asked of it — whether it is worth opening — and every one of
   * these sections has a state the app already knows.
   */
  summary?: string;
  /** How the summary reads: neutral by default, or as a live state. */
  intent?: 'success' | 'warning' | 'danger' | 'info';
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
.writing-setting-head { display: grid; gap: 3px; text-align: left; }
/* Title and description were 13px and 12px — a single pixel apart, in the same
   face and nearly the same colour, which is not a hierarchy so much as a pair.
   The separation is carried by weight and colour rather than by size, so the
   row stays compact and the description still reads as subordinate. */
.writing-setting-title { color: var(--fg-1); font: 600 14px/1.25 var(--font-sans); letter-spacing: -0.005em; }
.writing-setting-description { color: var(--fg-4); font: 400 12px/1.4 var(--font-sans); }
/* The state a section is in, so a closed row says whether it is worth opening.
   Tabular figures because most of these are counts, and a column of counts that
   shifts as it updates reads as instability. */
.writing-setting-summary { font-variant-numeric: tabular-nums; white-space: nowrap; }
.writing-health { display: grid; gap: var(--space-3); }
.writing-health-row { align-items: center; display: flex; gap: var(--space-3); justify-content: space-between; }
.writing-health-name { align-items: center; display: flex; gap: var(--space-2); }
.writing-health-endpoint { color: var(--fg-4); font: 400 11px/1.3 var(--font-mono); }
.writing-guide-row { align-items: center; display: flex; gap: var(--space-3); justify-content: space-between; }
/* Bands. Set in the page's own voice rather than as another row, so the eye
   reads them as dividers and not as sections that failed to open. */
.writing-settings-band { align-items: baseline; color: var(--fg-3); display: flex; flex-wrap: wrap; font: 600 11px/1 var(--font-mono); gap: var(--space-3); letter-spacing: .08em; margin: var(--space-5) 0 0; text-transform: uppercase; }
.writing-settings-band:first-child { margin-top: 0; }
.writing-settings-band span { color: var(--fg-4); font: 400 12px/1.4 var(--font-sans); letter-spacing: normal; text-transform: none; }
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
  const summary = group.summary
    ? `<span class="cnt-tag writing-setting-summary"${group.intent ? ` data-intent="${escapeHTML(group.intent)}"` : ''}>${escapeHTML(group.summary)}</span>`
    : '';
  return `<div class="cnt-acc-item" data-group="${escapeHTML(group.id)}">`
    + `<button class="cnt-acc-head" type="button" aria-expanded="${group.open === true}" aria-controls="${escapeHTML(group.id)}-body">`
    + `<span class="writing-setting-head">`
    + `<span class="writing-setting-title">${escapeHTML(group.title)}</span>`
    + `<span class="writing-setting-description">${escapeHTML(group.description)}</span>`
    + `</span>${summary}</button>`
    + `<div class="cnt-acc-body" id="${escapeHTML(group.id)}-body"${group.open === true ? '' : ' hidden'}>${group.body || ''}</div>`
    + '</div>';
}

/**
 * A band heading, for pages long enough that a flat list of sections stops
 * being scannable. It groups without consolidating: four ways of reaching other
 * apps read as one concern under a heading, while each keeps the summary that
 * says whether it is worth opening — which merging them into one section would
 * have thrown away.
 */
export interface SettingsBand {
  heading: string;
  description?: string;
}

export type SettingsPageItem = SettingsGroupState | SettingsBand;

function isBand(item: SettingsPageItem): item is SettingsBand {
  return typeof (item as SettingsBand).heading === 'string';
}

export function renderSettingsGroups(groups: SettingsPageItem[]): string {
  const valid = Array.isArray(groups)
    ? groups.filter((group) => group && (isBand(group) || typeof (group as SettingsGroupState).id === 'string'))
    : [];
  const rendered = valid.map((item) => (isBand(item)
    ? `<h2 class="writing-settings-band">${escapeHTML(item.heading)}`
      + (item.description ? `<span>${escapeHTML(item.description)}</span>` : '')
      + '</h2>'
    : renderSettingsGroup(item))).join('');
  return `<div class="cnt-accordion writing-settings-groups">${rendered}</div>`;
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
      + '<div class="cnt-empty-action"><button class="cnt-btn" type="button" data-action="import-guide">Import a guide</button></div>'
      + '</div></div>';
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

export interface WritingRuleState {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}

/**
 * Quality writing rules toggle card. Renders rules grouped by category with switches.
 */
export function renderWritingRulesCard(rules: WritingRuleState[] = []): string {
  if (!Array.isArray(rules) || rules.length === 0) {
    return '<div class="cnt-panel"><div class="cnt-empty"><div class="cnt-empty-text">No rules configured.</div></div></div>';
  }

  const categories: Record<string, WritingRuleState[]> = {};
  for (const rule of rules) {
    const cat = rule.category || 'General';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(rule);
  }

  const renderedCategories = Object.entries(categories).map(([categoryName, groupRules]) => {
    const rows = groupRules.map((rule) =>
      '<div class="writing-guide-row" style="margin-bottom: var(--space-2);">'
      + '<span class="writing-setting-head" style="flex: 1;">'
      + `<span class="writing-setting-title">${escapeHTML(rule.name)}</span>`
      + `<span class="writing-setting-description">${escapeHTML(rule.description)}</span>`
      + '</span>'
      + `<label class="cnt-switch"><input type="checkbox" data-action="toggle-rule" data-rule-id="${escapeHTML(rule.id)}"${rule.enabled ? ' checked' : ''}><span class="cnt-switch-track"></span></label>`
      + '</div>'
    ).join('');

    return `<div style="margin-bottom: var(--space-4);"><h4 style="color: var(--fg-3); font: 600 11px/1 var(--font-mono); text-transform: uppercase; letter-spacing: .05em; margin: 0 0 var(--space-2);">${escapeHTML(categoryName)}</h4>${rows}</div>`;
  }).join('');

  return `<div class="cnt-panel writing-rules">${renderedCategories}</div>`;
}
