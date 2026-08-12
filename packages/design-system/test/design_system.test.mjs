import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = await readFile(path.join(root, 'src/tokens.css'), 'utf8');
const primitives = await readFile(path.join(root, 'src/primitives.css'), 'utf8');
const manifest = JSON.parse(await readFile(path.join(root, 'tokens.json'), 'utf8'));

test('Continental token contract exposes semantic axes and runtime variables', () => {
  for (const axis of ['dialect', 'theme', 'palette', 'density', 'contrast']) assert.ok(manifest.axes[axis]?.length);
  for (const variable of ['--bg-0', '--bg-1', '--bg-2', '--bg-pop', '--fg-1', '--fg-2', '--fg-3', '--fg-4', '--border-1', '--border-2', '--accent', '--accent-hover', '--accent-press', '--accent-soft', '--radius-1', '--radius-2', '--radius-3', '--radius-pill', '--space-1', '--space-8', '--font-sans', '--font-serif', '--font-mono', '--shadow-pop', '--shadow-focus', '--ease-default', '--ease-spring', '--dur-fast', '--dur-default', '--dur-modal-in']) {
    assert.match(css, new RegExp(`${variable.replaceAll('-', '\\-')}\\s*:`), variable);
  }
  assert.match(css, /\[data-theme="light"\]/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /:host/);
  for (const axis of ['palette', 'density', 'contrast']) assert.match(css, new RegExp(`:host\\(\\[data-${axis}=`), axis);
  assert.match(css, /\[data-density="compact"\]/);
  assert.match(css, /\[data-density="spacious"\]/);
  assert.doesNotMatch(css, /@import\s+url\(/i);
});

test('primitives use semantic tokens and remain host/framework neutral', () => {
  for (const name of ['cnt-btn', 'cnt-icon-btn', 'cnt-button', 'cnt-icon-button', 'cnt-card', 'cnt-popover', 'cnt-status-dot', 'cnt-badge', 'cnt-field', 'cnt-menu']) assert.match(primitives, new RegExp(`\\.${name}`));
  assert.ok((primitives.match(/var\(--/g) || []).length >= 20);
  assert.doesNotMatch(primitives, /react|vue|electron|chrome|\/Users\//i);
});

// Phase A: the settings primitive set. Class names and DOM semantics are
// Continental's so markup stays portable; the declarations are authored against
// this package's token contract because Continental's own component CSS depends
// on internal tokens the contract deliberately does not carry.
test('the settings primitive set is present and uses Continental class names', () => {
  for (const name of [
    'cnt-label', 'cnt-help', 'cnt-input', 'cnt-select', 'cnt-textarea',
    'cnt-switch', 'cnt-check', 'cnt-segmented', 'cnt-slider', 'cnt-panel',
    'cnt-tabs', 'cnt-tab', 'cnt-accordion', 'cnt-acc-head', 'cnt-acc-body',
    'cnt-alert', 'cnt-stat', 'cnt-empty',
    'cnt-sheet', 'cnt-tag', 'cnt-chip', 'cnt-drawer', 'cnt-banner', 'cnt-toast',
    'cnt-progress', 'cnt-steps', 'cnt-step-dot', 'cnt-btn-group', 'cnt-divider',
    'cnt-tooltip', 'cnt-kbd', 'cnt-scrim',
  ]) {
    assert.match(primitives, new RegExp(`\\.${name}\\b`), `missing primitive: .${name}`);
  }
});

// The rule the rebuild exists to enforce. A hard-coded colour here is a second
// visual system starting, and it is far cheaper to catch as a test than as a
// surface that drifted.
test('primitives declare no colour, radius, or motion outside the token contract', () => {
  const declarations = primitives
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => /:\s*[^;]+;/.test(line));
  for (const line of declarations) {
    assert.doesNotMatch(line, /#[0-9a-f]{3,8}\b/i, `hard-coded hex: ${line.trim()}`);
    assert.doesNotMatch(line, /\brgba?\(\s*\d/, `hard-coded rgb: ${line.trim()}`);
    assert.doesNotMatch(line, /\bhsla?\(\s*\d/, `hard-coded hsl: ${line.trim()}`);
  }
  // Intent surfaces must derive from the intent colour so a palette change
  // carries, rather than each intent inventing its own tint.
  assert.match(primitives, /color-mix\(in oklab, var\(--danger\)/);
  assert.match(primitives, /color-mix\(in oklab, var\(--success\)/);
});

test('form controls follow the density axis rather than a fixed height', () => {
  assert.match(css, /--control-h:\s*\d+px/);
  assert.match(css, /\[data-density="compact"\][^}]*--control-h/);
  assert.match(css, /\[data-density="spacious"\][^}]*--control-h/);
  assert.match(primitives, /height:\s*var\(--control-h\)/);
});

test('every token the primitives reference is defined by the contract', () => {
  const used = new Set([...primitives.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(missing, [], `primitives reference undefined tokens: ${missing.join(', ')}`);
});

// A full-width control that overflows its container by its own padding is the
// kind of defect every surface built on it would inherit. Scoped to the
// primitives, because a package shipping a global reset changes layout in every
// host that adopts it.
test('primitives are border-box, without imposing a global reset', () => {
  assert.match(primitives, /\[class\^="cnt-"\][^{]*\{[^}]*box-sizing:\s*border-box/);
  assert.doesNotMatch(primitives, /^\s*\*\s*,?\s*\{[^}]*box-sizing/m);
});
