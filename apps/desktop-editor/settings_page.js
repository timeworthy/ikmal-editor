import { renderSettingsGroups, renderServiceHealth, renderStyleGuideCard, SETTINGS_CSS } from './settings.js';

// The canonical settings page, in the canonical order.
//
// This is the only settings implementation in the product. The launcher routes
// here rather than carrying a copy, and the order below is the one every host
// follows — a host may omit a section it cannot support, but it may not
// reorder the conceptual system.
//
// Everything here is built from the shared composites and primitives. A colour,
// radius, or control style authored in this file would be a second visual
// system starting inside the surface that exists to end them.

export const SETTINGS_PAGE_CSS = `${SETTINGS_CSS}
.settings-page { display: grid; gap: var(--space-5); max-width: 720px; }
.settings-row { align-items: center; display: flex; gap: var(--space-4); justify-content: space-between; }
.settings-stack { display: grid; gap: var(--space-3); }
.settings-inline { align-items: center; display: flex; flex-wrap: wrap; gap: var(--space-4); }
.settings-note { color: var(--fg-4); font: 400 12px/1.45 var(--font-sans); }
`;

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function select(name, value, options) {
  const rendered = options.map(([id, label]) =>
    `<option value="${escapeHTML(id)}"${String(value) === String(id) ? ' selected' : ''}>${escapeHTML(label)}</option>`).join('');
  return `<select class="cnt-select" data-setting="${name}">${rendered}</select>`;
}

function field(label, control, help) {
  return `<label class="cnt-field"><span class="cnt-label">${escapeHTML(label)}</span>${control}`
    + (help ? `<span class="cnt-help">${escapeHTML(help)}</span>` : '') + '</label>';
}

function toggle(name, label, checked) {
  return `<label class="cnt-switch"><input type="checkbox" data-setting="${name}"${checked ? ' checked' : ''}>`
    + `<span class="cnt-switch-track"></span>${escapeHTML(label)}</label>`;
}

function checkbox(name, label, checked) {
  return `<label class="cnt-check"><input type="checkbox" data-setting="${name}"${checked ? ' checked' : ''}>`
    + `<span class="cnt-check-box"></span>${escapeHTML(label)}</label>`;
}

/**
 * Checking comes first because it changes what the product does while the user
 * writes. Pause and Zen are not here: they are quick controls in the indicator,
 * and a writer should never have to open settings to quiet feedback.
 */
function checkingBody(preferences = {}) {
  const categories = preferences.categories || {};
  return '<div class="settings-stack">'
    + field('When to check', select('mode', preferences.mode || 'automatic', [
      ['automatic', 'Automatically as I write'],
      ['manual', 'Only when I ask'],
    ]))
    + field('Typing delay', `<input class="cnt-slider" type="range" min="200" max="2000" step="100" data-setting="delay" value="${Number(preferences.delay) || 700}">`,
      `${Number(preferences.delay) || 700} ms after you stop typing`)
    + field('Suggestion sensitivity', `<input class="cnt-slider" type="range" min="0" max="100" data-setting="sensitivity" value="${Number(preferences.sensitivity) ?? 55}">`,
      'Lower shows more suggestions, including less confident ones.')
    + '<div class="settings-stack"><span class="cnt-label">Findings to show</span><div class="settings-inline">'
    + checkbox('category:grammar', 'Grammar', categories.grammar !== false)
    + checkbox('category:repetition', 'Repetition', categories.repetition !== false)
    + checkbox('category:style', 'Style', categories.style !== false)
    + checkbox('category:languagetool', 'LanguageTool', categories.languagetool !== false)
    + '</div></div>'
    + '</div>';
}

function appearanceBody(annotations = {}, presence = {}, launchAtLogin = false) {
  return '<div class="settings-stack">'
    + field('Mark style', select('annotationStyle', annotations.style || 'squiggle', [
      ['squiggle', 'Squiggles'], ['line', 'Lines'], ['dash', 'Dashes'],
    ]))
    + field('Mark palette', select('annotationPalette', annotations.palette || 'balanced', [
      ['balanced', 'Balanced'], ['warm', 'Warm'], ['cool', 'Cool'], ['contrast', 'High contrast'],
    ]))
    + field('Mark intensity', `<input class="cnt-slider" type="range" min="0" max="100" data-setting="annotationIntensity" value="${Number(annotations.intensity) ?? 60}">`)
    + '<div class="settings-inline">'
    + toggle('menubarIcon', 'Show in the menu bar', presence.menubarIcon !== false)
    + (presence.dockSupported ? toggle('dockIcon', 'Show in the Dock', presence.dockIcon !== false) : '')
    + toggle('launchAtLogin', 'Open at login', Boolean(launchAtLogin))
    + '</div></div>';
}

function rulesBody(styleGuides = {}) {
  return '<div class="settings-stack">'
    + renderStyleGuideCard({
      guides: styleGuides.guides || [],
      selectedId: styleGuides.selectedId,
      enabled: styleGuides.enabled === true,
    })
    + '<p class="settings-note">A guide can be turned off without being removed. Its findings stay '
    + 'distinguishable from correctness errors in the review queue.</p>'
    + '</div>';
}

function servicesBody(serviceState = {}) {
  const managed = serviceState.managerRunning === true;
  const running = serviceState.languageToolReady && serviceState.qualityReady;
  return '<div class="settings-stack">'
    + renderServiceHealth([
      { name: 'LanguageTool', state: serviceState.languageToolReady ? 'ready' : 'stopped', endpoint: serviceState.proxyUrl, managed },
      { name: 'Quality checks', state: serviceState.qualityReady ? 'ready' : 'stopped', managed },
    ])
    + '<div class="settings-inline">'
    + `<button class="cnt-btn" type="button" data-action="start-services"${running ? ' disabled' : ''}>Start services</button>`
    // Stopping is only offered when this app owns the services. It cannot stop
    // something it did not start, and a button that silently does nothing is
    // worse than an absent one.
    + `<button class="cnt-btn" type="button" data-action="stop-services"${managed ? '' : ' disabled'}>Stop services</button>`
    + (managed ? '' : '<span class="settings-note">These services were started outside ikmal editor, so this app cannot stop them.</span>')
    + '</div></div>';
}

function privacyBody(recentChecks = []) {
  const count = Array.isArray(recentChecks) ? recentChecks.length : 0;
  return '<div class="settings-stack">'
    + '<div class="cnt-alert" data-intent="info"><div class="cnt-alert-text">'
    + 'Text is checked by services on this machine. There is no account, no cloud model, and nothing is sent anywhere.'
    + '</div></div>'
    + `<div class="settings-row"><span>${count === 1 ? '1 recent check kept locally' : `${count} recent checks kept locally`}</span>`
    + `<button class="cnt-btn" type="button" data-action="clear-history"${count ? '' : ' disabled'}>Clear history</button></div>`
    + '</div>';
}

function aboutBody(version) {
  return '<div class="settings-stack">'
    + `<div class="settings-row"><span>Version</span><span class="cnt-tag">${escapeHTML(version || 'unknown')}</span></div>`
    + '<div class="settings-inline">'
    + '<button class="cnt-btn" type="button" data-action="open-notices">Third-party notices</button>'
    + '</div></div>';
}

/**
 * The whole page. Sections are rendered in the canonical order; a section whose
 * data has not arrived yet renders its shell rather than disappearing, so the
 * page does not reflow as state loads.
 */
export function renderSettingsPage(state = {}) {
  return `<div class="settings-page">${renderSettingsGroups([
    { id: 'checking', title: 'Checking', description: 'When checks run and what they surface.', badge: 'Control', open: true, body: checkingBody(state.checking) },
    { id: 'appearance', title: 'Appearance', description: 'How findings are marked, and where the app appears.', badge: 'Display', body: appearanceBody(state.annotations, state.presence, state.launchAtLogin) },
    { id: 'rules', title: 'Dictionary and rules', description: 'Imported style guides and the rules they add.', badge: 'Optional', body: rulesBody(state.styleGuides) },
    { id: 'services', title: 'Services and diagnostics', description: 'What is running on this machine.', body: servicesBody(state.services) },
    { id: 'privacy', title: 'Privacy and data', description: 'What is stored locally, and removing it.', body: privacyBody(state.recentChecks) },
    { id: 'about', title: 'About', description: 'Version and licences.', body: aboutBody(state.version) },
  ])}</div>`;
}
