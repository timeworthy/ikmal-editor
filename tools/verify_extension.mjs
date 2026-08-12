// Structural checks for the browser extension.
//
// The load-bearing assertion here is the network one: the extension must never
// gain permission to reach a host that is not loopback. That is the promise the
// README makes and the reason the extension needs no privacy policy, so it is
// checked mechanically rather than trusted to review.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runNpm } from './npm_command.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'extension');

// adapters/extension_messages.js is compiled output that only the packagers
// stage, so a fresh clone fails the required-file check below with nothing
// actually missing from the source tree. Build it here instead, which also
// means verification reads the contract this checkout would ship rather than
// whatever an earlier package run happened to leave behind.
const writingAdapters = path.join(root, 'packages', 'writing-adapters');
const writingCore = path.join(root, 'packages', 'writing-core');
for (const packagePath of [writingCore, writingAdapters]) {
  runNpm(['run', 'build', '--prefix', packagePath], { stdio: 'inherit' });
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
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));

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
if (missing.length) throw new Error(`Missing extension files: ${missing.join(', ')}`);

// The chunked-check harness is opt-in because Playwright is not a dependency
// here, which is exactly why its absence would otherwise go unnoticed. Chunking
// without retention silently empties a long draft of its findings, and this is
// the only end-to-end proof in the browser that it does not.
if (!fs.existsSync(path.join(root, 'tools', 'extension_chunked_check_smoke.mjs'))) {
  throw new Error('Missing the chunked-check smoke harness: tools/extension_chunked_check_smoke.mjs');
}

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

// The underline overlay must never take pointer events. The marks now span the
// whole word so it can be hovered and clicked anywhere, and a box that size
// taking clicks would sit between the user and the page: clicking a flagged
// word would stop placing the caret, and in a rich-text editor that makes the
// field feel broken. content.js hit-tests the recorded geometry instead, so
// this pairing is what keeps the host editor usable.
const contentCSS = fs.readFileSync(path.join(extension, 'content.css'), 'utf8');
const markBlock = contentCSS.match(/\.ikmal-mark\s*\{[^}]*\}/);
if (!markBlock) throw new Error('content.css no longer defines .ikmal-mark.');
if (!/pointer-events:\s*none/.test(markBlock[0])) {
  throw new Error(
    'content.css .ikmal-mark must set pointer-events: none. Underlines cover the ' +
    'whole word, so taking pointer events would stop clicks reaching the page ' +
    'and prevent the host editor placing its caret on a flagged word.',
  );
}

const contentSource = stripComments(fs.readFileSync(path.join(extension, 'content.js'), 'utf8'));
if (!/function markAt\s*\(/.test(contentSource)) {
  throw new Error('content.js must hit-test marks itself; .ikmal-mark takes no pointer events.');
}
if (!/function buildEditableTextMap\s*\(/.test(contentSource)
  || !/function displaySource\s*\(/.test(contentSource)) {
  throw new Error('content.js must map rich-text offsets from rendered text and keep card provenance inside ikmal.');
}
if (!/indicator\.addEventListener\(['"]click['"]/.test(contentSource)
  || !/function openFocusMenu\s*\(/.test(contentSource)
  || !/['"]paused['"].*['"]zen['"]/.test(contentSource)) {
  throw new Error('content.js must expose Checking, Pause, and Zen from the clicked indicator.');
}
if (!/mouseup/.test(contentSource) || !/eventIsInsideActiveField/.test(contentSource)
  || !/selection:\s*true/.test(contentSource) || !/function renderSelectionSummary\s*\(/.test(contentSource)) {
  throw new Error('content.js must summarize and check arbitrary highlighted text.');
}

const backgroundSource = stripComments(fs.readFileSync(path.join(extension, 'background.js'), 'utf8'));
if (!/selection\s*=\s*false/.test(backgroundSource) || !/!selection/.test(backgroundSource)) {
  throw new Error('background.js must allow short selection checks while retaining the typing minimum.');
}
if (!/parseExtensionMessage/.test(backgroundSource) || !/adapters\/extension_messages\.js/.test(backgroundSource)) {
  throw new Error('background.js must consume the compiled versioned extension message contract.');
}

const popupHTML = fs.readFileSync(path.join(extension, 'popup.html'), 'utf8');
const popupSource = fs.readFileSync(path.join(extension, 'popup.js'), 'utf8');
if (!/class="brand-icon"/.test(popupHTML) || !/id="language-select"/.test(popupHTML)
  || !/languageSelect\.addEventListener/.test(popupSource)) {
  throw new Error('popup must carry ikmal branding and an in-popup language selector.');
}
const configSource = fs.readFileSync(path.join(extension, 'config.js'), 'utf8');
if (!/language:\s*'en-US'/.test(configSource)) {
  throw new Error('extension default language must be explicit English (US).');
}

const referencedIcons = Object.values(manifest.icons || {});
const missingIcons = referencedIcons.filter((icon) => !fs.existsSync(path.join(extension, icon)));
if (missingIcons.length) throw new Error(`Manifest references missing icons: ${missingIcons.join(', ')}`);

console.log(`Extension verified: ${manifest.name} v${manifest.version} (Manifest V${manifest.manifest_version}).`);
console.log(`  Files: ${requiredFiles.length}`);
console.log(`  Network reach: ${declaredHosts.join(', ')} (loopback only)`);
console.log(`  Payment gates: none found`);
