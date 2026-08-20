// Which Chromium the browser harnesses drive, and why that choice is explicit.
//
// Playwright's own build is pinned by package-lock.json, so `npm ci` followed
// by `npx playwright install chromium` gives every machine the same browser.
// That matters more than it sounds: Chromium changes its accessibility
// mappings between versions, and an ARIA assertion that breaks for that reason
// reads as a product regression when nothing about the product changed.
//
// A system Chromium is still accepted, because a contributor who would rather
// not download a browser should not be locked out of the harnesses. It is
// reported as unpinned so a passing run says which browser earned the pass.
//
// Order: IKMAL_CHROMIUM, then Playwright's pinned build, then a system install.

import fs from 'node:fs';

const SYSTEM_CHROMIUM = [
  '/opt/homebrew/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

/**
 * Playwright is a dependency of tools/, not of anything that ships. The env
 * override stays supported so a checkout with no install of its own can borrow
 * one that already exists.
 */
export async function loadChromium() {
  const playwrightModule = process.env.IKMAL_PLAYWRIGHT_MODULE || 'playwright';
  const { chromium } = await import(playwrightModule);
  return chromium;
}

function pinnedExecutable(chromium) {
  try {
    const executable = chromium.executablePath();
    return executable && fs.existsSync(executable) ? executable : '';
  } catch {
    // A Playwright that cannot name its own browser is one that has not
    // downloaded it; the system fallback below is the answer, not a crash.
    return '';
  }
}

export function resolveChromium(chromium) {
  const override = process.env.IKMAL_CHROMIUM;
  if (override) {
    if (!fs.existsSync(override)) throw new Error(`IKMAL_CHROMIUM points at nothing: ${override}`);
    return { executablePath: override, source: `IKMAL_CHROMIUM (${override})` };
  }
  const pinned = pinnedExecutable(chromium);
  if (pinned) return { executablePath: pinned, source: 'pinned Playwright Chromium' };
  const system = SYSTEM_CHROMIUM.find((candidate) => fs.existsSync(candidate));
  if (system) return { executablePath: system, source: `unpinned system Chromium (${system})` };
  throw new Error('No Chromium available. Run `npx playwright install chromium`, or set IKMAL_CHROMIUM to a browser already on this machine.');
}

function isGoogleChrome(executablePath) {
  return executablePath.includes('/Google Chrome.app/') || executablePath.endsWith('/Google Chrome');
}

// Playwright adds --disable-extensions by default. Chromium accepts the
// load-extension switches alongside that default, but current branded Chrome
// does not: its extension debugging path requires the default switch removed
// and an explicit CDP installation request. Keep the distinction here so all
// browser smokes exercise the same packaged artifact on both browsers.
export function extensionLaunchOptions(executablePath, packageDir) {
  const chrome = isGoogleChrome(executablePath);
  return {
    ignoreDefaultArgs: ['--disable-extensions'],
    args: chrome
      ? ['--enable-unsafe-extension-debugging']
      : [`--disable-extensions-except=${packageDir}`, `--load-extension=${packageDir}`],
  };
}

export async function loadUnpackedExtension(context, executablePath, packageDir) {
  if (!isGoogleChrome(executablePath)) return '';
  const browser = context.browser();
  if (!browser?.newBrowserCDPSession) {
    throw new Error('The branded Chrome smoke needs a browser-level CDP session to load its unpacked extension.');
  }
  const session = await browser.newBrowserCDPSession();
  try {
    const result = await session.send('Extensions.loadUnpacked', { path: packageDir });
    return result.id || '';
  } finally {
    await session.detach().catch(() => {});
  }
}

/**
 * Focus a field until the content script has mounted its indicator.
 *
 * The extension mounts on focus, so a focus that lands before the extension has
 * finished loading is not early — it is missed. Nothing mounts, and waiting
 * longer cannot help, because the event that would have mounted it is gone.
 * That made the browser smokes race the extension's own start-up: the injection
 * one happened to do enough work before focusing to usually win, the
 * unavailable one did not, and the same commit passed on one branch and failed
 * on the other.
 *
 * Focusing again is what fixes it. The field is blurred first because focusing
 * an already-focused element fires nothing.
 */
export async function focusUntilMounted(page, field, selector, timeout = 20000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    await page.evaluate(() => document.activeElement?.blur?.());
    await field.focus();
    try {
      await page.locator(selector).waitFor({ state: 'attached', timeout: 1000 });
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await page.waitForTimeout(200);
    }
  }
}
