#!/usr/bin/env node
// Phase A exit check: the primitives render, and the axes actually reach them.
//
// A CSS file that parses proves nothing. What matters is that a token change
// moves a real computed value on a real element, in a real browser, including
// inside a Shadow DOM — because the browser extension renders these there and
// page CSS must not be able to reach them.
//
// Opt-in like the other browser harnesses:
//   node tools/design_system_gallery_smoke.mjs

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium, resolveChromium } from './chromium_launch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromium = await loadChromium();
const { executablePath, source: browserSource } = resolveChromium(chromium);

const server = http.createServer((request, response) => {
  const file = path.resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://x').pathname)}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403); response.end(); return; }
  // Read before writing the head: sending 200 and then failing to read leaves
  // the handler unable to answer 404, which surfaces as ERR_HTTP_HEADERS_SENT
  // rather than as the missing file it actually is.
  let body;
  try { body = fs.readFileSync(file); } catch { response.writeHead(404); response.end(); return; }
  const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain';
  response.writeHead(200, { 'content-type': type });
  response.end(body);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-gallery-'));
let context;
try {
  context = await chromium.launchPersistentContext(userData, { executablePath, headless: false, viewport: { width: 1200, height: 900 } });
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/packages/design-system/gallery.html`, { waitUntil: 'networkidle' });

  // Every primitive the settings work depends on must actually be on the page.
  const required = ['cnt-label', 'cnt-help', 'cnt-input', 'cnt-select', 'cnt-textarea', 'cnt-switch',
    'cnt-check', 'cnt-segmented', 'cnt-slider', 'cnt-panel', 'cnt-tabs', 'cnt-tab', 'cnt-accordion',
    'cnt-acc-head', 'cnt-acc-body', 'cnt-alert', 'cnt-stat', 'cnt-empty', 'cnt-btn', 'cnt-card'];
  const missing = await page.evaluate((names) => names.filter((n) => !document.querySelector(`.${n}`)), required);
  if (missing.length) throw new Error(`Gallery is missing primitives: ${missing.join(', ')}`);

  const styleOf = (selector, property) => page.evaluate(
    ([s, p]) => getComputedStyle(document.querySelector(s)).getPropertyValue(p),
    [selector, property],
  );
  const setAxis = async (axis, value) => {
    await page.evaluate(([a, v]) => { document.documentElement.dataset[a] = v; }, [axis, value]);
    await page.waitForTimeout(120);
  };

  // Theme has to change the surface, not just the attribute.
  await setAxis('theme', 'dark');
  const darkBackground = await styleOf('body', 'background-color');
  await setAxis('theme', 'light');
  const lightBackground = await styleOf('body', 'background-color');
  if (darkBackground === lightBackground) throw new Error(`Theme did not reach the surface: both themes computed ${darkBackground}`);

  // Density has to reach control height, which is the token added for this set.
  await setAxis('theme', 'dark');
  await setAxis('density', 'comfortable');
  const comfortable = await styleOf('.cnt-input', 'height');
  await setAxis('density', 'compact');
  const compact = await styleOf('.cnt-input', 'height');
  await setAxis('density', 'spacious');
  const spacious = await styleOf('.cnt-input', 'height');
  if (new Set([comfortable, compact, spacious]).size !== 3) {
    throw new Error(`Density did not reach control height: ${JSON.stringify({ comfortable, compact, spacious })}`);
  }
  await setAxis('density', 'comfortable');

  // A palette change has to reach whatever consumes the accent. Measured on the
  // status dot rather than a resting button border: the button only takes the
  // accent on hover, so probing its border proves nothing about the palette.
  await setAxis('palette', 'slate');
  const slateAccent = await styleOf('.cnt-status-dot', 'background-color');
  await setAxis('palette', 'bathymetric');
  const bathymetricAccent = await styleOf('.cnt-status-dot', 'background-color');
  if (slateAccent === bathymetricAccent) {
    throw new Error(`Palette did not reach the accent: both computed ${slateAccent}`);
  }
  await setAxis('palette', 'slate');

  // Intents must differ from each other and from the neutral alert.
  const intents = await page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('.cnt-alert[data-intent]')]
      .map((el) => [el.dataset.intent, getComputedStyle(el).backgroundColor]),
  ));
  if (new Set(Object.values(intents)).size !== Object.keys(intents).length) {
    throw new Error(`Intent surfaces are not distinct: ${JSON.stringify(intents)}`);
  }

  // Keyboard focus must be visible on a control, not only on a button.
  const focusRing = await page.evaluate(() => {
    const input = document.querySelector('.cnt-input');
    input.focus();
    return getComputedStyle(input).boxShadow;
  });
  if (!focusRing || focusRing === 'none') throw new Error('Focused input has no visible focus ring.');

  // The Shadow DOM copy must style itself, and page CSS must not reach in.
  const shadow = await page.evaluate(() => {
    const host = document.querySelector('#shadow-host');
    const button = host.shadowRoot.querySelector('#shadow-btn');
    const style = getComputedStyle(button);
    return { background: style.backgroundColor, font: style.fontFamily, reachable: Boolean(document.querySelector('#shadow-btn')) };
  });
  if (shadow.reachable) throw new Error('Shadow content is reachable from the page, so it is not isolated.');
  if (shadow.background === 'rgba(0, 0, 0, 0)') throw new Error('Shadow DOM primitives did not receive their tokens.');

  if (errors.length) throw new Error(`Gallery raised page errors: ${errors.join('; ')}`);
  console.log(`Design-system gallery passed: ${required.length} primitives, theme/density/palette axes reach computed styles, intents distinct, focus visible, Shadow DOM isolated and styled (${JSON.stringify({ browser: browserSource, accent: { slateAccent, bathymetricAccent }, controlHeights: { comfortable, compact, spacious } })}).`);
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(userData, { recursive: true, force: true });
}
