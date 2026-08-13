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
  const compactTarget = await waitForTarget((entry) => entry.url.endsWith('/desktop/index.html')
    || entry.url.includes('/desktop-compact/index.html')
    || (packagedSmoke && entry.url.includes('/app.asar/index.html')), 'compact target');
  compact = await connect(compactTarget);
  // Whether this is the launcher is decided by which page loaded, not by
  // whether its DOM has appeared yet. Deriving it from a selector meant every
  // check below was skipped whenever the evaluate landed before the page was
  // ready — which it did, silently, so none of them were running at all.
  const isLauncher = compactTarget.url.includes('/desktop-compact/index.html')
    || (packagedSmoke && compactTarget.url.includes('/app.asar/index.html'));
  if (isLauncher) {
    await waitForState(compact, "Boolean(document.querySelector('#quick-input') && document.querySelector('#modes') && document.querySelector('.launcher-foot'))",
      Boolean, 'Launcher did not mount');
  }

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
  if (isLauncher) {
    if (launcher.settingsGroups !== 0) {
      throw new Error(`The launcher grew ${launcher.settingsGroups} settings groups; settings belong in the editor.`);
    }
    // Services are reported by exception. Two permanent rows naming LanguageTool
    // and the quality checks put our architecture on the surface a writer looks
    // at to check a sentence — which of two local services answered is not
    // something they chose or can act on. The fake shell here answers both
    // health checks, so the section must be showing nothing at all.
    const serviceReporting = await compact.evaluate(`(() => {
      const section = document.querySelector('#services');
      return JSON.stringify({ hidden: section.hidden, text: section.textContent.trim() });
    })()`);
    const reporting = JSON.parse(serviceReporting);
    if (!reporting.hidden || reporting.text) {
      throw new Error(`The launcher reports healthy services it should stay quiet about: ${serviceReporting}`);
    }

    if (!launcher.hasModes || !launcher.hasServices) {
      throw new Error(`Launcher is missing its own surfaces: ${JSON.stringify(launcher)}`);
    }
    // A launcher that could reach settings capabilities would invite the copy
    // this phase exists to prevent, so the surface is asserted, not assumed.
    const forbidden = launcher.surface.filter((name) => /Quality|StyleGuide|Office|SpellServer|Integration|Annotation/i.test(name));
    if (forbidden.length) throw new Error(`Launcher preload exposes settings capabilities: ${forbidden.join(', ')}`);

    // The launcher underlines findings in its own field. The legacy compact
    // window did, the rewrite did not, and it was the one gap E1 left open —
    // this window has no room for a list beside the field, so the marks are the
    // whole of its in-text feedback. Checked with the geometry, because an
    // overlay that does not lay text out exactly like its field puts marks under
    // the wrong words while still looking plausible.
    const launcherMarks = await compact.evaluate(`(async () => {
      const input = document.querySelector('#quick-input');
      input.value = 'The results is wrong.';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const layer = document.querySelector('#quick-marks');
      const marks = [...layer.querySelectorAll('.writing-underline')];
      const PROPS = ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'paddingTop',
        'paddingLeft', 'borderTopWidth', 'whiteSpace', 'overflowWrap', 'boxSizing'];
      const a = getComputedStyle(input);
      const b = getComputedStyle(layer);
      return JSON.stringify({
        marked: marks.map((mark) => mark.textContent),
        differing: PROPS.filter((name) => a[name] !== b[name]),
        heightGap: Math.abs(input.scrollHeight - layer.scrollHeight),
        hidden: layer.getAttribute('aria-hidden'),
        focusable: layer.innerHTML.includes('tabindex'),
      });
    })()`);
    const marksState = JSON.parse(launcherMarks);
    if (!marksState.marked.includes('is')) {
      throw new Error(`The launcher did not mark its own findings: ${launcherMarks}`);
    }
    if (marksState.differing.length || marksState.heightGap > 0.5) {
      throw new Error(`The launcher's mark overlay does not match its field: ${launcherMarks}`);
    }
    if (marksState.hidden !== 'true' || marksState.focusable) {
      throw new Error(`The launcher's mark overlay is announced or focusable: ${launcherMarks}`);
    }

    // The two ways out of this window must be on screen, whatever it is
    // showing. They were not: the body set a height and a padding without
    // border-box, so it stood 32px taller than the window in every state and
    // the footer hung below the bottom edge — in the empty state as much as the
    // full one. The middle row is the only thing allowed to scroll.
    const layout = await compact.evaluate(`(() => {
      const foot = document.querySelector('.launcher-foot');
      const body = document.querySelector('.launcher-body');
      const footBox = foot.getBoundingClientRect();
      const lastVisible = [...body.children].filter((child) => !child.hidden).pop();
      return {
        footBottom: Math.round(footBox.bottom),
        viewport: innerHeight,
        documentOverflow: Math.round(document.documentElement.scrollHeight - innerHeight),
        middleIsScroller: getComputedStyle(body).overflowY === 'auto',
        borderBox: getComputedStyle(document.body).boxSizing,
        // Space between the last thing shown and the buttons. A window sized to
        // its content holds this at the layout gap; a fixed one grows a void.
        gapBeforeFoot: lastVisible ? Math.round(footBox.top - lastVisible.getBoundingClientRect().bottom) : 0,
      };
    })()`);
    if (layout.borderBox !== 'border-box') throw new Error(`The launcher body is ${layout.borderBox}, so its padding is added outside its height.`);
    if (layout.footBottom > layout.viewport + 1) {
      throw new Error(`The launcher footer ends ${layout.footBottom - layout.viewport}px below the window, so the ways out are cut off.`);
    }
    if (layout.documentOverflow > 1) throw new Error(`The launcher page scrolls by ${layout.documentOverflow}px; only the middle row may scroll.`);
    if (!layout.middleIsScroller) throw new Error('The launcher middle row is not the scrolling region, so tall content pushes the footer out of reach.');
    // Generous, because it is catching a void rather than policing spacing: the
    // fixed-height window left 165px here with nothing to report.
    if (layout.gapBeforeFoot > 96) {
      throw new Error(`The launcher leaves ${layout.gapBeforeFoot}px of empty space above its buttons, which reads as something failing to load.`);
    }

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
    'revealExtension', 'openCompact',
    'getAppVersion',
    // Listening to what the shell already broadcasts. Not new powers — every
    // channel was already in the contract and already being sent — this is the
    // end of the shell talking to nobody.
    'onServiceError', 'onCheckingPreferences', 'onAnnotationPreferences', 'onShowHistory',
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
    marked: [...document.querySelectorAll('#editor-marks .writing-underline')].map((mark) => mark.textContent).join('|'),
    popover: !document.querySelector('#issue-popover').hidden,
    revision: document.querySelector('#revision').textContent
    // The count is asserted through the accessible name rather than the badge.
    // The badge is only the number the label is missing, and the core's label
    // here already counts — asserting the badge encoded the behaviour that put
    // "1 issue 1" on screen, so the premise was corrected rather than the
    // assertion worked around.
    //
    // What proves the finding reached the writer is the mark on the words, not
    // an open card. This asserted the card because the card used to be the only
    // surface a finding had; now the marks are, and the card is what the writer
    // asks for by pointing at one. Opening it on every check would drop a panel
    // over the sentence being typed, because a check runs 350ms after each
    // keystroke — so the card is asserted closed here, and opened on demand
    // below.
  })`, (state) => state.status === 'issues' && /\b1\b/.test(state.indicatorLabel || '') && state.marked === 'is' && !state.popover && state.revision === 'Revision 1', 'Fresh renderer check failed');
  if (flagged.text !== 'The results is ready.' || flagged.indicatorLabel !== '1 issue') throw new Error(`Fresh renderer accessibility state failed: ${JSON.stringify(flagged)}`);

  // Pointing at a mark surfaces the finding it belongs to — in whichever way
  // the layout surfaces findings. Both are asserted, because both ship and the
  // default changed once already: this checked only the card, from when the
  // card was the only layout there was.
  //
  // In the sidebar the mark selects its row, and a card would be the same
  // finding twice with one copy covering the words it describes. In the panel
  // the card opens anchored to the mark.
  const pointed = await editor.evaluate(`(async () => {
    const { applyAnnotationPreferences } = await import('./marks.js');
    const results = {};
    for (const layout of ['sidebar', 'panel']) {
      const stored = await window.ikmal.setAnnotationPreferences({ ...(await window.ikmal.getAnnotationPreferences()), layout });
      applyAnnotationPreferences(document.documentElement, stored);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const mark = document.querySelector('#editor-marks .writing-underline[data-issue-id]');
      mark.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const card = document.querySelector('#issue-popover');
      const cardRect = card.getBoundingClientRect();
      const markRect = mark.getBoundingClientRect();
      const row = document.querySelector('#review-sidebar .writing-review-row[aria-current="true"]');
      results[layout] = {
        storedLayout: stored.layout,
        cardOpen: !card.hidden,
        anchored: card.dataset.anchored || '',
        describesTheMark: card.textContent.includes(mark.textContent),
        coversItsOwnMark: !card.hidden && !(cardRect.bottom <= markRect.top || cardRect.top >= markRect.bottom),
        rowSelected: Boolean(row),
        rowDescribesTheMark: Boolean(row && row.textContent.includes(mark.textContent)),
        markActive: mark.classList.contains('is-active'),
      };
    }
    return JSON.stringify(results);
  })()`);
  const pointedState = JSON.parse(pointed);
  const side = pointedState.sidebar;
  const panel = pointedState.panel;
  if (side.storedLayout !== 'sidebar' || !side.rowSelected || !side.rowDescribesTheMark || !side.markActive || side.cardOpen) {
    throw new Error(`Pointing at a mark did not select its row in the sidebar layout: ${JSON.stringify(side)}`);
  }
  if (panel.storedLayout !== 'panel' || !panel.cardOpen || panel.anchored !== 'mark' || !panel.describesTheMark || panel.coversItsOwnMark) {
    throw new Error(`Pointing at a mark did not open the card it describes in the panel layout: ${JSON.stringify(panel)}`);
  }
  // Back to the shipped default, so nothing later in this run sees the panel.
  await editor.evaluate(`(async () => {
    const { applyAnnotationPreferences } = await import('./marks.js');
    applyAnnotationPreferences(document.documentElement, await window.ikmal.setAnnotationPreferences({ ...(await window.ikmal.getAnnotationPreferences()), layout: 'sidebar' }));
  })()`);

  await editor.command('Accessibility.enable');
  const accessibilityTree = await editor.command('Accessibility.getFullAXTree');
  const accessibilityNodes = accessibilityTree.nodes.map((node) => ({
    role: node.role?.value || '',
    name: node.name?.value || '',
  }));
  const hasAccessibleNode = (role, name) => accessibilityNodes.some((node) => node.role === role && node.name === name);
  // A finding has to be announced in whichever layout is showing. This asserted
  // the card's dialog, from when the card was the only layout there was; the
  // default is the sidebar now, where the finding is a named, selectable option
  // in a list. Both are checked below — the panel's dialog by switching to it —
  // so neither layout can lose its accessible path silently.
  for (const [role, name] of [['textbox', 'Draft'], ['button', '1 issue'], ['listbox', 'Findings'], ['button', 'Apply'], ['button', 'Ignore']]) {
    if (!hasAccessibleNode(role, name)) throw new Error(`Fresh renderer AX tree is missing ${role} ${JSON.stringify(name)}: ${JSON.stringify(accessibilityNodes)}`);
  }

  // The panel layout's own accessible path, checked by switching to it rather
  // than assumed from the sidebar's.
  await editor.evaluate(`(async () => {
    const { applyAnnotationPreferences } = await import('./marks.js');
    applyAnnotationPreferences(document.documentElement, await window.ikmal.setAnnotationPreferences({ ...(await window.ikmal.getAnnotationPreferences()), layout: 'panel' }));
    document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').click();
  })()`);
  const panelTree = await editor.command('Accessibility.getFullAXTree');
  const panelNodes = panelTree.nodes.map((node) => ({ role: node.role?.value || '', name: node.name?.value || '' }));
  if (!panelNodes.some((node) => node.role === 'dialog' && node.name === 'Writing issue')) {
    throw new Error(`The panel layout exposes no "Writing issue" dialog: ${JSON.stringify(panelNodes.slice(0, 24))}`);
  }

  // Apply is wherever the layout puts it: the card in the panel, the selected
  // row in the sidebar. Asserted through the action rather than the container,
  // so the tab order is checked in whichever layout is showing.
  const focusState = await editor.evaluate(`(() => {
    const apply = document.querySelector('[data-action=apply]');
    apply.focus();
    return { focusedAction: document.activeElement?.dataset.action || '', indicatorLabel: document.querySelector('#indicator-anchor').shadowRoot.querySelector('.indicator').getAttribute('aria-label') };
  })()`);
  if (focusState.focusedAction !== 'apply' || focusState.indicatorLabel !== '1 issue') throw new Error(`Desktop keyboard focus/accessibility failed: ${JSON.stringify(focusState)}`);
  const desktopTabOrder = [focusState.focusedAction];
  await editor.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await editor.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  desktopTabOrder.push(await editor.evaluate("document.querySelector('[data-action]:focus')?.dataset.action || ''"));
  if (desktopTabOrder.join('|') !== 'apply|ignore') throw new Error(`Desktop popover Tab order failed: ${JSON.stringify(desktopTabOrder)}`);

  const screenshot = await editor.command('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(desktopRoot, '..', 'bin', 'desktop-rewrite-smoke.png'), Buffer.from(screenshot.data, 'base64'));
  await editor.evaluate("document.documentElement.dataset.theme = 'light'");
  await editor.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const lightScreenshot = await editor.command('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(desktopRoot, '..', 'bin', 'desktop-rewrite-smoke-light.png'), Buffer.from(lightScreenshot.data, 'base64'));
  const lightButtonStyles = await editor.evaluate(`(() => {
    const button = document.querySelector('#check');
    const action = document.querySelector('[data-action]');
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
