// A check runs against more than one engine. When one of them does not answer,
// every host has to say so: a result missing its grammar engine is not a
// shorter list of findings, it is a check that never looked for most of them,
// and shown plainly it reads as a clean document.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { degradedCheckSources, degradedCheckMessage, normalizeCheckResponse } from '../extension/core/check_contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const OFFICE_HOSTS = ['word', 'excel', 'powerpoint', 'outlook', 'onenote', 'project'];

test('the shared contract names the engines that did not answer', () => {
  assert.deepEqual(degradedCheckSources({ matches: [] }), []);
  assert.deepEqual(degradedCheckSources({ ikmalLanguageToolWarning: 'HTTP 413' }), ['grammar']);
  assert.deepEqual(degradedCheckSources({ ikmalQualityWarning: 'refused' }), ['quality']);
  assert.deepEqual(
    degradedCheckSources({ ikmalLanguageToolWarning: 'down', ikmalQualityWarning: 'down' }),
    ['grammar', 'quality'],
  );
  assert.equal(degradedCheckMessage({ matches: [] }), '');
  assert.match(degradedCheckMessage({ ikmalQualityWarning: 'refused' }), /^Some checks did not run: quality\./);
  assert.equal(degradedCheckSources(null).length, 0);
});

test('normalizing a response derives the field hosts render', () => {
  assert.deepEqual(normalizeCheckResponse({ matches: [], ikmalLanguageToolWarning: 'HTTP 413' }).ikmalDegradedChecks, ['grammar']);
  // A complete check carries no such field, so nothing has to be cleared.
  assert.equal('ikmalDegradedChecks' in normalizeCheckResponse({ matches: [] }), false);
  // The proxy names them itself; normalizing must agree rather than compete.
  assert.deepEqual(
    normalizeCheckResponse({ matches: [], ikmalDegradedChecks: ['grammar'], ikmalLanguageToolWarning: 'HTTP 413' }).ikmalDegradedChecks,
    ['grammar'],
  );
});

test('every host contract module carries the same rule', () => {
  for (const module of ['office-bridge/check_contract.cjs', 'vscode-extension/check_contract.cjs']) {
    const contract = require(path.join(root, module));
    assert.deepEqual(contract.degradedCheckSources({ ikmalLanguageToolWarning: 'down' }), ['grammar'], module);
    assert.equal(contract.degradedCheckMessage({ ikmalQualityWarning: 'down' }), degradedCheckMessage({ ikmalQualityWarning: 'down' }), module);
    assert.deepEqual(contract.normalizeCheckResponse({ ikmalQualityWarning: 'down' }).ikmalDegradedChecks, ['quality'], module);
  }
});

test('every host reports a partial check in its own surface', () => {
  // Browser extension: the field indicator is the only always-visible surface.
  const content = read('extension/content.js');
  assert.match(content, /ikmalDegradedChecks/);
  assert.match(content, /checks did not run/);

  // VS Code: diagnostics cannot show what is absent, so the status bar says it,
  // and the interruption happens once per change rather than per keystroke.
  const vscode = read('vscode-extension/extension.js');
  assert.match(vscode, /degradedCheckMessage/);
  assert.match(vscode, /reportDegradedChecks\(response\)/);
  assert.match(vscode, /if \(message === degradedChecks\) return;/);
  assert.match(vscode, /\$\(warning\) ikmal/);
  // A document the extension declined to check must not look like a checked
  // one: it clears every diagnostic, so silence would read as "nothing wrong".
  assert.match(vscode, /setSkippedReason\(`ikmal is not checking this document/);
  assert.match(vscode, /\$\(circle-slash\) ikmal/);
  assert.match(vscode, /ikmal\.maxLength limit/);

  // Desktop editor: an error notice above the suggestion list.
  const desktop = read('desktop/editor-renderer.js');
  assert.match(desktop, /ikmalDegradedChecks/);
  assert.match(desktop, /Findings may be incomplete/);

  // Office task panes: appended to the finding count each pane already shows.
  for (const host of OFFICE_HOSTS) {
    const pane = read(`office-bridge/public/office/${host}/app.js`);
    assert.match(pane, /function degradedSuffix\(result\)/, host);
    assert.match(pane, /setState\(`\$\{[^`]*degradedSuffix\(result\)\}`\)/, host);
  }
});

test('the proxy names the missing engines rather than leaving hosts to parse an error', () => {
  const proxy = read('quality_proxy.go');
  assert.match(proxy, /func degradedCheckSources\(languageToolErr, qualityErr error\) \[\]string/);
  assert.match(proxy, /languageToolResponse\["ikmalDegradedChecks"\] = degraded/);
  assert.match(proxy, /languageToolResponse\["ikmalLanguageToolWarning"\]/);
});
