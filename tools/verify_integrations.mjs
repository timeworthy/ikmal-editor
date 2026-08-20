#!/usr/bin/env node
// Structural checks for the thin host adapters. Runtime behavior belongs to
// integration_adapter_smoke.mjs; this verifier catches missing packaging
// files, accidental remote permissions, and settings surfaces that drift apart.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const integrations = path.join(root, 'integrations');
const read = (file) => fs.readFileSync(path.join(integrations, file), 'utf8');
const required = [
  'common/languagetool.cjs',
  'obsidian/manifest.json', 'obsidian/main.js', 'obsidian/README.md',
  'joplin/index.js', 'joplin/package.json', 'joplin/README.md',
  'libreoffice/manifest.json', 'libreoffice/remote_checker.cjs', 'libreoffice/README.md',
  'thunderbird/manifest.json', 'thunderbird/background.js', 'thunderbird/compose.html',
  'thunderbird/compose.js', 'thunderbird/compose.css', 'thunderbird/compose_projection.js',
  'thunderbird/README.md',
];
const missing = required.filter((file) => !fs.existsSync(path.join(integrations, file)));
if (missing.length) throw new Error(`Missing integration files: ${missing.join(', ')}`);

const loopback = /127\.0\.0\.1|localhost|\[::1\]/;
const common = read('common/languagetool.cjs');
for (const requiredText of ['normalizeSettings', 'filterMatches', 'applyMatch', 'loopback', '/v2/check']) {
  if (!common.includes(requiredText)) throw new Error(`Shared adapter transport is missing ${requiredText}.`);
}
if (/https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\])/.test(common)) {
  throw new Error('Shared adapter transport contains a non-loopback URL.');
}

const obsidian = JSON.parse(read('obsidian/manifest.json'));
if (!obsidian.id || !obsidian.version || !obsidian.minAppVersion) throw new Error('Obsidian manifest is incomplete.');
const obsidianSource = read('obsidian/main.js');
for (const requiredText of ['check-document', 'check-selection', 'apply-first-suggestion', 'dictionary', 'ignoredRules']) {
  if (!obsidianSource.includes(requiredText)) throw new Error(`Obsidian adapter is missing ${requiredText}.`);
}

const joplinSource = read('joplin/index.js');
for (const requiredText of ['ikmal.checkNote', 'ikmal.checkSelection', 'panelHTML', 'request', 'dictionary', 'ignoredRules']) {
  if (!joplinSource.includes(requiredText)) throw new Error(`Joplin adapter is missing ${requiredText}.`);
}

const libreManifest = JSON.parse(read('libreoffice/manifest.json'));
if (!Array.isArray(libreManifest.hosts) || !libreManifest.hosts.includes('Writer') || !loopback.test(libreManifest.checker)) {
  throw new Error('LibreOffice profile must cover Writer and use a loopback checker.');
}
const libreSource = read('libreoffice/remote_checker.cjs');
for (const requiredText of ['validateNativeEndpoint', 'checkUnoText', 'applyUnoMatch', 'loopback-only']) {
  if (!libreSource.includes(requiredText)) throw new Error(`LibreOffice adapter is missing ${requiredText}.`);
}
for (const file of ['Dockerfile.libreoffice', 'docker-compose.libreoffice.yml', 'tools/libreoffice_uno_smoke.py', 'tools/libreoffice_docker_smoke.sh']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing LibreOffice container check file: ${file}`);
}

const thunderbird = JSON.parse(read('thunderbird/manifest.json'));
const permissions = thunderbird.permissions || [];
if (!permissions.includes('compose') || permissions.some((permission) => permission.includes('://') && !loopback.test(permission))) {
  throw new Error('Thunderbird permissions must include compose and remain loopback-only.');
}
const thunderbirdSource = read('thunderbird/background.js');
for (const requiredText of ['importScripts', 'check-compose', 'apply-compose', 'setComposeDetails']) {
  if (!thunderbirdSource.includes(requiredText)) throw new Error(`Thunderbird adapter is missing ${requiredText}.`);
}

console.log('Host integrations verified: Obsidian, Joplin, LibreOffice, and Thunderbird manifests, settings surfaces, loopback boundaries, and Apply entrypoints.');
