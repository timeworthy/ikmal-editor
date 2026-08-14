#!/usr/bin/env node
// Builds the shipped marks from the design source in docs/design/logo.
//
// The marks used to be hand-written SVG: a 466-byte circle with two rounded
// rectangles, a squiggle and three hard-coded hexes, drawn once at one size.
// `edmark.js` is the real system — a locked ring geometry shared with the tasks
// mark, an outlined logotype that does not depend on a font being installed,
// and two tiers with a switch at 48px, because "ikmal" inside a ring stops
// being readable long before a menubar icon stops being useful.
//
// The generators are browser scripts that publish onto `window`, so they are
// evaluated here against a small shim rather than rewritten. Rewriting them
// would fork the design source, and the point of running them is that the
// shipped asset and the design studio cannot disagree.
//
//   node tools/generate_marks.mjs [--check]
//
// --check regenerates the SVGs into memory and fails if what is on disk differs,
// which is what keeps an edited asset from drifting away from the source it came
// from. It deliberately does not compare the PNGs: those are rasterised through
// whatever Chromium is available, and two versions of it will not agree
// byte-for-byte, so asserting on them would fail for a reason that has nothing
// to do with the marks. Their source is checked instead.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logoDir = path.join(root, 'docs', 'design', 'logo');
const assets = path.join(root, 'assets');

// The generators reach for `window` and `localStorage` and nothing else. An
// empty localStorage matters: `loadMaster()` reads it, and a stored override
// would make the build depend on whoever last used the export studio.
const sandbox = { window: {}, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ['markgen.js', 'edmark.js']) {
  vm.runInContext(fs.readFileSync(path.join(logoDir, file), 'utf8'), sandbox, { filename: file });
}
const mark = sandbox.window.IkmalEditor;
if (!mark?.markSVG) throw new Error('edmark.js did not publish IkmalEditor; is markgen.js present?');
const P = mark.DEFAULT;

// What ships, and at what size each is actually seen.
const outputs = {
  // In-app header mark. Small enough that the min tier is the readable one.
  'ikmal_languagetool_mark.svg': mark.markSVG(P, { size: 100, cw: mark.COLORWAYS.darkUI, tier: 'min' }),
  // Rounded tile, seen at desktop-icon sizes where the word can be read.
  'ikmal_languagetool_icon.svg': mark.appIconSVG(P, { size: 512, tier: 'full' }),
  // The menubar. A template image: one ink colour and transparency, so macOS
  // can tint it for light, dark and highlighted states rather than showing our
  // grey against its own. The min tier is not a fallback here — at 22 points
  // the ring plus a word is a smudge.
  'ikmal_languagetool_tray.svg': mark.templateIconSVG(P, { size: 44, tier: 'min', color: '#000000' }),
  // Wide lockup for READMEs and the site.
  'ikmal_languagetool_banner.svg': mark.readmeBannerSVG
    ? mark.readmeBannerSVG(P, { cw: mark.COLORWAYS.darkUI })
    : mark.lockupSVG(P, { size: 320, cw: mark.COLORWAYS.darkUI }),
};

// The menubar and the app icon ship as PNG, not SVG, and for a stated reason:
// Electron rasterises SVG inconsistently in the menubar, which shows up as an
// invisible or white-box tray icon. So the same source is rasterised here
// through the browser the app already embeds, rather than left as a committed
// binary nobody can regenerate.
const RASTER = {
  'ikmal_languagetool_tray.png': { svg: outputs['ikmal_languagetool_tray.svg'], size: 36 },
  'ikmal_languagetool_icon.png': { svg: outputs['ikmal_languagetool_icon.svg'], size: 1024 },
};

async function rasterise() {
  const { chromium } = await import('playwright');
  const { resolveChromium } = await import('./chromium_launch.mjs');
  let executablePath;
  try { executablePath = resolveChromium()?.executablePath; } catch { executablePath = undefined; }
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const written = [];
  for (const [name, { svg, size }] of Object.entries(RASTER)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    // Transparent background: the tray image is a template and the app icon is
    // composited by the OS, so a white page behind either would be a white box.
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
    await page.locator('svg').evaluate((node, target) => {
      node.setAttribute('width', String(target));
      node.setAttribute('height', String(target));
    }, size);
    const target = path.join(assets, name);
    const shot = await page.locator('svg').screenshot({ omitBackground: true });
    fs.writeFileSync(target, shot);
    written.push(`${name}  ${shot.length} bytes  ${size}x${size}`);
    await page.close();
  }
  await browser.close();
  for (const line of written) console.log(line);
}

// The in-app mark is generated too, but tokenised rather than baked: the ring
// and prose line take currentColor and the squiggle takes var(--accent), so the
// mark follows the interface it sits in instead of carrying a second palette
// beside it. The shipped files above cannot do this — a menubar template image
// is tinted by the OS and an app icon is baked at package time — which is why
// those stay on the design source's locked accent and this one does not.
//
// Generated rather than hand-written for the same reason as the rest: the
// geometry lives in one place, and a mark drawn twice is a mark that will
// disagree with itself.
const inlineMark = mark.markSVG(P, {
  size: 24, tier: 'min', cw: mark.COLORWAYS.darkUI, fg: 'currentColor', ac: 'var(--accent)',
});
const markModule = `// Generated by tools/generate_marks.mjs from docs/design/logo. Do not edit:
// \`npm run verify\` fails when this no longer matches the design source.
//
// The min tier — a line of prose under a ring, with the squiggle broken. It is
// the mark that stays legible small, which is every place a running app shows
// one. Colours are tokens, so it follows the theme and the accent.
export const MARK_MIN_SVG = ${JSON.stringify(inlineMark)};

/** The mark at a given size, for a host that wants it larger than the default. */
export function renderMark(size = 24) {
  const px = Number.isFinite(size) && size > 0 ? Math.round(size) : 24;
  return MARK_MIN_SVG.replace('width="24" height="24"', \`width="\${px}" height="\${px}"\`);
}
`;
outputs['../packages/writing-ui/src/mark.ts'] = markModule;

const check = process.argv.includes('--check');
const drifted = [];
for (const [name, svg] of Object.entries(outputs)) {
  const target = path.join(assets, name);
  const body = name.endsWith('.ts') ? svg : `${svg.trim()}\n`;
  if (check) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (current !== body) drifted.push(name);
    continue;
  }
  fs.writeFileSync(target, body);
  console.log(`${name}  ${body.length} bytes`);
}
// The PNGs exist because Electron rasterises SVG unreliably in the menubar, so
// they must be rebuilt whenever their source changes — but only on a real run.
if (!check) await rasterise();

if (check && drifted.length) {
  throw new Error(`These marks no longer match the design source; run tools/generate_marks.mjs: ${drifted.join(', ')}`);
}
if (check) {
  // Named, so a passing line says which files were actually compared.
  console.log(`Marks match their design source: ${Object.keys(outputs).join(', ')}`);
  // The rasterised pair has no byte-stable check, so at least assert they exist:
  // a missing tray icon is an invisible menubar item.
  for (const name of Object.keys(RASTER)) {
    if (!fs.existsSync(path.join(assets, name))) throw new Error(`${name} is missing; run tools/generate_marks.mjs`);
  }
}
