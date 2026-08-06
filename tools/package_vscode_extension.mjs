// Builds a distributable VS Code extension archive in bin/vscode-extension/.
// The package is dependency-free; the VS Code host supplies its API.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'vscode-extension');
const outputDir = path.join(root, 'bin', 'vscode-extension');
const verify = path.join(root, 'tools', 'verify_vscode_extension.mjs');

execFileSync(process.execPath, [verify], { stdio: 'inherit' });
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'package.json'), 'utf8'));
const archive = path.join(outputDir, `ikmal-editor-vscode-v${manifest.version}.zip`);

fs.mkdirSync(outputDir, { recursive: true });
fs.rmSync(archive, { force: true });
execFileSync('zip', [
  '-r', '-q', archive, '.',
  '-x', '*.DS_Store', '-x', '__MACOSX/*', '-x', 'node_modules/*',
], { cwd: extension });

const size = (fs.statSync(archive).size / 1024).toFixed(1);
console.log(`\nVS Code adapter package ready: ${archive} (${size} KB)`);
