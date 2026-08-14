// edmark.js — the LOCKED ikmal editor mark, parameterized.
//
// Two tiers, one system:
//   full — "ikmal" inside the ring, squiggle underneath        (48px and up)
//   min  — one line of prose, squiggle broken at 64 / 78%      (below 48px)
//
// Ring geometry is inherited from markgen.js so the editor and tasks marks stay
// mechanically identical (same radius, same stroke, same 100-unit grid).
// Mirrors the markgen API surface, so the export studio and asset sheet can
// drive either mark with the same calls. Default accent: sage.
//
// Requires markgen.js to be loaded first.
(function () {
  const M = window.IkmalMark;
  const COLORWAYS = M.COLORWAYS, THEMES = M.THEMES, ICON_FIELDS = M.ICON_FIELDS;
  const accentFor = M.accentFor, textColor = M.textColor;
  const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

  // Outlined logotype. Inter Bold "ikmal" (design tracking -1px@21 baked in) and
  // Inter Regular "editor", both traced at font-size 100 with the baseline at y=0.
  // The mark must not depend on a font being installed: GitHub's README renderer,
  // Linux CI, and stock Windows have no Inter, and live <text> silently reflows.
  const WORDS = {
    ikmal: { x1: 5.469, w: 231.236, adv: 242.742, d: "M21.165 0L6.037 0L6.037-54.545L21.165-54.545L21.165 0ZM13.636-61.577L13.636-61.577Q10.263-61.577 7.866-63.832Q5.469-66.087 5.469-69.247L5.469-69.247Q5.469-72.372 7.866-74.627Q10.263-76.882 13.636-76.882L13.636-76.882Q17.010-76.882 19.407-74.627Q21.804-72.372 21.804-69.247L21.804-69.247Q21.804-66.087 19.407-63.832Q17.010-61.577 13.636-61.577ZM43.605 0L28.477 0L28.477-72.727L43.605-72.727L43.605-33.842L44.421-33.842L61.893-54.545L79.258-54.545L59.017-30.930L80.288 0L62.568 0L47.688-21.982L43.605-17.330L43.605 0ZM97.010 0L81.882 0L81.882-54.545L96.300-54.545L96.300-44.922L96.939-44.922Q98.644-49.716 102.621-52.486Q106.598-55.256 112.138-55.256L112.138-55.256Q117.749-55.256 121.691-52.468Q125.632-49.680 126.946-44.922L126.946-44.922L127.515-44.922Q129.184-49.609 133.569-52.433Q137.955-55.256 143.956-55.256L143.956-55.256Q151.591-55.256 156.368-50.408Q161.144-45.561 161.144-36.683L161.144-36.683L161.144 0L146.051 0L146.051-33.700Q146.051-38.246 143.637-40.518Q141.222-42.791 137.600-42.791L137.600-42.791Q133.480-42.791 131.172-40.181Q128.864-37.571 128.864-33.310L128.864-33.310L128.864 0L114.198 0L114.198-34.020Q114.198-38.033 111.907-40.412Q109.617-42.791 105.888-42.791L105.888-42.791Q103.367-42.791 101.360-41.531Q99.354-40.270 98.182-38.015Q97.010-35.760 97.010-32.741L97.010-32.741L97.010 0ZM183.868 1.030L183.868 1.030Q178.648 1.030 174.564-0.799Q170.480-2.628 168.118-6.232Q165.757-9.837 165.757-15.234L165.757-15.234Q165.757-19.780 167.426-22.869Q169.095-25.959 171.971-27.841Q174.848-29.723 178.523-30.682Q182.199-31.641 186.247-32.031L186.247-32.031Q191.005-32.528 193.917-32.972Q196.829-33.416 198.143-34.304Q199.457-35.192 199.457-36.932L199.457-36.932L199.457-37.145Q199.457-40.518 197.344-42.365Q195.231-44.212 191.361-44.212L191.361-44.212Q187.277-44.212 184.862-42.418Q182.447-40.625 181.666-37.926L181.666-37.926L167.675-39.063Q168.740-44.034 171.865-47.674Q174.990-51.314 179.944-53.285Q184.898-55.256 191.432-55.256L191.432-55.256Q195.977-55.256 200.150-54.190Q204.322-53.125 207.572-50.888Q210.821-48.651 212.703-45.153Q214.585-41.655 214.585-36.790L214.585-36.790L214.585 0L200.238 0L200.238-7.564L199.812-7.564Q198.498-5.007 196.297-3.072Q194.095-1.136 191.005-0.053Q187.916 1.030 183.868 1.030ZM188.200-9.411L188.200-9.411Q191.538-9.411 194.095-10.742Q196.652-12.074 198.108-14.347Q199.564-16.619 199.564-19.496L199.564-19.496L199.564-25.284Q198.853-24.822 197.628-24.450Q196.403-24.077 194.876-23.775Q193.349-23.473 191.822-23.242Q190.295-23.011 189.052-22.834L189.052-22.834Q186.389-22.443 184.400-21.591Q182.412-20.739 181.311-19.300Q180.210-17.862 180.210-15.732L180.210-15.732Q180.210-12.642 182.465-11.026Q184.720-9.411 188.200-9.411ZM221.577-72.727L236.705-72.727L236.705 0L221.577 0L221.577-72.727Z" },
    editor: { x1: 5.114, w: 269.886, adv: 277.273, d: "M30.540 1.136L30.540 1.136Q22.656 1.136 16.957-2.362Q11.257-5.859 8.185-12.163Q5.114-18.466 5.114-26.847Q5.114-35.227 8.185-41.637Q11.257-48.047 16.779-51.651Q22.301-55.256 29.688-55.256L29.688-55.256Q33.949-55.256 38.104-53.835Q42.259-52.415 45.668-49.237Q49.077-46.058 51.101-40.838Q53.125-35.618 53.125-27.983L53.125-27.983L53.125-24.432L13.530-24.432Q13.707-18.999 15.661-15.128L15.661-15.128Q17.791-10.831 21.626-8.612Q25.462-6.392 30.540-6.392L30.540-6.392Q33.842-6.392 36.523-7.333Q39.205-8.274 41.158-10.174Q43.111-12.074 44.176-14.915L44.176-14.915L52.273-12.642Q50.994-8.523 47.976-5.415Q44.957-2.308 40.518-0.586Q36.080 1.136 30.540 1.136ZM13.530-31.676L13.530-31.676L44.602-31.676Q44.602-36.293 42.773-39.915Q40.945-43.537 37.589-45.632Q34.233-47.727 29.688-47.727L29.688-47.727Q24.680-47.727 21.040-45.259Q17.401-42.791 15.447-38.849L15.447-38.849Q13.778-35.476 13.530-31.676ZM86.506 1.136L86.506 1.136Q79.688 1.136 74.467-2.326Q69.247-5.788 66.300-12.127Q63.352-18.466 63.352-27.131L63.352-27.131Q63.352-35.724 66.300-42.045Q69.247-48.366 74.503-51.811Q79.759-55.256 86.648-55.256L86.648-55.256Q91.974-55.256 95.082-53.498Q98.189-51.740 99.840-49.521Q101.491-47.301 102.415-45.881L102.415-45.881L103.125-45.881L103.125-72.727L111.506-72.727L111.506 0L103.409 0L103.409-8.381L102.415-8.381Q101.491-6.889 99.787-4.634Q98.082-2.379 94.922-0.621Q91.761 1.136 86.506 1.136ZM87.642-6.392L87.642-6.392Q92.685-6.392 96.165-9.038Q99.645-11.683 101.456-16.388Q103.267-21.094 103.267-27.273L103.267-27.273Q103.267-33.381 101.491-37.979Q99.716-42.578 96.236-45.153Q92.756-47.727 87.642-47.727L87.642-47.727Q82.315-47.727 78.782-45.011Q75.249-42.294 73.491-37.660Q71.733-33.026 71.733-27.273L71.733-27.273Q71.733-21.449 73.526-16.708Q75.320-11.967 78.853-9.180Q82.386-6.392 87.642-6.392ZM136.364 0L127.983 0L127.983-54.545L136.364-54.545L136.364 0ZM132.244-63.636L132.244-63.636Q129.794-63.636 128.036-65.305Q126.278-66.974 126.278-69.318L126.278-69.318Q126.278-71.662 128.036-73.331Q129.794-75 132.244-75L132.244-75Q134.695-75 136.452-73.331Q138.210-71.662 138.210-69.318L138.210-69.318Q138.210-66.974 136.452-65.305Q134.695-63.636 132.244-63.636ZM163.778-54.545L175.426-54.545L175.426-47.443L163.778-47.443L163.778-15.625Q163.778-12.074 164.826-10.316Q165.874-8.558 167.525-7.972Q169.176-7.386 171.023-7.386L171.023-7.386Q172.408-7.386 173.295-7.546Q174.183-7.706 174.716-7.813L174.716-7.813L176.420-0.284Q175.568 0.036 174.041 0.373Q172.514 0.710 170.170 0.710L170.170 0.710Q166.619 0.710 163.228-0.817Q159.837-2.344 157.617-5.469Q155.398-8.594 155.398-13.352L155.398-13.352L155.398-47.443L147.159-47.443L147.159-54.545L155.398-54.545L155.398-67.614L163.778-67.614L163.778-54.545ZM210.227 1.136L210.227 1.136Q202.841 1.136 197.283-2.379Q191.726-5.895 188.619-12.216Q185.511-18.537 185.511-26.989L185.511-26.989Q185.511-35.511 188.619-41.868Q191.726-48.224 197.283-51.740Q202.841-55.256 210.227-55.256L210.227-55.256Q217.614-55.256 223.171-51.740Q228.729-48.224 231.836-41.868Q234.943-35.511 234.943-26.989L234.943-26.989Q234.943-18.537 231.836-12.216Q228.729-5.895 223.171-2.379Q217.614 1.136 210.227 1.136ZM210.227-6.392L210.227-6.392Q215.838-6.392 219.460-9.268Q223.082-12.145 224.822-16.832Q226.563-21.520 226.563-26.989L226.563-26.989Q226.563-32.457 224.822-37.180Q223.082-41.903 219.460-44.815Q215.838-47.727 210.227-47.727L210.227-47.727Q204.616-47.727 200.994-44.815Q197.372-41.903 195.632-37.180Q193.892-32.457 193.892-26.989L193.892-26.989Q193.892-21.520 195.632-16.832Q197.372-12.145 200.994-9.268Q204.616-6.392 210.227-6.392ZM256.108 0L247.727 0L247.727-54.545L255.824-54.545L255.824-46.307L256.392-46.307Q257.884-50.355 261.790-52.876Q265.696-55.398 270.597-55.398L270.597-55.398Q271.520-55.398 272.905-55.362Q274.290-55.327 275-55.256L275-55.256L275-46.733Q274.574-46.839 273.065-47.070Q271.555-47.301 269.886-47.301L269.886-47.301Q265.909-47.301 262.802-45.650Q259.695-43.999 257.901-41.104Q256.108-38.210 256.108-34.517L256.108-34.517L256.108 0Z" },
  };
  const SPACE = 0.26;                               // em fraction between the two words
  const inkW = (key, size) => WORDS[key].w * size / 100;
  // draw an outlined word with its INK left edge at x and baseline at y
  function word(key, size, x, y, fill) {
    const W = WORDS[key], s = size / 100;
    return `<path d="${W.d}" transform="translate(${n(x - W.x1 * s)} ${n(y)}) scale(${n(s)})" fill="${fill}"/>`;
  }
  const wordCentered = (key, size, cx, y, fill) => word(key, size, cx - inkW(key, size) / 2, y, fill);
  // "ikmal editor" as one outlined run; returns { markup, width }
  function logotype(size, x, y, fill, subFill) {
    const a = inkW("ikmal", size), gap = size * SPACE, b = inkW("editor", size);
    return {
      markup: word("ikmal", size, x, y, fill) + word("editor", size, x + a + gap, y, subFill || fill),
      width: a + gap + b,
    };
  }
  const logotypeCentered = (size, cx, y, fill, subFill) => {
    const w = inkW("ikmal", size) + size * SPACE + inkW("editor", size);
    return logotype(size, cx - w / 2, y, fill, subFill);
  };

  const DEFAULT = {
    tier: "auto", switchPx: 48,
    ringR: 33, ringW: 7, ringOp: 0.3, dy: 0,
    // full tier — the word and its underline
    wordSize: 21, wordY: 52.5, wordTrack: -1,
    // Overhang, not inset: how far the underline runs past the word at each
    // end. It was a fixed inset from the frame, which made the rule 59 units
    // wide under a 48.6-unit word — 5.2 units proud at each end, reading as a
    // rule the word sits on rather than as the word's own underline. Measured
    // from the word, it also follows wordSize instead of needing a second
    // adjustment every time the word changes.
    fullSqY: 62.5, fullSqW: 3.2, fullSqAmp: 2.1, fullSqPeriod: 8.4, fullSqOverhang: 2,
    // min tier — one line of prose, broken squiggle
    lineY: 39.5, lineW: 40, lineH: 6, lineOp: 0.58,
    minSqY: 55.5, minSqW: 3.4, minSqAmp: 2.4, minSqPeriod: 9.2, brA: 0.64, brB: 0.78,
  };
  const THEME = THEMES.sage;                       // locked accent
  const MASTER_KEY = "ikmal_editor_master";

  let _uid = 0;
  const uid = (p) => `${p}${++_uid}`;
  const n = (v) => String(Math.round(v * 100) / 100);
  const svgHead = (vb, w, h) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${w ? ` width="${w}" height="${h || w}"` : ""} fill="none">`;
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((pa >> sh) & 255) + ((((pb >> sh) & 255)) - ((pa >> sh) & 255)) * t);
    return "#" + ((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1);
  }
  // scale+translate a 100-unit mark about (cx,cy)
  const place = (cx, cy, s) => `transform="translate(${n(cx - 50 * s)} ${n(cy - 50 * s)}) scale(${s})"`;

  /* ── primitives ───────────────────────────────────────── */
  function wavePath(x1, x2, y, amp, period) {
    let d = `M${n(x1)} ${n(y)}`, x = x1, up = true;
    const half = period / 2;
    while (x < x2 - 0.01) {
      const nx = Math.min(x + half, x2), mid = (x + nx) / 2;
      d += ` Q${n(mid)} ${n(y + (up ? -amp : amp))} ${n(nx)} ${n(y)}`;
      x = nx; up = !up;
    }
    return d;
  }
  const squiggle = (x1, x2, y, color, sw, amp, period) =>
    `<path d="${wavePath(x1, x2, y, amp, period)}" stroke="${color}" stroke-width="${n(sw)}" fill="none" stroke-linecap="round"/>`;
  const ringMarkup = (p, c) =>
    `<circle cx="50" cy="50" r="${n(p.ringR)}" stroke="${c.fg}" stroke-width="${n(p.ringW * (c.s || 1))}" opacity="${c.ringOp != null ? c.ringOp : p.ringOp}" fill="none"/>`;

  /* ── the two tiers ────────────────────────────────────── */
  function innerFull(p, c) {
    const s = c.s || 1, dy = p.dy || 0;
    return ringMarkup(p, c) +
      wordCentered("ikmal", p.wordSize, 50, p.wordY + dy, c.fg) +
      (() => {
        const half = inkW("ikmal", p.wordSize) / 2 + (p.fullSqOverhang != null ? p.fullSqOverhang : 2);
        return squiggle(50 - half, 50 + half, p.fullSqY + dy, c.ac, p.fullSqW * s, p.fullSqAmp, p.fullSqPeriod);
      })();
  }
  function innerMin(p, c) {
    const s = c.s || 1, dy = p.dy || 0, w = p.lineW, x = 50 - w / 2, sy = p.minSqY + dy;
    return ringMarkup(p, c) +
      `<rect x="${n(x)}" y="${n(p.lineY + dy)}" width="${n(w)}" height="${n(p.lineH)}" rx="${n(p.lineH / 2)}" fill="${c.fg}" opacity="${c.flat ? 1 : p.lineOp}"/>` +
      squiggle(x + 0.4, x + w * p.brA, sy, c.ac, p.minSqW * s, p.minSqAmp, p.minSqPeriod) +
      squiggle(x + w * p.brB, x + w - 0.4, sy, c.ac, p.minSqW * s, p.minSqAmp, p.minSqPeriod);
  }
  const tierFor = (p, size) =>
    (p.tier === "full" || p.tier === "min") ? p.tier : ((size || 512) >= (p.switchPx || 48) ? "full" : "min");
  const inner = (p, c, tier) => (tier === "min" ? innerMin : innerFull)(p, c);

  function ctx(p, opts) {
    const cw = opts.cw || COLORWAYS.darkUI;
    return {
      fg: opts.fg || cw.fg,
      ac: opts.ac || accentFor(cw, opts.theme || THEME),
      ringOp: opts.ringOp != null ? opts.ringOp : p.ringOp,
      s: opts.s || 1,
      flat: !!opts.flat,
    };
  }

  /* ── mark, lockup, stack ──────────────────────────────── */
  function markSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.darkUI, c = ctx(p, opts);
    const tier = opts.tier || tierFor(p, opts.size);
    const bg = cw.bg && cw.bg !== "transparent"
      ? `<rect width="100" height="100"${opts.round ? ` rx="${opts.round}"` : ""} fill="${cw.bg}"/>` : "";
    return svgHead("0 0 100 100", opts.size) + bg + inner(p, c, tier) + "</svg>";
  }

  // horizontal: mark · "ikmal editor"
  function lockupSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.darkUI, c = ctx(p, opts), tc = textColor(cw);
    const body = inner(p, c, opts.tier || "min");   // word already reads in the wordmark
    const W = 340, H = 100;
    const bg = cw.bg && cw.bg !== "transparent" ? `<rect width="${W}" height="${H}" fill="${cw.bg}"/>` : "";
    const sub = cw.mode === "light" ? "#6E6A5C" : "#9C9CA4";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${opts.size ? ` width="${opts.size}"` : ""} fill="none">${bg}` +
      `<g transform="translate(2 18) scale(0.64)">${body}</g>` +
      logotype(38, 80, 62, tc, sub).markup + "</svg>";
  }

  // stacked: mark over "ikmal editor"
  function stackSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.darkUI, c = ctx(p, opts), tc = textColor(cw);
    const body = inner(p, c, opts.tier || "min");
    const W = 190, H = 196;
    const bg = cw.bg && cw.bg !== "transparent" ? `<rect width="${W}" height="${H}" fill="${cw.bg}"/>` : "";
    const sub = cw.mode === "light" ? "#6E6A5C" : "#9C9CA4";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${opts.size ? ` width="${opts.size}"` : ""} fill="none">${bg}` +
      `<g transform="translate(45 8) scale(1)">${body}</g>` +
      wordCentered("ikmal", 30, 95, 152, tc) +
      wordCentered("editor", 19, 95, 180, sub) + "</svg>";
  }

  /* ── app icons ────────────────────────────────────────── */
  function fieldPaint(opts) {
    const t = opts.theme || THEME;
    const style = ICON_FIELDS.includes(opts.field) ? opts.field : "gradient";
    const gid = uid("edfld");
    if (style === "ink") {
      return { gid, style, t,
        defs: `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(t.dark, "#1B1A22", 0.8)}"/><stop offset="1" stop-color="#131217"/></linearGradient>`,
        fill: `url(#${gid})`, sheen: 0.05 };
    }
    if (style === "solid") return { gid, style, t, defs: "", fill: t.light, sheen: 0.12 };
    return { gid, style, t,
      defs: `<linearGradient id="${gid}" x1="0.12" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${t.grad[0]}"/><stop offset="1" stop-color="${mix(t.grad[1], "#000000", 0.14)}"/></linearGradient>`,
      fill: `url(#${gid})`, sheen: 0.16 };
  }
  const iconMark = (p, f, tier) => inner(p,
    f.style === "ink"
      ? { fg: "#ECECF3", ac: f.t.dark, ringOp: 0.55 }
      : { fg: "#FFFFFF", ac: "#FFFFFF", ringOp: 0.92 },
    tier);
  const sheenDef = (id, op) =>
    `<radialGradient id="${id}" cx="0.5" cy="-0.08" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="${op}"/><stop offset="0.72" stop-color="#fff" stop-opacity="0"/></radialGradient>`;

  function iconBody(p, opts, geom) {
    const f = fieldPaint(opts), sid = uid("edsh");
    const tier = opts.tier || tierFor(p, opts.size || 1024);
    return `<defs>${f.defs}${sheenDef(sid, f.sheen)}</defs>` + geom(f, sid) +
      `<g ${place(50, geom.cy || 50, geom.scale || 0.64)}>${iconMark(p, f, tier)}</g>`;
  }

  function appIconSVG(p, opts = {}) {
    const f = fieldPaint(opts), sid = uid("edsh"), r = opts.round != null ? opts.round : 22;
    return svgHead("0 0 100 100", opts.size || 1024) + `<defs>${f.defs}${sheenDef(sid, f.sheen)}</defs>` +
      `<rect width="100" height="100" rx="${r}" fill="${f.fill}"/><rect width="100" height="100" rx="${r}" fill="url(#${sid})"/>` +
      `<g ${place(50, 50, 0.64)}>${iconMark(p, f, opts.tier || tierFor(p, opts.size || 1024))}</g></svg>`;
  }
  function iosIconSVG(p, opts = {}) {
    const f = fieldPaint(opts), sid = uid("edsh");
    return svgHead("0 0 100 100", opts.size || 1024) + `<defs>${f.defs}${sheenDef(sid, f.sheen)}</defs>` +
      `<rect width="100" height="100" fill="${f.fill}"/><rect width="100" height="100" fill="url(#${sid})"/>` +
      `<g ${place(50, 50, 0.64)}>${iconMark(p, f, opts.tier || "full")}</g></svg>`;
  }
  function macIconSVG(p, opts = {}) {
    const f = fieldPaint(opts), sid = uid("edsh"), fid = uid("edmacsh");
    return svgHead("0 0 100 100", opts.size || 1024) +
      `<defs>${f.defs}${sheenDef(sid, f.sheen)}<filter id="${fid}" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.6" flood-color="#000" flood-opacity="0.30"/></filter></defs>` +
      `<rect x="10.5" y="9" width="79" height="79" rx="18" fill="${f.fill}" filter="url(#${fid})"/>` +
      `<rect x="10.5" y="9" width="79" height="79" rx="18" fill="url(#${sid})"/>` +
      `<g ${place(50, 48.5, 0.5)}>${iconMark(p, f, opts.tier || tierFor(p, opts.size || 1024))}</g></svg>`;
  }
  function maskableIconSVG(p, opts = {}) {
    const f = fieldPaint(opts), sid = uid("edsh");
    return svgHead("0 0 100 100", opts.size || 512) + `<defs>${f.defs}${sheenDef(sid, f.sheen)}</defs>` +
      `<rect width="100" height="100" fill="${f.fill}"/><rect width="100" height="100" fill="url(#${sid})"/>` +
      `<g ${place(50, 50, 0.52)}>${iconMark(p, f, opts.tier || "full")}</g></svg>`;
  }

  // macOS menu-bar template: one ink, no field, no opacity tricks.
  // Template images are masked by the system, so everything must be solid black.
  function templateIconSVG(p, opts = {}) {
    const ink = opts.color || "#000000", size = opts.size || 44;
    const c = { fg: ink, ac: ink, ringOp: 1, s: opts.s || 1.15, flat: true };
    return svgHead("0 0 100 100", size) + inner(p, c, opts.tier || "min") + "</svg>";
  }

  // circular avatar
  function avatarSVG(p, opts = {}) {
    const dark = opts.light !== true;
    const fg = opts.fg || (dark ? "#D7D7DD" : "#3A372F");
    const ac = opts.ac || accentFor({ mode: dark ? "dark" : "light", fg }, opts.theme || THEME);
    return svgHead("0 0 100 100", opts.size || 512) +
      `<circle cx="50" cy="50" r="50" fill="${dark ? "#1E1E22" : "#F4F1E9"}"/>` +
      `<g ${place(50, 50, 0.78)}>${inner(p, { fg, ac, ringOp: p.ringOp }, opts.tier || "full")}</g></svg>`;
  }

  // one-color stamp (single ink)
  function stampSVG(p, opts = {}) {
    const color = opts.color || "#1C1B17";
    return svgHead("0 0 100 100", opts.size) +
      inner(p, { fg: color, ac: color, ringOp: 1, flat: true }, opts.tier || "min") + "</svg>";
  }

  /* ── collateral ───────────────────────────────────────── */
  const TAGLINE = "A real editor built just for you";

  function ogBannerSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.onSlate || COLORWAYS.darkUI;
    const c = ctx(p, { ...opts, cw }), tc = textColor(cw);
    const field = cw.bg && cw.bg !== "transparent" ? cw.bg : "#1E1E22";
    const sub = cw.mode === "light" ? "#8A8472" : "#9C9CA4";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" fill="none">` +
      `<rect width="1200" height="630" fill="${field}"/>` +
      `<g transform="translate(478 128) scale(2.44)">${inner(p, c, "full")}</g>` +
      logotypeCentered(82, 600, 466, tc, sub).markup +
      `<text x="600" y="524" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="28" fill="${sub}">${TAGLINE}</text></svg>`;
  }

  // wide README banner, 1280×320
  function readmeBannerSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.onSlate || COLORWAYS.darkUI;
    const c = ctx(p, { ...opts, cw }), tc = textColor(cw);
    const field = cw.bg && cw.bg !== "transparent" ? cw.bg : "#1E1E22";
    const sub = cw.mode === "light" ? "#8A8472" : "#9C9CA4";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 320" fill="none">` +
      `<rect width="1280" height="320" fill="${field}"/>` +
      `<g transform="translate(96 88) scale(1.44)">${inner(p, c, "full")}</g>` +
      logotype(54, 290, 152, tc, sub).markup +
      `<text x="292" y="196" font-family="${FONT}" font-weight="500" font-size="22" fill="${sub}">${TAGLINE}</text>` +
      `<rect x="292" y="222" width="228" height="3" rx="1.5" fill="${c.ac}" opacity="0.5"/>` +
      `<text x="292" y="258" font-family="ui-monospace,'SF Mono',Menlo,monospace" font-size="17" fill="${sub}">Local-first writing quality \u00b7 127.0.0.1 only</text></svg>`;
  }

  /* ── master (shared with the export studio) ───────────── */
  function loadMaster() {
    try {
      const s = JSON.parse(localStorage.getItem(MASTER_KEY) || "null");
      if (s && typeof s === "object") return { ...DEFAULT, ...s };
    } catch (e) {}
    return { ...DEFAULT };
  }
  const saveMaster = (p) => { try { localStorage.setItem(MASTER_KEY, JSON.stringify(p)); return true; } catch (e) { return false; } };
  const clearMaster = () => { try { localStorage.removeItem(MASTER_KEY); } catch (e) {} };
  const isMasterLocked = () => { try { return !!localStorage.getItem(MASTER_KEY); } catch (e) { return false; } };

  window.IkmalEditor = {
    DEFAULT, THEME, TAGLINE, COLORWAYS, THEMES, ICON_FIELDS, FONT, WORDS,
    accentFor, textColor, inner, innerFull, innerMin, tierFor, ctx, place, squiggle, ringMarkup,
    word, wordCentered, logotype, logotypeCentered, inkW,
    markSVG, lockupSVG, stackSVG, avatarSVG, stampSVG, templateIconSVG,
    appIconSVG, iosIconSVG, macIconSVG, maskableIconSVG,
    ogBannerSVG, readmeBannerSVG,
    MASTER_KEY, loadMaster, saveMaster, clearMaster, isMasterLocked,
  };
})();
