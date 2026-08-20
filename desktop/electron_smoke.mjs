import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const debugPort = Number(process.env.IKMAL_SMOKE_DEBUG_PORT || 9237);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function responseFor(text) {
  if (text.includes('Plants feed it')) {
    return {
      matches: [{
        message: 'Check what the pronoun refers to.',
        replacements: [],
        offset: text.indexOf('it'),
        length: 2,
        rule: { id: 'IKMAL_PRONOUN_ANTECEDENT', category: { id: 'GRAMMAR' } },
      }],
      ikmalAntecedents: [{ pronoun: 'it', start: text.indexOf('it'), end: text.indexOf('it') + 2, antecedent: 'Plants', antecedentStart: 0, antecedentEnd: 6, confidence: 0.95 }],
    };
  }
  if (!text.includes('results is')) return { matches: [] };
  return {
    matches: [{
      message: 'Use “are” with the plural subject.',
      replacements: [{ value: 'are' }],
      offset: text.indexOf('is'),
      length: 2,
      rule: { id: 'BE_PLURAL', category: { id: 'GRAMMAR' } },
    }],
  };
}

function createFakeServices() {
  let checkRequests = 0;
  const checkTexts = [];
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && (request.url === '/health' || request.url === '/v2/languages')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && request.url === '/v1/style-guides') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ guides: [], activeId: '', enabled: false }));
      return;
    }
    if (request.method === 'POST' && request.url === '/v2/check') {
      checkRequests += 1;
      let body = '';
      for await (const chunk of request) body += chunk;
      const text = new URLSearchParams(body).get('text') || '';
      checkTexts.push(text);
      if (text.includes('failure')) {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'temporary test failure' }));
        return;
      }
      // Keep the first request outstanding long enough to prove that the
      // newer generation wins when responses return out of order.
      if (text.includes('slow')) await wait(2500);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(responseFor(text)));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      port: server.address().port,
      requests: () => checkRequests,
      checkTexts: () => [...checkTexts],
    }));
  });
}

async function waitForTarget(urlSuffix = '/index.html') {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const target = targets.find((entry) => entry.type === 'page' && entry.url.endsWith(urlSuffix));
      if (target) return target;
    } catch (_) {
      // Electron is still starting.
    }
    await wait(100);
  }
  throw new Error('Timed out waiting for the compact Electron window.');
}

async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let nextID = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (!resolve) return;
    pending.delete(message.id);
    if (message.error) resolve({ error: new Error(message.error.message) });
    else resolve({ result: message.result });
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextID;
    pending.set(id, (message) => message.error ? reject(message.error) : resolve(message.result));
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed.');
    return result.result?.value;
  };
  return { socket, command, evaluate };
}

async function waitForRendererState(browser, expression, predicate, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let latest;
  while (Date.now() < deadline) {
    try {
      latest = await browser.evaluate(expression);
      if (predicate(latest)) return latest;
    } catch (error) {
      // A newly-created Electron target can be visible to the debugger before
      // its DOM and preload contract are ready.
      latest = { error: error.message };
    }
    await wait(100);
  }
  throw new Error(`${label}: ${JSON.stringify(latest)}`);
}

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

function getHTTPS(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.once('error', reject);
  });
}

const fakeServices = await createFakeServices();
const smokeUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-editor-smoke-'));
const smokeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-editor-smoke-home-'));
const officePort = await freePort();
const electronPath = path.join(desktopRoot, 'node_modules', '.bin', 'electron');
const electron = spawn(electronPath, ['.', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${smokeUserData}`], {
  cwd: desktopRoot,
  env: {
    ...process.env,
    IKMAL_DESKTOP_PROXY_URL: `http://127.0.0.1:${fakeServices.port}`,
    IKMAL_DESKTOP_QUALITY_URL: `http://127.0.0.1:${fakeServices.port}/health`,
    IKMAL_DESKTOP_LANGUAGETOOL_URL: `http://127.0.0.1:${fakeServices.port}`,
    IKMAL_MANAGER_BINARY: path.join(desktopRoot, 'missing-smoke-manager'),
    HOME: smokeHome,
    IKMAL_DESKTOP_TEST_HOME: smokeHome,
    IKMAL_OFFICE_BRIDGE_PORT: String(officePort),
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});

try {
  const target = await waitForTarget('/index.html');
  const browser = await connect(target);
  await wait(500);
  const serviceState = await waitForRendererState(browser, `({
    label: document.querySelector('#service-label').textContent,
    startDisabled: document.querySelector('#start-button').disabled,
    languageTool: document.querySelector('#languagetool-status-label').textContent,
    quality: document.querySelector('#quality-status-label').textContent
  })`, (state) => state.label === 'Ready · existing' && state.startDisabled && state.languageTool === 'Ready' && state.quality === 'Ready', 'Existing service state smoke failed');
  const initialCheckingPreferences = await browser.evaluate('window.ikmal.getCheckingPreferences()');
  if (initialCheckingPreferences.mode !== 'automatic' || initialCheckingPreferences.delay !== 700 || !initialCheckingPreferences.categories.grammar) {
    throw new Error(`Initial checking-preferences smoke failed: ${JSON.stringify(initialCheckingPreferences)}`);
  }
  const sensitivityPreferences = await browser.evaluate(`window.ikmal.setCheckingPreferences({
    mode: 'automatic',
    delay: 700,
    sensitivity: 85,
    categories: { grammar: true, repetition: true, style: true, languagetool: true }
  })`);
  const sensitivityPresentation = await browser.evaluate(`(async () => ({
    value: document.querySelector('#checking-sensitivity').value,
    state: (await window.ikmal.getCheckingPreferences()).sensitivity
  }))()`);
  if (sensitivityPreferences.sensitivity !== 85 || sensitivityPresentation.value !== '85' || sensitivityPresentation.state !== 85) {
    throw new Error(`Checking sensitivity persistence smoke failed: ${JSON.stringify({ sensitivityPreferences, sensitivityPresentation })}`);
  }
  const initialPresence = await browser.evaluate('window.ikmal.getDesktopPresence()');
  if (!initialPresence.menubarIcon || initialPresence.dockIcon || initialPresence.dockSupported !== true) {
    throw new Error(`Initial app-presence smoke failed: ${JSON.stringify(initialPresence)}`);
  }
  await browser.evaluate(`(() => {
    const dock = document.querySelector('#dock-toggle');
    dock.checked = true;
    dock.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const dockEnabledByUI = await waitForRendererState(browser, `(async () => ({
    menubar: document.querySelector('#menubar-toggle').checked,
    dock: document.querySelector('#dock-toggle').checked,
    state: await window.ikmal.getDesktopPresence()
  }))()`, (state) => state.menubar && state.dock && state.state.dockIcon, 'Dock-toggle UI smoke failed');
  if (!dockEnabledByUI.state.menubarIcon || !dockEnabledByUI.state.dockIcon) {
    throw new Error(`Dock-toggle UI state was not applied: ${JSON.stringify(dockEnabledByUI)}`);
  }
  await browser.evaluate(`(() => {
    const menubar = document.querySelector('#menubar-toggle');
    menubar.checked = false;
    menubar.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const menubarDisabledByUI = await waitForRendererState(browser, 'window.ikmal.getDesktopPresence()', (state) => !state.menubarIcon && state.dockIcon, 'Menubar-toggle UI smoke failed');
  if (menubarDisabledByUI.menubarIcon || !menubarDisabledByUI.dockIcon) {
    throw new Error(`Menubar-toggle UI state was not applied: ${JSON.stringify(menubarDisabledByUI)}`);
  }
  await browser.evaluate(`(() => {
    const menubar = document.querySelector('#menubar-toggle');
    menubar.checked = true;
    menubar.dispatchEvent(new Event('change', { bubbles: true }));
    const dock = document.querySelector('#dock-toggle');
    dock.checked = false;
    dock.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const restoredPresenceByUI = await waitForRendererState(browser, 'window.ikmal.getDesktopPresence()', (state) => state.menubarIcon && !state.dockIcon, 'App-presence UI restore smoke failed');
  if (!restoredPresenceByUI.menubarIcon || restoredPresenceByUI.dockIcon) {
    throw new Error(`App-presence UI restore was not applied: ${JSON.stringify(restoredPresenceByUI)}`);
  }

  const officeInitial = await browser.evaluate('window.ikmal.getOfficeBridgeState()');
  if (!officeInitial.supported || officeInitial.running || officeInitial.configured) {
    throw new Error(`Office bridge initial state smoke failed: ${JSON.stringify(officeInitial)}`);
  }
  const officeConfigured = await browser.evaluate('window.ikmal.generateOfficeCertificate()');
  if (!officeConfigured.configured || officeConfigured.running || !officeConfigured.keyPath || !officeConfigured.certificatePath) {
    throw new Error(`Office certificate lifecycle smoke failed: ${JSON.stringify(officeConfigured)}`);
  }
  const officeRunning = await browser.evaluate('window.ikmal.startOfficeBridge()');
  if (!officeRunning.running || !officeRunning.url.includes(`:${officePort}/`)) {
    throw new Error(`Office bridge start lifecycle smoke failed: ${JSON.stringify(officeRunning)}`);
  }
  const officeHosts = ['word', 'excel', 'powerpoint', 'outlook', 'onenote', 'project'];
  for (const host of officeHosts) {
    const officePage = await getHTTPS(`https://localhost:${officePort}/office/${host}/`);
    if (officePage.status !== 200 || !officePage.body.includes('office.js')) {
      throw new Error(`Office bridge served an invalid ${host} task pane: ${JSON.stringify({ status: officePage.status, body: officePage.body.slice(0, 120) })}`);
    }
  }
  const officeStopped = await browser.evaluate('window.ikmal.stopOfficeBridge()');
  if (officeStopped.running) throw new Error(`Office bridge stop lifecycle smoke failed: ${JSON.stringify(officeStopped)}`);
  const officeRemoved = await browser.evaluate('window.ikmal.removeOfficeCertificate()');
  if (officeRemoved.configured) throw new Error(`Office certificate removal lifecycle smoke failed: ${JSON.stringify(officeRemoved)}`);

  const desktopPlatform = await browser.evaluate('window.ikmal.platform');
  if (desktopPlatform === 'darwin') {
    const spellInitial = await browser.evaluate('window.ikmal.getSpellServerState()');
    if (!spellInitial.supported || !spellInitial.available || spellInitial.installed) {
      throw new Error(`Native spell-service initial state smoke failed: ${JSON.stringify(spellInitial)}`);
    }
    const spellInstalled = await browser.evaluate('window.ikmal.installSpellServer()');
    if (!spellInstalled.installed || !fs.existsSync(spellInstalled.path)) {
      throw new Error(`Native spell-service install lifecycle smoke failed: ${JSON.stringify(spellInstalled)}`);
    }
    const spellRemoved = await browser.evaluate('window.ikmal.removeSpellServer()');
    if (spellRemoved.installed || fs.existsSync(spellInstalled.path)) {
      throw new Error(`Native spell-service removal lifecycle smoke failed: ${JSON.stringify(spellRemoved)}`);
    }
  }
  const annotationPreferences = await browser.evaluate(`window.ikmal.setAnnotationPreferences({ style: 'dash', palette: 'contrast', intensity: 85 })`);
  await wait(100);
  const annotationPresentation = await browser.evaluate(`({ style: document.documentElement.dataset.annotationStyle, palette: document.documentElement.dataset.annotationPalette, intensity: document.querySelector('#annotation-intensity').value })`);
  if (annotationPreferences.style !== 'dash' || annotationPreferences.palette !== 'contrast' || annotationPreferences.intensity !== 85 || annotationPresentation.style !== 'dash' || annotationPresentation.palette !== 'contrast' || annotationPresentation.intensity !== '85') {
    throw new Error(`Annotation preference smoke failed: ${JSON.stringify({ annotationPreferences, annotationPresentation })}`);
  }
  const guardedPresence = await browser.evaluate('window.ikmal.setDesktopPresence({ menubarIcon: false, dockIcon: false })');
  if (!guardedPresence.dockIcon || !guardedPresence.notice) {
    throw new Error(`App-presence guard smoke failed: ${JSON.stringify(guardedPresence)}`);
  }
  const restoredPresence = await browser.evaluate('window.ikmal.setDesktopPresence({ menubarIcon: true, dockIcon: false })');
  if (!restoredPresence.menubarIcon || restoredPresence.dockIcon) {
    throw new Error(`App-presence restore smoke failed: ${JSON.stringify(restoredPresence)}`);
  }
  await browser.evaluate(`(() => {
    const mode = document.querySelector('#checking-mode');
    mode.value = 'manual';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    const grammar = document.querySelector('#checking-category-grammar');
    grammar.checked = false;
    grammar.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const manualPreferences = await waitForRendererState(browser, `(async () => ({
    mode: document.querySelector('#checking-mode').value,
    grammar: document.querySelector('#checking-category-grammar').checked,
    state: await window.ikmal.getCheckingPreferences()
  }))()`, (state) => state.mode === 'manual' && !state.grammar && state.state.mode === 'manual' && !state.state.categories.grammar, 'Manual checking preference smoke failed');
  await wait(300);
  const requestsBeforeManualInput = fakeServices.requests();
  await browser.evaluate(`(() => {
    const input = document.querySelector('#writing-input');
    input.value = 'The results is ready.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(1000);
  const manualInputState = await browser.evaluate(`({ status: document.querySelector('#writing-status-label').textContent, marks: document.querySelectorAll('#writing-highlights .writing-underline').length })`);
  if (fakeServices.requests() !== requestsBeforeManualInput || manualInputState.status !== 'Ready to check' || manualInputState.marks !== 0) {
    throw new Error(`Manual/category filtering smoke failed: ${JSON.stringify({ requests: fakeServices.requests() - requestsBeforeManualInput, manualInputState, manualPreferences })}`);
  }
  await browser.evaluate(`(() => document.querySelector('#writing-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })))()`);
  await waitForRendererState(browser, `({ status: document.querySelector('#writing-status-label').textContent, marks: document.querySelectorAll('#writing-highlights .writing-underline').length })`, (state) => state.status === 'No issues detected' && state.marks === 0, 'Manual explicit-check smoke failed');
  await browser.evaluate(`(() => {
    const mode = document.querySelector('#checking-mode');
    mode.value = 'automatic';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    const grammar = document.querySelector('#checking-category-grammar');
    grammar.checked = true;
    grammar.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitForRendererState(browser, 'window.ikmal.getCheckingPreferences()', (state) => state.mode === 'automatic' && state.categories.grammar, 'Checking preference restore smoke failed');
  await browser.evaluate(`(() => {
    const input = document.querySelector('#writing-input');
    input.value = 'The slow results is ready.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(800);
  await browser.evaluate(`(() => {
    const input = document.querySelector('#writing-input');
    input.value = 'The fast sentence is ready.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  // Wait past the delayed response from the first request. The second
  // generation must remain authoritative even after that old response lands.
  await wait(2800);
  const currentState = await browser.evaluate(`({
    text: document.querySelector('#writing-input').value,
    status: document.querySelector('#writing-status-label').textContent,
    width: outerWidth
  })`);
  if (currentState.text.trim() !== 'The fast sentence is ready.' || currentState.status !== 'No issues detected' || currentState.width !== 430) {
    throw new Error(`Stale-check smoke failed: ${JSON.stringify(currentState)}`);
  }
  await browser.evaluate(`(() => {
    const input = document.querySelector('#writing-input');
    input.value = 'Plants feed it.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const relationshipMarks = await waitForRendererState(browser, `(() => {
    const marks = [...document.querySelectorAll('#writing-highlights .writing-underline')];
    return { marks: marks.map((mark) => ({ type: mark.dataset.annotationType, classes: mark.className, groups: mark.dataset.annotationGroups })), text: document.querySelector('#writing-input').value };
  })()`, (state) => state.text === 'Plants feed it.' && state.marks.some((mark) => mark.classes.includes('is-antecedent')) && state.marks.some((mark) => mark.classes.includes('is-pronoun')), 'Antecedent highlighting smoke failed');
  await browser.evaluate("document.querySelector('#writing-highlights .is-antecedent').dispatchEvent(new Event('mouseenter', { bubbles: true }))");
  const relationshipTooltip = await waitForRendererState(browser, `({
    tooltip: document.querySelector('#suggestion-popover').textContent,
    open: document.querySelector('#suggestion-popover').classList.contains('is-open'),
    related: document.querySelectorAll('#writing-highlights .is-related-hover').length
  })`, (state) => state.open && state.tooltip.includes('refers to') && state.related >= 2, 'Antecedent tooltip smoke failed');
  if (!relationshipTooltip.open) throw new Error('Antecedent tooltip did not open.');
  const invalidated = await browser.evaluate(`(() => {
    const input = document.querySelector('#writing-input');
    input.value = 'A new prefix. Plants feed it.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      marks: document.querySelectorAll('#writing-highlights .writing-underline').length,
      cards: document.querySelectorAll('#results .result-card').length,
      popoverOpen: document.querySelector('#suggestion-popover').classList.contains('is-open'),
    };
  })()`);
  if (invalidated.marks !== 0 || invalidated.cards !== 0 || invalidated.popoverOpen) {
    throw new Error(`Stale annotation invalidation failed: ${JSON.stringify(invalidated)}`);
  }
  await wait(1000);
  await browser.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });
  await waitForRendererState(browser, `(() => {
    const style = getComputedStyle(document.querySelector('.writing-status-tooltip'));
    return { opacity: style.opacity, pointerEvents: style.pointerEvents };
  })()`, (state) => Number(state.opacity) <= 0.01 && state.pointerEvents === 'none', 'Idle status should be dot-only');

  await browser.evaluate(`(() => {
    const input = document.querySelector('#writing-input');
    input.value = 'The results is ready.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const flagged = await waitForRendererState(browser, `({
    status: document.querySelector('#writing-status-label').textContent,
    actionDisabled: document.querySelector('#writing-status-action').disabled
  })`, (state) => state.status === '1 to review' && !state.actionDisabled, 'Flagged-state smoke failed');
  const statusPoint = await browser.evaluate(`(() => {
    const rect = document.querySelector('#writing-status').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await browser.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: statusPoint.x, y: statusPoint.y });
  const tooltip = await waitForRendererState(browser, `({
    computed: (() => {
      const style = getComputedStyle(document.querySelector('.writing-status-tooltip'));
      return { opacity: style.opacity, visibility: style.visibility, pointerEvents: style.pointerEvents };
    })(),
    text: document.querySelector('#writing-status-label').textContent,
    action: document.querySelector('#writing-status-action').textContent,
    hovered: document.querySelector('#writing-status').matches(':hover'),
    pointElement: document.elementFromPoint(${statusPoint.x}, ${statusPoint.y})?.id || ''
  })`, (state) => Number(state.computed.opacity) >= 0.9 && state.computed.visibility === 'visible' && state.computed.pointerEvents === 'auto' && state.text === '1 to review' && state.action === 'Open suggestions', 'Status-tooltip smoke failed');
  await browser.evaluate("document.querySelector('#writing-status-action').click()");
  await wait(300);
  const expanded = await browser.evaluate(`({
    width: outerWidth,
    expanded: document.querySelector('#writing-panel').classList.contains('suggestions-expanded'),
    action: document.querySelector('#writing-status-action').textContent
  })`);
  if (expanded.width !== 760 || !expanded.expanded || expanded.action !== 'Close suggestions') {
    throw new Error(`Drawer-open smoke failed: ${JSON.stringify(expanded)}`);
  }
  await browser.evaluate("document.querySelector('#writing-status-action').click()");
  await wait(250);
  const collapsed = await browser.evaluate(`({ width: outerWidth, expanded: document.querySelector('#writing-panel').classList.contains('suggestions-expanded') })`);
  if (collapsed.width !== 430 || collapsed.expanded) throw new Error(`Drawer-close smoke failed: ${JSON.stringify(collapsed)}`);

  await browser.evaluate(`(() => {
    const input = document.querySelector('#writing-input');
    input.value = 'A failure should offer clear actions.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitForRendererState(browser, `({
    status: document.querySelector('#writing-status-label').textContent,
    visible: !document.querySelector('#writing-notice').classList.contains('is-hidden'),
    actions: [...document.querySelectorAll('#writing-notice .notice-actions button')].map((button) => button.textContent),
    details: Boolean(document.querySelector('#writing-notice .notice-details'))
  })`, (state) => state.status === 'Check unavailable' && state.visible && state.details && state.actions.join('|') === 'Retry|Keep editing', 'Failure-action smoke failed');
  await browser.evaluate("document.querySelector('#writing-notice .notice-actions button:nth-child(2)').click()");
  await waitForRendererState(browser, `({
    text: document.querySelector('#writing-input').value,
    hidden: document.querySelector('#writing-notice').classList.contains('is-hidden'),
    status: document.querySelector('#writing-status-label').textContent,
  })`, (state) => state.text.trim() === 'A failure should offer clear actions.' && state.hidden && state.status === 'Ready when you are', 'Failure-cancel smoke failed');
  // The settings panel must fit the compact window. A single non-wrapping
  // action row (the six Office manifest buttons plus remove-certificate) was
  // ~1180px wide in a 430px window, which pushed the acknowledgement checkbox
  // and several buttons outside the viewport, where they rendered but could
  // not be clicked. Assert nothing in the panel escapes horizontally, and that
  // the controls a user has to reach are actually hit-testable.
  await browser.evaluate(`[...document.querySelectorAll('.tab')].find((b) => b.textContent.trim() === 'Settings').click()`);
  await wait(600);
  // Each group is checked on its own rather than opening them all at once,
  // because the groups are an accordion: opening one closes the others, so a
  // bulk open would only ever measure the last group.
  const groupIDs = await browser.evaluate(`[...document.querySelectorAll('#settings-panel details.settings-group')].map((d) => d.id)`);
  for (const groupID of groupIDs) {
    await browser.evaluate(`document.getElementById('${groupID}').open = true`);
    await wait(220);
    const openCount = await browser.evaluate(`[...document.querySelectorAll('#settings-panel details.settings-group')].filter((d) => d.open).length`);
    if (openCount !== 1) {
      throw new Error(`Settings groups are not an accordion: ${openCount} open after expanding #${groupID}`);
    }
    const overflow = await browser.evaluate(`(() => {
      const limit = document.documentElement.clientWidth;
      return [...document.querySelectorAll('#settings-panel *')]
        .filter((el) => { const b = el.getBoundingClientRect(); return (b.width || b.height) && (b.right > limit + 1 || b.left < -1); })
        .map((el) => (el.id ? '#' + el.id : el.tagName + '.' + String(el.className).split(' ')[0]) + ':' + Math.round(el.getBoundingClientRect().width) + 'px')
        .slice(0, 8);
    })()`);
    if (overflow.length) {
      throw new Error(`Settings group #${groupID} overflows the compact window: ${overflow.join(', ')}`);
    }
  }
  // The quality install block needs a working manager binary to render, and
  // this run deliberately points at a missing one, so controls with no box are
  // not applicable here rather than broken. Anything that does render must be
  // reachable — the Office manifest row is the one that overflowed.
  for (const controlID of ['configure-integrations', 'refresh-integrations', 'reveal-office-manifest', 'office-manifest-host', 'remove-office-certificate']) {
    const hit = await browser.evaluate(`(() => {
      const el = document.querySelector('#${controlID}');
      if (!el) return 'missing';
      // Groups are an accordion, so the control's own group must be the open
      // one before it can be measured.
      const group = el.closest('details.settings-group');
      if (group && !group.open) group.open = true;
      const box = el.getBoundingClientRect();
      if (!box.width && !box.height) return 'not-rendered';
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      if (!top) return 'offscreen';
      return top === el || el.contains(top) ? 'self' : 'covered by ' + (top.id || top.tagName);
    })()`);
    if (hit !== 'self' && hit !== 'not-rendered') {
      throw new Error(`Settings control #${controlID} is not clickable: ${hit}`);
    }
  }
  await browser.evaluate(`[...document.querySelectorAll('.tab')].find((b) => b.textContent.trim() === 'Quick check').click()`);
  await wait(300);

  await browser.evaluate(`window.ikmal.openEditor('The full editor receives this passage.')`);
  const editorTarget = await waitForTarget('/editor.html');
  const editor = await connect(editorTarget);
  const editorText = await waitForRendererState(editor, `({
    text: document.querySelector('#editor-input').value,
    settings: document.querySelector('#editor-settings-view').classList.contains('is-hidden')
  })`, (state) => state.text === 'The full editor receives this passage.' && state.settings, 'Full-editor launch smoke failed');
  // Reopening the editor with no text — what the tray entry, the dock, and
  // app.on('activate') all do — must not clear whatever is already in it.
  await editor.evaluate(`(() => {
    const input = document.querySelector('#editor-input');
    input.value = 'A draft that must survive reopening.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.evaluate('window.ikmal.openEditor()');
  await wait(500);
  const preservedDraft = await editor.evaluate(`document.querySelector('#editor-input').value`);
  if (preservedDraft !== 'A draft that must survive reopening.') {
    throw new Error(`Reopening the editor discarded the draft: ${JSON.stringify(preservedDraft)}`);
  }

  const editorPresenceBefore = await editor.evaluate('window.ikmal.getDesktopPresence()');
  if (!editorPresenceBefore.menubarIcon || editorPresenceBefore.dockIcon) {
    throw new Error(`Full-editor presence baseline failed: ${JSON.stringify({ editorText, editorPresenceBefore })}`);
  }
  await editor.evaluate(`(() => {
    const dock = document.querySelector('#editor-dock-toggle');
    dock.checked = true;
    dock.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const editorDockEnabled = await waitForRendererState(editor, 'window.ikmal.getDesktopPresence()', (state) => state.menubarIcon && state.dockIcon, 'Full-editor Dock-toggle smoke failed');
  await editor.evaluate(`(() => {
    const menubar = document.querySelector('#editor-menubar-toggle');
    menubar.checked = false;
    menubar.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const editorMenubarDisabled = await waitForRendererState(editor, 'window.ikmal.getDesktopPresence()', (state) => !state.menubarIcon && state.dockIcon, 'Full-editor menubar-toggle smoke failed');
  await editor.evaluate(`(() => {
    const menubar = document.querySelector('#editor-menubar-toggle');
    menubar.checked = true;
    menubar.dispatchEvent(new Event('change', { bubbles: true }));
    const dock = document.querySelector('#editor-dock-toggle');
    dock.checked = false;
    dock.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const editorPresenceRestored = await waitForRendererState(editor, 'window.ikmal.getDesktopPresence()', (state) => state.menubarIcon && !state.dockIcon, 'Full-editor presence restore smoke failed');
  if (!editorDockEnabled.dockIcon || editorMenubarDisabled.menubarIcon || !editorPresenceRestored.menubarIcon || editorPresenceRestored.dockIcon) {
    throw new Error(`Full-editor presence smoke failed: ${JSON.stringify({ editorDockEnabled, editorMenubarDisabled, editorPresenceRestored })}`);
  }
  // A long draft is checked around the caret, and the findings the check never
  // looked at are carried rather than dropped. Both halves matter: chunking
  // without retention would silently delete every finding outside the window.
  await waitForRendererState(
    editor,
    'document.querySelector(\'#editor-check\').disabled',
    (disabled) => disabled === false,
    'Chunked-check smoke started before the previous check settled',
  );
  const filler = Array.from({ length: 40 }, (_, index) =>
    `Middle paragraph ${index} carries enough words that a chunk window centred here cannot reach the ends of the draft.`);
  const longDraft = ['Opening paragraph where the results is wrong.', ...filler, 'Closing paragraph of the draft.'].join('\n\n');

  // The editor's own check path: typing and pressing Check must send a chunk,
  // not the whole draft.
  await editor.evaluate(`(() => {
    const input = document.querySelector('#editor-input');
    input.value = ${JSON.stringify(longDraft)};
    input.setSelectionRange(0, 0);
    document.querySelector('#editor-check').click();
  })()`);
  await waitForRendererState(
    editor,
    `document.querySelector('#editor-suggestion-count').textContent`,
    (count) => count === '1',
    'Chunked-check smoke failed to find the opening finding',
    8000,
  );
  if (!fakeServices.checkTexts().some((text) => text.length < longDraft.length)) {
    throw new Error('The editor sent whole documents; no chunk ever reached the checker.');
  }

  // Retention is asserted through the IPC directly, so the idle whole-document
  // pass the renderer schedules cannot re-derive the finding and hide a
  // regression behind its own timing.
  const before = fakeServices.checkTexts().length;
  const retained = await editor.evaluate(`window.ikmal.checkText(
    ${JSON.stringify(longDraft)} + ' A closing sentence.',
    { caret: ${longDraft.length + 20} }
  )`);
  const sent = fakeServices.checkTexts().slice(before);
  if (!sent.length || sent.some((text) => text.includes('results is'))) {
    throw new Error(`Expected a chunk that never saw the opening paragraph, got ${JSON.stringify(sent.map((text) => text.length))}.`);
  }
  const retainedMessages = (retained.matches || []).map((match) => match.message);
  if (!retainedMessages.some((message) => message.includes('plural subject'))) {
    throw new Error(`A finding outside the rechecked chunk was dropped: ${JSON.stringify(retainedMessages)}`);
  }
  if (!retained.ikmalFullCheckPending) {
    throw new Error('A chunked check must tell the renderer a whole-document pass is still owed.');
  }

  editor.socket.close();
  browser.socket.close();
  console.log('Electron smoke passed: service state, Office bridge/certificate lifecycle, native spell-service lifecycle, compact/full-editor presence, stale responses, status tooltips, drawer geometry, failure actions, and chunked checks with retained findings.');
} finally {
  if (electron.exitCode === null && !electron.killed) {
    electron.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => electron.once('exit', resolve)),
      wait(2000),
    ]);
  }
  await new Promise((resolve) => fakeServices.server.close(resolve));
  fs.rmSync(smokeUserData, { recursive: true, force: true });
  fs.rmSync(smokeHome, { recursive: true, force: true });
}
