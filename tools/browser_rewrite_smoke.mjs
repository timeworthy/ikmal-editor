#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'bin', 'browser-extension');
const chromium = process.env.IKMAL_CHROMIUM || ['/opt/homebrew/bin/chromium', '/usr/bin/chromium'].find((candidate) => fs.existsSync(candidate));
if (!chromium) throw new Error('Chromium was not found. Set IKMAL_CHROMIUM to run browser rewrite smoke.');
execFileSync(process.execPath, [path.join(root, 'tools', 'package_browser_rewrite.mjs')], { stdio: 'inherit' });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const file = path.resolve(root, `.${requestPath}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    response.writeHead(403); response.end(); return;
  }
  try {
    const body = fs.readFileSync(file);
    const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
    response.writeHead(200, { 'content-type': `${contentType}; charset=utf-8` });
    response.end(body);
  } catch {
    response.writeHead(404); response.end();
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-browser-rewrite-smoke-'));
const debugPort = Number(process.env.IKMAL_BROWSER_REWRITE_DEBUG_PORT || 9239);
const browserProcess = spawn(chromium, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

async function target() {
  return (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((entry) => entry.type === 'page');
}

async function waitForTarget() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { const value = await target(); if (value) return value; } catch (_) { /* browser is starting */ }
    await wait(100);
  }
  throw new Error('Timed out waiting for Chromium DevTools target.');
}

const devtools = await new Promise(async (resolve, reject) => {
  const page = await waitForTarget();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  let nextID = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    callback(message.error ? new Error(message.error.message) : null, message.result);
  });
  socket.addEventListener('error', reject, { once: true });
  socket.addEventListener('open', () => {
    const command = (method, params = {}) => new Promise((commandResolve, commandReject) => {
      const id = ++nextID;
      pending.set(id, (error, result) => error ? commandReject(error) : commandResolve(result));
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
      return result.result?.value;
    };
    resolve({ socket, command, evaluate });
  }, { once: true });
});

async function waitForState(expression, predicate, label) {
  const deadline = Date.now() + 7000;
  let latest;
  while (Date.now() < deadline) {
    try { latest = await devtools.evaluate(expression); if (predicate(latest)) return latest; } catch (error) { latest = { error: error.message }; }
    await wait(100);
  }
  throw new Error(`${label}: ${JSON.stringify(latest)}`);
}

try {
  await devtools.command('Page.navigate', { url: `http://127.0.0.1:${port}/apps/browser-extension/test/fixture.html` });
  const moduleURL = `http://127.0.0.1:${port}/bin/browser-extension/content_module.js`;
  const artifactURL = `http://127.0.0.1:${port}/bin/browser-extension/`;
  await devtools.evaluate(`(async () => {
    window.__rewriteErrors = [];
    window.addEventListener('error', (event) => window.__rewriteErrors.push(event.message));
    window.addEventListener('unhandledrejection', (event) => window.__rewriteErrors.push(String(event.reason)));
    window.__rewriteRequests = [];
    const resultFor = (text) => {
      const offset = text.indexOf('teh');
      return { matches: offset < 0 ? [] : [{ offset, length: 3, message: 'Use the correct spelling.', replacements: [{ value: 'the' }], rule: { id: 'SPELL', category: { id: 'SPELLING' } }, ikmalSource: 'quality-sidecar' }] };
    };
    window.chrome = { runtime: {
      lastError: null,
      getURL: (file) => ${JSON.stringify(artifactURL)} + file,
      sendMessage: (message, callback) => {
        window.__rewriteRequests.push(message);
        const unavailable = String(message.text).includes('offline');
        setTimeout(() => callback(unavailable ? { ok: false, error: 'Local checker unavailable.' } : { ok: true, data: resultFor(message.text) }), String(message.text).includes('slow') ? 250 : 0);
      },
    }};
    await import(${JSON.stringify(moduleURL)} + '?smoke=' + Date.now());
  })()`);

  await devtools.evaluate(`(() => { const field = document.querySelector('#editor'); field.setSelectionRange(6, 9); field.focus(); field.dispatchEvent(new Event('focusin', { bubbles: true })); })()`);
  const flagged = await waitForState(`({
    status: document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status || '',
    count: document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.count')?.textContent || '',
    shadow: Boolean(document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot),
    selection: window.__rewriteRequests[0]?.selection === true
  })`, (value) => value.status === 'issues' && value.count === '1' && value.shadow && value.selection, 'Textarea browser check failed');
  if (flagged.status !== 'issues') throw new Error(`Unexpected textarea state: ${JSON.stringify(flagged)}`);

  await devtools.evaluate("document.querySelector('#ikmal-rewrite-indicator').shadowRoot.querySelector('.indicator').click()");
  await waitForState('Boolean(document.querySelector(\'#ikmal-rewrite-popover\')?.shadowRoot?.querySelector(\'[data-action=apply]\'))', Boolean, 'Browser issue popover did not open');
  await devtools.evaluate("document.querySelector('#ikmal-rewrite-popover').shadowRoot.querySelector('[data-action=apply]').click()");
  const applied = await waitForState(`({
    text: document.querySelector('#editor').value,
    status: document.querySelector('#ikmal-rewrite-indicator').shadowRoot.querySelector('.indicator').dataset.status
  })`, (value) => value.text === 'Write the draft' && value.status === 'clean', 'Textarea browser Apply failed');

  await devtools.evaluate(`(() => {
    const field = document.querySelector('#content');
    field.innerHTML = 'Editable teh content';
    field.focus();
    field.dispatchEvent(new Event('focusin', { bubbles: true }));
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  })()`);
  await waitForState(`({
    status: document.querySelector('#ikmal-rewrite-indicator').shadowRoot.querySelector('.indicator').dataset.status,
    text: document.querySelector('#content').innerText
  })`, (value) => value.status === 'issues' && value.text === 'Editable teh content', 'Contenteditable browser check failed');
  await devtools.evaluate("document.querySelector('#ikmal-rewrite-indicator').shadowRoot.querySelector('.indicator').click()");
  await waitForState('Boolean(document.querySelector(\'#ikmal-rewrite-popover\')?.shadowRoot?.querySelector(\'.writing-issue-popover\'))', Boolean, 'Contenteditable issue popover did not open');
  const focusState = await devtools.evaluate(`(() => {
    const indicator = document.querySelector('#ikmal-rewrite-indicator').shadowRoot.querySelector('.indicator');
    const apply = document.querySelector('#ikmal-rewrite-popover').shadowRoot.querySelector('[data-action=apply]');
    indicator.focus();
    apply.focus();
    return { indicatorLabel: indicator.getAttribute('aria-label'), focusedAction: document.querySelector('#ikmal-rewrite-popover').shadowRoot.activeElement?.dataset.action || '' };
  })()`);
  if (focusState.indicatorLabel !== '1 issue' || focusState.focusedAction !== 'apply') throw new Error(`Browser keyboard focus/accessibility failed: ${JSON.stringify(focusState)}`);
  const screenshot = await devtools.command('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(packageDir, 'browser-rewrite-smoke.png'), Buffer.from(screenshot.data, 'base64'));
  const dismissed = await devtools.evaluate(`(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    return {
      popover: Boolean(document.querySelector('#ikmal-rewrite-popover')),
      focus: document.querySelector('#ikmal-rewrite-indicator').shadowRoot.activeElement?.className || '',
      key: 'Escape'
    };
  })()`);
  if (dismissed.popover || dismissed.focus !== 'indicator') throw new Error(`Browser Escape dismissal failed: ${JSON.stringify(dismissed)}`);
  /* Keep a wait assertion here so a real native key event and the synchronous
     test event share the same final DOM contract. */
  await waitForState(`({
    popover: Boolean(document.querySelector('#ikmal-rewrite-popover')),
    focus: document.querySelector('#ikmal-rewrite-indicator').shadowRoot.activeElement?.className || ''
  })`, (value) => !value.popover && value.focus === 'indicator', 'Browser Escape dismissal state changed');
  await devtools.evaluate("document.querySelector('#ikmal-rewrite-indicator').shadowRoot.querySelector('.indicator').click()");
  await waitForState('Boolean(document.querySelector(\'#ikmal-rewrite-popover\')?.shadowRoot?.querySelector(\'[data-action=apply]\'))', Boolean, 'Browser popover reopen failed');
  await devtools.evaluate("document.querySelector('#ikmal-rewrite-popover').shadowRoot.querySelector('[data-action=apply]').click()");
  const contentApplied = await waitForState(`({
    text: document.querySelector('#content').innerText,
    status: document.querySelector('#ikmal-rewrite-indicator').shadowRoot.querySelector('.indicator').dataset.status
  })`, (value) => value.text === 'Editable the content' && value.status === 'clean', 'Contenteditable Apply failed');

  await devtools.evaluate(`(() => {
    const field = document.querySelector('#content');
    field.innerHTML = 'Editable teh content';
    field.focus();
    field.dispatchEvent(new Event('focusin', { bubbles: true }));
  })()`);
  await waitForState(`document.querySelector('#ikmal-rewrite-indicator').shadowRoot.querySelector('.indicator').dataset.status`, (value) => value === 'issues', 'Ignore setup check failed');
  await devtools.evaluate("document.querySelector('#ikmal-rewrite-indicator').shadowRoot.querySelector('.indicator').click(); document.querySelector('#ikmal-rewrite-popover').shadowRoot.querySelector('[data-action=ignore]').click()");
  const ignored = await devtools.evaluate(`({ text: document.querySelector('#content').innerText, popover: Boolean(document.querySelector('#ikmal-rewrite-popover')) })`);
  if (ignored.text !== 'Editable teh content' || ignored.popover) throw new Error(`Browser Ignore failed: ${JSON.stringify(ignored)}`);

  await devtools.evaluate(`(() => {
    const field = document.querySelector('#editor');
    field.value = 'offline';
    field.focus();
    field.dispatchEvent(new Event('focusin', { bubbles: true }));
  })()`);
  const unavailable = await waitForState(`document.querySelector('#ikmal-rewrite-indicator').shadowRoot.querySelector('.indicator').dataset.status`, (value) => value === 'unavailable', 'Unavailable-service state failed');

  await devtools.evaluate(`(() => {
    const field = document.querySelector('#editor');
    field.value = 'A slow teh draft';
    field.focus();
    field.dispatchEvent(new Event('focusin', { bubbles: true }));
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  // Remove the field before the first delayed response can land. This models
  // a route change/editor teardown while a check is in flight.
  await wait(100);
  await devtools.evaluate(`(() => {
    const field = document.querySelector('#editor');
    field.value = 'A mutated draft';
    field.remove();
  })()`);
  await wait(600);
  const chaos = await devtools.evaluate(`({ errors: window.__rewriteErrors, indicator: document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status || '' })`);
  if (chaos.errors.length || chaos.indicator === 'issues') throw new Error(`Browser mutation/teardown chaos failed: ${JSON.stringify(chaos)}`);
  console.log(`Browser rewrite smoke passed: Shadow DOM, selection-aware textarea Apply, contenteditable + IME events, Ignore, unavailable service, and mutation teardown (${JSON.stringify({ applied, contentApplied, unavailable, chaos })}).`);
} finally {
  devtools.socket.close();
  if (browserProcess.exitCode === null && !browserProcess.killed) {
    browserProcess.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => browserProcess.once('exit', resolve)), wait(2000)]);
  }
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(userData, { recursive: true, force: true });
}
