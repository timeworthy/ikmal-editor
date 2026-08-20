#!/usr/bin/env node
// Packages the shared browser adapter as a Firefox .xpi. The source runtime is
// shared with Chromium; only the browser manifest differs because Firefox MV3
// uses a module event page instead of a service worker.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'extension');
const outputDir = path.join(root, 'bin', 'extension');
const manifestPath = path.join(extension, 'firefox-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-firefox-extension-'));

try {
  execFileSync(process.execPath, [path.join(root, 'tools', 'package_extension.mjs')], { stdio: 'inherit' });
  fs.cpSync(extension, staging, { recursive: true });
  fs.copyFileSync(manifestPath, path.join(staging, 'manifest.json'));
  fs.rmSync(path.join(staging, 'firefox-manifest.json'), { force: true });
  execFileSync(process.execPath, [path.join(root, 'tools', 'verify_firefox_extension.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, IKMAL_FIREFOX_EXTENSION_DIR: staging },
  });

  fs.mkdirSync(outputDir, { recursive: true });
  const archive = path.join(outputDir, `ikmal-editor-firefox-v${manifest.version}.xpi`);
  fs.rmSync(archive, { force: true });
  execFileSync('zip', [
    '-r', '-q', archive, '.',
    '-x', '*.DS_Store', '-x', '__MACOSX/*', '-x', '*.map', '-x', 'node_modules/*',
  ], { cwd: staging });
  const size = (fs.statSync(archive).size / 1024).toFixed(1);
  console.log(`\nFirefox extension package ready: ${archive} (${size} KB)`);
  console.log('Load the .xpi temporarily from about:debugging, or submit the signed artifact to AMO.');
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
