#!/usr/bin/env node
// Browser-host smoke for the real Office task-pane frontends. Microsoft Office
// is not available to headless CI, and a desktop session can have Office
// installed but unable to expose a document window. This harness therefore
// mocks only the Office.js host surface while loading the shipped pane assets,
// certificate-backed bridge, CSP, and checker path unchanged.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadChromium, resolveChromium } from './chromium_launch.mjs';

const require = createRequire(import.meta.url);
const { certificatePaths, generateOfficeCertificate } = require('../office-bridge/certificate.cjs');
const { createOfficeBridgeServer } = require('../office-bridge/office_bridge.cjs');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function officeMockScript() {
  return `(() => {
    const host = window.__ikmalOfficeHost || 'Word';
    const state = window.__ikmalOfficeState = {
      word: { text: 'The results is ready.', changeTrackingMode: 'Off' },
      excel: { text: 'The results is ready.' },
      powerpoint: { text: 'The results is ready.' },
      outlook: { html: '<p>The results is ready.</p>' },
      onenote: { html: '<p>The results is ready.</p>' },
      project: { taskId: 'task-1', name: 'The results is ready.', notes: '' },
    };
    const hostTypes = { Word: 'Word', Excel: 'Excel', PowerPoint: 'PowerPoint', Outlook: 'Outlook', OneNote: 'OneNote', Project: 'Project' };

    function wordContext() {
      const context = {};
      const documentState = state.word;
      const selection = {
        get text() { return documentState.text; },
        load() {},
        search(needle) {
          const items = [];
          let from = 0;
          while (true) {
            const index = documentState.text.indexOf(needle, from);
            if (index < 0) break;
            const font = { underline: 'None', highlightColor: null };
            const item = {
              text: needle,
              font,
              insertText(value) {
                documentState.text = documentState.text.slice(0, index) + value + documentState.text.slice(index + needle.length);
              },
            };
            items.push(item);
            from = index + needle.length;
          }
          return { items, load() {} };
        },
      };
      context.document = {
        changeTrackingMode: documentState.changeTrackingMode,
        load() {},
        getSelection: () => selection,
      };
      context.sync = async () => {};
      return context;
    }

    function excelContext() {
      const context = {};
      const documentState = state.excel;
      const makeRange = () => {
        const range = {
          text: [[documentState.text]],
          formulas: [['']],
          rowIndex: 0,
          columnIndex: 0,
          worksheet: { name: 'Sheet1' },
          format: {
            fill: { color: '', clear() { this.color = ''; } },
            font: { underline: 'None' },
          },
          load() {},
        };
        Object.defineProperty(range, 'values', {
          get: () => [[documentState.text]],
          set: (values) => { documentState.text = String(values?.[0]?.[0] || ''); },
        });
        return range;
      };
      const selected = makeRange();
      const sheet = { getRange: () => makeRange() };
      context.workbook = {
        getSelectedRange: () => selected,
        worksheets: { getItem: () => sheet },
      };
      context.sync = async () => {};
      return context;
    }

    function powerpointContext() {
      const context = {};
      const documentState = state.powerpoint;
      const makeTextRange = (start = 0, length = documentState.text.length) => {
        const range = {
          font: { underline: 'None', color: '#000000' },
          load() {},
          getSubstring(nextStart, nextLength) { return makeTextRange(nextStart, nextLength); },
        };
        Object.defineProperty(range, 'text', {
          get: () => documentState.text.slice(start, start + length),
          set: (value) => {
            documentState.text = documentState.text.slice(0, start) + String(value) + documentState.text.slice(start + length);
          },
        });
        range.context = context;
        return range;
      };
      const textRange = makeTextRange();
      const shape = {
        id: 'shape-1',
        name: 'Title',
        type: 'TextBox',
        textFrame: { textRange },
      };
      const slide = {
        id: 'slide-1',
        shapes: {
          items: [shape],
          load() {},
          getItem: () => shape,
        },
      };
      context.presentation = {
        slides: { items: [slide], load() {}, getItemAt: () => slide },
      };
      context.sync = async () => {};
      return context;
    }

    function officeDocument() {
      const outlookBody = {
        getAsync(_coercion, callback) { callback({ status: 'succeeded', value: state.outlook.html }); },
        setAsync(value, _options, callback) { state.outlook.html = String(value); callback({ status: 'succeeded' }); },
      };
      const projectDocument = {
        getSelectedTaskAsync(callback) { callback({ status: 'succeeded', value: state.project.taskId }); },
        getTaskAsync(_taskId, callback) { callback({ status: 'succeeded', value: { taskName: state.project.name } }); },
        getTaskFieldAsync(_taskId, field, callback) {
          callback({ status: 'succeeded', value: field === 'Notes' ? state.project.notes : state.project.name });
        },
        setTaskFieldAsync(_taskId, field, value, callback) {
          if (field === 'Name') state.project.name = String(value);
          if (field === 'Notes') state.project.notes = String(value);
          callback({ status: 'succeeded' });
        },
      };
      return {
        getSelectedDataAsync(_coercion, callback) { callback({ status: 'succeeded', value: state.onenote.html }); },
        setSelectedDataAsync(value, _options, callback) { state.onenote.html = String(value); callback({ status: 'succeeded' }); },
        ...projectDocument,
      };
    }

    window.Word = { run: async (callback) => callback(wordContext()) };
    window.Excel = { run: async (callback) => callback(excelContext()) };
    window.PowerPoint = { run: async (callback) => callback(powerpointContext()) };
    window.Office = {
      HostType: hostTypes,
      CoercionType: { Html: 'html' },
      AsyncResultStatus: { Succeeded: 'succeeded' },
      ProjectTaskFields: { Name: 'Name', Notes: 'Notes' },
      context: { document: officeDocument(), mailbox: { item: { body: {
        getAsync(_coercion, callback) { callback({ status: 'succeeded', value: state.outlook.html }); },
        setAsync(value, _options, callback) { state.outlook.html = String(value); callback({ status: 'succeeded' }); },
      } } } },
      onReady(callback) { queueMicrotask(() => callback({ host })); },
    };
    window.OneNote = { run: async (callback) => callback({ application: { getActivePage: () => ({ analyzePage: () => ({ value: JSON.stringify({ content: state.onenote.html }) }) }) }, sync: async () => {} }) };
  })();`;
}

const certificateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-office-host-cert-'));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-office-host-browser-'));
let bridge;
let context;

try {
  generateOfficeCertificate({ directory: certificateDirectory });
  const paths = certificatePaths(certificateDirectory);
  const port = await freePort();
  bridge = createOfficeBridgeServer({
    port,
    key: fs.readFileSync(paths.keyPath),
    cert: fs.readFileSync(paths.certificatePath),
    fetchImpl: async (_url, request) => {
      const text = new URLSearchParams(request.body).get('text') || '';
      const offset = text.indexOf('results is');
      return new Response(JSON.stringify({
        matches: offset < 0 ? [] : [{
          offset,
          length: 'results is'.length,
          message: 'A plural subject takes a plural verb.',
          replacements: [{ value: 'results are' }],
          rule: { id: 'PLURAL_AGREEMENT', category: { id: 'GRAMMAR' } },
        }],
        ikmalDegradedChecks: ['style'],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  await new Promise((resolve, reject) => {
    bridge.once('error', reject);
    bridge.listen(port, '127.0.0.1', resolve);
  });

  const chromium = await loadChromium();
  const { executablePath: browserPath, source: browserSource } = resolveChromium(chromium);
  context = await chromium.launchPersistentContext(userData, {
    executablePath: browserPath,
    headless: false,
    ignoreHTTPSErrors: true,
    viewport: { width: 1000, height: 800 },
  });
  await context.addInitScript(() => {
    const match = location.pathname.match(/\/office\/([^/]+)\//);
    const names = { word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint', outlook: 'Outlook', onenote: 'OneNote', project: 'Project' };
    window.__ikmalOfficeHost = names[match?.[1]] || 'Word';
  });
  await context.route('https://appsforoffice.microsoft.com/lib/1/hosted/office.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: officeMockScript(),
  }));

  const page = context.pages()[0] || await context.newPage();
  page.on('pageerror', (error) => console.error(`Office host page error: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') console.error(`Office host console error: ${message.text()}`); });
  const hosts = ['word', 'excel', 'powerpoint', 'outlook', 'onenote', 'project'];
  for (const host of hosts) {
    await page.goto(`https://localhost:${port}/office/${host}/`, { waitUntil: 'networkidle' });
    await page.locator('#check').waitFor({ state: 'attached' });
    const ready = await page.evaluate(() => ({
      title: document.title,
      state: document.querySelector('#state')?.textContent,
      disabled: document.querySelector('#check')?.disabled,
    }));
    if (ready.disabled || !ready.state?.startsWith('Ready.')) {
      throw new Error(`${host} Office host initialization failed: ${JSON.stringify(ready)}`);
    }
  }

  const stateKeys = {
    word: 'word',
    excel: 'excel',
    powerpoint: 'powerpoint',
    outlook: 'outlook',
    onenote: 'onenote',
    project: 'project',
  };
  for (const host of hosts) {
    console.log(`Office host smoke: checking ${host}`);
    await page.goto(`https://localhost:${port}/office/${host}/`, { waitUntil: 'networkidle' });
    await page.locator('#check').click();
    try {
      await page.waitForFunction(() => document.querySelector('#state')?.textContent?.includes('1 finding'), null, { timeout: 5000 });
    } catch (error) {
      const state = await page.locator('#state').textContent();
      throw new Error(`${host} check did not settle (state=${JSON.stringify(state)}): ${error.message}`);
    }
    const checked = await page.evaluate(() => ({
      state: document.querySelector('#state')?.textContent,
      finding: document.querySelector('.finding')?.textContent,
      clearDisabled: document.querySelector('#clear')?.disabled,
      canApply: Boolean(document.querySelector('.finding button')),
    }));
    if (!checked.state.includes('style checks did not run') || !checked.finding || (!checked.canApply && host !== 'project')) {
      throw new Error(`${host} task-pane check lifecycle failed: ${JSON.stringify(checked)}`);
    }
    console.log(`Office host smoke: applying ${host}`);
    if (host !== 'project') {
      await page.locator('.finding button').click();
      try {
        await page.waitForFunction(() => document.querySelector('#state')?.textContent?.startsWith('Applied'), null, { timeout: 5000 });
      } catch (error) {
        const state = await page.locator('#state').textContent();
        throw new Error(`${host} Apply did not settle (state=${JSON.stringify(state)}): ${error.message}`);
      }
    } else {
      await page.locator('.finding button').click();
      try {
        await page.waitForFunction(() => document.querySelector('#state')?.textContent?.startsWith('Applied to'), null, { timeout: 5000 });
      } catch (error) {
        const state = await page.locator('#state').textContent();
        throw new Error(`${host} Apply did not settle (state=${JSON.stringify(state)}): ${error.message}`);
      }
    }
    const applied = await page.evaluate((key) => ({
      state: document.querySelector('#state')?.textContent,
      value: key === 'outlook' || key === 'onenote' ? window.__ikmalOfficeState[key].html : key === 'project' ? window.__ikmalOfficeState[key].name : window.__ikmalOfficeState[key].text,
    }), stateKeys[host]);
    if (!applied.value.includes('results are')) {
      throw new Error(`${host} task-pane Apply lifecycle failed: ${JSON.stringify(applied)}`);
    }
  }

  console.log(`Office host smoke passed: HTTPS bridge, mocked Office.js initialization, check/degraded state, mark lifecycle, and Apply for ${hosts.join(', ')} (${JSON.stringify({ browser: browserSource, port })}).`);
} finally {
  await context?.close();
  if (bridge) await new Promise((resolve) => bridge.close(resolve));
  fs.rmSync(certificateDirectory, { recursive: true, force: true });
  fs.rmSync(userData, { recursive: true, force: true });
}
