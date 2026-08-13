import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const packagedExecutable = process.env.IKMAL_REWRITE_SMOKE_EXECUTABLE || '';
const packagedSmoke = Boolean(packagedExecutable);

async function availableDebugPort(requested) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    const fallback = () => {
      const dynamic = net.createServer();
      dynamic.once('error', reject);
      dynamic.listen(0, '127.0.0.1', () => {
        const port = dynamic.address().port;
        dynamic.close(() => resolve(port));
      });
    };
    probe.once('error', () => { probe.close(); fallback(); });
    probe.listen(requested, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

const debugPort = await availableDebugPort(Number(process.env.IKMAL_REWRITE_SMOKE_DEBUG_PORT || 0));

const fakeServices = await new Promise((resolve, reject) => {
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
      let body = '';
      for await (const chunk of request) body += chunk;
      const text = new URLSearchParams(body).get('text') || '';
      if (text.includes('failure')) {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'temporary test failure' }));
        return;
      }
      const offset = text.indexOf('is');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        matches: offset < 0 ? [] : [{
          message: 'Use “are” with the plural subject.',
          replacements: [{ value: 'are' }],
          offset,
          length: 2,
          rule: { id: 'BE_PLURAL', category: { id: 'GRAMMAR' } },
        }],
      }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
});

async function targets() {
  return (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json());
}

async function waitForTarget(predicate, label) {
  const deadline = Date.now() + 10000;
  let latest = [];
  while (Date.now() < deadline) {
    try {
      latest = await targets();
      const target = latest.find((entry) => entry.type === 'page' && predicate(entry));
      if (target) return target;
    } catch (_) {
      // Electron is still starting.
    }
    await wait(100);
  }
  throw new Error(`${label}: ${latest.map((entry) => entry.url).join(', ')}`);
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
    resolve(message);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextID;
    pending.set(id, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed.');
    return result.result?.value;
  };
  return { socket, command, evaluate };
}

async function waitForState(browser, expression, predicate, label) {
  const deadline = Date.now() + 7000;
  let latest;
  while (Date.now() < deadline) {
    try {
      latest = await browser.evaluate(expression);
      if (predicate(latest)) return latest;
    } catch (error) {
      latest = { error: error.message };
    }
    await wait(100);
  }
  throw new Error(`${label}: ${JSON.stringify(latest)}`);
}

const smokeUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-editor-rewrite-smoke-'));
const electronPath = packagedExecutable || path.join(desktopRoot, 'node_modules', '.bin', 'electron');
const launchArgs = packagedSmoke
  ? [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${smokeUserData}`]
  : ['.', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${smokeUserData}`];
const electron = spawn(electronPath, launchArgs, {
  cwd: packagedSmoke ? path.dirname(electronPath) : desktopRoot,
  env: {
    ...process.env,
    IKMAL_DESKTOP_REWRITE_SLICE: '1',
    ...(packagedSmoke ? { IKMAL_DESKTOP_PACKAGED: '1' } : {}),
    IKMAL_DESKTOP_PROXY_URL: `http://127.0.0.1:${fakeServices.port}`,
    IKMAL_DESKTOP_QUALITY_URL: `http://127.0.0.1:${fakeServices.port}/health`,
    IKMAL_DESKTOP_LANGUAGETOOL_URL: `http://127.0.0.1:${fakeServices.port}`,
    IKMAL_MANAGER_BINARY: path.join(desktopRoot, 'missing-rewrite-smoke-manager'),
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});

let compact;
let editor;
try {
  // With the rewrite slice on, the compact window is the launcher in
  // apps/desktop-compact; with it off it is the legacy renderer. Both are
  // accepted so this smoke describes whichever one is under test.
  compact = await connect(await waitForTarget((entry) => entry.url.endsWith('/desktop/index.html')
    || entry.url.includes('/desktop-compact/index.html')
    || (packagedSmoke && entry.url.includes('/app.asar/index.html')), 'compact target'));

  // The launcher is a launcher. It carries quick check, service status, focus
  // modes and a route into the editor — and no settings, because settings live
  // in the editor and a second copy here is the duplication being removed.
  const launcher = await compact.evaluate(`(() => ({
    surface: Object.keys(window.ikmal || {}).sort(),
    settingsGroups: document.querySelectorAll('.cnt-acc-item, .settings-group').length,
    hasQuickCheck: Boolean(document.querySelector('#quick-input')),
    hasModes: Boolean(document.querySelector('#modes')),
    hasServices: Boolean(document.querySelector('#services')),
  }))()`);
  if (launcher.hasQuickCheck) {
    if (launcher.settingsGroups !== 0) {
      throw new Error(`The launcher grew ${launcher.settingsGroups} settings groups; settings belong in the editor.`);
    }
    if (!launcher.hasModes || !launcher.hasServices) {
      throw new Error(`Launcher is missing its own surfaces: ${JSON.stringify(launcher)}`);
    }
    // A launcher that could reach settings capabilities would invite the copy
    // this phase exists to prevent, so the surface is asserted, not assumed.
    const forbidden = launcher.surface.filter((name) => /Quality|StyleGuide|Office|SpellServer|Integration|Annotation/i.test(name));
    if (forbidden.length) throw new Error(`Launcher preload exposes settings capabilities: ${forbidden.join(', ')}`);
  }

  await compact.evaluate("window.ikmal.openEditor('The results is ready.')");
  editor = await connect(await waitForTarget((entry) => entry.url.includes('/apps/desktop-editor/index.html') || (packagedSmoke && entry.url.includes('/Resources/desktop-editor/index.html')), 'fresh editor target'));
  await waitForState(editor, "Boolean(document.querySelector('#editor-input') && document.querySelector('#indicator-anchor')?.shadowRoot)", Boolean, 'Fresh renderer did not mount');
  const preloadSurface = await editor.evaluate("Object.keys(window.ikmal || {}).sort()");
  // The fresh renderer must receive its own narrow preload rather than the
  // legacy app's. What matters is that nothing outside this set reaches it; an
  // exact match instead failed the moment the slice gained the dictionary
  // capability its popover legitimately offers, which is how it came to be
  // wrong rather than protective.
  // Writing plus settings, because settings live in this window and nowhere
  // else. The property is still boundedness: an intentional surface, not the
  // legacy 55 handed over wholesale. Anything outside this list fails.
  const allowedPreload = [
    'addDictionaryWord', 'checkText', 'onEditorText',
    'getCheckingPreferences', 'setCheckingPreferences',
    'getAnnotationPreferences', 'setAnnotationPreferences',
    'getDesktopPresence', 'setDesktopPresence',
    'getLaunchAtLogin', 'setLaunchAtLogin',
    'getStyleGuideState', 'importStyleGuide', 'selectStyleGuide', 'setStyleGuideEnabled',
    'getServiceState', 'startServices', 'stopServices', 'onServiceState',
    'getRecentChecks', 'clearRecentChecks', 'openThirdPartyNotices',
    'getIntegrationStatus', 'configureIntegrations',
    'getSpellServerState', 'installSpellServer', 'removeSpellServer',
    'getOfficeBridgeState', 'generateOfficeCertificate', 'removeOfficeCertificate',
    'startOfficeBridge', 'stopOfficeBridge', 'revealOfficeManifest',
    'getQualityStatus', 'installQualityStack', 'revealExtension',
    'getAppVersion',
  ];
  const unexpectedPreload = preloadSurface.filter((key) => !allowedPreload.includes(key));
  if (unexpectedPreload.length || !preloadSurface.includes('checkText')) {
    throw new Error(`Fresh renderer received an unexpected preload surface: ${JSON.stringify(preloadSurface)}`);
  }

  const initial = await waitForState(editor, `({
    text: document.querySelector('#editor-input').value,
    revision: document.querySelector('#revision').textContent,
    status: document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').dataset.status,
    shadow: Boolean(document.querySelector('#indicator-anchor').shadowRoot)
  })`, (state) => state.text === 'The results is ready.' && state.shadow, 'Fresh renderer did not receive preload editor text');
  if (initial.text !== 'The results is ready.' || !initial.shadow) throw new Error(`Fresh renderer initial state failed: ${JSON.stringify(initial)}`);

  await editor.evaluate(`(() => {
    const input = document.querySelector('#editor-input');
    input.setSelectionRange(0, 14);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const flagged = await waitForState(editor, `({
    text: document.querySelector('#editor-input').value,
    status: document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').dataset.status,
    count: document.querySelector('#indicator-anchor').shadowRoot.querySelector('.count')?.textContent || '',
    indicatorLabel: document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').getAttribute('aria-label'),
    popover: !document.querySelector('#issue-popover').hidden,
    revision: document.querySelector('#revision').textContent
  })`, (state) => state.status === 'issues' && state.count === '1' && state.popover && state.revision === 'Revision 1', 'Fresh renderer check failed');
  if (flagged.text !== 'The results is ready.' || flagged.indicatorLabel !== '1 issue') throw new Error(`Fresh renderer accessibility state failed: ${JSON.stringify(flagged)}`);

  await editor.command('Accessibility.enable');
  const accessibilityTree = await editor.command('Accessibility.getFullAXTree');
  const accessibilityNodes = accessibilityTree.nodes.map((node) => ({
    role: node.role?.value || '',
    name: node.name?.value || '',
  }));
  const hasAccessibleNode = (role, name) => accessibilityNodes.some((node) => node.role === role && node.name === name);
  for (const [role, name] of [['textbox', 'Draft'], ['button', '1 issue'], ['dialog', 'Writing issue'], ['button', 'Apply'], ['button', 'Ignore']]) {
    if (!hasAccessibleNode(role, name)) throw new Error(`Fresh renderer AX tree is missing ${role} ${JSON.stringify(name)}: ${JSON.stringify(accessibilityNodes)}`);
  }

  const focusState = await editor.evaluate(`(() => {
    const apply = document.querySelector('#issue-popover [data-action=apply]');
    apply.focus();
    return { focusedAction: document.activeElement?.dataset.action || '', indicatorLabel: document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').getAttribute('aria-label') };
  })()`);
  if (focusState.focusedAction !== 'apply' || focusState.indicatorLabel !== '1 issue') throw new Error(`Desktop keyboard focus/accessibility failed: ${JSON.stringify(focusState)}`);
  const desktopTabOrder = [focusState.focusedAction];
  await editor.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await editor.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  desktopTabOrder.push(await editor.evaluate("document.querySelector('#issue-popover').querySelector('[data-action]:focus')?.dataset.action || ''"));
  if (desktopTabOrder.join('|') !== 'apply|ignore') throw new Error(`Desktop popover Tab order failed: ${JSON.stringify(desktopTabOrder)}`);

  const screenshot = await editor.command('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(desktopRoot, '..', 'bin', 'desktop-rewrite-smoke.png'), Buffer.from(screenshot.data, 'base64'));
  await editor.evaluate("document.documentElement.dataset.theme = 'light'");
  await editor.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const lightScreenshot = await editor.command('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(desktopRoot, '..', 'bin', 'desktop-rewrite-smoke-light.png'), Buffer.from(lightScreenshot.data, 'base64'));
  const lightButtonStyles = await editor.evaluate(`(() => {
    const button = document.querySelector('#check');
    const action = document.querySelector('#issue-popover [data-action]');
    const read = (element) => { const style = getComputedStyle(element); return { background: style.backgroundColor, color: style.color, colorScheme: style.colorScheme }; };
    return { check: read(button), action: read(action) };
  })()`);
  await editor.evaluate("Object.assign(document.documentElement.dataset, { theme: 'dark', density: 'compact', contrast: 'high', palette: 'bathymetric' })");
  await editor.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const compactScreenshot = await editor.command('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(desktopRoot, '..', 'bin', 'desktop-rewrite-smoke-dark-compact.png'), Buffer.from(compactScreenshot.data, 'base64'));
  const compactVisual = await editor.evaluate(`(() => {
    const indicator = document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator');
    const popover = document.querySelector('#issue-popover .writing-issue-popover');
    const indicatorStyle = getComputedStyle(indicator);
    const popoverStyle = getComputedStyle(popover);
    return {
      density: document.documentElement.dataset.density,
      contrast: document.documentElement.dataset.contrast,
      palette: document.documentElement.dataset.palette,
      indicatorAccent: indicatorStyle.getPropertyValue('--accent').trim(),
      popoverAccent: popoverStyle.getPropertyValue('--accent').trim(),
      popoverPadding: popoverStyle.padding,
      indicatorLabel: indicator.getAttribute('aria-label'),
    };
  })()`);
  if (compactVisual.density !== 'compact' || compactVisual.contrast !== 'high' || compactVisual.palette !== 'bathymetric'
    || compactVisual.indicatorAccent !== '#34c6c0' || compactVisual.popoverAccent !== '#34c6c0' || compactVisual.popoverPadding !== '10px') {
    throw new Error(`Desktop compact/high-contrast/bathymetric visual state failed: ${JSON.stringify(compactVisual)}`);
  }
  await editor.evaluate("document.documentElement.dataset.theme = 'dark'; delete document.documentElement.dataset.density; delete document.documentElement.dataset.contrast; delete document.documentElement.dataset.palette");
  const dismissed = await editor.evaluate(`(() => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true });
    const dispatched = document.dispatchEvent(event);
    return { hidden: document.querySelector('#issue-popover').hidden, focus: document.querySelector('#indicator-anchor').shadowRoot.activeElement?.className || '', key: event.key, dispatched };
  })()`);
  if (!dismissed.hidden || dismissed.focus !== 'indicator') throw new Error(`Desktop Escape dismissal failed: ${JSON.stringify(dismissed)}`);
  await editor.evaluate("document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').click()");
  await waitForState(editor, "!document.querySelector('#issue-popover').hidden", Boolean, 'Desktop popover reopen failed');

  await editor.evaluate("document.querySelector('#issue-popover [data-action=apply]').click()");
  const applied = await waitForState(editor, `({
    text: document.querySelector('#editor-input').value,
    status: document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').dataset.status,
    popover: document.querySelector('#issue-popover').hidden
  })`, (state) => state.text === 'The results are ready.' && state.status === 'clean' && state.popover, 'Fresh renderer Apply failed');

  await editor.evaluate(`(() => {
    const input = document.querySelector('#editor-input');
    input.value = 'The results is ready.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitForState(editor, "document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').dataset.status", (state) => state === 'issues', 'Desktop Ignore setup failed');
  await editor.evaluate("document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').click(); document.querySelector('#issue-popover [data-action=ignore]').click()");
  const ignored = await editor.evaluate(`({ text: document.querySelector('#editor-input').value, hidden: document.querySelector('#issue-popover').hidden })`);
  if (ignored.text !== 'The results is ready.' || !ignored.hidden) throw new Error(`Desktop Ignore failed: ${JSON.stringify(ignored)}`);

  await editor.evaluate(`(() => {
    const input = document.querySelector('#editor-input');
    input.value = 'A failure should show unavailable.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const unavailable = await waitForState(editor, "({ status: document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').dataset.status, label: document.querySelector('#service-status').textContent })", (state) => state.status === 'unavailable' && state.label === 'Local checker unavailable', 'Desktop unavailable-service state failed');
  console.log(`Desktop rewrite smoke passed: minimal preload surface, preload text handoff, selected-range Apply, Ignore, unavailable service, Shadow DOM indicator, Chromium AX tree, and theme captures (${JSON.stringify({ preloadSurface, applied, ignored, unavailable, lightButtonStyles, compactVisual })}).`);
} finally {
  if (editor) editor.socket.close();
  if (compact) compact.socket.close();
  if (electron.exitCode === null && !electron.killed) {
    electron.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => electron.once('exit', resolve)), wait(2000)]);
  }
  await new Promise((resolve) => fakeServices.server.close(resolve));
  fs.rmSync(smokeUserData, { recursive: true, force: true });
}
