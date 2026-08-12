#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runNpm } from './npm_command.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps', 'desktop-editor');
const compact = path.join(root, 'apps', 'desktop-compact');
const packages = ['writing-core', 'writing-adapters', 'writing-ui'];
execFileSync(process.execPath, [path.join(root, 'tools', 'verify_desktop_rewrite.mjs')], { stdio: 'inherit' });
for (const packageName of packages) runNpm(['run', 'build', '--prefix', path.join(root, 'packages', packageName)], { stdio: 'inherit' });

const copies = [
  ['packages/writing-core/dist/index.js', 'writing-core.js'],
  ['packages/writing-adapters/dist/browser_field.js', 'browser_field.js'],
  ['packages/writing-adapters/dist/browser_slice.js', 'browser_slice.js'],
  ['packages/writing-adapters/dist/desktop_slice.js', 'desktop_slice.js'],
  ['packages/writing-ui/dist/indicator.js', 'indicator.js'],
  ['packages/writing-ui/dist/issue_popover.js', 'issue_popover.js'],
  ['packages/design-system/src/tokens.css', 'tokens.css'],
  ['packages/design-system/src/primitives.css', 'primitives.css'],
];
for (const [source, target] of copies) fs.copyFileSync(path.join(root, source), path.join(app, target));

// The launcher shares the core, the slice controller, and the composites it
// renders. Staged rather than imported across app boundaries so each app ships
// a self-contained tree.
const compactCopies = [
  ['packages/writing-core/dist/index.js', 'writing-core.js'],
  ['packages/writing-adapters/dist/desktop_slice.js', 'desktop_slice.js'],
  // desktop_slice imports both of these; staging it alone leaves the launcher
  // with a module chain that breaks only at runtime.
  ['packages/writing-adapters/dist/browser_field.js', 'browser_field.js'],
  ['packages/writing-adapters/dist/browser_slice.js', 'browser_slice.js'],
  ['packages/writing-ui/dist/indicator.js', 'indicator.js'],
  ['packages/writing-ui/dist/issue_popover.js', 'issue_popover.js'],
  ['packages/writing-ui/dist/mode_picker.js', 'mode_picker.js'],
  ['packages/writing-ui/dist/settings.js', 'settings.js'],
  ['packages/design-system/src/tokens.css', 'tokens.css'],
  ['packages/design-system/src/primitives.css', 'primitives.css'],
];
for (const [source, target] of compactCopies) fs.copyFileSync(path.join(root, source), path.join(compact, target));
console.log(`Desktop compact launcher staged in ${compact}`);
console.log(`Desktop rewrite slice staged in ${app}`);
