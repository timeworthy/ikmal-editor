#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps', 'desktop-editor');
const packages = ['writing-core', 'writing-adapters', 'writing-ui'];
execFileSync(process.execPath, [path.join(root, 'tools', 'verify_desktop_rewrite.mjs')], { stdio: 'inherit' });
for (const packageName of packages) execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--prefix', path.join(root, 'packages', packageName)], { stdio: 'inherit' });

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
console.log(`Desktop rewrite slice staged in ${app}`);
