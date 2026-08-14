// markgen.js — single source of truth for the ikmal loop+list mark.
// Produces SVG strings (preview injection AND file export) so what you see is
// exactly what exports. Pure string builder, no React.

(function () {
  const WIDTHS = [28, 18, 24];            // long · short · medium (default row lengths)
  const MUT = 0.42;
  const DEFAULT = { k: 1, dx: -2, dy: 0, pitch: 12.5, ringR: 33, ringW: 7, markers: true, checkAt: 0, ringOp: 0.3, mutedOp: 0.42, iconFit: 1, widths: [28, 18, 24] };

  // Neutral contexts. mode drives which accent shade is used.
  const COLORWAYS = {
    darkUI:   { id: "darkUI",   name: "On dark",   fg: "#D7D7DD", bg: "transparent", mode: "dark" },
    lightUI:  { id: "lightUI",  name: "On light",  fg: "#3A372F", bg: "transparent", mode: "light" },
    onSlate:  { id: "onSlate",  name: "Slate tile", fg: "#D7D7DD", bg: "#1E1E22", mode: "dark" },
    onCream:  { id: "onCream",  name: "Cream tile", fg: "#3A372F", bg: "#F4F1E9", mode: "light" },
    monoDark: { id: "monoDark", name: "Mono ink",   fg: "#1C1B17", bg: "transparent", mode: "mono" },
    monoLight:{ id: "monoLight",name: "Mono paper", fg: "#F3F0E8", bg: "transparent", mode: "mono" },
  };

  // Accent themes — match the design-system "notebook" semantics.
  const THEMES = {
    violet:     { id: "violet",     name: "Violet",     dark: "#8E80DF", light: "#6253C0", grad: ["#8B7CE0", "#4B3F9C"] },
    amber:      { id: "amber",      name: "Amber",      dark: "#E0A458", light: "#C2832E", grad: ["#E8B570", "#B47A2E"] },
    terracotta: { id: "terracotta", name: "Terracotta", dark: "#D67560", light: "#B85240", grad: ["#E08A72", "#A84F3C"] },
    sage:       { id: "sage",       name: "Sage",       dark: "#6FA37C", light: "#4E8260", grad: ["#82B88E", "#46795A"] },
    steel:      { id: "steel",      name: "Steel",      dark: "#6B8AAF", light: "#4F6E92", grad: ["#7F9DC0", "#46618A"] },
    neutral:    { id: "neutral",    name: "Monochrome", dark: "#B9B9C2", light: "#55524A", grad: ["#6E6E78", "#39383F"] },
  };

  function accentFor(cw, theme) {
    const t = theme || THEMES.violet;
    if (cw.mode === "mono") return cw.fg;
    return cw.mode === "light" ? t.light : t.dark;
  }

  function geom(p) {
    const k = p.k;
    const h = 7 * k, pitch = p.pitch * k, lx = 44 + p.dx, mx = 36 + p.dx;
    const w = (p.widths || WIDTHS).map((x) => x * k);
    const blockH = 2 * pitch + h;
    const top = 50 - blockH / 2 + p.dy;
    const rowY = [0, 1, 2].map((i) => top + i * pitch);
    return { h, pitch, lx, mx, w, rowY, k };
  }

  // ring only. c = {fg, s, flat}
  function ringMarkup(p, c) {
    const s = c.s || 1;
    const ringOp = c.flat ? 1 : (c.ringOp != null ? c.ringOp : (p.ringOp != null ? p.ringOp : 0.3));
    return `<circle cx="50" cy="50" r="${p.ringR}" stroke="${c.fg}" stroke-width="${(p.ringW * s).toFixed(2)}" opacity="${ringOp}" fill="none"/>`;
  }

  // rows + markers only. c = {fg, ac, s, flat}
  function rowsMarkup(p, c) {
    const g = geom(p), s = c.s || 1;
    const mut = c.flat ? 1 : (c.mutedOp != null ? c.mutedOp : (p.mutedOp != null ? p.mutedOp : MUT));
    let out = "";
    for (let i = 0; i < 3; i++) {
      const y = g.rowY[i], my = y + g.h / 2, isCheck = i === p.checkAt;
      const fill = isCheck ? c.ac : c.fg, op = isCheck ? 1 : mut;
      out += `<rect x="${g.lx.toFixed(2)}" y="${y.toFixed(2)}" width="${g.w[i].toFixed(2)}" height="${g.h.toFixed(2)}" rx="${(g.h / 2).toFixed(2)}" fill="${fill}" opacity="${op}"/>`;
      if (p.markers) {
        if (isCheck) {
          const mx = g.mx;
          out += `<path d="M${(mx - 4 * g.k).toFixed(2)} ${my.toFixed(2)} L${(mx - g.k).toFixed(2)} ${(my + 3 * g.k).toFixed(2)} L${(mx + 4.2 * g.k).toFixed(2)} ${(my - 4 * g.k).toFixed(2)}" stroke="${c.ac}" stroke-width="${(2.4 * s).toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        } else {
          out += `<circle cx="${g.mx.toFixed(2)}" cy="${my.toFixed(2)}" r="${(2.2 * g.k).toFixed(2)}" fill="${c.fg}" opacity="${mut}"/>`;
        }
      }
    }
    return out;
  }

  // inner markup (no <svg> wrapper, no bg). c = {fg, ac, s, flat}
  function inner(p, c) { return ringMarkup(p, c) + rowsMarkup(p, c); }

  // place the 100-unit mark so its center lands at (cx,cy) at the given scale.
  // base is the icon's default scale; iconFit (from p) dials it bigger/smaller in place.
  function place(p, cx, cy, base) {
    const sc = base * (p.iconFit != null ? p.iconFit : 1);
    const tx = (cx - 50 * sc).toFixed(2), ty = (cy - 50 * sc).toFixed(2);
    return `transform="translate(${tx} ${ty}) scale(${sc.toFixed(3)})"`;
  }

  // full mark SVG string. opts: { cw, theme, size, s, round, fg, ac }
  function markSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.darkUI;
    const fg = opts.fg || cw.fg;
    const ac = opts.ac || accentFor(cw, opts.theme);
    const s = opts.s || 1;
    const bg = cw.bg && cw.bg !== "transparent"
      ? (opts.round ? `<rect width="100" height="100" rx="${opts.round}" fill="${cw.bg}"/>` : `<rect width="100" height="100" fill="${cw.bg}"/>`)
      : "";
    const body = inner(p, { fg, ac, s });
    const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${size} fill="none">${bg}${body}</svg>`;
  }

  function textColor(cw) {
    return cw.mode === "light" ? "#1C1B17" : (cw.mode === "mono" ? cw.fg : "#E8E8EC");
  }

  // horizontal lockup: mark + "ikmal". Uses Inter via <text> (web). opts {cw, theme, size}
  function lockupSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.darkUI;
    const ac = opts.ac || accentFor(cw, opts.theme);
    const body = inner(p, { fg: opts.fg || cw.fg, ac });
    const tc = textColor(cw);
    const W = 300, H = 100;
    const bg = cw.bg && cw.bg !== "transparent" ? `<rect width="${W}" height="${H}" fill="${cw.bg}"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none">${bg}
      <g transform="translate(4 14) scale(0.72)">${body}</g>
      <text x="86" y="51" dominant-baseline="middle" font-family="Inter, sans-serif" font-weight="700" font-size="42" letter-spacing="-1.3" fill="${tc}">ikmal</text>
    </svg>`;
  }

  // stacked lockup: mark above wordmark
  function stackSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.darkUI;
    const ac = opts.ac || accentFor(cw, opts.theme);
    const body = inner(p, { fg: opts.fg || cw.fg, ac });
    const tc = textColor(cw);
    const W = 160, H = 190;
    const bg = cw.bg && cw.bg !== "transparent" ? `<rect width="${W}" height="${H}" fill="${cw.bg}"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none">${bg}
      <g transform="translate(40 6) scale(0.8)">${body}</g>
      <text x="80" y="160" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="38" letter-spacing="-1.2" fill="${tc}">ikmal</text>
    </svg>`;
  }

  // ── icons & platform deliverables ────────────────────────
  let _gid = 0;
  const uid = (pre) => pre + (++_gid);
  function gradDefs(id, t) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.grad[0]}"/><stop offset="1" stop-color="${t.grad[1]}"/></linearGradient>`;
  }
  const svgHead = (vb, size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${size ? ` width="${size}" height="${size}"` : ""} fill="none">`;

  // linear blend of two #rrggbb hexes (t=0 → a, t=1 → b)
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
    const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
    const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }

  // ── app-icon engine ──────────────────────────────────────
  // App icons live on arbitrary home-screen wallpapers, so the mark is drawn at
  // MUCH higher opacity than the in-UI mark (which is tuned for a calm dark
  // surface). Three field styles, all high-contrast:
  //   gradient — deep diagonal accent gradient, crisp white mark (default)
  //   ink      — near-black slate field, accent-tinted check (best across wallpapers)
  //   solid    — flat accent field, white mark
  const ICON_FIELDS = ["gradient", "ink", "solid"];
  function fieldPaint(opts) {
    const t = opts.theme || THEMES.violet;
    const style = ICON_FIELDS.includes(opts.field) ? opts.field : "gradient";
    const gid = uid("ikfld");
    if (style === "ink") {
      const top = mix(t.dark, "#1B1A22", 0.80);
      return { gid, style, t,
        defs: `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="#131217"/></linearGradient>`,
        fill: `url(#${gid})`, sheen: 0.05 };
    }
    if (style === "solid") {
      return { gid, style, t, defs: "", fill: t.light, sheen: 0.12 };
    }
    return { gid, style, t,
      defs: `<linearGradient id="${gid}" x1="0.12" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${t.grad[0]}"/><stop offset="1" stop-color="${mix(t.grad[1], "#000000", 0.14)}"/></linearGradient>`,
      fill: `url(#${gid})`, sheen: 0.16 };
  }
  // high-contrast mark for the chosen field
  function iconMark(p, f) {
    return f.style === "ink"
      ? inner(p, { fg: "#ECECF3", ac: f.t.dark, ringOp: 0.55, mutedOp: 0.5 })
      : inner(p, { fg: "#FFFFFF", ac: "#FFFFFF", ringOp: 0.92, mutedOp: 0.64 });
  }
  // soft top sheen for depth (drawn as a second copy of the shape so it clips cleanly)
  const sheenDef = (id, op) => `<radialGradient id="${id}" cx="0.5" cy="-0.08" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="${op}"/><stop offset="0.72" stop-color="#fff" stop-opacity="0"/></radialGradient>`;

  // generic rounded themed field (studio preview, generic app icon)
  function appIconSVG(p, opts = {}) {
    const f = fieldPaint(opts), sid = uid("iksh");
    return `${svgHead("0 0 100 100", opts.size || 1024)}<defs>${f.defs}${sheenDef(sid, f.sheen)}</defs>` +
      `<rect width="100" height="100" rx="22" fill="${f.fill}"/><rect width="100" height="100" rx="22" fill="url(#${sid})"/>` +
      `<g ${place(p, 50, 50, 0.64)}>${iconMark(p, f)}</g></svg>`;
  }

  // iOS — full-bleed square, NO rounded corners, NO transparency (system masks it)
  function iosIconSVG(p, opts = {}) {
    const f = fieldPaint(opts), sid = uid("iksh");
    return `${svgHead("0 0 100 100", opts.size || 1024)}<defs>${f.defs}${sheenDef(sid, f.sheen)}</defs>` +
      `<rect width="100" height="100" fill="${f.fill}"/><rect width="100" height="100" fill="url(#${sid})"/>` +
      `<g ${place(p, 50, 50, 0.64)}>${iconMark(p, f)}</g></svg>`;
  }

  // macOS — rounded squircle inset on a transparent canvas, soft shadow
  function macIconSVG(p, opts = {}) {
    const f = fieldPaint(opts), sid = uid("iksh"), fid = uid("ikmacsh");
    return `${svgHead("0 0 100 100", opts.size || 1024)}<defs>${f.defs}${sheenDef(sid, f.sheen)}` +
      `<filter id="${fid}" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.6" flood-color="#000" flood-opacity="0.30"/></filter></defs>` +
      `<rect x="10.5" y="9" width="79" height="79" rx="18" fill="${f.fill}" filter="url(#${fid})"/>` +
      `<rect x="10.5" y="9" width="79" height="79" rx="18" fill="url(#${sid})"/>` +
      `<g ${place(p, 50, 48.5, 0.5)}>${iconMark(p, f)}</g></svg>`;
  }

  // Android adaptive — foreground (mark in safe zone, transparent)
  function androidFgSVG(p, opts = {}) {
    const f = fieldPaint(opts);
    return `${svgHead("0 0 100 100", opts.size || 432)}<g ${place(p, 50, 50, 0.5)}>${iconMark(p, f)}</g></svg>`;
  }
  // Android adaptive — background (themed field, full bleed)
  function androidBgSVG(opts = {}) {
    const f = fieldPaint(opts), sid = uid("iksh");
    return `${svgHead("0 0 100 100", opts.size || 432)}<defs>${f.defs}${sheenDef(sid, f.sheen)}</defs>` +
      `<rect width="100" height="100" fill="${f.fill}"/><rect width="100" height="100" fill="url(#${sid})"/></svg>`;
  }

  // PWA maskable — full-bleed field, mark inside the 80% safe zone (extra padding)
  function maskableIconSVG(p, opts = {}) {
    const f = fieldPaint(opts), sid = uid("iksh");
    return `${svgHead("0 0 100 100", opts.size || 512)}<defs>${f.defs}${sheenDef(sid, f.sheen)}</defs>` +
      `<rect width="100" height="100" fill="${f.fill}"/><rect width="100" height="100" fill="url(#${sid})"/>` +
      `<g ${place(p, 50, 50, 0.52)}>${iconMark(p, f)}</g></svg>`;
  }

  // circular avatar: solid field + mark
  function avatarSVG(p, opts = {}) {
    const dark = opts.light !== true;
    const fg = opts.fg || (dark ? "#D7D7DD" : "#3A372F");
    const ac = opts.ac || accentFor({ mode: dark ? "dark" : "light", fg }, opts.theme);
    const field = dark ? "#1E1E22" : "#F4F1E9";
    return `${svgHead("0 0 100 100", opts.size || 512)}<circle cx="50" cy="50" r="50" fill="${field}"/>` +
      `<g ${place(p, 50, 50, 0.78)}>${inner(p, { fg, ac })}</g></svg>`;
  }

  // ── collateral ───────────────────────────────────────────
  // one-color stamp (single ink, flat opacity) — markers carry the "done" meaning
  function stampSVG(p, opts = {}) {
    const color = opts.color || "#1C1B17";
    const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${size} fill="none">${inner(p, { fg: color, ac: color, flat: true })}</svg>`;
  }

  // email-signature lockup: mark · wordmark · divider · tagline (web; live Inter)
  function emailSigSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.lightUI;
    const ac = opts.ac || accentFor(cw, opts.theme);
    const tc = textColor(cw), body = inner(p, { fg: opts.fg || cw.fg, ac });
    const W = 470, H = 96, div = cw.mode === "light" ? "#D8D2C4" : "#3A3A42", sub = cw.mode === "light" ? "#8A8472" : "#9C9CA4";
    const bg = cw.bg && cw.bg !== "transparent" ? `<rect width="${W}" height="${H}" fill="${cw.bg}"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none">${bg}
      <g transform="translate(6 18) scale(0.6)">${body}</g>
      <text x="76" y="42" font-family="Inter, sans-serif" font-weight="700" font-size="30" letter-spacing="-0.9" fill="${tc}">ikmal</text>
      <rect x="178" y="26" width="1.4" height="44" fill="${div}"/>
      <text x="196" y="41" font-family="Inter, sans-serif" font-weight="600" font-size="14" fill="${tc}">Every reminder, one place</text>
      <text x="196" y="61" font-family="Inter, sans-serif" font-weight="400" font-size="12.5" fill="${sub}">ikmal.app</text>
    </svg>`;
  }

  // social / OG banner 1200×630 (web; live Inter)
  function ogBannerSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.onSlate;
    const ac = opts.ac || accentFor(cw, opts.theme);
    const tc = textColor(cw), body = inner(p, { fg: opts.fg || cw.fg, ac });
    const field = cw.bg && cw.bg !== "transparent" ? cw.bg : "#1E1E22";
    const sub = cw.mode === "light" ? "#8A8472" : "#9C9CA4";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" fill="none">
      <rect width="1200" height="630" fill="${field}"/>
      <g transform="translate(478 138) scale(2.44)">${body}</g>
      <text x="600" y="470" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="92" letter-spacing="-3" fill="${tc}">ikmal</text>
      <text x="600" y="530" text-anchor="middle" font-family="Inter, sans-serif" font-weight="500" font-size="30" fill="${sub}">Every reminder, one place</text>
    </svg>`;
  }

  // animated loading spinner (SMIL) — accent arc sweeps the ring, list sits inside
  function spinnerSVG(p, opts = {}) {
    const cw = opts.cw || COLORWAYS.darkUI;
    const fg = opts.fg || cw.fg;
    const ac = opts.ac || accentFor(cw, opts.theme);
    const dur = opts.dur || 1.25, size = opts.size || 96;
    const C = 2 * Math.PI * p.ringR, arc = (C * 0.26).toFixed(2), gap = (C * 0.74).toFixed(2);
    return `${svgHead("0 0 100 100", size)}` +
      ringMarkup(p, { fg }) +
      `<circle cx="50" cy="50" r="${p.ringR}" stroke="${ac}" stroke-width="${p.ringW.toFixed(2)}" fill="none" stroke-linecap="round" stroke-dasharray="${arc} ${gap}">` +
      `<animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="${dur}s" repeatCount="indefinite"/></circle>` +
      rowsMarkup(p, { fg, ac }) + `</svg>`;
  }

  // Shared "locked" geometry. The studio writes it; the asset sheet reads it.
  // Falls back to DEFAULT when nothing has been locked yet.
  const MASTER_KEY = "ikmal_master";
  function loadMaster() {
    try {
      const s = JSON.parse(localStorage.getItem(MASTER_KEY) || "null");
      if (s && typeof s === "object") return { ...DEFAULT, ...s };
    } catch (e) {}
    return { ...DEFAULT };
  }
  function saveMaster(p) {
    try { localStorage.setItem(MASTER_KEY, JSON.stringify(p)); return true; }
    catch (e) { return false; }
  }
  function clearMaster() {
    try { localStorage.removeItem(MASTER_KEY); } catch (e) {}
  }
  function isMasterLocked() {
    try { return !!localStorage.getItem(MASTER_KEY); } catch (e) { return false; }
  }

  window.IkmalMark = {
    WIDTHS, DEFAULT, COLORWAYS, THEMES, MUT, ICON_FIELDS,
    accentFor, geom, inner, ringMarkup, rowsMarkup, place, textColor,
    markSVG, lockupSVG, stackSVG, avatarSVG,
    appIconSVG, iosIconSVG, macIconSVG, androidFgSVG, androidBgSVG, maskableIconSVG,
    stampSVG, emailSigSVG, ogBannerSVG, spinnerSVG,
    MASTER_KEY, loadMaster, saveMaster, clearMaster, isMasterLocked,
  };
})();
