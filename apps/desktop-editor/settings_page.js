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
/* A slider's current value, sitting opposite its label. Tabular figures so the
   number does not shuffle sideways while the handle is being dragged. */
.settings-value { color: var(--fg-2); font: 500 12px/1.45 var(--font-mono); font-variant-numeric: tabular-nums; }
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
 * A slider always reports the value it is sitting on.
 *
 * Two of the three sliders here used to report nothing, so the only way to read
 * a setting was to judge a handle's position against a bare track. The value
 * goes beside the label rather than under the control, because that is where
 * the eye already is when it reads what the slider is for.
 */
function slider(name, label, value, { min, max, step = 1, format, help, disabled, disabledNote } = {}) {
  const current = Number.isFinite(Number(value)) ? Number(value) : min;
  const shown = format ? format(current) : String(current);
  return '<div class="cnt-field">'
    + `<span class="settings-row"><span class="cnt-label">${escapeHTML(label)}</span>`
    + `<span class="settings-value">${escapeHTML(shown)}</span></span>`
    + `<input class="cnt-slider" type="range" min="${min}" max="${max}" step="${step}" data-setting="${name}" value="${current}"${disabled ? ' disabled' : ''}>`
    + (disabled && disabledNote ? `<span class="cnt-help">${escapeHTML(disabledNote)}</span>`
      : help ? `<span class="cnt-help">${escapeHTML(help)}</span>` : '')
    + '</div>';
}

/**
 * A numbered procedure.
 *
 * The legacy panels carried these for the browser extension, the spell service
 * and Office, and they were the most valuable text on the page — installing any
 * of the three leaves the user somewhere they have to be told how to finish.
 * They were dropped in the first pass because they read as clutter in a legacy
 * panel that squeezed them into a column three words wide. The content was
 * never the problem.
 */
function steps(items) {
  // An item may be a string, or [text, state] where state marks it done or
  // current. A setup sequence the app can already see the progress of should
  // say so, rather than making the reader work out which step they are on.
  return '<ol class="cnt-steps" data-orientation="vertical">'
    + items.map((item, index) => {
      const [text, state] = Array.isArray(item) ? item : [item, null];
      return `<li class="cnt-step"${state ? ` data-state="${state}"` : ''}>`
        + `<span class="cnt-step-dot">${state === 'done' ? '✓' : index + 1}</span>`
        + `<span class="cnt-step-label">${text}</span></li>`;
    }).join('')
    + '</ol>';
}

/** Literal text a user has to type or find, kept apart from the prose. */
function literal(value) {
  return `<code class="cnt-kbd">${escapeHTML(value)}</code>`;
}

/**
 * Checking comes first because it changes what the product does while the user
 * writes. Pause and Zen are not here: they are quick controls in the indicator,
 * and a writer should never have to open settings to quiet feedback.
 */
function checkingBody(preferences = {}) {
  const categories = preferences.categories || {};
  // The delay only means anything while checks run on their own. Left live in
  // manual mode it invites the user to tune something that cannot take effect,
  // and then blames them when nothing changes.
  const manual = preferences.mode === 'manual';
  return '<div class="settings-stack">'
    + field('When to check', select('mode', preferences.mode || 'automatic', [
      ['automatic', 'Automatically as I write'],
      ['manual', 'Only when I ask'],
    ]))
    // The steps are the shell's own rounding: it snaps the pause to 50 ms and
    // the sensitivity to 5. A finer control offers precision that is discarded
    // on the way in, so the number released on is not the number kept.
    + slider('delay', 'Typing pause', preferences.delay ?? 700, {
      min: 200, max: 2000, step: 50,
      format: (value) => `${value} ms`,
      help: 'How long to wait after you stop typing before checking.',
      disabled: manual,
      disabledNote: 'Not used while checks only run when you ask.',
    })
    + slider('sensitivity', 'Suggestion sensitivity', preferences.sensitivity ?? 55, {
      min: 0, max: 100, step: 5,
      format: (value) => `${value}%`,
      help: 'Lower shows more suggestions, including less confident ones.',
    })
    // Named for what each category actually catches. "Style" alone does not say
    // that an imported guide's rules arrive under it, and "Repetition" reads as
    // a duplicate-word check rather than the echoes it also finds.
    + '<div class="settings-stack"><span class="cnt-label">Findings to show</span><div class="settings-inline">'
    + checkbox('category:grammar', 'Grammar and agreement', categories.grammar !== false)
    + checkbox('category:repetition', 'Repeats and echoes', categories.repetition !== false)
    + checkbox('category:style', 'Style and guide rules', categories.style !== false)
    + checkbox('category:languagetool', 'LanguageTool suggestions', categories.languagetool !== false)
    + '</div></div>'
    + '</div>';
}

function appearanceBody(annotations = {}, presence = {}, launchAtLogin = false) {
  return '<div class="settings-stack">'
    // Each control says what choosing it changes. A bare "Mark palette" leaves
    // the reader to open the menu to find out what a palette decides.
    + field('Mark style', select('annotationStyle', annotations.style || 'squiggle', [
      ['squiggle', 'Squiggles'], ['line', 'Lines'], ['dash', 'Dashes'],
    ]), 'The shape drawn under text a finding refers to.')
    + field('Mark palette', select('annotationPalette', annotations.palette || 'balanced', [
      ['balanced', 'Balanced'], ['warm', 'Warm'], ['cool', 'Cool'], ['contrast', 'High contrast'],
    ]), 'How strongly the categories are told apart by colour.')
    + slider('annotationIntensity', 'Mark intensity', annotations.intensity ?? 60, {
      min: 0, max: 100,
      format: (value) => `${value}%`,
      help: 'How prominent the marks are against your text.',
    })
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
  // Revealing the files is the first move of three, not the whole job. Showing
  // the button alone leaves the user in a folder with nothing to do next.
  return '<div class="settings-stack">'
    + '<p class="settings-note">A different product from LanguageTool\'s plugins above. Running both underlines everything twice.</p>'
    + steps([
      `Open ${literal('chrome://extensions')} and turn on <strong>Developer mode</strong>.`,
      'Choose <strong>Load unpacked</strong>, then pick the folder that opens below.',
      `It connects to ${literal('127.0.0.1:8096')} on its own — there is no account and nothing to sign in to.`,
    ])
    + '<div class="settings-inline">'
    + '<button class="cnt-btn" type="button" data-action="reveal-extension">Show extension files</button>'
    + '</div></div>';
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
    // Installing registers the service; it does not make it appear. Without
    // these three moves the user sees no change and concludes it failed.
    + (spell.installed
      ? steps([
        'Restart the app you want to check in — it reads the service list at launch.',
        'Turn on <strong>Check Grammar With Spelling</strong> in its Edit menu.',
        'Choose <strong>English (ikmal editor)</strong> from the spelling language list.',
      ])
      : '<p class="settings-note">Lists ikmal in macOS spelling and grammar settings, so native apps can '
        + 'check against it. Text stays on this computer.</p>')
    + (spell.installed
      ? '<p class="settings-note">ikmal editor must be running for its richer checks to appear.</p>'
      : '')
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
    // Four moves in a fixed order, each blocked on the one before it, and the
    // app already knows which are done. Saying so is the difference between a
    // sequence the user is walked through and one they have to reconstruct.
    + steps([
      ['Generate the per-user localhost certificate.', configured ? 'done' : 'current'],
      ['Approve it in your operating system\'s certificate store — Office refuses to load a task pane it does not trust.',
        office.trust === 'trusted' ? 'done' : configured ? 'current' : null],
      ['Start the bridge.', office.running ? 'done' : configured ? 'current' : null],
      ['Sideload the manifest for the app you want the pane in.', office.running ? 'current' : null],
    ])
    + '<div class="settings-stack"><span class="cnt-label">Task pane manifests</span><div class="settings-inline">'
    // A manifest points at the bridge. Handing one over while the bridge is
    // stopped sideloads a pane that cannot load, and the failure surfaces in
    // Office rather than here, where it could be explained.
    + hosts.map(([id, name]) => `<button class="cnt-btn" type="button" data-action="reveal-manifest" data-host="${id}"${office.running ? '' : ' disabled'}>${name}</button>`).join('')
    + '</div>'
    + (office.running ? '' : '<span class="settings-note">Start the bridge to sideload a manifest.</span>')
    + '</div></div>';
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
    // Named for what it contains. It was "Dictionary and rules" while holding
    // no dictionary — the shell can add a word but cannot list or remove one,
    // so a title promising dictionary management had nothing behind it.
    { id: 'rules', title: 'Style guides', description: 'Imported guides and the rules they add.', badge: 'Optional', body: rulesBody(state.styleGuides), open: open.has('rules') },
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
