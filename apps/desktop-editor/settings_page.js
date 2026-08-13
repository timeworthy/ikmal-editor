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
/* The measure is the page's, not this component's. Capping here at 720 while
   the header ran to the slice's own 756 left the two with different right
   edges — near enough to look like a mistake rather than a margin. */
.settings-page { display: grid; gap: var(--space-5); }
.settings-row { align-items: center; display: flex; gap: var(--space-4); justify-content: space-between; }
.settings-stack { display: grid; gap: var(--space-3); }
.settings-inline { align-items: center; display: flex; flex-wrap: wrap; gap: var(--space-4); }
.settings-note { color: var(--fg-4); font: 400 12px/1.45 var(--font-sans); }
/* An open section sits in the same plane as the closed rows below it, so its
   controls read as a continuation of the list rather than as its contents —
   "Findings to show" appeared to belong to whichever section came next. A
   recessed surface is enough to say inside. */
.settings-page .cnt-acc-body { background: var(--bg-0); padding-top: var(--space-4); }
/* A field's own parts sat 8px apart and consecutive fields 12px, so a help line
   was nearly as close to the next field's label as to the control it described.
   Fields are stacked at three times their internal gap, which is what makes
   them read as units. */
.settings-form { display: grid; gap: var(--space-5); }
/* Four categories wrapped 3 + 1, orphaning the longest. A pair of columns fits
   them evenly and collapses to one when there is no room for two. */
.settings-checks { display: grid; gap: var(--space-3) var(--space-4); grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
/* A slider's current value, sitting opposite its label. Tabular figures so the
   number does not shuffle sideways while the handle is being dragged. */
.settings-value { color: var(--fg-2); font: 500 12px/1.45 var(--font-mono); font-variant-numeric: tabular-nums; }
/* What was checked recently. One line each, because the point is to recognise
   an entry and decide whether to keep the list, not to read it back. */
.settings-history { display: grid; gap: var(--space-2); list-style: none; margin: 0; padding: 0; }
.settings-history-item { align-items: baseline; display: flex; gap: var(--space-4); justify-content: space-between; }
.settings-history-text { color: var(--fg-2); font: 400 13px/1.45 var(--font-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings-history-meta { align-items: center; color: var(--fg-4); display: flex; flex: none; font: 400 11px/1 var(--font-mono); gap: var(--space-2); }
/* Two sliders read better side by side than stacked: they are the same kind of
   control answering related questions, and stacked they put a help line between
   each label and the next. One column when there is no room for two. */
.settings-sliders { display: grid; gap: var(--space-4) var(--space-5); grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
/* An explanation the reader opens. Closed by default — it is for the person who
   is unsure, and it should not push the controls down for everyone else. */
.settings-explain { color: var(--fg-3); }
.settings-explain summary { color: var(--fg-2); cursor: pointer; font: 500 12px/1.4 var(--font-sans); }
.settings-explain summary:focus-visible { border-radius: var(--radius-1); box-shadow: var(--shadow-focus); outline: 2px solid transparent; }
.settings-explain-body { display: grid; gap: var(--space-3); padding: var(--space-3) 0 0; }
.settings-explain-row { display: grid; gap: var(--space-1); }
.settings-explain-term { color: var(--fg-2); font: 600 12px/1.4 var(--font-sans); }
.settings-explain-text { color: var(--fg-3); font: 400 12px/1.5 var(--font-sans); }
.settings-explain-note { color: var(--fg-4); }
/* The words a rule would actually catch, set apart from the sentence about
   them so the example is not read as part of the explanation. */
.settings-sample { background: var(--bg-2); border-radius: var(--radius-1); color: var(--fg-2); font: 400 12px/1.4 var(--font-mono); padding: 1px var(--space-2); }
/* Between the two halves of a merged section, so they read as related rather
   than as one long body that changes subject without warning. */
.settings-divider { background: var(--border-1); border: 0; height: 1px; margin: var(--space-2) 0; }
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

/**
 * An explanation the reader opens, with examples.
 *
 * A control's help line has room for what a setting does and none for what it
 * means. "Lower shows more suggestions, including less confident ones" is true
 * and still leaves someone unable to guess what they would actually see
 * differently — and four categories named Grammar, Repeats, Style and Other
 * cannot be told apart without an example of each.
 *
 * A disclosure rather than a tooltip: a tooltip cannot be reached by keyboard
 * or touch, and this is the text most likely to be wanted by someone who is
 * not sure what they are looking at.
 */
function explain(summary, rows) {
  const items = rows.map(([term, example]) =>
    `<div class="settings-explain-row"><span class="settings-explain-term">${escapeHTML(term)}</span>`
    + `<span class="settings-explain-text">${example}</span></div>`).join('');
  return `<details class="settings-explain"><summary>${escapeHTML(summary)}</summary>`
    + `<div class="settings-explain-body">${items}</div></details>`;
}

/**
 * An example of the text a rule catches, so a category name is not the only
 * clue. A correction is shown as one — the arrow is what makes "teh the" read
 * as a fix rather than as two words.
 */
function sample(text, correction) {
  return `<span class="settings-sample">${escapeHTML(text)}</span>`
    + (correction ? ` <span class="settings-explain-note">&rarr; ${escapeHTML(correction)}</span>` : '');
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
  return '<div class="settings-form">'
    + field('When to check', select('mode', preferences.mode || 'automatic', [
      ['automatic', 'Automatically as I write'],
      ['manual', 'Only when I ask'],
    ]))
    // Side by side: two sliders answering related questions about the same
    // thing. Stacked, each label was separated from the next by a help line, so
    // the pair read as two unrelated settings that happened to be adjacent.
    + '<div class="settings-sliders">'
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
      help: 'How sure a suggestion must be before you see it.',
    })
    + '</div>'
    // Sensitivity is the hardest control on this page to guess the effect of.
    // A percentage with no referent tells the reader nothing about what would
    // appear or stop appearing, so the ends of the range are described by what
    // they actually let through.
    + explain('What does sensitivity change?', [
      ['Higher — only confident findings',
        'Spelling and agreement, where there is one right answer. '
        + sample('The results is wrong', 'The results are wrong')],
      ['Lower — suggestions as well',
        'Judgement calls that may be fine as written: passive voice, a long '
        + 'sentence, a word repeated across a paragraph. ' + sample('was reviewed by the team')],
      ['It never changes what is checked',
        'Only how sure a finding must be before it is shown. Turning a whole kind of '
        + 'finding off is what the checkboxes below are for.'],
    ])
    // Named for what each category actually catches. "Style" alone does not say
    // that an imported guide's rules arrive under it, and "Repetition" reads as
    // a duplicate-word check rather than the echoes it also finds.
    + '<div class="settings-stack"><span class="cnt-label">Findings to show</span><div class="settings-checks">'
    + checkbox('category:grammar', 'Grammar and agreement', categories.grammar !== false)
    + checkbox('category:repetition', 'Repeats and echoes', categories.repetition !== false)
    + checkbox('category:style', 'Style and guide rules', categories.style !== false)
    // Named for what it turns off, not for which of our services produces it.
    // The other three rows say "grammar", "repeats", "style"; this one said
    // "LanguageTool", which asks the reader to know our architecture to guess
    // what they would stop seeing. The engines are named where they are the
    // subject — Services, Integrations — and nowhere else.
    + checkbox('category:languagetool', 'Other suggestions', categories.languagetool !== false)
    + '</div>'
    // Four names cannot be told apart without an example of each, and the
    // difference between "Grammar" and "Other suggestions" is the one nobody
    // can guess: both come from the same checker, and the split is between what
    // has a single right answer and what does not.
    + explain('What is the difference between these?', [
      ['Grammar and agreement',
        'Subject and verb, tense, articles, spelling. There is a right answer '
        + 'and it can be applied. ' + sample('teh', 'the')],
      ['Repeats and echoes',
        'The same word or root used again close by, including forms of it. '
        + sample('the report … the report')],
      ['Style and guide rules',
        'How something is written rather than whether it is correct — passive '
        + 'voice, wordiness — plus every rule from a style guide you have imported.'],
      ['Other suggestions',
        'Everything else the checker reports that does not fall into the three '
        + 'above. Turning this off is the way to quieten the long tail without '
        + 'losing the categories you rely on.'],
    ])
    + '</div>'
    + '</div>';
}

/**
 * Where the app itself lives. First, because it is what someone opening
 * settings for the first time is most likely to be looking for — and because
 * these three decide whether the product is present at all, which is a
 * different question from how it marks a draft. They sat at the bottom of
 * Appearance, under three controls about the colour of underlines.
 */
function generalBody(presence = {}, launchAtLogin = false) {
  return '<div class="settings-form"><div class="settings-inline">'
    + toggle('menubarIcon', 'Show in the menu bar', presence.menubarIcon !== false)
    + (presence.dockSupported ? toggle('dockIcon', 'Show in the Dock', presence.dockIcon !== false) : '')
    + toggle('launchAtLogin', 'Open at login', Boolean(launchAtLogin))
    + '</div>'
    + (presence.dockSupported ? '' : '<p class="settings-note">Dock visibility is managed by the '
      + 'operating system on this platform.</p>')
    + '</div>';
}

function appearanceBody(annotations = {}) {
  return '<div class="settings-form">'
    // First, because it decides the shape of the window the other three are
    // describing. Both are real choices: a list beside the draft is the better
    // way to work through a document, and a card from the indicator is what
    // someone in a narrow window, or wanting the text alone, reaches for.
    + field('Findings', select('annotationLayout', annotations.layout || 'sidebar', [
      ['sidebar', 'In a list beside the draft'], ['panel', 'In a card, when I ask for one'],
    ]), 'Where findings appear while you write.')
    // Each control says what choosing it changes. A bare "Mark palette" leaves
    // the reader to open the menu to find out what a palette decides.
    + field('Mark style', select('annotationStyle', annotations.style || 'squiggle', [
      ['squiggle', 'Squiggles'], ['line', 'Lines'], ['dash', 'Dashes'],
    ]), 'The shape drawn under text a finding refers to.')
    + field('Mark palette', select('annotationPalette', annotations.palette || 'balanced', [
      ['balanced', 'Balanced'], ['warm', 'Warm'], ['cool', 'Cool'], ['contrast', 'High contrast'],
    ]), 'How strongly the categories are told apart by colour.')
    + slider('annotationIntensity', 'Mark intensity', annotations.intensity ?? 55, {
      min: 0, max: 100, step: 5,
      format: (value) => `${value}%`,
      help: 'How prominent the marks are against your text.',
    })
    + '</div>';
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

  // "Non-commercial" is the most misread word on this page, and the common
  // misreading is that it forbids writing you are paid for. What the licence
  // actually restricts is stated in its own words, and what we cannot answer is
  // said rather than guessed at: Creative Commons makes the test turn on the
  // use rather than the user, and declines to draw a line. Telling someone
  // their case is fine would be legal advice this product is in no position to
  // give — so it says what is certain, and where to read the rest.
  const licence = quality.modelIsDefault
    ? '<div class="cnt-alert" data-intent="warning"><div>'
      + '<div class="cnt-alert-title">Non-commercial model</div>'
      + `<div class="cnt-alert-text">The default model ${escapeHTML(quality.modelId || '')} is licensed `
      + `${escapeHTML(quality.modelLicense || '')}. ikmal editor's own MIT licence does not cover these weights, and `
      + 'installing them makes this machine the party bound by that licence.</div></div></div>'
      + explain('What does non-commercial mean here?', [
        ['It applies to these model weights and nothing else',
          'Every other part of ikmal editor is MIT licensed. Choosing a '
          + 'permissively licensed model leaves nothing non-commercial installed.'],
        ['The licence\'s own words',
          'CC BY-NC-SA 4.0 defines NonCommercial as ' + sample('not primarily intended for or '
          + 'directed towards commercial advantage or monetary compensation') + '.'],
        ['Whether your use qualifies is not something this app can tell you',
          'Creative Commons treats it as depending on the use rather than on who '
          + 'you are, and does not draw a line. Writing that earns you money is '
          + 'not obviously inside or outside it, and this is not legal advice — '
          + 'if it matters, read the licence or ask someone qualified.'],
        ['The way to avoid the question',
          'Set ' + literal('IKMAL_TRANSFORMER_MODEL') + ' to a permissively licensed '
          + 'model before installing — ' + literal('Unbabel/gec-t5_small') + ' is Apache-2.0. '
          + 'Third-party notices below has the full terms and the links.'],
      ])
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

// When a check was kept, said the way someone reads a clock rather than a log.
function whenChecked(value) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  const minutes = Math.round((Date.now() - at.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return at.toLocaleDateString();
}

function privacyBody(recentChecks = []) {
  const entries = Array.isArray(recentChecks) ? recentChecks : [];
  const count = entries.length;
  // The list, not only the number. The tray offers "Recent checks (N)" and this
  // is where it lands, so a count with a Clear button beside it would have been
  // a destination that could not answer the question it was opened to answer.
  // Kept short: this is the record the product holds about you, and its purpose
  // here is that you can see it and delete it.
  const list = count
    ? '<ul class="settings-history">'
      + entries.slice(0, 8).map((entry) => '<li class="settings-history-item">'
        + `<span class="settings-history-text">${escapeHTML(String(entry?.text ?? '').slice(0, 90))}</span>`
        + `<span class="settings-history-meta"><span class="cnt-tag">${Number(entry?.matchCount) || 0}</span>`
        + `<span>${escapeHTML(whenChecked(entry?.checkedAt))}</span></span></li>`).join('')
      + '</ul>'
      + (count > 8 ? `<p class="settings-note">${count - 8} older ${count - 8 === 1 ? 'check is' : 'checks are'} also kept.</p>` : '')
    : '<p class="settings-note">Nothing has been checked yet.</p>';
  return '<div class="settings-stack">'
    + '<div class="cnt-alert" data-intent="info"><div class="cnt-alert-text">'
    + 'Text is checked by services on this machine. There is no account, no cloud model, and nothing is sent anywhere.'
    + '</div></div>'
    + `<div class="settings-row"><span>${count === 1 ? '1 recent check kept locally' : `${count} recent checks kept locally`}</span>`
    + `<button class="cnt-btn" type="button" data-action="clear-history"${count ? '' : ' disabled'}>Clear history</button></div>`
    + list
    + '</div>';
}

function aboutBody(version) {
  return '<div class="settings-stack">'
    + `<div class="settings-row"><span>Version</span><span class="cnt-tag">${escapeHTML(version || 'unknown')}</span></div>`
    + '<div class="settings-row"><span>Licence</span><span class="cnt-tag">MIT</span></div>'
    // What someone comes to About to find out. The notices file has always had
    // this and the page never said any of it, so the only way to learn what you
    // were bound by was to open a markdown file and read a table.
    + explain('What is this licensed under?', [
      ['ikmal editor itself', 'MIT. Use it for anything, including work you are paid for.'],
      ['The services it runs',
        'LanguageTool is LGPL-2.1 and runs as a separate process this app talks to '
        + 'over loopback. The quality adapter is MIT.'],
      ['The optional local model',
        'The only part with a restriction. The default weights are CC BY-NC-SA 4.0 '
        + '(non-commercial); Services and model explains what that covers and how to '
        + 'install a permissively licensed model instead.'],
      ['Everything, in full', 'Third-party notices lists every dependency, its version and its licence.'],
    ])
    + '<div class="settings-inline">'
    + '<button class="cnt-btn" type="button" data-action="open-notices">Third-party notices</button>'
    + '</div></div>';
}

/**
 * What each closed section is currently set to.
 *
 * Eleven sections rendered at identical weight with a category label that said
 * "Optional" on seven of them, so the page was a list of doors: the only way to
 * learn the state of anything was to open all eleven. Every section here has a
 * state the app already holds, so the closed row can answer the question it is
 * actually being asked — whether it is worth opening.
 *
 * A section whose state has not loaded yet returns nothing rather than a
 * placeholder, because a row that says "unknown" is a row that has to be opened
 * anyway, and it would reflow when the real value arrived.
 */
function sectionSummaries(state = {}) {
  const summaries = {};
  const set = (id, summary, intent) => { if (summary) summaries[id] = { summary, ...(intent ? { intent } : {}) }; };

  if (state.checking?.mode) {
    set('checking', state.checking.mode === 'manual' ? 'Only when asked' : `Automatic · ${Number(state.checking.delay) || 700} ms`);
  }
  if (state.annotations?.style) {
    set('appearance', { squiggle: 'Squiggles', line: 'Lines', dash: 'Dashes' }[state.annotations.style] || state.annotations.style);
  }
  if (state.styleGuides) {
    const guides = state.styleGuides.guides?.length || 0;
    // Imported but switched off is the state worth flagging: the rules are
    // there and are not being applied, which is invisible from anywhere else.
    set('rules', !guides ? 'None imported' : state.styleGuides.enabled ? `${guides} active` : `${guides} imported, off`,
      guides && !state.styleGuides.enabled ? 'warning' : undefined);
  }
  if (state.integrations?.targets) {
    const targets = state.integrations.targets;
    const configured = targets.filter((target) => target.configured).length;
    set('integrations', !targets.length ? 'None found' : `${configured} of ${targets.length} pointed here`,
      configured ? 'success' : undefined);
  }
  if (state.spellServer && state.spellServer.supported !== undefined) {
    set('spell', !state.spellServer.supported ? 'macOS only'
      : !state.spellServer.available ? 'Not in this build'
        : state.spellServer.installed ? 'Installed' : 'Not installed',
      state.spellServer.installed ? 'success' : undefined);
  }
  if (state.office && state.office.supported !== undefined) {
    set('office', !state.office.supported ? 'Not in this build'
      : state.office.running ? 'Bridge running'
        : state.office.configured ? 'Bridge stopped' : 'Not set up',
      state.office.running ? 'success' : undefined);
  }
  // Both halves of the merged section in one line. Saying "Both running" while
  // the optional model is missing would answer a question nobody asked and hide
  // the one they did.
  if (state.services && state.services.languageToolReady !== undefined) {
    const running = [state.services.languageToolReady, state.services.qualityReady].filter(Boolean).length;
    const services = running === 2 ? 'Both running' : running ? '1 of 2 running' : 'Stopped';
    const model = state.quality?.components?.length
      ? state.quality.ready ? (state.quality.transformerRunning ? 'model running' : 'model idle') : 'no model'
      : '';
    set('services', model ? `${services} · ${model}` : services,
      running === 2 ? 'success' : 'warning');
  }
  if (Array.isArray(state.recentChecks)) {
    set('privacy', state.recentChecks.length === 1 ? '1 check kept' : `${state.recentChecks.length} checks kept`);
  }
  if (state.presence && state.presence.menubarIcon !== undefined) {
    const where = [state.presence.menubarIcon !== false ? 'Menu bar' : '', state.presence.dockIcon ? 'Dock' : '']
      .filter(Boolean).join(' + ');
    set('general', where || 'Hidden', where ? undefined : 'warning');
  }
  set('about', state.version);
  return summaries;
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
  const summaries = sectionSummaries(state);
  const section = (id, title, description, body) => ({
    id, title, description, body, open: open.has(id), ...(summaries[id] || {}),
  });
  // Three bands, because eleven sections in a flat list stopped being
  // scannable. They group without consolidating: four ways of reaching other
  // apps read as one concern, while each keeps the summary that says whether it
  // is worth opening — which merging them into a single section would have
  // thrown away. The one real consolidation is the quality model, which is a
  // service on this machine and now sits with the others.
  return `<div class="settings-page">${renderSettingsGroups([
    { heading: 'Writing', description: 'What the product does while you write.' },
    section('general', 'General', 'Where ikmal appears, and whether it starts with your session.',
      generalBody(state.presence, state.launchAtLogin)),
    section('checking', 'Checking', 'When checks run and what they surface.', checkingBody(state.checking)),
    section('appearance', 'Appearance', 'How findings are shown and marked.', appearanceBody(state.annotations)),
    // Named for what it contains. It was "Dictionary and rules" while holding
    // no dictionary — the shell can add a word but cannot list or remove one,
    // so a title promising dictionary management had nothing behind it.
    section('rules', 'Style guides', 'Imported guides and the rules they add.', rulesBody(state.styleGuides)),

    { heading: 'Where ikmal works', description: 'The other places you write.' },
    // Every other description names what the section covers; this one told the
    // reader to go and do something. It also now says whose extension it is,
    // which is the distinction the body goes on to draw.
    section('extension', 'Browser extension', 'ikmal\'s own extension, for text fields in your browser.', browserExtensionBody()),
    section('integrations', 'Integrations', 'LanguageTool plugins and editors pointed at this machine.', integrationsBody(state.integrations)),
    section('spell', 'Native macOS spell service', 'ikmal in the system spelling menu.', spellServerBody(state.spellServer)),
    section('office', 'Microsoft Office', 'Task panes served over local HTTPS.', officeBody(state.office)),

    { heading: 'On this machine', description: 'What runs here, what is kept, and what it is built on.' },
    section('services', 'Services and model', 'What is running here, and the optional local model.',
      `<div class="settings-stack">${servicesBody(state.services)}`
      + `<hr class="settings-divider">${qualityModelBody(state.quality, state.services)}</div>`),
    section('privacy', 'Privacy and data', 'What is kept on this machine, and how to remove it.', privacyBody(state.recentChecks)),
    section('about', 'About', 'Version and licences.', aboutBody(state.version)),
  ])}</div>`;
}
