#!/usr/bin/env node
// Gate 1 asset boundary: approved editor exports are portable, self-contained,
// and still traceable to the locked generator without copying developer paths.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logoSource = path.join(repo, 'docs/design/logo/edmark.js');
const assetRoot = path.join(repo, 'docs/design/editor/repo-assets');
const approved = [
  'ikmal_languagetool_banner.svg',
  'ikmal_languagetool_icon.svg',
  'ikmal_languagetool_mark.svg',
  'ikmal_languagetool_mark_light.svg',
  'ikmal_languagetool_mark_small.svg',
  'ikmal_languagetool_mark_small_light.svg',
  'ikmal_languagetool_menubar_template.svg',
  'ikmal_languagetool_og.svg',
];

const source = await readFile(logoSource, 'utf8');
assert.match(source, /switchPx:\s*48/, 'editor mark must retain the locked 48px tier switch');
for (const exportName of ['tierFor', 'markSVG', 'templateIconSVG']) {
  assert.match(source, new RegExp(`(?:function|const)\\s+${exportName}`), `missing ${exportName} export`);
}

for (const name of approved) {
  const svg = await readFile(path.join(assetRoot, name), 'utf8');
  assert.match(svg, /^<svg\b/, `${name}: expected SVG root`);
  assert.match(svg, /\bviewBox="[^"]+"/, `${name}: missing viewBox`);
  assert.doesNotMatch(svg, /(?:href|src|xlink:href)="https?:\/\//i, `${name}: external resource reference`);
  assert.doesNotMatch(svg, /\/Users\/|[A-Za-z]:\\\\Users\\/i, `${name}: developer-local path`);
  const targetSize = name.includes('_small') ? 64
    : name === 'ikmal_languagetool_menubar_template.svg' ? 44
      : name.includes('_mark') || name === 'ikmal_languagetool_icon.svg' ? (name.includes('_icon') ? 1024 : 512) : null;
  if (targetSize) assert.match(svg, new RegExp(`width="${targetSize}"\\s+height="${targetSize}"`), `${name}: unexpected target size`);
  if (name.includes('_small')) assert.match(svg, /<rect\b/, `${name}: small tier must use the compact bar tier`);
  if (name === 'ikmal_languagetool_mark.svg') {
    assert.match(svg, /<path\b/, `${name}: full tier must contain the outlined wordmark`);
    assert.match(svg, /#D7D7DD/i, `${name}: dark full tier foreground drifted`);
    assert.match(svg, /#6FA37C/i, `${name}: dark full tier accent drifted`);
  }
  if (name === 'ikmal_languagetool_mark_light.svg') {
    assert.match(svg, /<path\b/, `${name}: light full tier must contain the outlined wordmark`);
    assert.match(svg, /#3A372F/i, `${name}: light full tier foreground drifted`);
    assert.match(svg, /#4E8260/i, `${name}: light full tier accent drifted`);
  }
  if (name === 'ikmal_languagetool_mark_small.svg') {
    assert.match(svg, /#D7D7DD/i, `${name}: dark minimum tier foreground drifted`);
    assert.match(svg, /#6FA37C/i, `${name}: dark minimum tier accent drifted`);
  }
  if (name === 'ikmal_languagetool_mark_small_light.svg') {
    assert.match(svg, /#3A372F/i, `${name}: light minimum tier foreground drifted`);
    assert.match(svg, /#4E8260/i, `${name}: light minimum tier accent drifted`);
  }
  if (name === 'ikmal_languagetool_menubar_template.svg') {
    assert.match(svg, /#000000/i, `${name}: menu-bar template must be solid black`);
    assert.doesNotMatch(svg, /opacity="0\./, `${name}: menu-bar template cannot use translucent ink`);
  }
}

// Walked here rather than shelled out to ripgrep. A machine without rg used to
// throw ENOENT out of this check, and the tempting fix — swallowing the error
// alongside rg's "no matches" exit code — would leave the check reporting a
// pass while scanning nothing. Files are read as latin1 so a binary asset with
// a path baked into its metadata is searched too, not skipped.
const DEVELOPER_PATH = '/Users/iansherr/Projects/ikmal';
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'bin']);

function filesLeakingDeveloperPath(directory) {
  const leaking = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      leaking.push(...filesLeakingDeveloperPath(entryPath));
    } else if (entry.isFile() && fs.readFileSync(entryPath, 'latin1').includes(DEVELOPER_PATH)) {
      leaking.push(path.relative(repo, entryPath));
    }
  }
  return leaking;
}

const runtimeRoots = ['desktop', 'extension', 'vscode-extension', 'packages'];
for (const runtimeRoot of runtimeRoots) {
  const leaking = filesLeakingDeveloperPath(path.join(repo, runtimeRoot));
  assert.deepEqual(leaking, [], `${runtimeRoot}: packaged/runtime files leak a developer-local path: ${leaking.join(', ')}`);
}

console.log(`Editor asset boundary passed: ${approved.length} approved SVG exports and ${runtimeRoots.length} runtime roots checked.`);
