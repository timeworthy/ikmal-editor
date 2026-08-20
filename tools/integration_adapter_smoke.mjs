#!/usr/bin/env node
// Deterministic host-contract smoke for adapters whose real applications are
// optional desktop products. Each host API is mocked only at its boundary;
// the shared transport, settings, filtering, projection, and Apply paths are
// exercised as shipped code.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const common = require(path.join(root, 'integrations/common/languagetool.cjs'));
const libre = require(path.join(root, 'integrations/libreoffice/remote_checker.cjs'));
const joplin = require(path.join(root, 'integrations/joplin/index.js'));
const projection = require(path.join(root, 'integrations/thunderbird/compose_projection.js'));

const checkerResponse = (text) => {
  const matches = [];
  const typo = text.indexOf('teh');
  if (typo >= 0) matches.push({ offset: typo, length: 3, message: 'Use the correct spelling.', replacements: [{ value: 'the' }], rule: { id: 'SPELL', issueType: 'misspelling', category: { id: 'TYPOS' } } });
  const grammar = text.indexOf('results is');
  if (grammar >= 0) matches.push({ offset: grammar, length: 10, message: 'Use a plural verb.', replacements: [{ value: 'results are' }], rule: { id: 'AGREEMENT', category: { id: 'GRAMMAR' } } });
  const style = text.indexOf('very unique');
  if (style >= 0) matches.push({ offset: style, length: 11, message: 'Prefer a precise description.', replacements: [{ value: 'unique' }], rule: { id: 'STYLE_WORDINESS', category: { id: 'STYLE' } } });
  return { matches };
};

function fetchFixture(_url, options) {
  const text = new URLSearchParams(options.body).get('text') || '';
  return Promise.resolve({ ok: true, status: 200, json: async () => checkerResponse(text) });
}

async function testCommonSettings() {
  assert.equal(common.normalizeSettings({ endpoint: 'http://127.0.0.1:8096/v2/check', checkDelayMs: 10 }).endpoint, 'http://127.0.0.1:8096');
  assert.throws(() => common.normalizeSettings({ endpoint: 'https://example.com' }), /loopback/);
  const result = await common.checkText('Please review teh results is very unique.', {
    endpoint: 'http://127.0.0.1:8096', language: 'en-US', minLength: 1,
  }, fetchFixture);
  assert.equal(result.matches.length, 3, 'grammar, spelling, and style findings should survive');
  const filtered = await common.checkText('Please review teh results is very unique.', {
    endpoint: 'http://localhost:8096', language: 'en-US', minLength: 1,
    dictionary: ['teh'], ignoredRules: ['AGREEMENT'],
  }, fetchFixture);
  assert.deepEqual(filtered.matches.map((match) => match.rule.id), ['STYLE_WORDINESS']);
  assert.equal((await common.checkText('short', { minLength: 12 }, fetchFixture)).skipped, 'disabled-or-too-short');
  assert.equal((await common.checkText('x'.repeat(30), { minLength: 1, maxLength: 10 }, fetchFixture)).skipped, 'too-long');
  const applied = common.applyMatch('Please review teh.', { offset: 14, length: 3, replacements: [{ value: 'the' }] });
  assert.equal(applied, 'Please review the.');
}

async function testObsidianBoundary() {
  const commands = [];
  const notices = [];
  class Plugin {
    constructor(app) { this.app = app; this.data = {}; }
    async loadData() { return this.data; }
    async saveData(value) { this.data = value; }
    addCommand(command) { commands.push(command); }
    addSettingTab() {}
  }
  class PluginSettingTab {}
  class Setting { setName() { return this; } setDesc() { return this; } addText(callback) { callback({ setValue() { return this; }, onChange() { return this; } }); return this; } }
  class Notice { constructor(message) { notices.push(message); } }
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'obsidian') return { Plugin, PluginSettingTab, Setting, MarkdownView: class {}, Notice, requestUrl: async ({ body }) => ({ status: 200, json: checkerResponse(new URLSearchParams(body).get('text') || '') }) };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const ObsidianPlugin = require(path.join(root, 'integrations/obsidian/main.js'));
    const plugin = new ObsidianPlugin({ workspace: {} });
    await plugin.onload();
    const editor = { value: 'Please review teh.', getValue() { return this.value; }, getSelection() { return this.value.slice(0, 18); }, setValue(value) { this.value = value; }, replaceSelection(value) { this.value = value; } };
    await commands.find((command) => command.id === 'check-document').editorCallback(editor);
    assert.equal(plugin.last.result.matches.length, 1);
    commands.find((command) => command.id === 'apply-first-suggestion').editorCallback(editor);
    assert.equal(editor.value, 'Please review the.');
    assert.ok(notices.some((message) => /applied/i.test(message)));
  } finally {
    Module._load = originalLoad;
  }
}

async function testJoplinBoundary() {
  assert.match(joplin.panelHTML({ matches: [{ message: 'Fix this.', replacements: [{ value: 'that' }] }] }), /Apply/);
  assert.match(joplin.escapeHTML('<script>'), /&lt;script&gt;/);
  assert.match(joplin.panelHTML({ matches: [] }), /No suggestions/);
  const commands = [];
  const html = [];
  let onMessage;
  let replaced = '';
  const values = {
    'ikmal.endpoint': 'http://127.0.0.1:8096', 'ikmal.language': 'auto',
    'ikmal.minLength': 1, 'ikmal.maxLength': 20000, 'ikmal.checkDelayMs': 900,
    'ikmal.enabled': true, 'ikmal.dictionary': '', 'ikmal.ignoredRules': '',
    'ikmal.includeQuotedText': false, 'ikmal.motherTongue': '',
  };
  globalThis.joplin = {
    workspace: {
      async selectedNote() { return { id: 'note-1' }; },
      async selectedText() { return 'Please review teh.'; },
      async replaceSelection(value) { replaced = value; },
    },
    data: { async get() { return { id: 'note-1', title: 'Test', body: 'Please review teh.' }; }, async put() {} },
    settings: { async registerSettings() {}, async value(key) { return values[key]; } },
    views: { panels: {
      async create() { return 'panel-1'; },
      async setHtml(_panel, value) { html.push(value); },
      async onMessage(_panel, listener) { onMessage = listener; },
      async show() {},
    } },
    commands: { async register(command) { commands.push(command); } },
    async request(options) { return { status: 200, async json() { return checkerResponse(new URLSearchParams(options.body).get('text') || ''); } }; },
  };
  try {
    await joplin.default.onStart();
    const result = await commands.find((command) => command.name === 'ikmal.checkSelection').execute();
    assert.equal(result.matches.length, 1);
    assert.match(html.at(-1), /Apply/);
    await onMessage({ type: 'apply', index: 0 });
    assert.equal(replaced, 'Please review the.');
  } finally {
    delete globalThis.joplin;
  }
}

async function testLibreOfficeBoundary() {
  assert.equal(libre.validateNativeEndpoint('http://127.0.0.1:8097/v2/check'), 'http://127.0.0.1:8097');
  assert.throws(() => libre.validateNativeEndpoint('http://10.0.0.2:8097'), /loopback/);
  const result = await libre.checkUnoText('The results is ready.', { endpoint: 'http://127.0.0.1:8097', language: 'en-US' }, fetchFixture);
  assert.equal(result.matches.length, 1);
  assert.deepEqual(libre.applyUnoMatch('The results is ready.', result.matches[0]), { text: 'The results are ready.', range: { start: 4, end: 14 } });
}

async function testThunderbirdBoundary() {
  const html = '<p>Please review teh draft.</p><div class="moz-cite-prefix">Quoted teh history</div><blockquote>teh quoted body</blockquote><div id="signature">--<br>teh signature</div>';
  const projected = projection.projectComposeBody(html);
  assert.equal(projected.text, 'Please review teh draft.');
  const match = checkerResponse(projected.text).matches[0];
  const applied = projection.applyComposeMatch(html, match);
  assert.match(applied.html, /Please review the draft/);
  assert.match(applied.html, /Quoted teh history/);
  assert.match(applied.html, /teh signature/);
  const included = projection.projectComposeBody(html, { includeQuotedText: true });
  assert.match(included.text, /quoted body/);
}

async function testThunderbirdBackground() {
  const messages = [];
  const state = { body: '<p>Please review teh draft.</p><blockquote>teh quoted</blockquote>' };
  const browser = {
    storage: { local: { async get(defaults) { return defaults; }, async set() {} } },
    compose: { async getComposeDetails() { return { body: state.body }; }, async setComposeDetails(_tab, details) { state.body = details.body; } },
    runtime: { onMessage: { addListener(listener) { messages.push(listener); } } },
  };
  const sandbox = { browser, console, URL, URLSearchParams, fetch: fetchFixture, globalThis: null, importScripts: (...files) => files.forEach((file) => load(path.join(root, 'integrations/thunderbird', file))) };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const load = (file) => vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  load(path.join(root, 'integrations/thunderbird/background.js'));
  const check = await messages[0]({ type: 'check-compose', tabId: 1 });
  assert.equal(check.matches.length, 1);
  const applied = await messages[0]({ type: 'apply-compose', tabId: 1, match: check.matches[0] });
  assert.equal(applied.ok, true);
  assert.match(state.body, /Please review the draft/);
  assert.match(state.body, /teh quoted/);
}

await testCommonSettings();
await testObsidianBoundary();
await testJoplinBoundary();
await testLibreOfficeBoundary();
await testThunderbirdBoundary();
await testThunderbirdBackground();
console.log('Integration adapter smoke passed: shared settings/filtering, Obsidian, Joplin, LibreOffice, Thunderbird projection/background, degraded boundaries, and Apply paths.');
