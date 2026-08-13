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
for (const capability of ['getCheckingPreferences', 'getAnnotationPreferences', 'getStyleGuideState', 'getServiceState', 'getRecentChecks', 'getIntegrationStatus', 'getSpellServerState', 'getOfficeBridgeState', 'getQualityStatus', 'revealExtension']) {
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
for (const forbidden of ['getQualityStatus', 'getStyleGuideState', 'getOfficeBridgeState', 'getSpellServerState', 'getIntegrationStatus', 'setAnnotationPreferences']) {
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
assert.deepEqual(sectionOrder, ['checking', 'appearance', 'rules', 'quality', 'extension', 'integrations', 'spell', 'office', 'services', 'privacy', 'about'],
  'settings sections are out of canonical order');
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
  'Quality model': 'quality',
  'Style guide': 'rules',
  'Checking behavior': 'checking',
  'Native macOS spell service': 'spell',
  'Highlighting': 'appearance',
  'App access': 'appearance',
  'Advanced': 'appearance',
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
