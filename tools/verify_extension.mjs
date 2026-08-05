// Structural checks for the browser extension.
//
// The load-bearing assertion here is the network one: the extension must never
// gain permission to reach a host that is not loopback. That is the promise the
// README makes and the reason the extension needs no privacy policy, so it is
// checked mechanically rather than trusted to review.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));

const requiredFiles = [
  'manifest.json',
  'background.js',
  'core/check_contract.js',
  'config.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'popup.css',
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
if (missing.length) throw new Error(`Missing extension files: ${missing.join(', ')}`);

if (manifest.manifest_version !== 3) {
  throw new Error(`Extension must be Manifest V3, found V${manifest.manifest_version}.`);
}

// Every host the extension may reach, from any manifest field that can grant
// network access.
const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?\*?$/;
const declaredHosts = [
  ...(manifest.host_permissions || []),
  ...(manifest.permissions || []).filter((entry) => entry.includes('://')),
];

if (!declaredHosts.length) throw new Error('Extension declares no host permissions; the popup could never reach the server.');

const remote = declaredHosts.filter((host) => !LOOPBACK.test(host));
if (remote.length) {
  throw new Error(
    `Extension declares non-loopback host permissions: ${remote.join(', ')}. ` +
    'The extension is documented as unable to reach any remote host; ' +
    'widen this only with a matching change to extension/README.md.',
  );
}

// A content script running everywhere is intended, but it must not also carry
// broad permissions that would let a compromised page reach further.
const risky = ['<all_urls>', 'tabs', 'webRequest', 'cookies', 'history', 'downloads'];
const grantedRisky = (manifest.permissions || []).filter((entry) => risky.includes(entry));
if (grantedRisky.length) {
  throw new Error(`Extension requests broader permissions than it needs: ${grantedRisky.join(', ')}.`);
}

// The funding rules in support.js are only credible if nothing in the source
// can gate a feature. Catch an entitlement check before it ships.
// Comments are stripped first: the files deliberately discuss the absence of
// gating, and prose describing what is not there must not read as the thing.
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const sources = requiredFiles
  .filter((file) => file.endsWith('.js'))
  .map((file) => stripComments(fs.readFileSync(path.join(extension, file), 'utf8')))
  .join('\n');
const gatingTerms = [/isPremium/i, /licenseKey/i, /entitlement/i, /subscriptionActive/i, /trialExpired/i, /checksRemaining/i];
const found = gatingTerms.filter((pattern) => pattern.test(sources));
if (found.length) {
  throw new Error(
    `Extension source contains what looks like a payment gate (${found.map(String).join(', ')}). ` +
    'extension/README.md promises no feature is ever gated on payment.',
  );
}

const referencedIcons = Object.values(manifest.icons || {});
const missingIcons = referencedIcons.filter((icon) => !fs.existsSync(path.join(extension, icon)));
if (missingIcons.length) throw new Error(`Manifest references missing icons: ${missingIcons.join(', ')}`);

console.log(`Extension verified: ${manifest.name} v${manifest.version} (Manifest V${manifest.manifest_version}).`);
console.log(`  Files: ${requiredFiles.length}`);
console.log(`  Network reach: ${declaredHosts.join(', ')} (loopback only)`);
console.log(`  Payment gates: none found`);
