#!/usr/bin/env node
// End-to-end Firefox smoke for the packaged .xpi contents. web-ext installs the
// add-on through Firefox's supported temporary-install path; the Firefox RDP
// then drives the page and checks the real content-script/event-page boundary.

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageScript = path.join(root, 'tools', 'package_firefox_extension.mjs');
const archive = path.join(root, 'bin', 'extension', 'ikmal-editor-firefox-v0.1.0.xpi');
const firefoxBinary = process.env.IKMAL_FIREFOX || '/opt/homebrew/bin/firefox';

if (!fs.existsSync(firefoxBinary)) throw new Error(`Firefox was not found at ${firefoxBinary}.`);
execFileSync(process.execPath, [packageScript], { stdio: 'inherit' });

// The Firefox debugger speaks length-prefixed JSON packets. Keeping this tiny
// client here avoids adding web-ext's large transitive dependency tree to the
// project; the smoke command downloads web-ext only when explicitly run.
class FirefoxRDPClient {
  constructor() {
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.waiters = [];
  }

  connect(port) {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: '127.0.0.1', port });
      this.socket.on('data', (chunk) => this.read(chunk));
      this.socket.once('error', reject);
      this.pending.set('root', { resolve, reject });
    });
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const separator = this.buffer.indexOf(':');
      if (separator < 1) return;
      const length = Number(this.buffer.subarray(0, separator).toString());
      if (!Number.isFinite(length) || this.buffer.length < separator + 1 + length) return;
      const payload = this.buffer.subarray(separator + 1, separator + 1 + length).toString();
      this.buffer = this.buffer.subarray(separator + 1 + length);
      const message = JSON.parse(payload);
      if (message.type === 'tabListChanged') continue;
      const request = this.pending.get(message.from);
      if (request) {
        this.pending.delete(message.from);
        if (message.error) request.reject(new Error(`${message.error}: ${message.message || ''}`));
        else request.resolve(message);
        continue;
      }
      const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(message));
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1);
        waiter.resolve(message);
      }
    }
  }

  waitForMessage(predicate) {
    return new Promise((resolve, reject) => this.waiters.push({ predicate, resolve, reject }));
  }

  request(request) {
    const packet = typeof request === 'string' ? { to: 'root', type: request } : request;
    return new Promise((resolve, reject) => {
      this.pending.set(packet.to, { resolve, reject });
      const payload = JSON.stringify(packet);
      this.socket.write(`${Buffer.byteLength(payload)}:${payload}`);
    });
  }

  disconnect() {
    this.socket?.end();
  }
}

// Marionette is Firefox's built-in WebDriver transport. It is used only by
// this smoke to generate trusted focus/click events; the extension itself has
// no dependency on it. web-ext starts Firefox with --marionette below.
class MarionetteClient {
  constructor() {
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 0;
    this.pending = new Map();
    this.hello = null;
  }

  connect(port) {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: '127.0.0.1', port });
      this.socket.on('data', (chunk) => this.read(chunk));
      this.socket.once('error', reject);
      this.pending.set('hello', { resolve, reject });
    });
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const separator = this.buffer.indexOf(':');
      if (separator < 1) return;
      const length = Number(this.buffer.subarray(0, separator).toString());
      if (!Number.isFinite(length) || this.buffer.length < separator + 1 + length) return;
      const payload = this.buffer.subarray(separator + 1, separator + 1 + length).toString();
      this.buffer = this.buffer.subarray(separator + 1 + length);
      const message = JSON.parse(payload);
      if (!Array.isArray(message)) {
        this.hello = message;
        const greeting = this.pending.get('hello');
        if (greeting) {
          this.pending.delete('hello');
          greeting.resolve(message);
        }
        continue;
      }
      const [, id, error, result] = message;
      const request = this.pending.get(id);
      if (!request) continue;
      this.pending.delete(id);
      if (error) request.reject(new Error(`${error.error}: ${error.message}`));
      else request.resolve(result);
    }
  }

  request(command, parameters = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload = JSON.stringify([0, id, command, parameters]);
      this.socket.write(`${Buffer.byteLength(payload)}:${payload}`);
    });
  }

  async startSession() {
    const session = await this.request('WebDriver:NewSession', { strictFileInteractability: false });
    await this.request('Marionette:SetContext', { value: 'content' });
    return session;
  }

  async click(selector) {
    const response = await this.request('WebDriver:FindElement', { using: 'css selector', value: selector });
    const element = response.value || response;
    const id = element['element-6066-11e4-a52e-4f735466cecf'] || element.ELEMENT;
    if (!id) throw new Error(`Marionette did not return an element for ${selector}: ${JSON.stringify(element)}`);
    await this.request('WebDriver:ElementClick', { id });
  }

  async refresh() {
    await this.request('WebDriver:Refresh');
  }

  async clickAt(x, y) {
    await this.request('WebDriver:PerformActions', {
      actions: [{
        type: 'pointer',
        id: 'ikmal-mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y) },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
        ],
      }],
    });
  }

  async deleteSession() {
    if (!this.socket) return;
    try { await this.request('WebDriver:DeleteSession'); } catch { /* Firefox may already be stopping. */ }
    this.socket.end();
  }
}

async function connectFirefox(port) {
  const client = new FirefoxRDPClient();
  await client.connect(port);
  return client;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function startServer(handler, port) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function waitFor(predicate, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

const checkerPort = await freePort();
const fixturePort = await freePort();
let checkerRequests = 0;
const checker = await startServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/v2/check') {
    response.writeHead(404);
    response.end();
    return;
  }
  checkerRequests += 1;
  let body = '';
  for await (const chunk of request) body += chunk;
  const text = new URLSearchParams(body).get('text') || '';
  const offset = text.indexOf('teh');
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({
    matches: offset < 0 ? [] : [{
      offset,
      length: 3,
      message: 'Use the correct spelling.',
      replacements: [{ value: 'the' }],
      rule: { id: 'SPELL', category: { id: 'TYPOS' }, issueType: 'misspelling' },
      ikmalSource: 'quality-sidecar',
    }],
  }));
}, checkerPort);
const fixture = await startServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><meta charset="utf-8"><style>body{font:16px system-ui;margin:4rem}textarea{width:32rem;height:8rem}</style><textarea id="editor">Please review teh draft before the meeting.</textarea>');
}, fixturePort);

try {
  const lsof = execFileSync('lsof', ['-ti', ':2828'], { encoding: 'utf8' }).trim();
  if (lsof) {
    for (const pid of lsof.split(/\s+/)) {
      if (pid) process.kill(Number(pid), 'SIGKILL');
    }
  }
} catch {}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-firefox-smoke-'));
const output = [];
let webExt;
let firefoxRemote;
let marionette;
try {
  execFileSync('unzip', ['-q', archive, '-d', staging]);
  const configPath = path.join(staging, 'config.js');
  fs.writeFileSync(configPath, fs.readFileSync(configPath, 'utf8').replaceAll('http://127.0.0.1:8096', `http://127.0.0.1:${checkerPort}`));
  if (process.env.IKMAL_FIREFOX_DEBUG) {
    const debugManifestPath = path.join(staging, 'manifest.json');
    const debugManifest = JSON.parse(fs.readFileSync(debugManifestPath, 'utf8'));
    debugManifest.content_scripts[0].js.unshift('firefox-probe.js');
    fs.writeFileSync(debugManifestPath, `${JSON.stringify(debugManifest, null, 2)}\n`);
    fs.writeFileSync(path.join(staging, 'firefox-probe.js'), 'document.documentElement.dataset.ikmalFirefoxProbe = "loaded";\n');
  }
  const webExtCommand = process.env.IKMAL_WEB_EXT || 'npx';
  const webExtPrefix = process.env.IKMAL_WEB_EXT ? [] : ['--yes', 'web-ext'];
  webExt = spawn(webExtCommand, [
    ...webExtPrefix, 'run', '--source-dir', staging, '--firefox', firefoxBinary, '--no-reload', '--no-input',
    '--verbose', `--start-url=http://127.0.0.1:${fixturePort}/`, '--arg=--headless', '--arg=--marionette',
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const collect = (chunk) => output.push(String(chunk));
  webExt.stdout.on('data', collect);
  webExt.stderr.on('data', collect);

  // web-ext picks a debugger port itself. Read the port it reports instead of
  // competing with its own RDP server using a second fixed port.
  await waitFor(() => {
    const match = output.join('').match(/Started devtools server on (\d+)/);
    return match && Number(match[1]);
  }, 'Firefox debugger');
  await waitFor(() => /Installed .* as a temporary add-on/.test(output.join('')), 'Firefox temporary add-on install');
  const debuggerPortMatch = output.join('').match(/Started devtools server on (\d+)/);
  firefoxRemote = await connectFirefox(Number(debuggerPortMatch[1]));
  if (process.env.IKMAL_FIREFOX_DEBUG) {
    console.error(`Firefox add-ons: ${JSON.stringify(await firefoxRemote.request('listAddons'))}`);
  }
  marionette = await waitFor(async () => {
    try {
      const candidate = new MarionetteClient();
      await candidate.connect(2828);
      await candidate.startSession();
      return candidate;
    } catch {
      return false;
    }
  }, 'Firefox Marionette');
  const client = firefoxRemote;
  const tab = await waitFor(async () => {
    const tabs = await client.request('listTabs');
    return tabs.tabs?.find((candidate) => candidate.url?.includes(`127.0.0.1:${fixturePort}`));
  }, 'Firefox fixture tab');
  // The temporary add-on is installed after web-ext has opened the start URL.
  // Reload that page through the descriptor so the newly installed content
  // script is applied to a fresh document.
  await marionette.refresh();
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const targetResponse = await client.request({ to: tab.actor, type: 'getTarget' });
  const target = targetResponse.frame || targetResponse.target || targetResponse.form || targetResponse;
  const targetActor = target.actor || targetResponse.targetActor || targetResponse.targetActorID;
  if (!targetActor) throw new Error(`Firefox did not expose a fixture target actor: ${JSON.stringify(targetResponse)}`);
  const consoleActor = target.consoleActor || targetResponse.consoleActor || tab.consoleActor;
  if (!target.threadActor || !consoleActor) throw new Error(`Firefox did not expose the fixture debugger actors: ${JSON.stringify({ targetResponse, tab })}`);

  async function evaluate(expression) {
    const evaluation = client.waitForMessage((message) => message.from === consoleActor && message.type === 'evaluationResult');
    const response = await client.request({ to: consoleActor, type: 'evaluateJSAsync', text: expression });
    const result = await evaluation;
    if (result.resultID !== response.resultID) throw new Error(`Firefox evaluation response ID mismatch: ${JSON.stringify({ response, result })}`);
    return result.result?.value ?? result.result;
  }

  const pageState = await evaluate('({ url: location.href, title: document.title, probe: document.documentElement.dataset.ikmalFirefoxProbe || null, editor: document.querySelector("#editor")?.value || null, indicator: Boolean(document.querySelector(".ikmal-indicator")), body: document.body?.innerText })');
  if (process.env.IKMAL_FIREFOX_DEBUG) {
    console.error(`Firefox page after install/navigation: ${JSON.stringify(pageState)}`);
  }

  await marionette.click('#editor');

  if (process.env.IKMAL_FIREFOX_DEBUG) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const afterClick = {
      active: await evaluate('document.activeElement?.id || null'),
      className: await evaluate('document.querySelector(".ikmal-indicator")?.className || null'),
      title: await evaluate('document.querySelector(".ikmal-indicator")?.title || null'),
      text: await evaluate('document.querySelector(".ikmal-indicator")?.textContent || null'),
    };
    console.error(`Firefox after trusted click: ${JSON.stringify({ afterClick, checkerRequests })}`);
  }

  const indicator = await waitFor(async () => {
    const raw = await evaluate('JSON.stringify((() => { const node = document.querySelector(".ikmal-indicator"); return node ? { className: node.className, title: node.title } : null; })())');
    const state = raw ? JSON.parse(raw) : null;
    return state?.className?.includes('is-flagged') && state;
  }, 'Firefox finding');
  if (!indicator.title.includes('1 suggestion')) throw new Error(`Firefox indicator did not report the finding: ${JSON.stringify(indicator)}`);
  const mark = await waitFor(async () => {
    const raw = await evaluate('JSON.stringify((() => { const node = document.querySelector(".ikmal-mark"); if (!node) return null; const box = node.getBoundingClientRect(); return { left: box.left, top: box.top, width: box.width, height: box.height }; })())');
    return raw ? JSON.parse(raw) : null;
  }, 'Firefox underline mark');
  await marionette.clickAt(mark.left + mark.width / 2, mark.top + mark.height / 2);
  await waitFor(() => evaluate('Boolean(document.querySelector(".ikmal-card-apply"))'), 'Firefox Apply action');
  await marionette.click('.ikmal-card-apply');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!(await evaluate('document.querySelector("#editor")?.value?.includes("the draft")'))) {
    await evaluate('document.querySelector(".ikmal-card-apply")?.click()');
  }
  const corrected = await waitFor(async () => {
    const value = await evaluate('document.querySelector("#editor")?.value');
    return value?.includes('the draft') && value;
  }, 'Firefox correction');
  console.log(`Firefox extension smoke passed: temporary .xpi install, event-page check, content-script indicator, and Apply (${corrected}).`);
} catch (error) {
  throw new Error(`${error.message}\nweb-ext output:\n${output.join('')}`);
} finally {
  firefoxRemote?.disconnect();
  await marionette?.deleteSession();
  try {
    const profileMatch = output.join('').match(/profile at ([^\s]+)/);
    if (profileMatch && profileMatch[1]) {
      execFileSync('pkill', ['-9', '-f', profileMatch[1]]);
    }
  } catch {}
  if (webExt?.exitCode === null) webExt.kill('SIGKILL');
  if (webExt) await new Promise((resolve) => webExt.once('exit', resolve));
  await new Promise((resolve) => checker.close(resolve));
  await new Promise((resolve) => fixture.close(resolve));
  fs.rmSync(staging, { recursive: true, force: true });
}
