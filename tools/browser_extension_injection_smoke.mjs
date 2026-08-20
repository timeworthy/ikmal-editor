#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extensionLaunchOptions, focusUntilMounted, loadChromium, loadUnpackedExtension, resolveChromium } from './chromium_launch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'bin', 'browser-extension');
const chromium = await loadChromium();
const { executablePath: browserPath, source: browserSource } = resolveChromium(chromium);
execFileSync(process.execPath, [path.join(root, 'tools', 'package_browser_rewrite.mjs')], { stdio: 'inherit' });

const fixtureServer = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const file = path.resolve(root, `.${requestPath}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403); response.end(); return; }
  try {
    const body = fs.readFileSync(file);
    response.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' });
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve, reject) => { fixtureServer.once('error', reject); fixtureServer.listen(0, '127.0.0.1', resolve); });
const fixturePort = fixtureServer.address().port;

let checkerRequests = 0;
const checkerServer = http.createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/v2/check') { response.writeHead(404); response.end(); return; }
  checkerRequests += 1;
  let body = '';
  for await (const chunk of request) body += chunk;
  const text = new URLSearchParams(body).get('text') || '';
  const offset = text.indexOf('teh');
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ matches: offset < 0 ? [] : [{ offset, length: 3, message: 'Use the correct spelling.', replacements: [{ value: 'the' }], actionability: 'review-first', rule: { id: 'SPELL', category: { id: 'SPELLING' } }, ikmalSource: 'quality-sidecar' }] }));
});
let checker = checkerServer;
let checkerSource = 'fixture';
let checkerPort = 8096;
try {
  await new Promise((resolve, reject) => { checkerServer.once('error', reject); checkerServer.listen(8096, '127.0.0.1', resolve); });
} catch (error) {
  if (error.code !== 'EADDRINUSE') throw error;
  await new Promise((resolve, reject) => {
    checkerServer.once('error', reject);
    checkerServer.listen(0, '127.0.0.1', resolve);
  });
  checkerPort = checkerServer.address().port;
  checkerSource = `isolated fixture on loopback port ${checkerPort}`;
  const backgroundPath = path.join(packageDir, 'background.js');
  const background = fs.readFileSync(backgroundPath, 'utf8');
  fs.writeFileSync(backgroundPath, background.replace('http://127.0.0.1:8096/v2/check', `http://127.0.0.1:${checkerPort}/v2/check`));
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-browser-extension-smoke-'));
let context;
let darkPage;
async function waitForServiceWorker(browserContext) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const worker = browserContext.serviceWorkers().find((candidate) => candidate.url().startsWith('chrome-extension://'));
    if (worker) return worker;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for MV3 service worker. Known workers: ${browserContext.serviceWorkers().map((candidate) => candidate.url()).join(', ')}`);
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
  if (manifest.name !== 'ikmal editor rewrite (browser slice)') throw new Error(`Unexpected MV3 service worker: ${manifest.name}`);

  const page = context.pages()[0] || await context.newPage();
  const pageErrors = [];
  const httpRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => { if (/^https?:/.test(request.url())) httpRequests.push(request.url()); });
  await page.goto(`http://127.0.0.1:${fixturePort}/apps/browser-extension/test/fixture.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  const frameIndicatorCount = await page.evaluate(() => document.querySelector('#embedded')?.contentDocument?.querySelectorAll('#ikmal-rewrite-indicator').length || 0);
  if (frameIndicatorCount !== 0) throw new Error(`MV3 all_frames isolation failed: ${frameIndicatorCount} frame indicators`);
  const field = page.locator('#editor');
  const indicator = page.locator('#ikmal-rewrite-indicator');
  // The extension mounts on focus, so focusing once and waiting races its
  // start-up: a focus delivered too early is missed rather than queued.
  await focusUntilMounted(page, field, '#ikmal-rewrite-indicator');
  await page.waitForFunction(() => document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status !== 'checking', null, { timeout: 7000 });
  await field.fill('teh');
  await page.waitForFunction(() => document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status === 'issues', null, { timeout: 7000 });
  // The badge belongs to the field it describes, not to the corner of the
  // window. It was pinned to the viewport, which says nothing about which field
  // it is for and floats over unrelated content once the field scrolls away.
  const anchored = await page.evaluate(() => {
    const host = document.querySelector('#ikmal-rewrite-indicator');
    const field = document.querySelector('#editor');
    const badge = host.getBoundingClientRect();
    const box = field.getBoundingClientRect();
    return {
      insideField: badge.right <= box.right + 1 && badge.bottom <= box.bottom + 1
        && badge.left >= box.left - 1 && badge.top >= box.top - 1,
      nearBottomRight: (box.right - badge.right) < 24 && (box.bottom - badge.bottom) < 24,
      fixed: getComputedStyle(host).position === 'fixed',
    };
  });
  if (!anchored.insideField || !anchored.nearBottomRight || !anchored.fixed) {
    throw new Error(`The indicator is not anchored to its field: ${JSON.stringify(anchored)}`);
  }

  // The card belongs beside its badge, for the same reason the badge belongs on
  // its field: pinned to the viewport it is a card about a sentence, floating
  // over whatever else the page has down there.
  await page.locator('#ikmal-rewrite-indicator').click();
  await page.locator('#ikmal-rewrite-popover').waitFor({ state: 'attached', timeout: 3000 });
  const cardAnchored = await page.evaluate(() => {
    const card = document.querySelector('#ikmal-rewrite-popover').getBoundingClientRect();
    const badge = document.querySelector('#ikmal-rewrite-indicator').getBoundingClientRect();
    return {
      card: { right: Math.round(card.right), bottom: Math.round(card.bottom), w: Math.round(card.width), h: Math.round(card.height) },
      badge: { right: Math.round(badge.right), top: Math.round(badge.top) },
      // Adjacent to the badge on whichever side has room — above by preference,
      // below when the field sits near the top of the page. Demanding "above"
      // would have failed the correct behaviour.
      nearBadge: Math.abs(card.right - badge.right) < 40
        && Math.min(Math.abs(badge.top - card.bottom), Math.abs(card.top - badge.bottom)) <= 16,
      insideWindow: card.left >= 0 && card.top >= 0 && card.right <= innerWidth + 1 && card.bottom <= innerHeight + 1,
    };
  });
  if (!cardAnchored.nearBadge || !cardAnchored.insideWindow) {
    throw new Error(`The suggestion card is not anchored to its badge: ${JSON.stringify(cardAnchored)}`);
  }

  const issueState = await indicator.evaluate((host) => ({ shadow: Boolean(host.shadowRoot), label: host.shadowRoot?.querySelector('.indicator')?.getAttribute('aria-label') || '', theme: host.dataset.theme }));
  const issueCount = Number(issueState.label.match(/^(\d+) issue/)?.[1] || 0);
  if (!issueState.shadow || issueCount < 1 || issueState.theme !== 'light') throw new Error(`Injected indicator state failed: ${JSON.stringify(issueState)}`);

  await indicator.evaluate((host) => host.shadowRoot.querySelector('.indicator').click());
  const popover = page.locator('#ikmal-rewrite-popover');
  await popover.waitFor({ state: 'attached', timeout: 3000 });
  const accessibilitySnapshot = `${await indicator.ariaSnapshot()}\n${await popover.ariaSnapshot()}`;
  if (!/button "\d+ issues?"/.test(accessibilitySnapshot)) throw new Error(`Injected ARIA snapshot is missing the issue indicator: ${accessibilitySnapshot}`);
  // A safe-apply finding renders a real button; a review-first one renders its
  // candidates inside a <details>, which Chromium has exposed as both a named
  // button and an unnamed group with the summary as text across versions. The
  // label reaching the accessibility tree is the contract here; which role
  // carries it is the browser's business, and the data-action assertion below
  // is what proves the control actually works.
  const primaryAction = /button "(?:Apply|Review alternatives|Consider rewording)"|group: (?:Review alternatives|Consider rewording)/;
  if (!primaryAction.test(accessibilitySnapshot)) throw new Error(`Injected ARIA snapshot is missing the primary issue action: ${accessibilitySnapshot}`);
  for (const expected of ['dialog "Writing issue"', 'button "Ignore"']) {
    if (!accessibilitySnapshot.includes(expected)) throw new Error(`Injected ARIA snapshot is missing ${expected}: ${accessibilitySnapshot}`);
  }
  // The keyboard contract is over the controls a writer can actually reach. A
  // review-first finding keeps its candidates inside a <details>, so the
  // disclosure is a Tab stop and the apply buttons are not one until it opens.
  // Selecting on layout boxes rather than on data-action is what keeps a
  // hidden candidate out of the expected order.
  const readControls = (host) => [...host.shadowRoot.querySelectorAll('summary, [data-action]')]
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => element.dataset.action || element.textContent.trim());
  const actions = await popover.evaluate(readControls);
  if (!actions.includes('ignore') || !actions.some((label) => label === 'apply' || /alternatives|rewording/i.test(label))) {
    throw new Error(`Injected popover has unexpected actions: ${JSON.stringify(actions)}`);
  }
  const focusState = await popover.evaluate((host) => {
    const first = [...host.shadowRoot.querySelectorAll('summary, [data-action]')].find((element) => element.getClientRects().length > 0);
    first.focus();
    const active = host.shadowRoot.activeElement;
    return { action: active?.dataset.action || active?.textContent.trim() || '', theme: host.dataset.theme };
  });
  if (!focusState.action || focusState.theme !== 'light') throw new Error(`Injected popover focus/theme failed: ${JSON.stringify(focusState)}`);
  const tabOrder = [focusState.action];
  for (let index = 1; index < actions.length; index += 1) {
    await page.keyboard.press('Tab');
    tabOrder.push(await popover.evaluate((host) => {
      const active = host.shadowRoot.activeElement;
      return active?.dataset.action || active?.textContent.trim() || '';
    }));
  }
  if (tabOrder.some((action, index) => action !== actions[index])) throw new Error(`Injected popover Tab order failed: ${JSON.stringify({ expected: actions, actual: tabOrder })}`);
  // Opening the disclosure has to put a real Apply in reach. Without this a
  // popover that offered the review step and nothing behind it would still
  // satisfy the order check above.
  const revealed = await popover.evaluate((host) => {
    const details = host.shadowRoot.querySelector('details.writing-issue-alternatives');
    if (!details) return null;
    details.open = true;
    return [...host.shadowRoot.querySelectorAll('[data-action]')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.dataset.action);
  });
  if (revealed && !revealed.includes('apply')) throw new Error(`Opening the alternatives disclosure revealed no apply action: ${JSON.stringify(revealed)}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#ikmal-rewrite-popover') && document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.activeElement?.className === 'indicator', null, { timeout: 3000 });
  await indicator.evaluate((host) => host.shadowRoot.querySelector('.indicator').click());
  await popover.waitFor({ state: 'attached', timeout: 3000 });
  const visualState = await popover.evaluate((host) => {
    const surface = host.shadowRoot.querySelector('.writing-issue-popover');
    const style = getComputedStyle(surface);
    return {
      background: style.backgroundColor,
      color: style.color,
      border: style.borderTopColor,
      padding: style.padding,
      role: surface.getAttribute('role'),
      theme: host.dataset.theme,
    };
  });
  if (visualState.background === 'rgba(0, 0, 0, 0)' || visualState.padding === '0px' || visualState.role !== 'dialog' || visualState.theme !== 'light') {
    throw new Error(`Injected popover visual/security state failed: ${JSON.stringify(visualState)}`);
  }
  // Evidence, not an assertion — the visual state was checked above. A headed
  // browser on a virtual display cannot always capture, and losing the picture
  // is not a reason to fail a run that proved the thing the picture shows.
  await page.screenshot({ path: path.join(packageDir, 'browser-rewrite-light.png') })
    .catch((error) => console.warn(`Screenshot evidence skipped: ${error.message.split('\n')[0]}`));
  let finalText = await field.inputValue();
  // Apply gets its own clean run rather than reusing the popover above. That
  // one has been deliberately abused — Escape, Tab cycling, a disclosure left
  // open — and each of those re-checks the field, so a correction applied
  // against it races the answer that arrives next. A controller that refuses to
  // apply a correction derived from a superseded check is behaving correctly;
  // asserting Apply on top of that measures the race, not the feature.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#ikmal-rewrite-popover'), null, { timeout: 3000 });
  await field.focus();
  // Cleared and retyped so the finding being applied comes from a check of the
  // text as it stands. Refilling the same value advances the field without
  // producing a new result, and a controller is right to refuse a correction
  // derived from a check that no longer describes the document.
  await field.fill('');
  await page.waitForFunction(() => document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status !== 'issues', null, { timeout: 7000 });
  await field.fill('teh');
  await page.waitForFunction(() => document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status === 'issues', null, { timeout: 7000 });
  await indicator.evaluate((host) => host.shadowRoot.querySelector('.indicator').click());
  await popover.waitFor({ state: 'attached', timeout: 3000 });
  // A review-first finding keeps its apply behind the disclosure, so the
  // control is present but not visible. Asking the DOM rather than the visible
  // control list is what keeps this branch alive.
  const applyAction = await popover.evaluate((host) => Boolean(host.shadowRoot.querySelector('[data-action=apply]')));
  if (applyAction) {
    await popover.evaluate((host) => {
      const details = host.shadowRoot.querySelector('details.writing-issue-alternatives');
      if (details) details.open = true;
      host.shadowRoot.querySelector('[data-action=apply]').click();
    });
    await page.waitForFunction(() => document.querySelector('#editor').value === 'the' && document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status === 'clean', null, { timeout: 7000 }).catch(async (error) => {
      const state = await page.evaluate(() => document.querySelector('#editor')?.value + ' / ' + document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status);
      throw new Error(`${error.message}; checkerRequests=${checkerRequests}; state=${state}`);
    });
    finalText = await field.inputValue();
  } else {
    await popover.evaluate((host) => host.shadowRoot.querySelector('[data-action=ignore]').click());
    await page.waitForFunction(() => !document.querySelector('#ikmal-rewrite-popover'), null, { timeout: 3000 });
  }

  await field.fill('teh');
  await page.waitForTimeout(390);
  await field.fill('the');
  await page.waitForFunction(() => document.querySelector('#editor')?.value === 'the'
    && document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status === 'clean', null, { timeout: 7000 });
  const rapidEdit = await indicator.evaluate((host) => ({
    text: document.querySelector('#editor')?.value || '',
    status: host.shadowRoot?.querySelector('.indicator')?.dataset.status || '',
  }));
  if (rapidEdit.text !== 'the' || rapidEdit.status !== 'clean') throw new Error(`Rapid edit left stale injected state: ${JSON.stringify(rapidEdit)}`);

  const content = page.locator('#content');
  await content.fill('Editable teh content');
  await page.waitForFunction(() => document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status === 'issues', null, { timeout: 7000 });
  await page.evaluate(() => {
    const field = document.querySelector('#content');
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  await page.waitForTimeout(500);
  const contentText = await content.innerText();

  await page.evaluate(() => {
    const field = document.querySelector('#content');
    field.textContent = 'A slow teh draft';
    field.focus();
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.remove();
  });
  await page.waitForTimeout(700);
  if (pageErrors.length) throw new Error(`MV3 contenteditable/IME/mutation errors: ${pageErrors.join(' | ')}`);
  const externalRequests = httpRequests.filter((url) => !['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
  if (externalRequests.length) throw new Error(`Injected runtime made non-loopback HTTP requests: ${externalRequests.join(', ')}`);

  darkPage = await context.newPage();
  await darkPage.addInitScript(() => Object.assign(document.documentElement.dataset, {
    theme: 'dark', density: 'compact', contrast: 'high', palette: 'bathymetric',
  }));
  await darkPage.goto(`http://127.0.0.1:${fixturePort}/apps/browser-extension/test/fixture.html`, { waitUntil: 'domcontentloaded' });
  await darkPage.evaluate(() => Object.assign(document.documentElement.dataset, {
    theme: 'dark', density: 'compact', contrast: 'high', palette: 'bathymetric',
  }));
  const darkField = darkPage.locator('#editor');
  const darkIndicator = darkPage.locator('#ikmal-rewrite-indicator');
  // A second page races the extension the same way the first did.
  await focusUntilMounted(darkPage, darkField, '#ikmal-rewrite-indicator');
  await darkField.fill('teh');
  await darkPage.waitForFunction(() => document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status === 'issues', null, { timeout: 7000 });
  await darkIndicator.evaluate((host) => host.shadowRoot.querySelector('.indicator').click());
  const darkPopover = darkPage.locator('#ikmal-rewrite-popover');
  await darkPopover.waitFor({ state: 'attached', timeout: 3000 });
  await darkPage.emulateMedia({ reducedMotion: 'reduce' });
  await darkIndicator.evaluate((host) => { host.shadowRoot.querySelector('.indicator').dataset.status = 'checking'; });
  const darkVisualState = await darkPopover.evaluate((host) => {
    const surface = host.shadowRoot.querySelector('.writing-issue-popover');
    const style = getComputedStyle(surface);
    return {
      theme: host.dataset.theme,
      density: host.dataset.density,
      contrast: host.dataset.contrast,
      palette: host.dataset.palette,
      background: style.backgroundColor,
      color: style.color,
      padding: style.padding,
      accent: style.getPropertyValue('--accent').trim(),
      borderAxis: style.getPropertyValue('--border-1').trim(),
      role: surface.getAttribute('role'),
    };
  });
  const reducedMotion = await darkIndicator.evaluate((host) => getComputedStyle(host.shadowRoot.querySelector('.dot')).animationName);
  if (darkVisualState.theme !== 'dark' || darkVisualState.density !== 'compact' || darkVisualState.contrast !== 'high' || darkVisualState.palette !== 'bathymetric'
    || darkVisualState.background === 'rgba(0, 0, 0, 0)' || darkVisualState.padding !== '10px' || darkVisualState.accent !== '#34c6c0'
    || darkVisualState.borderAxis !== 'rgba(232,232,236,0.22)' || darkVisualState.role !== 'dialog' || reducedMotion !== 'none') {
    throw new Error(`Injected dark-theme visual state failed: ${JSON.stringify({ darkVisualState, reducedMotion })}`);
  }
  await darkPage.screenshot({ path: path.join(packageDir, 'browser-rewrite-dark.png') });
  console.log(`MV3 browser injection smoke passed: service worker, content-script injection, light/dark themes, Continental axes, reduced motion, iframe isolation, textarea actions, Tab order, rapid edit freshness, contenteditable + IME events, mutation teardown, visual semantics, ARIA snapshot, and loopback-only requests (${JSON.stringify({ manifest: manifest.name, browser: browserSource, checker: checkerSource, actions, tabOrder, text: finalText, rapidEdit, contentText, visualState, darkVisualState, reducedMotion, requestCount: httpRequests.length })}).`);
} finally {
  await darkPage?.close();
  await context?.close();
  if (checker) await new Promise((resolve) => checker.close(resolve));
  await new Promise((resolve) => fixtureServer.close(resolve));
  fs.rmSync(userData, { recursive: true, force: true });
}
