// Where the --mark-* palettes in packages/design-system/src/tokens.css come from.
//
// A design tool, not a test: run it to add or retune a palette, then paste the
// CSS it prints into tokens.css. What checks the result is
// design_system_gallery_smoke.mjs, which resolves every theme-palette pair
// through the real cascade and fails below 3:1 contrast or dE 15 separation.
//
//   node tools/derive_mark_palettes.mjs [alpha]
//
// Five roles need five hues a reader can tell apart. The palettes vary the
// character of those hues — warmer, cooler, louder — but must not collapse two
// roles onto one colour, which is what the legacy warm and cool palettes did.
// So: fixed hue spacing per role, a per-palette rotation and chroma/lightness
// transform, and a check that every combination clears 3:1 against its surface
// and stays perceptually separated.

const SURFACE = { dark: '#15151b', light: '#f4f1e9' };

// OKLCH → sRGB hex.
const toSRGB = (l, c, hDeg) => {
  const h = (hDeg * Math.PI) / 180;
  const [a, b] = [c * Math.cos(h), c * Math.sin(h)];
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [
    +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
  ];
  return lin.map((v) => {
    const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(srgb * 255)));
  });
};
const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const unhex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));

const linear = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
const lab = ([r, g, b]) => {
  const [x, y, z] = [
    linear(r) * 0.4124 + linear(g) * 0.3576 + linear(b) * 0.1805,
    linear(r) * 0.2126 + linear(g) * 0.7152 + linear(b) * 0.0722,
    linear(r) * 0.0193 + linear(g) * 0.1192 + linear(b) * 0.9505,
  ];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x / 0.95047), f(y), f(z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

// Hue per role, spaced around the wheel. Red for the thing that is wrong,
// amber for the thing that recurs, green for the thing that links, and the two
// cooler hues for the two advisory sources.
const ROLES = { grammar: 27, related: 75, relationship: 150, style: 245, language: 295 };
// Lightness and chroma per theme: a mark must be lighter than a dark surface
// and darker than a light one, at the same chroma.
const THEME = { dark: { l: 0.70, c: 0.13 }, light: { l: 0.50, c: 0.13 } };
// The palettes. Rotation keeps the five apart while changing their character.
const PALETTES = {
  balanced: { rotate: 0, chroma: 1, light: 0 },
  warm: { rotate: 16, chroma: 0.92, light: 0.02 },
  cool: { rotate: -14, chroma: 0.92, light: 0.01 },
  contrast: { rotate: 0, chroma: 1.45, light: 0.06 },
};

const ALPHA = Number(process.argv[2] || 0.85);
const palette = (theme, name) => {
  const base = THEME[theme];
  const p = PALETTES[name];
  const out = {};
  for (const [role, hue] of Object.entries(ROLES)) {
    const l = theme === 'dark' ? base.l + p.light : base.l - p.light;
    out[role] = hex(toSRGB(l, base.c * p.chroma, hue + p.rotate));
  }
  return out;
};

let worstContrast = Infinity;
let worstPair = Infinity;
const lines = [];
for (const theme of ['dark', 'light']) {
  for (const name of Object.keys(PALETTES)) {
    const colours = palette(theme, name);
    const bg = unhex(SURFACE[theme]);
    const roles = Object.keys(ROLES);
    const cs = roles.map((r) => contrast(over(unhex(colours[r]), bg, ALPHA), bg));
    const ds = [];
    for (let i = 0; i < roles.length; i += 1) {
      for (let j = i + 1; j < roles.length; j += 1) {
        ds.push(deltaE(over(unhex(colours[roles[i]]), bg, ALPHA), over(unhex(colours[roles[j]]), bg, ALPHA)));
      }
    }
    worstContrast = Math.min(worstContrast, ...cs);
    worstPair = Math.min(worstPair, ...ds);
    const flag = Math.min(...cs) < 3 || Math.min(...ds) < 15 ? '  <-- ' : '';
    lines.push(`${`${theme}/${name}`.padEnd(20)} ${Math.min(...cs).toFixed(2)}:1   dE ${Math.min(...ds).toFixed(1)}${flag}`);
    lines.push(`   ${roles.map((r) => `${r}:${colours[r]}`).join(' ')}`);
  }
}
console.log(`alpha ${ALPHA}   worst contrast ${worstContrast.toFixed(2)}:1   worst dE ${worstPair.toFixed(1)}\n`);
console.log(lines.join('\n'));

console.log('\n--- CSS ---');
for (const theme of ['dark', 'light']) {
  for (const name of Object.keys(PALETTES)) {
    const c = palette(theme, name);
    const body = Object.keys(ROLES).map((r) => `--mark-${r}: ${c[r]};`).join(' ');
    const sel = theme === 'dark'
      ? `[data-annotation-palette="${name}"]`
      : `[data-theme="light"][data-annotation-palette="${name}"]`;
    console.log(`${sel} { ${body} }`);
  }
}
