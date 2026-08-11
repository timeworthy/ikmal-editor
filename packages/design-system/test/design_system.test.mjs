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
