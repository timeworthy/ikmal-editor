import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function filesUnder(relativePath) {
  const start = path.join(root, relativePath);
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'bin') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(css|html|js|json|mjs|ts|tsx)$/.test(entry.name)) result.push(absolute);
    }
  };
  visit(start);
  return result;
}

const freshRuntimeRoots = [
  'apps/browser-extension',
  'apps/desktop-editor',
  'packages/design-system/src',
  'packages/writing-core/src',
  'packages/writing-adapters/src',
  'packages/writing-ui/src',
];
const freshRuntimeFiles = freshRuntimeRoots.flatMap(filesUnder);
const freshRuntime = freshRuntimeFiles.map((file) => read(path.relative(root, file))).join('\n');

assert.ok(freshRuntimeFiles.length > 20, 'fresh rewrite runtime inventory is unexpectedly small');
assert.doesNotMatch(freshRuntime, /\/Users\/iansherr\/Projects\/ikmal(?:-editor)?/, 'fresh runtime contains a developer-local path');
assert.doesNotMatch(freshRuntime, /(?:from|require\s*\()\s*['"](?:electron|chrome|node:(?:fs|net|http|https|child_process)|fs|https?):/, 'portable/fresh runtime imports a host-only module directly');

const coreSource = read('packages/writing-core/src/index.ts');
const compiledCore = filesUnder('apps').filter((file) => path.basename(file) === 'writing-core.js');
// One source of truth, not one file. Each app stages its own copy of the
// compiled core so it ships a self-contained tree, and that is fine — what must
// never happen is two copies that differ, which would mean an app had drifted
// onto its own build of the core. Byte-identity is the property; counting files
// only enforced it while there happened to be one app.
assert.ok(compiledCore.length >= 1, 'no compiled core is staged into any app');
const stagedCores = compiledCore.map((file) => fs.readFileSync(file, 'utf8'));
for (const [index, staged] of stagedCores.entries()) {
  assert.equal(staged, stagedCores[0],
    `${path.relative(root, compiledCore[index])} differs from ${path.relative(root, compiledCore[0])}: an app is running its own build of the core`);
}
for (const exportedFunction of ['normalizeIssue', 'normalizeCheckResult', 'applyCorrection', 'resolveIndicatorState']) {
  assert.match(coreSource, new RegExp(`export function ${exportedFunction}\\b`), `missing canonical core export: ${exportedFunction}`);
}

const browserSurface = ['manifest.json', 'bootstrap.js', 'content_module.js', 'README.md']
  .map((file) => read(path.join('apps/browser-extension', file)))
  .join('\n');
const desktopSurface = ['index.html', 'renderer.js', 'README.md']
  .map((file) => read(path.join('apps/desktop-editor', file)))
  .join('\n');
assert.doesNotMatch(`${browserSurface}\n${desktopSurface}`, /language\s*tool/i, 'fresh product-facing surface contains legacy engine branding');
assert.match(read('apps/desktop-editor/index.html'), /<title>ikmal editor/i);
assert.match(read('apps/browser-extension/manifest.json'), /"name"\s*:\s*"ikmal editor(?:\s|"|$)/i);

const indicator = read('apps/desktop-editor/indicator.js');
const issuePopover = read('apps/desktop-editor/issue_popover.js');
const desktopHTML = read('apps/desktop-editor/index.html');
const browserController = read('apps/browser-extension/content_module.js');
assert.match(indicator, /<button[^>]+aria-label=/);
assert.match(indicator, /aria-hidden="true"/);
assert.match(indicator, /prefers-reduced-motion/);
assert.match(issuePopover, /role="dialog"\s+aria-label="Writing issue"/);
assert.match(issuePopover, /data-action="ignore"/);
assert.match(issuePopover, /<details><summary>Why\?<\/summary>/);
assert.match(desktopHTML, /<label for="editor-input">Draft<\/label>/);
assert.match(desktopHTML, /Content-Security-Policy/);
assert.match(desktopHTML, /connect-src 'none'/);
assert.match(desktopHTML, /aria-live="polite"/);
assert.match(browserController, /attachShadow\(\{ mode: 'open' \}\)/);
assert.match(browserController, /event\.key !== 'Escape'/);
assert.match(read('apps/browser-extension/manifest.json'), /content_security_policy/);

console.log(`Final rewrite boundaries verified: ${freshRuntimeFiles.length} fresh runtime files, identical staged core copies, product identity, host isolation, and accessibility hooks.`);
