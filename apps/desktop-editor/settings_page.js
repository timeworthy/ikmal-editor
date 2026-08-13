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

/**
 * Integrations. ikmal's own adapters and LanguageTool's plugins are different
 * products, and a card that blurs them leaves the user unable to tell what they
 * just pointed where. Each row says which it is.
 */
function integrationsBody(integrations = {}) {
  const targets = Array.isArray(integrations.targets) ? integrations.targets : [];
  if (!targets.length) {
    return '<div class="cnt-empty"><div class="cnt-empty-title">No integrations detected</div>'
      + '<div class="cnt-empty-text">LanguageTool plugins and editors are found automatically when installed.</div></div>';
  }
  const rows = targets.map((target) => {
    // Not detected is an absence, not a fault: a plugin nobody installed should
    // not wear the colour reserved for something broken. Configured is ready,
    // detected-but-not-configured is available to act on, absent is neutral.
    const state = target.configured ? 'ready' : target.detected ? 'starting' : 'stopped';
    const label = target.configured ? 'Points here' : target.detected ? 'Found' : 'Not detected';
    return '<div class="writing-health-row">'
      + `<span class="writing-health-name"><span class="cnt-status-dot" data-state="${state}"></span>`
      + `<span class="settings-stack"><span>${escapeHTML(target.name)}</span>`
      + `<span class="settings-note">${escapeHTML(target.details || '')}</span></span></span>`
      + `<span class="writing-health-name">`
      + (target.configuredEndpoint ? `<span class="writing-health-endpoint">${escapeHTML(target.configuredEndpoint)}</span>` : '')
      + `<span class="cnt-tag" data-intent="${target.configured ? 'success' : 'info'}">${label}</span></span>`
      + '</div>';
  }).join('');
  return '<div class="settings-stack">'
    + `<div class="cnt-panel writing-health">${rows}</div>`
    + '<p class="settings-note">These are LanguageTool\'s own plugins. Configuring one rewrites its server '
    + 'address so it checks against this machine instead of the cloud. ikmal\'s own extension is a separate '
    + 'product with its own install.</p>'
    + '<button class="cnt-btn" type="button" data-action="configure-integrations">Point detected plugins here</button>'
    + '</div>';
}

/**
 * The optional local model.
 *
 * Two questions get answered separately here because conflating them is what
 * made the legacy panel misleading: whether the files are installed, and
 * whether the model is actually running. A panel that reported only the first
 * said "all components are installed" while quality suggestions came from the
 * deterministic checks, and told the reader to "start services with the
 * transformer enabled" — an instruction with no control behind it, for
 * something the app already does on its own.
 */
function qualityModelBody(quality = {}, serviceState = {}) {
  const components = Array.isArray(quality.components) ? quality.components : [];
  if (!components.length) {
    return '<div class="cnt-empty"><div class="cnt-empty-text">The optional model is not available in this build.</div></div>';
  }
  const rows = components.map((component) => '<div class="writing-health-row">'
    + `<span class="writing-health-name"><span class="cnt-status-dot" data-state="${component.installed ? 'ready' : 'stopped'}"></span>`
    + `<span class="settings-stack"><span>${escapeHTML(component.name)}</span>`
    + `<span class="settings-note">${escapeHTML(component.source || '')}</span></span></span>`
    + `<span class="writing-health-name"><span class="writing-health-endpoint">${escapeHTML(component.license || '')}</span>`
    // Omitted rather than emptied: a component with no size rendered a bare pill
    // next to its licence, which reads as a value that failed to load.
    + (component.size && component.size !== '—' ? `<span class="cnt-tag">${escapeHTML(component.size)}</span>` : '')
    + `<span class="cnt-tag" data-intent="${component.installed ? 'success' : 'info'}">${component.installed ? 'Installed' : 'Not installed'}</span></span>`
    + '</div>').join('');

  // Installed and running are different questions. The remedy depends on who
  // started the services: reopening the app starts the model when the app owns
  // them, and changes nothing when it is reusing services started elsewhere.
  const remedy = serviceState.managerRunning
    ? 'Quit and reopen ikmal editor to start it.'
    : 'These services were started outside ikmal editor, so reopening the app will reuse them unchanged. Stop them and let ikmal editor start its own.';
  const runningNote = quality.ready
    ? (quality.transformerRunning
      ? '<div class="cnt-alert" data-intent="success"><div class="cnt-alert-text">All components are installed, and the local model is running.</div></div>'
      : `<div class="cnt-alert" data-intent="warning"><div class="cnt-alert-text">All components are installed, but the local model is not running, so quality suggestions are coming from the deterministic checks only. ${escapeHTML(remedy)}</div></div>`)
    : '';

  const licence = quality.modelIsDefault
    ? '<div class="cnt-alert" data-intent="warning"><div>'
      + '<div class="cnt-alert-title">Non-commercial model</div>'
      + `<div class="cnt-alert-text">The default model ${escapeHTML(quality.modelId || '')} is licensed `
      + `${escapeHTML(quality.modelLicense || '')}. ikmal editor's own MIT licence does not cover these weights, and `
      + 'installing them makes this machine the party bound by that licence. For commercial use, set '
      + 'IKMAL_TRANSFORMER_MODEL to a permissively licensed model before installing.</div></div></div>'
    : '';

  const install = quality.ready ? '' : '<div class="settings-stack">'
    + `<label class="cnt-check"><input type="checkbox" data-setting="quality-notices"${quality.noticesAccepted ? ' checked' : ''}>`
    + '<span class="cnt-check-box"></span>I have reviewed and accept the third-party licences</label>'
    + `<button class="cnt-btn" type="button" data-action="install-quality"${quality.noticesAccepted ? '' : ' disabled'}>Install the local model</button>`
    + '</div>';

  return '<div class="settings-stack">'
    + `<div class="cnt-panel writing-health">${rows}</div>`
    + runningNote + licence + install
    + '</div>';
}

/** ikmal's own browser extension, which is not LanguageTool's. */
function browserExtensionBody() {
  return '<div class="settings-stack">'
    + '<p class="settings-note">ikmal\'s own extension checks text fields in your browser against this machine. '
    + 'It is a different product from LanguageTool\'s plugins above; running both underlines everything twice.</p>'
    + '<button class="cnt-btn" type="button" data-action="reveal-extension">Show extension files</button>'
    + '</div>';
}

/** The native macOS spell service. Absent, rather than disabled, off macOS. */
function spellServerBody(spell = {}) {
  if (!spell.supported) {
    return '<div class="cnt-empty"><div class="cnt-empty-text">The native spell service is macOS only.</div></div>';
  }
  if (!spell.available) {
    return '<div class="cnt-alert" data-intent="info"><div class="cnt-alert-text">'
      + 'The spell service is not bundled in this build.</div></div>';
  }
  return '<div class="settings-stack">'
    + `<div class="settings-row"><span class="writing-health-name">`
    + `<span class="cnt-status-dot" data-state="${spell.installed ? 'ready' : 'stopped'}"></span>`
    + `${spell.installed ? 'Installed' : 'Not installed'}</span>`
    + (spell.installed
      ? '<button class="cnt-btn" type="button" data-action="remove-spell-server">Remove</button>'
      : '<button class="cnt-btn" type="button" data-action="install-spell-server">Install</button>')
    + '</div>'
    + (spell.path ? `<span class="writing-health-endpoint">${escapeHTML(spell.path)}</span>` : '')
    + '<p class="settings-note">Adds ikmal to the system spelling menu in native macOS apps.</p>'
    + '</div>';
}

/**
 * The Office bridge. The certificate comes first because nothing else works
 * without it, and its trust state is the thing users get stuck on.
 */
function officeBody(office = {}) {
  if (!office.supported) {
    return '<div class="cnt-empty"><div class="cnt-empty-text">The Office bridge is not available in this build.</div></div>';
  }
  const configured = office.configured === true;
  const hosts = [['word', 'Word'], ['excel', 'Excel'], ['powerpoint', 'PowerPoint'], ['outlook', 'Outlook'], ['onenote', 'OneNote'], ['project', 'Project']];
  return '<div class="settings-stack">'
    + '<div class="settings-row"><span class="writing-health-name">'
    + `<span class="cnt-status-dot" data-state="${configured ? 'ready' : 'stopped'}"></span>`
    + `Certificate${office.trust ? ` · ${escapeHTML(office.trust)} trust` : ''}</span>`
    + (configured
      ? '<button class="cnt-btn" type="button" data-action="remove-office-certificate">Remove</button>'
      : '<button class="cnt-btn" type="button" data-action="generate-office-certificate">Generate</button>')
    + '</div>'
    + '<div class="settings-row"><span class="writing-health-name">'
    + `<span class="cnt-status-dot" data-state="${office.running ? 'ready' : 'stopped'}"></span>`
    + `Bridge${office.url ? ` · <span class="writing-health-endpoint">${escapeHTML(office.url)}</span>` : ''}</span>`
    + (office.running
      ? '<button class="cnt-btn" type="button" data-action="stop-office-bridge">Stop</button>'
      : `<button class="cnt-btn" type="button" data-action="start-office-bridge"${configured ? '' : ' disabled'}>Start</button>`)
    + '</div>'
    + (configured ? '' : '<p class="settings-note">Generate the certificate first; the bridge serves the task panes over HTTPS.</p>')
    + '<div class="settings-stack"><span class="cnt-label">Task pane manifests</span><div class="settings-inline">'
    + hosts.map(([id, name]) => `<button class="cnt-btn" type="button" data-action="reveal-manifest" data-host="${id}">${name}</button>`).join('')
    + '</div></div></div>';
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
  // Which sections are open is the reader's state, not the data's. A repaint
  // driven by a service-state push would otherwise snap every open section
  // shut underneath them.
  const open = state.open instanceof Set ? state.open : new Set(['checking']);
  return `<div class="settings-page">${renderSettingsGroups([
    { id: 'checking', title: 'Checking', description: 'When checks run and what they surface.', badge: 'Control', body: checkingBody(state.checking), open: open.has('checking') },
    { id: 'appearance', title: 'Appearance', description: 'How findings are marked, and where the app appears.', badge: 'Display', body: appearanceBody(state.annotations, state.presence, state.launchAtLogin), open: open.has('appearance') },
    { id: 'rules', title: 'Dictionary and rules', description: 'Imported style guides and the rules they add.', badge: 'Optional', body: rulesBody(state.styleGuides), open: open.has('rules') },
    { id: 'quality', title: 'Local quality model', description: 'Optional local suggestions beyond LanguageTool.', badge: 'Optional', body: qualityModelBody(state.quality, state.services), open: open.has('quality') },
    { id: 'extension', title: 'Browser extension', description: 'Check text fields in your browser against this machine.', badge: 'Optional', body: browserExtensionBody(), open: open.has('extension') },
    { id: 'integrations', title: 'Integrations', description: 'LanguageTool plugins and editors pointed at this machine.', badge: 'Optional', body: integrationsBody(state.integrations), open: open.has('integrations') },
    { id: 'spell', title: 'Native macOS spell service', description: 'ikmal in the system spelling menu.', badge: 'Optional', body: spellServerBody(state.spellServer), open: open.has('spell') },
    { id: 'office', title: 'Microsoft Office', description: 'Task panes served over local HTTPS.', badge: 'Optional', body: officeBody(state.office), open: open.has('office') },
    { id: 'services', title: 'Services and diagnostics', description: 'What is running on this machine.', body: servicesBody(state.services), open: open.has('services') },
    { id: 'privacy', title: 'Privacy and data', description: 'What is stored locally, and removing it.', body: privacyBody(state.recentChecks), open: open.has('privacy') },
    { id: 'about', title: 'About', description: 'Version and licences.', body: aboutBody(state.version), open: open.has('about') },
  ])}</div>`;
}
