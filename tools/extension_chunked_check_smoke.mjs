#!/usr/bin/env node
// End-to-end proof that the shipping extension checks a long draft around the
// caret and keeps the findings that check never looked at.
//
// The desktop has this proof in desktop/electron_smoke.mjs, and it fails when
// retention is removed. This is the browser half of it, and it is deliberately
// the same shape: drive the service worker's own check path, then assert on
// what actually reached the checker rather than on what the page decided to
// draw. Chunking without retention deletes every finding outside the window,
// which reads as a document that just became clean — the failure this exists
// to catch.
//
// Note this loads the packaged ikmal editor extension (bin/extension), not the
// browser rewrite slice that tools/browser_extension_injection_smoke.mjs
// drives. They are different artifacts and only this one chunks.
//
// Opt-in, like the other browser harnesses: Playwright is not a dependency of
// this repository.
//   IKMAL_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//     node tools/extension_chunked_check_smoke.mjs

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extensionLaunchOptions, loadChromium, loadUnpackedExtension, resolveChromium } from './chromium_launch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromium = await loadChromium();
const { executablePath: browserPath, source: browserSource } = resolveChromium(chromium);

// The zip is what a user installs, so that is what gets loaded here rather
// than the source directory the packager stages into.
execFileSync(process.execPath, [path.join(root, 'tools', 'package_extension.mjs')], { stdio: 'inherit' });
const manifestVersion = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8')).version;
const archive = path.join(root, 'bin', 'extension', `ikmal-editor-extension-v${manifestVersion}.zip`);
const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-extension-chunked-package-'));
execFileSync('unzip', ['-q', archive, '-d', packageDir]);

// Every text the extension asked the checker to look at, in order. This is the
// evidence: a chunked check must show up here as a slice, not a whole draft.
const checkTexts = [];
const checkerServer = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"status":"ok"}');
    return;
  }
  if (request.method !== 'POST' || request.url !== '/v2/check') { response.writeHead(404); response.end(); return; }
  let body = '';
  for await (const chunk of request) body += chunk;
  const text = new URLSearchParams(body).get('text') || '';
  checkTexts.push(text);
  // One finding, in the opening paragraph only. A check that never sees the
  // opening paragraph therefore returns nothing, and any finding in the merged
  // result had to have been carried.
  const offset = text.indexOf('results is');
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({
    matches: offset < 0 ? [] : [{
      offset,
      length: 'results is'.length,
      message: 'A plural subject takes a plural verb.',
      replacements: [{ value: 'results are' }],
      rule: { id: 'PLURAL_AGREEMENT', category: { id: 'GRAMMAR' } },
      ikmalSource: 'quality-sidecar',
    }],
  }));
});
await new Promise((resolve, reject) => { checkerServer.once('error', reject); checkerServer.listen(0, '127.0.0.1', resolve); });
const checkerPort = checkerServer.address().port;

// Long enough that a 4000-character window at the end cannot reach the top.
const filler = Array.from({ length: 60 }, (_, index) =>
  `Middle paragraph ${index} carries enough words that a chunk window centred here cannot reach the ends of the draft.`);
const longDraft = ['Opening paragraph where the results is wrong.', ...filler, 'Closing paragraph of the draft.'].join('\n\n');
const editedDraft = `${longDraft} A closing sentence.`;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-extension-chunked-smoke-'));
let context;

async function waitForServiceWorker(browserContext) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const worker = browserContext.serviceWorkers().find((candidate) => candidate.url().startsWith('chrome-extension://'));
    if (worker) return worker;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for the service worker. Known workers: ${browserContext.serviceWorkers().map((candidate) => candidate.url()).join(', ')}`);
}

try {
  const extensionOptions = extensionLaunchOptions(browserPath, packageDir);
  context = await chromium.launchPersistentContext(userData, {
    executablePath: browserPath,
    headless: false,
    viewport: { width: 1200, height: 800 },
    ...extensionOptions,
    args: [...extensionOptions.args, '--no-first-run', '--no-default-browser-check'],
  });
  await loadUnpackedExtension(context, browserPath, packageDir);
  const serviceWorker = await waitForServiceWorker(context);
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  if (manifest.name !== 'ikmal editor') throw new Error(`Unexpected service worker: ${manifest.name}`);
  const extensionID = new URL(serviceWorker.url()).host;

  // The options page is an extension context, so chrome.runtime.sendMessage
  // reaches the worker's own check handler. That is the browser's equivalent of
  // the desktop asserting through the IPC: no debounce, no idle whole-document
  // pass, nothing that could re-derive a dropped finding and hide a regression
  // behind its own timing.
  const page = context.pages()[0] || await context.newPage();
  await page.goto(`chrome-extension://${extensionID}/options.html`, { waitUntil: 'domcontentloaded' });
  const send = (message) => page.evaluate((payload) => chrome.runtime.sendMessage(payload), message);

  const configured = await send({ type: 'updateSettings', patch: { endpoint: `http://127.0.0.1:${checkerPort}` } });
  if (!configured?.ok) throw new Error(`Could not point the extension at the fixture checker: ${JSON.stringify(configured)}`);

  // A first check with no caret is a whole-document check, and it is what gives
  // the next one something to carry.
  const whole = await send({ type: 'check', text: longDraft, language: 'en-US', fieldID: 'chunk-smoke' });
  if (!whole?.ok) throw new Error(`Whole-document check failed: ${JSON.stringify(whole)}`);
  if (checkTexts.length !== 1 || checkTexts[0] !== longDraft) {
    throw new Error(`Expected one whole-document request, got ${JSON.stringify(checkTexts.map((text) => text.length))}.`);
  }
  if (!(whole.data.matches || []).some((match) => match.message.includes('plural subject'))) {
    throw new Error(`The whole-document check did not find the opening issue: ${JSON.stringify(whole.data.matches)}`);
  }
  if (whole.data.ikmalFullCheckPending) throw new Error('A whole-document check must not report a pass still owed.');

  // The edit-and-recheck the whole thing exists for: a caret at the end must
  // send a slice that never saw the opening paragraph, and the finding there
  // must survive anyway.
  const before = checkTexts.length;
  const chunked = await send({ type: 'check', text: editedDraft, language: 'en-US', caret: editedDraft.length, fieldID: 'chunk-smoke' });
  if (!chunked?.ok) throw new Error(`Chunked check failed: ${JSON.stringify(chunked)}`);
  const sent = checkTexts.slice(before);
  if (!sent.length || sent.some((text) => text.length >= editedDraft.length || text.includes('results is'))) {
    throw new Error(`Expected a chunk that never saw the opening paragraph, got ${JSON.stringify(sent.map((text) => text.length))} of ${editedDraft.length}.`);
  }
  const retained = (chunked.data.matches || []).map((match) => match.message);
  if (!retained.some((message) => message.includes('plural subject'))) {
    throw new Error(`A finding outside the rechecked chunk was dropped: ${JSON.stringify(retained)}`);
  }
  if (!chunked.data.ikmalFullCheckPending) {
    throw new Error('A chunked check must report that a whole-document pass is still owed.');
  }
  // Carried offsets have to describe the current text, not the text they were
  // found in. Here the edit is an append, so the opening finding does not move
  // — but a merge that returned chunk-relative offsets would fail this.
  const carriedMatch = (chunked.data.matches || []).find((match) => match.message.includes('plural subject'));
  if (editedDraft.slice(carriedMatch.offset, carriedMatch.offset + carriedMatch.length) !== 'results is') {
    throw new Error(`A carried finding points at the wrong text: ${JSON.stringify(editedDraft.slice(carriedMatch.offset, carriedMatch.offset + carriedMatch.length))}`);
  }

  // A field the worker has no findings for cannot chunk: there would be nothing
  // to merge the slice into, and the rest of the draft would come back clean.
  const unknownField = checkTexts.length;
  const fresh = await send({ type: 'check', text: editedDraft, language: 'en-US', caret: editedDraft.length, fieldID: 'a-different-field' });
  if (!fresh?.ok) throw new Error(`Unknown-field check failed: ${JSON.stringify(fresh)}`);
  if (checkTexts.slice(unknownField).some((text) => text !== editedDraft)) {
    throw new Error('A field with no previous findings must be checked whole.');
  }

  // The whole-document pass the chunked check said was owed.
  const documentScope = checkTexts.length;
  const full = await send({ type: 'check', text: editedDraft, language: 'en-US', caret: editedDraft.length, fieldID: 'chunk-smoke', scope: 'document' });
  if (!full?.ok) throw new Error(`Document-scope check failed: ${JSON.stringify(full)}`);
  if (checkTexts.slice(documentScope).some((text) => text !== editedDraft)) {
    throw new Error('A document-scope check must send the whole field even with a caret.');
  }
  if (full.data.ikmalFullCheckPending) throw new Error('A whole-document pass must clear the pending flag.');

  // A selection is a slice the user already chose, so it is sent as it is.
  const selectionStart = checkTexts.length;
  const selection = await send({ type: 'check', text: longDraft, language: 'en-US', caret: 10, fieldID: 'chunk-smoke', selection: true });
  if (!selection?.ok) throw new Error(`Selection check failed: ${JSON.stringify(selection)}`);
  if (checkTexts.slice(selectionStart).some((text) => text !== longDraft)) {
    throw new Error('A selection check must never be chunked further.');
  }

  console.log(`Extension chunked-check smoke passed: whole-document baseline, a caret chunk that never saw the opening paragraph, retained and correctly offset findings, per-field state, document scope, and unchunked selections (${JSON.stringify({
    browser: browserSource,
    draft: editedDraft.length,
    requests: checkTexts.map((text) => text.length),
  })}).`);
} finally {
  await context?.close();
  await new Promise((resolve) => checkerServer.close(resolve));
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(packageDir, { recursive: true, force: true });
}
