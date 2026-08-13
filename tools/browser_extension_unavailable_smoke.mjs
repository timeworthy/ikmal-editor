#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { focusUntilMounted, loadChromium, resolveChromium } from './chromium_launch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'bin', 'browser-extension');
const chromium = await loadChromium();
const { executablePath: browserPath, source: browserSource } = resolveChromium(chromium);
execFileSync(process.execPath, [path.join(root, 'tools', 'package_browser_rewrite.mjs')], { stdio: 'inherit' });
const backgroundPath = path.join(packageDir, 'background.js');
fs.writeFileSync(
  backgroundPath,
  fs.readFileSync(backgroundPath, 'utf8').replace('http://127.0.0.1:8096/v2/check', 'http://127.0.0.1:1/v2/check'),
);

const fixtureServer = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const file = path.resolve(root, `.${requestPath}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403); response.end(); return; }
  try {
    const body = fs.readFileSync(file);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve, reject) => { fixtureServer.once('error', reject); fixtureServer.listen(0, '127.0.0.1', resolve); });
const fixturePort = fixtureServer.address().port;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-browser-unavailable-smoke-'));
let context;
try {
  context = await chromium.launchPersistentContext(userData, {
    executablePath: browserPath,
    headless: false,
    viewport: { width: 1200, height: 800 },
    args: [`--disable-extensions-except=${packageDir}`, `--load-extension=${packageDir}`, '--no-first-run', '--no-default-browser-check'],
  });
  const page = context.pages()[0] || await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${fixturePort}/apps/browser-extension/test/fixture.html`, { waitUntil: 'domcontentloaded' });
  const field = page.locator('#editor');
  const indicator = page.locator('#ikmal-rewrite-indicator');
  // The extension mounts on focus, so focusing once and waiting races its
  // start-up: a focus delivered too early is missed rather than queued.
  await focusUntilMounted(page, field, '#ikmal-rewrite-indicator');
  await field.fill('Write teh draft');
  await page.waitForFunction(() => document.querySelector('#ikmal-rewrite-indicator')?.shadowRoot?.querySelector('.indicator')?.dataset.status === 'unavailable', null, { timeout: 7000 });
  const state = await indicator.evaluate((host) => ({ status: host.shadowRoot?.querySelector('.indicator')?.dataset.status, label: host.shadowRoot?.querySelector('.indicator')?.getAttribute('aria-label') }));
  if (pageErrors.length || state.status !== 'unavailable' || state.label !== 'Checking unavailable') throw new Error(`Unavailable injected state failed: ${JSON.stringify({ state, pageErrors })}`);
  console.log(`MV3 unavailable-service smoke passed: content-script injection survives an unreachable checker and renders the unavailable state (${JSON.stringify({ browser: browserSource, ...state })}).`);
} finally {
  await context?.close();
  await new Promise((resolve) => fixtureServer.close(resolve));
  fs.rmSync(userData, { recursive: true, force: true });
}
