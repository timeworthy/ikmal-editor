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
assert.doesNotMatch(preload, /getServiceState|openCompact|configureIntegrations|setFocusMode/);
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
