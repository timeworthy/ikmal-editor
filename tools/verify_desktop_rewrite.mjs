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
const sectionOrder = [...settingsPage.matchAll(/id: '([a-z]+)', title: '([^']+)'/g)].map((match) => match[1]);
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
// Matched in either form: a control may carry the attribute literally or get it
// from the select helper, and the property being asserted is the binding, not
// which helper produced it.
for (const key of ['mode', 'delay', 'sensitivity']) {
  assert.match(settingsPage, new RegExp(`data-setting="${key}"|select\\('${key}'`),
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
