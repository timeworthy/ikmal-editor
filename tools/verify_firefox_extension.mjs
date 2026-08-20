#!/usr/bin/env node
// Structural checks for the Firefox WebExtension artifact. Firefox shares the
// browser adapter with Chromium, but its MV3 background entrypoint is an event
// page rather than a service worker, and AMO requires a stable Gecko ID.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = process.env.IKMAL_FIREFOX_EXTENSION_DIR
  ? path.resolve(process.env.IKMAL_FIREFOX_EXTENSION_DIR)
  : path.join(root, 'extension');
const manifestPath = process.env.IKMAL_FIREFOX_EXTENSION_DIR
  ? path.join(extension, 'manifest.json')
  : path.join(extension, 'firefox-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const requiredFiles = [
  'manifest.json',
  'background.js',
  'adapters/extension_messages.js',
  'adapters/raw_matches.js',
  'adapters/chunked_checks.js',
  'core/writing_core.js',
  'core/check_contract.js',
  'core/text_stats.js',
  'core/editable_replacement.js',
  'config.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'workspace.html',
  'workspace.js',
  'workspace.css',
  'options.html',
  'options.js',
  'options.css',
  'support.js',
  'README.md',
  'LICENSE',
  'icons/icon48.png',
  'icons/icon128.png',
];
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(extension, file)));
if (missing.length) throw new Error(`Missing Firefox extension files: ${missing.join(', ')}`);

if (manifest.manifest_version !== 3) throw new Error('Firefox artifact must use Manifest V3.');
if (manifest.background?.service_worker) throw new Error('Firefox artifact must not rely on a service worker.');
if (!manifest.background?.scripts?.includes('background.js')) {
  throw new Error('Firefox artifact must declare background.js as an event-page script.');
}
if (manifest.background.type !== 'module') throw new Error('Firefox background.js must remain an ES module.');

const gecko = manifest.browser_specific_settings?.gecko;
if (!gecko || !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/.test(gecko.id || '')) {
  throw new Error('Firefox artifact must declare a stable email-shaped Gecko extension ID.');
}
if (gecko.data_collection_permissions?.required?.join(',') !== 'none') {
  throw new Error('Firefox artifact must declare that it requires no off-device data collection.');
}
if (Number.parseFloat(gecko.strict_min_version || '0') < 142) {
  throw new Error('Firefox artifact must target the current AMO data-collection manifest requirements from Firefox 142.');
}

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?\*?$/;
const declaredHosts = [
  ...(manifest.host_permissions || []),
  ...(manifest.permissions || []).filter((entry) => entry.includes('://')),
];
if (!declaredHosts.length || declaredHosts.some((host) => !LOOPBACK.test(host))) {
  throw new Error(`Firefox artifact has non-loopback host permissions: ${declaredHosts.join(', ')}`);
}
const risky = ['<all_urls>', 'tabs', 'webRequest', 'cookies', 'history', 'downloads'];
const grantedRisky = (manifest.permissions || []).filter((entry) => risky.includes(entry));
if (grantedRisky.length) throw new Error(`Firefox artifact requests unnecessary broad permissions: ${grantedRisky.join(', ')}`);

const contentCSS = fs.readFileSync(path.join(extension, 'content.css'), 'utf8');
const markBlock = contentCSS.match(/\.ikmal-mark\s*\{[^}]*\}/);
if (!markBlock || !/pointer-events:\s*none/.test(markBlock[0])) {
  throw new Error('Firefox artifact must preserve the non-intercepting underline boundary.');
}
console.log(`Firefox extension verified: ${manifest.name} v${manifest.version} (Gecko ${gecko.id}, minimum Firefox ${gecko.strict_min_version}).`);
console.log(`  Network reach: ${declaredHosts.join(', ')} (loopback only)`);
