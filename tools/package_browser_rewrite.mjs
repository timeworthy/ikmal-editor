#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps', 'browser-extension');
const output = path.join(root, 'bin', 'browser-extension');
execFileSync(process.execPath, [path.join(root, 'tools', 'verify_browser_rewrite.mjs')], { stdio: 'inherit' });
const packages = ['writing-core', 'writing-adapters', 'writing-ui'];
for (const packageName of packages) {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--prefix', path.join(root, 'packages', packageName)], { stdio: 'inherit' });
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of ['manifest.json', 'background.js', 'bootstrap.js', 'content_module.js', 'README.md']) {
  fs.copyFileSync(path.join(app, file), path.join(output, file));
}
fs.copyFileSync(path.join(root, 'extension', 'core', 'check_contract.js'), path.join(output, 'check_contract.js'));
fs.copyFileSync(path.join(root, 'packages', 'writing-adapters', 'dist', 'extension_messages.js'), path.join(output, 'extension_messages.js'));
fs.copyFileSync(path.join(root, 'packages', 'writing-core', 'dist', 'index.js'), path.join(output, 'writing-core.js'));
for (const file of ['browser_field.js', 'browser_slice.js']) {
  fs.copyFileSync(path.join(root, 'packages', 'writing-adapters', 'dist', file), path.join(output, file));
}
for (const file of ['indicator.js', 'issue_popover.js']) {
  fs.copyFileSync(path.join(root, 'packages', 'writing-ui', 'dist', file), path.join(output, file));
}
fs.copyFileSync(path.join(root, 'packages', 'design-system', 'src', 'tokens.css'), path.join(output, 'tokens.css'));
fs.copyFileSync(path.join(root, 'packages', 'design-system', 'src', 'primitives.css'), path.join(output, 'primitives.css'));

execFileSync('zip', ['-r', '-q', path.join(output, 'ikmal-editor-browser-slice-v0.1.0.zip'), '.', '-x', '*.zip'], { cwd: output });
console.log(`Browser rewrite slice ready: ${output}`);
