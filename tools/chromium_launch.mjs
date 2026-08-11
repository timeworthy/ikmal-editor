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
