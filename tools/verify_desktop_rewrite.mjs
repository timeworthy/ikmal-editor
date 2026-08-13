import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps', 'desktop-editor');
for (const file of ['index.html', 'styles.css', 'renderer.js', 'preload.cjs', 'README.md']) assert.ok(fs.existsSync(path.join(app, file)), `missing desktop rewrite source: ${file}`);
assert.ok(fs.existsSync(path.join(root, 'desktop', 'rewrite_packaged_smoke.mjs')), 'missing packaged desktop rewrite smoke harness');
const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(app, 'renderer.js'), 'utf8');
assert.match(html, /id="editor-input"/);
assert.match(html, /Content-Security-Policy/);
assert.match(html, /connect-src 'none'/);
assert.match(html, /object-src 'none'/);
assert.match(html, /type="module"/);
for (const importName of ['writing-core.js', 'desktop_slice.js', 'indicator.js', 'issue_popover.js']) assert.match(renderer, new RegExp(importName.replace('.', '\\.')), `missing compiled import: ${importName}`);
assert.match(renderer, /window\.ikmal\.checkText/);
assert.match(renderer, /onEditorText/);
assert.doesNotMatch(renderer, /require\(['"]electron|from ['"]electron/);
const preload = fs.readFileSync(path.join(app, 'preload.cjs'), 'utf8');
assert.match(preload, /contextBridge\.exposeInMainWorld\(['"]ikmal['"]/);
assert.match(preload, /checkText/);
assert.match(preload, /onEditorText/);
// The editor owns settings, so it legitimately reaches service state, style
// guides, and preferences. What it must never receive is the legacy surface
// wholesale — the point was a preload shaped by what this window does, not a
// copy of all 55 capabilities. `configureIntegrations` and `openCompact` stand
// for that: neither belongs to writing or to settings as built.
// The editor owns every settings surface now, so the forbidden list is what
// belongs to the launcher or to no window at all.
assert.doesNotMatch(preload, /openCompact|setCompactExpanded|setCompactHeight|onQuickCheck/);
// Settings live here and only here, so these must be present.
for (const capability of ['getCheckingPreferences', 'getAnnotationPreferences', 'getStyleGuideState', 'getServiceState', 'getRecentChecks', 'getIntegrationStatus', 'getSpellServerState', 'getOfficeBridgeState', 'revealExtension']) {
  assert.ok(preload.includes(capability), `the editor owns settings and is missing ${capability}`);
}
const packageSource = fs.readFileSync(path.join(root, 'desktop', 'package_desktop.mjs'), 'utf8');
assert.match(packageSource, /assets', 'ikmal_editor'/, 'fresh desktop packaging must use product-branded icon assets');
assert.doesNotMatch(packageSource, /assets', 'ikmal_languagetool'/, 'fresh desktop packaging must not use legacy LanguageTool icon assets');
assert.match(packageSource, /executableName: 'ikmal-editor'/, 'Linux packaging must expose the product executable name');
assert.match(packageSource, /linuxDesktopPath/, 'Linux packaging must stage the desktop entry resources');
assert.doesNotMatch(`${html}\n${fs.readFileSync(path.join(app, 'README.md'), 'utf8')}`, /language\s*tool/i, 'fresh desktop product surface must not use legacy engine branding');
assert.doesNotMatch(`${html}\n${renderer}`, /\/Users\/iansherr\/Projects\/ikmal|https?:\/\/(?!127\.0\.0\.1|localhost)/);
assert.doesNotMatch(renderer, /unsafe-eval|eval\s*\(/, 'fresh desktop renderer must not use dynamic code execution');
console.log('Fresh desktop rewrite source verified: isolated renderer, preload-shaped checker, and compiled imports present.');

// The primitive layer is the foundation every later phase builds on, and its
// only real proof is a browser rendering it across the axes. An opt-in harness
// is exactly the kind that disappears unnoticed.
assert.ok(fs.existsSync(path.join(root, 'tools', 'design_system_gallery_smoke.mjs')), 'missing design-system gallery harness');
assert.ok(fs.existsSync(path.join(root, 'packages', 'design-system', 'gallery.html')), 'missing design-system gallery');

// The launcher is a launcher. Its preload is the boundary that keeps it one:
// a capability it cannot reach is a settings panel it cannot grow.
const compact = path.join(root, 'apps', 'desktop-compact');
for (const file of ['index.html', 'renderer.js', 'preload.cjs', 'styles.css']) {
  assert.ok(fs.existsSync(path.join(compact, file)), `missing launcher file: ${file}`);
}
const compactPreload = fs.readFileSync(path.join(compact, 'preload.cjs'), 'utf8');
for (const capability of ['checkText', 'getServiceState', 'getFocusMode', 'setFocusMode', 'openEditor']) {
  assert.ok(compactPreload.includes(capability), `launcher preload is missing ${capability}`);
}
for (const forbidden of ['getStyleGuideState', 'getOfficeBridgeState', 'getSpellServerState', 'getIntegrationStatus', 'setAnnotationPreferences']) {
  assert.ok(!compactPreload.includes(forbidden), `launcher preload exposes a settings capability: ${forbidden}`);
}
// Layout only: a colour here is a second visual system starting.
const compactStyles = fs.readFileSync(path.join(compact, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
assert.doesNotMatch(compactStyles, /#[0-9a-f]{3,8}\b/i, 'launcher styles hard-code a colour');
assert.doesNotMatch(compactStyles, /\brgba?\(\s*\d/, 'launcher styles hard-code a colour');
assert.ok(fs.readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8').includes('desktopCompactPagePath'),
  'the shell must be able to load the launcher slice');

// Settings live in the editor and nowhere else. The canonical order is a
// product contract: a host may omit a section it cannot support, but it may not
// reorder the conceptual system.
const settingsPage = fs.readFileSync(path.join(app, 'settings_page.js'), 'utf8');
// Matched in either authoring form — an object literal, or the `section()`
// helper that builds one. The property is the order the sections appear in, not
// the syntax that produced them, which is the third time this file has asserted
// a shape when it meant a property.
const sectionOrder = [...settingsPage.matchAll(/(?:id: '([a-z]+)', title: ')|(?:\n\s*section\('([a-z]+)', ')/g)]
  .map((match) => match[1] || match[2]);
// The order is still a product contract; the contract changed on purpose.
// General leads because whether the product is present at all is a different
// question from how it marks a draft, and it sat under three controls about the
// colour of underlines. The quality model is gone entirely: the optional
// transformer and its non-commercial weights were deleted, and the deterministic
// checks it sat beside are what Services reports.
assert.deepEqual(sectionOrder, ['general', 'checking', 'appearance', 'rules', 'extension', 'integrations', 'spell', 'office', 'services', 'privacy', 'about'],
  'settings sections are out of canonical order');
// Consolidating a section must not quietly delete what was in it. This caught a
// real over-reach: a regex meant for one function's doc comment matched from an
// earlier one and took ten functions with it.
for (const body of ['generalBody', 'checkingBody', 'appearanceBody', 'rulesBody', 'servicesBody', 'privacyBody', 'aboutBody']) {
  assert.match(settingsPage, new RegExp(`\\b${body}\\(`), `${body} is defined but never rendered`);
}
// Bands group the page without merging what they group: each section under one
// keeps its own summary, which is the whole reason for grouping rather than
// consolidating four connection sections into one.
assert.match(settingsPage, /heading: 'Where ikmal works'/, 'the settings page has no bands');
assert.ok((settingsPage.match(/\{ heading: '/g) || []).length >= 3, 'the settings page is one flat list of sections');
// Built from the shared composites, not restyled.
for (const composite of ['renderSettingsGroups', 'renderServiceHealth', 'renderStyleGuideCard']) {
  assert.ok(settingsPage.includes(composite), `settings page does not use ${composite}`);
}
assert.doesNotMatch(settingsPage.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),
  /#[0-9a-f]{3,8}\b|\brgba?\(\s*\d/i, 'the settings page hard-codes a colour');
// The control names are the shell's preference keys. A translation layer here
// is a place for the two to drift apart.
// Matched in any of the forms a control is authored in: the attribute written
// out literally, or a helper given the key as its first argument. The property
// being asserted is that the control binds the shell's own key — not which
// helper happened to produce the markup, which is how this assertion broke the
// last two times a helper was introduced.
for (const key of ['mode', 'delay', 'sensitivity']) {
  assert.match(settingsPage, new RegExp(`data-setting="${key}"|(?:select|slider|toggle|checkbox)\\('${key}'`),
    `settings page does not bind the ${key} preference`);
}

// The legacy compact window carried ten settings groups. Every one must have an
// equivalent here before the legacy renderers can be deleted, so the mapping is
// asserted rather than remembered.
const legacyGroups = [...fs.readFileSync(path.join(root, 'desktop', 'index.html'), 'utf8')
  .matchAll(/<summary><span><strong>([^<]+)<\/strong>/g)].map((match) => match[1]);
const covers = {
  'LanguageTool plugins': 'integrations',
  'Browser extension': 'extension',
  'Microsoft Office': 'office',
  // The optional transformer and its non-commercial weights were deleted, so
  // the legacy group maps to the services section that remains: the
  // deterministic quality checks it described are still there and still run.
  'Quality model': 'services',
  'Style guide': 'rules',
  'Checking behavior': 'checking',
  'Native macOS spell service': 'spell',
  'Highlighting': 'appearance',
  // Menu bar, Dock and open-at-login moved out of Appearance into General:
  // where the app lives is not how it marks a draft.
  'App access': 'general',
  'Advanced': 'general',
};
for (const group of legacyGroups) {
  const section = covers[group];
  assert.ok(section, `legacy settings group "${group}" has no mapping to a rewrite section`);
  assert.ok(sectionOrder.includes(section), `legacy group "${group}" maps to a missing section: ${section}`);
}

// A repaint must not close a section the reader opened. Service state is pushed
// while settings are visible, so the page repaints on its own — holding the
// open set outside the render is what keeps it from snapping shut underneath
// them.
const editorRenderer = fs.readFileSync(path.join(app, 'renderer.js'), 'utf8');
assert.match(editorRenderer, /const openSections = new Set\(/, 'open sections are not held across repaints');
assert.match(editorRenderer, /renderSettingsPage\(\{ \.\.\.settingsState, open: openSections \}\)/,
  'the settings render does not receive the open set');
assert.match(settingsPage, /state\.open instanceof Set/, 'the settings page ignores which sections are open');

// Installing the extension, the spell service, or the Office bridge each leave
// the user somewhere they have to be told how to finish, and the first pass of
// this page dropped all three procedures because they read as clutter in the
// legacy panel that squeezed them into a column three words wide. The content
// was never the problem, so its absence is now a failure.
for (const section of ['browserExtensionBody', 'spellServerBody', 'officeBody']) {
  const body = settingsPage.slice(settingsPage.indexOf(`function ${section}`));
  const end = body.indexOf('\nfunction ');
  assert.match(end === -1 ? body : body.slice(0, end), /steps\(\[/,
    `${section} tells the user what it does but not how to finish it`);
}
// Every slider reports the value it is sitting on. Two of the three reported
// nothing, so the only way to read a setting was to judge a handle's position
// against a bare track.
// Exactly one, and it is the helper's own. A second is a slider authored by
// hand, which is how two of the three came to report nothing.
assert.equal(
  (settingsPage.match(/<input class="cnt-slider"/g) || []).length, 1,
  'a slider is authored by hand rather than through the helper that gives it a readout',
);
assert.match(settingsPage.slice(settingsPage.indexOf('function slider('), settingsPage.indexOf('<input class="cnt-slider"')),
  /settings-value/, 'the slider helper does not render a readout');

// A slider must not offer precision the shell throws away. The shell rounds the
// typing pause and the sensitivity to fixed grains, so a finer control returns
// a number that is silently changed on the way in — the value released on is
// not the value kept. The grains are read out of the shell rather than copied,
// so the two cannot drift apart.
const shell = fs.readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8');
const grains = {
  delay: Number(shell.match(/checkDelay:[^\n]*?Math\.round\(delay \/ (\d+)\)/)?.[1]),
  sensitivity: Number(shell.match(/checkSensitivity:[^\n]*?Math\.round\(sensitivity \/ (\d+)\)/)?.[1]),
};
for (const [key, grain] of Object.entries(grains)) {
  assert.ok(Number.isFinite(grain) && grain > 0, `could not read the shell's rounding for ${key}`);
  const step = Number(settingsPage.match(new RegExp(`slider\\('${key}'[\\s\\S]{0,200}?step: (\\d+)`))?.[1]);
  assert.ok(Number.isFinite(step), `the ${key} slider declares no step`);
  assert.equal(step % grain, 0,
    `the ${key} slider steps by ${step}, but the shell rounds to ${grain} — it would report a value it does not keep`);
}

// A collapsed row says what the section is set to, not what kind of section it
// is. The slot used to hold a category — and said "Optional" on seven of the
// eleven, so it was identical across most of the page and carried nearly
// nothing, while mixing two axes: Control and Display describe what a section
// is about, Optional describes whether you need it.
assert.match(settingsPage, /function sectionSummaries\(state/, 'the settings page does not derive per-section state');
for (const category of ['Optional', 'Control', 'Display']) {
  assert.doesNotMatch(settingsPage, new RegExp(`summary: '${category}'|badge: '${category}'`),
    `a section is labelled with the category "${category}" rather than what it is set to`);
}
// Every summary must come from state. A literal is a category by another name.
const summaries = settingsPage.slice(settingsPage.indexOf('function sectionSummaries'));
const summaryBody = summaries.slice(0, summaries.indexOf('\n}'));
assert.match(summaryBody, /state\./, 'section summaries are not read from state');

// The mark layer. Appearance ships three controls for it — style, palette and
// intensity — and for the whole of Phase D they wrote a preference that nothing
// in the rewrite read: there was no overlay, no mark styles in the design
// system, and the legacy annotation surface was never ported. A settings
// section for a feature the window cannot perform is worse than an absent one,
// so the wiring is asserted rather than assumed.
const editorMarkup = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
assert.match(editorMarkup, /class="writing-marks-surface"/, 'the editor has no mark surface');
assert.match(editorMarkup, /id="editor-marks"[^>]*|class="writing-marks"/, 'the editor has no mark overlay');
assert.match(editorMarkup, /class="writing-marks-input"/, 'the editor field is not part of the mark surface');
// The overlay is a second copy of the draft. Announced, it would be the whole
// document read twice, so it is hidden — and nothing inside it may be
// focusable, which is the pairing the legacy surface got wrong.
assert.match(editorMarkup.slice(editorMarkup.indexOf('writing-marks"')), /aria-hidden="true"/,
  'the mark overlay is announced, so the draft is read twice');
const marksSource = fs.readFileSync(path.join(root, 'packages', 'writing-ui', 'src', 'marks.ts'), 'utf8');
assert.doesNotMatch(marksSource.slice(marksSource.indexOf('export function renderMarks')), /tabindex/,
  'marks are focusable inside a hidden overlay');

// Every preference must reach the paint. Storing one is not applying it, and
// storing one was exactly what the three controls did.
for (const preference of ['annotationStyle', 'annotationPalette', 'annotationIntensity']) {
  assert.ok(settingsPage.includes(`data-setting="${preference}"`) || settingsPage.includes(`'${preference}'`),
    `Appearance does not offer ${preference}`);
}
assert.match(editorRenderer, /applyAnnotationPreferences\(document\.documentElement/,
  'the editor never applies the annotation preferences it saves');
assert.match(editorRenderer, /attachMarkSurface\(/, 'the editor does not attach the mark surface');

// The field and the overlay must take their geometry from one place. Every
// property that decides where a glyph lands is set on both by the composite, so
// restating any of them in the app is how the marks come to sit under the wrong
// words — silently, and only on some drafts.
const editorStyles = fs.readFileSync(path.join(app, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
for (const property of ['font', 'font-size', 'line-height', 'padding', 'letter-spacing', 'white-space', 'word-break']) {
  assert.doesNotMatch(editorStyles, new RegExp(`#editor-input[^{]*\\{[^}]*\\b${property}\\s*:`),
    `the app restates ${property} on the field, which the mark overlay has to match`);
}

// No event the shell broadcasts may land on nobody.
//
// This is the defect E2 exists to remove, and it was invisible because a
// send() to a window with no listener succeeds. Two of the six tray items —
// "Quick check clipboard" and "Recent checks" — did nothing at all, and four
// service failures including a manager binary that cannot be found reported
// themselves into silence. Derived from the contract rather than listed here,
// so a channel added later cannot be added without a listener.
const contractSource = fs.readFileSync(path.join(root, 'packages', 'writing-adapters', 'src', 'desktop_ipc.ts'), 'utf8');
const eventBlock = contractSource.slice(contractSource.indexOf('DESKTOP_EVENT_CHANNELS'));
const eventChannels = [...eventBlock.slice(0, eventBlock.indexOf('] as const')).matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
assert.ok(eventChannels.length >= 9, `could not read the event channels from the contract: ${JSON.stringify(eventChannels)}`);
const preloads = {
  launcher: compactPreload,
  editor: preload,
};
for (const channel of eventChannels) {
  const heard = Object.entries(preloads).filter(([, source]) =>
    source.includes(`subscribe('${channel}')`) || source.includes(`ipcRenderer.on('${channel}'`));
  assert.ok(heard.length, `the shell broadcasts "${channel}" and no rewrite window listens for it`);
}

// And a preload that exposes a subscription no renderer calls is the same
// defect one level up: the capability exists, and nothing happens.
const compactRenderer = fs.readFileSync(path.join(compact, 'renderer.js'), 'utf8');
for (const [name, source, renderer] of [['launcher', compactPreload, compactRenderer], ['editor', preload, editorRenderer]]) {
  for (const [, handler] of source.matchAll(/^\s*(on[A-Z]\w+):/gm)) {
    assert.match(renderer, new RegExp(`window\\.ikmal\\.${handler}`),
      `the ${name} preload exposes ${handler} and its renderer never calls it`);
  }
}

// The tray's "Recent checks" has a destination that can answer the question it
// is opened to ask. Privacy showed a count and a Clear button, which is not a
// list of recent checks by any reading.
assert.match(settingsPage, /settings-history-item/, 'Privacy counts recent checks but cannot show them');
assert.match(editorRenderer, /onShowHistory/, 'nothing routes the tray history request anywhere');

// The optional transformer and its non-commercial model weights were deleted.
// Nothing this app installs may carry a non-commercial restriction, and no
// capability for installing one may reappear in a preload.
for (const source of [preload, compactPreload, editorRenderer, settingsPage]) {
  assert.doesNotMatch(source, /installQualityStack|getQualityStatus|IKMAL_TRANSFORMER/,
    'a transformer or model-install capability came back');
}
// The property is that no component is described as non-commercial — not that
// the words never appear. About says plainly that nothing installed carries
// such a restriction, which is the reassurance this deletion earns.
assert.doesNotMatch(settingsPage, /CC BY-NC/i, 'a non-commercial licence is named again');
assert.doesNotMatch(settingsPage, /modelLicense|modelIsDefault|install-quality|quality-notices/,
  'the model install flow came back');
