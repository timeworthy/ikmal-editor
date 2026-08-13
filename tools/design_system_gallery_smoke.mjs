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
  // A module served as text/plain is refused by the browser's strict MIME
  // check, and the page then fails silently with nothing rendered.
  const type = file.endsWith('.css') ? 'text/css'
    : file.endsWith('.js') ? 'text/javascript'
    : file.endsWith('.html') ? 'text/html; charset=utf-8'
    : 'text/plain';
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
    'cnt-acc-head', 'cnt-acc-body', 'cnt-alert', 'cnt-stat', 'cnt-empty', 'cnt-btn', 'cnt-card',
    'cnt-sheet', 'cnt-tag', 'cnt-chip', 'cnt-kbd', 'cnt-tooltip', 'cnt-banner', 'cnt-toast',
    'cnt-progress', 'cnt-steps', 'cnt-step', 'cnt-step-dot', 'cnt-btn-group', 'cnt-divider'];
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

  // A disabled button must not look like one that works. It carried no styling
  // of its own, so the settings page rendered Start and Stop identically to
  // live controls and answered a click with nothing. Asserted on computed style
  // in a real browser, because the defect is what the pixels do — and hover is
  // included, since a control that lights up under the pointer is still making
  // a promise it will refuse.
  const disabledButton = await page.evaluate(() => {
    const off = document.querySelector('#disabled-btn');
    const on = off.previousElementSibling;
    const style = getComputedStyle(off);
    return {
      distinct: style.opacity !== getComputedStyle(on).opacity || style.color !== getComputedStyle(on).color,
      cursor: style.cursor,
    };
  });
  if (!disabledButton.distinct) throw new Error('A disabled button is indistinguishable from an enabled one.');
  if (disabledButton.cursor !== 'not-allowed') throw new Error(`A disabled button offers the wrong cursor: ${disabledButton.cursor}`);
  await page.hover('#disabled-btn');
  const hoveredBackground = await page.evaluate(() => getComputedStyle(document.querySelector('#disabled-btn')).backgroundColor);
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  if (accent && hoveredBackground.includes(accent)) throw new Error('A disabled button still lights up on hover.');

  // The duration control exists only while a timed mode is running, and lives
  // in the segment that mode occupies rather than on a row of its own. Asserted
  // in a browser because the point of the change is what is on screen: choosing
  // Pause used to drop a menu below the row, so the click that said "pause" was
  // not the one that paused.
  const modePicker = await page.evaluate(() => ({
    automatic: document.querySelectorAll('#modes-automatic select').length,
    paused: document.querySelectorAll('#modes-paused select').length,
    rowsAutomatic: document.querySelectorAll('#modes-automatic .writing-modes > *').length,
    rowsPaused: document.querySelectorAll('#modes-paused .writing-modes > *').length,
    inSegment: Boolean(document.querySelector('#modes-paused .cnt-segmented select')),
    readable: (() => {
      const select = document.querySelector('#modes-paused select');
      const segment = select.closest('[data-selected="true"]');
      return getComputedStyle(select).color === getComputedStyle(segment).color;
    })(),
  }));
  if (modePicker.automatic !== 0) throw new Error('Automatic offers a duration it has no use for.');
  // A segment marked selected must look it, in whichever idiom it uses to say
  // so. The segmented primitive styled only `aria-selected`, so moving these
  // buttons to `aria-pressed` — correct, because they toggle a mode rather than
  // reveal a panel — silently left the running mode looking unselected.
  const selection = await page.evaluate(() => {
    const read = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      pressed: read('#modes-automatic [aria-pressed="true"]'),
      unpressed: read('#modes-automatic [aria-pressed="false"]'),
      dataSelected: read('#modes-paused [data-selected="true"]'),
    };
  });
  if (selection.pressed === selection.unpressed) throw new Error('A pressed segment looks the same as an unpressed one.');
  if (selection.dataSelected !== selection.pressed) throw new Error('The two ways of marking a segment selected do not look the same.');
  if (modePicker.paused !== 1) throw new Error(`A running timed mode offers ${modePicker.paused} duration controls, not 1.`);
  if (!modePicker.inSegment) throw new Error('The duration control is not inside the segment its mode occupies.');
  if (modePicker.rowsPaused !== modePicker.rowsAutomatic) {
    throw new Error('Choosing a timed mode adds a row, which is the clutter the control exists to avoid.');
  }
  if (!modePicker.readable) throw new Error('The duration control does not take its segment\'s foreground, so it is unreadable when selected.');

  // Nothing inside a composite may be laid out past its own edge. The issue
  // card's grid track took its minimum from the meta row, which is three
  // unbreakable uppercase words plus four buttons, so every child sat 14px
  // beyond the card in the editor — where the host constrains it to 360px.
  // Checked at a narrow measure, because that is where a track that cannot
  // shrink shows itself.
  const spills = await page.evaluate(() => {
    const results = [];
    for (const measure of ['280px', '320px', '360px']) {
      for (const card of document.querySelectorAll('.writing-issue-popover')) {
        card.style.setProperty('--issue-measure', measure);
        const box = card.getBoundingClientRect();
        for (const child of card.querySelectorAll('*')) {
          const rect = child.getBoundingClientRect();
          if (rect.width > 0 && (rect.right > box.right + 0.5 || rect.left < box.left - 0.5)) {
            results.push(`${measure}: ${child.className || child.tagName}`);
          }
        }
        card.style.removeProperty('--issue-measure');
      }
    }
    return [...new Set(results)];
  });
  if (spills.length) throw new Error(`Content is laid out past the issue card's own edge: ${spills.slice(0, 4).join(', ')}`);

  // A full-width control must not overflow its container. This is what caught
  // the missing box-sizing: the gallery's textarea ran past its column, and
  // every settings form built on the primitive would have inherited it.
  const overflowing = await page.evaluate(() => [...document.querySelectorAll('.cnt-input,.cnt-select,.cnt-textarea')]
    .filter((el) => el.getBoundingClientRect().right > el.parentElement.getBoundingClientRect().right + 0.5)
    .map((el) => el.className));
  if (overflowing.length) throw new Error(`Controls overflow their container: ${overflowing.join(', ')}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
    throw new Error('The gallery scrolls sideways, so something is wider than its container.');
  }

  // Phase B composites must render from the compiled package and compose the
  // primitives, not restyle them: a composite that brought its own card would
  // be a second visual system inside the one this package exports.
  const composites = await page.evaluate(() => {
    const root = document.querySelector('#composites');
    return {
      rendered: root.children.length,
      usesPrimitives: root.querySelectorAll('.cnt-stat, .cnt-tag, .cnt-acc-head, .cnt-status-dot, .cnt-btn').length,
      strayClasses: [...root.querySelectorAll('*')]
        .flatMap((el) => [...el.classList])
        .filter((name) => !name.startsWith('cnt-') && !name.startsWith('writing-')),
    };
  });
  if (!composites.rendered) throw new Error('No writing composites rendered.');
  if (composites.usesPrimitives < 10) throw new Error(`Composites barely use primitives: ${composites.usesPrimitives} found.`);
  if (composites.strayClasses.length) throw new Error(`Composites use classes outside the system: ${[...new Set(composites.strayClasses)].join(', ')}`);

  // The mark palettes, measured rather than eyeballed. Five roles are only
  // useful if a reader can tell them apart, and a mark is a thin wavy line on
  // the writing surface rather than a filled shape — so both properties are
  // easy to lose and impossible to notice in a screenshot. The legacy palettes
  // this replaced put style and related within dE 4-7 of each other in two of
  // the four, which is to say they had four roles, not five.
  const MARK_ROLES = ['grammar', 'style', 'language', 'relationship', 'related'];
  const marksReport = await page.evaluate(({ MARK_ROLES, palettes, themes }) => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const channels = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const read = (expression) => { probe.style.color = expression; return channels(getComputedStyle(probe).color); };
    const previous = { ...document.documentElement.dataset };
    const rows = [];
    for (const theme of themes) {
      for (const palette of palettes) {
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.annotationPalette = palette;
        rows.push({
          theme,
          palette,
          surface: read('var(--bg-0)'),
          alpha: Number(getComputedStyle(document.documentElement).getPropertyValue('--mark-alpha')) || 0,
          inks: MARK_ROLES.map((role) => read(`var(--mark-${role})`)),
        });
      }
    }
    Object.assign(document.documentElement.dataset, previous);
    probe.remove();
    return rows;
  }, { MARK_ROLES, palettes: ['balanced', 'warm', 'cool', 'contrast'], themes: ['dark', 'light'] });

  const toLinear = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const luminance = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  const contrastRatio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const composite = (ink, surface, alpha) => ink.map((c, i) => c * alpha + surface[i] * (1 - alpha));
  const toLab = ([r, g, b]) => {
    const [x, y, z] = [
      toLinear(r) * 0.4124 + toLinear(g) * 0.3576 + toLinear(b) * 0.1805,
      toLinear(r) * 0.2126 + toLinear(g) * 0.7152 + toLinear(b) * 0.0722,
      toLinear(r) * 0.0193 + toLinear(g) * 0.1192 + toLinear(b) * 0.9505,
    ];
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const [fx, fy, fz] = [f(x / 0.95047), f(y), f(z / 1.08883)];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const deltaE = (a, b) => Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]));

  let worstMarkContrast = { ratio: Infinity };
  let worstMarkPair = { distance: Infinity };
  for (const row of marksReport) {
    if (!(row.alpha > 0)) throw new Error(`--mark-alpha is unset for ${row.theme}/${row.palette}, so marks paint as nothing.`);
    const painted = row.inks.map((ink) => composite(ink, row.surface, row.alpha));
    painted.forEach((colour, index) => {
      const ratio = contrastRatio(colour, row.surface);
      if (ratio < worstMarkContrast.ratio) worstMarkContrast = { ratio, ...row, role: MARK_ROLES[index] };
    });
    for (let i = 0; i < painted.length; i += 1) {
      for (let j = i + 1; j < painted.length; j += 1) {
        const distance = deltaE(painted[i], painted[j]);
        if (distance < worstMarkPair.distance) worstMarkPair = { distance, ...row, pair: `${MARK_ROLES[i]}/${MARK_ROLES[j]}` };
      }
    }
  }
  if (worstMarkContrast.ratio < 3) {
    throw new Error(`A mark is below 3:1 against the writing surface: ${worstMarkContrast.theme}/${worstMarkContrast.palette} ${worstMarkContrast.role} at ${worstMarkContrast.ratio.toFixed(2)}:1.`);
  }
  if (worstMarkPair.distance < 15) {
    throw new Error(`Two mark roles are the same colour: ${worstMarkPair.theme}/${worstMarkPair.palette} ${worstMarkPair.pair} at dE ${worstMarkPair.distance.toFixed(1)}.`);
  }

  // And the overlay must lie exactly over the field it annotates. Every
  // property that decides where a glyph lands has to match, or the marks sit
  // under the wrong words — which is the one way this layer fails that still
  // looks plausible on screen.
  const markGeometry = await page.evaluate(() => {
    const input = document.querySelector('#marks-demo-input');
    const layer = document.querySelector('#marks-demo-layer');
    if (!input || !layer) return { missing: true };
    const PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing',
      'textIndent', 'paddingTop', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderLeftWidth',
      'whiteSpace', 'overflowWrap', 'wordBreak', 'tabSize', 'boxSizing', 'textTransform'];
    const a = getComputedStyle(input);
    const b = getComputedStyle(layer);
    return {
      differing: PROPS.filter((name) => a[name] !== b[name]).map((name) => `${name}: ${a[name]} vs ${b[name]}`),
      widthGap: Math.abs(input.clientWidth - layer.clientWidth),
      heightGap: Math.abs(input.scrollHeight - layer.scrollHeight),
      marks: layer.querySelectorAll('.writing-underline').length,
      roles: [...new Set([...layer.querySelectorAll('.writing-underline')].map((mark) => mark.dataset.role))].sort(),
    };
  });
  if (markGeometry.missing) throw new Error('The gallery does not render the mark layer, so nothing checks it.');
  if (markGeometry.differing.length) throw new Error(`The mark overlay does not lay text out like the field: ${markGeometry.differing.join(', ')}`);
  if (markGeometry.widthGap > 0.5 || markGeometry.heightGap > 0.5) {
    throw new Error(`The mark overlay is a different size from its field: ${markGeometry.widthGap}px wide, ${markGeometry.heightGap}px tall.`);
  }
  if (markGeometry.roles.length < 5) throw new Error(`The gallery shows only ${markGeometry.roles.length} mark roles: ${markGeometry.roles.join(', ')}`);

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
  console.log(`Design-system gallery passed: ${required.length} primitives, theme/density/palette axes reach computed styles, intents distinct, focus visible, Shadow DOM isolated and styled, mark palettes legible and separated (${JSON.stringify({ browser: browserSource, accent: { slateAccent, bathymetricAccent }, controlHeights: { comfortable, compact, spacious }, marks: { worstContrast: `${worstMarkContrast.ratio.toFixed(2)}:1`, worstPair: `dE ${worstMarkPair.distance.toFixed(1)}`, roles: markGeometry.roles.length } })}).`);
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(userData, { recursive: true, force: true });
}
