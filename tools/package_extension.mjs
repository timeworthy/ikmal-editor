// Builds a distributable extension zip in bin/extension/.
//
// Verification runs first and is not optional: a build that skipped the
// loopback-only and no-payment-gate checks would be exactly the build worth
// checking.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'extension');
const outputDir = path.join(root, 'bin', 'extension');
const writingAdapters = path.join(root, 'packages', 'writing-adapters');

for (const packagePath of [path.join(root, 'packages', 'writing-core'), writingAdapters]) {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--prefix', packagePath], { stdio: 'inherit' });
}
const stagedModules = [
  [path.join(writingAdapters, 'dist', 'extension_messages.js'), path.join(extension, 'adapters', 'extension_messages.js')],
  // The service worker chunks checks around the caret and carries findings
  // across edits, using the same compiled modules the desktop app loads.
  [path.join(writingAdapters, 'dist', 'raw_matches.js'), path.join(extension, 'adapters', 'raw_matches.js')],
  [path.join(writingAdapters, 'dist', 'chunked_checks.js'), path.join(extension, 'adapters', 'chunked_checks.js')],
  [path.join(root, 'packages', 'writing-core', 'dist', 'index.js'), path.join(extension, 'core', 'writing_core.js')],
];
for (const [source, target] of stagedModules) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

execFileSync(process.execPath, [path.join(root, 'tools', 'verify_extension.mjs')], { stdio: 'inherit' });

const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
const archive = path.join(outputDir, `ikmal-editor-extension-v${manifest.version}.zip`);

fs.mkdirSync(outputDir, { recursive: true });
fs.rmSync(archive, { force: true });

// Exclude editor and OS cruft rather than enumerating includes, so a new
// source file is never silently dropped from a release.
execFileSync('zip', [
  '-r', '-q', archive, '.',
  '-x', '*.DS_Store', '-x', '__MACOSX/*', '-x', '*.map', '-x', 'node_modules/*',
], { cwd: extension });

const size = (fs.statSync(archive).size / 1024).toFixed(1);
console.log(`\nExtension package ready: ${archive} (${size} KB)`);
console.log('Load unpacked from extension/ for development, or upload this zip to a store listing.');
