// editorgen.js — ikmal editor mark directions. Sits on top of markgen.js so the
// ring, palette and geometry stay identical to the tasks mark; only the interior
// changes. Pure SVG string builders.
(function () {
  const M = window.IkmalMark;
  const THEMES = M.THEMES, CW = M.COLORWAYS;
  const P = { ...M.DEFAULT };

  // ── primitives ───────────────────────────────────────────
  // rounded text line
  const line = (x, y, w, h, fill, op) =>
    `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(h / 2).toFixed(2)}" fill="${fill}" opacity="${op}"/>`;

  // squiggle: alternating quadratic half-periods
  function wave(x1, x2, y, amp, period) {
    let d = `M${x1.toFixed(2)} ${y.toFixed(2)}`, x = x1, up = true;
    const half = period / 2;
    while (x < x2 - 0.01) {
      const nx = Math.min(x + half, x2), mid = (x + nx) / 2;
      d += ` Q${mid.toFixed(2)} ${(y + (up ? -amp : amp)).toFixed(2)} ${nx.toFixed(2)} ${y.toFixed(2)}`;
      x = nx; up = !up;
    }
    return d;
  }
  const squiggle = (x1, x2, y, color, sw, amp = 1.9, period = 6.4) =>
    `<path d="${wave(x1, x2, y, amp, period)}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;

  // sine-modulated arc riding the ring circumference
  function ringSquiggle(r, a0, a1, amp, cycles, color, sw) {
    let d = "";
    const N = 96;
    for (let i = 0; i <= N; i++) {
      const t = i / N, th = (a0 + (a1 - a0) * t) * Math.PI / 180;
      const rr = r + amp * Math.sin(t * cycles * 2 * Math.PI);
      const x = 50 + rr * Math.cos(th), y = 50 + rr * Math.sin(th);
      d += (i ? " L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
    }
    return `<path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
  }

  // ring drawn as an arc with a gap between a0 and a1 (degrees, clockwise)
  function ringArc(r, a0, a1, color, sw, op) {
    const pt = (a) => [50 + r * Math.cos(a * Math.PI / 180), 50 + r * Math.sin(a * Math.PI / 180)];
    const span = ((a1 - a0) % 360 + 360) % 360, mid = a0 + span / 2;
    const [x0, y0] = pt(a0), [xm, ym] = pt(mid), [x1, y1] = pt(a1);
    return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${xm.toFixed(2)} ${ym.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" stroke="${color}" stroke-width="${sw}" opacity="${op}" fill="none" stroke-linecap="round"/>`;
  }

  // three centred text lines. returns { markup, rows:[{x,y,w,h}] }
  function textBlock(c, opts = {}) {
    const widths = opts.widths || [34, 25, 30];
    const h = opts.h || 5, pitch = opts.pitch || 10.5, x = opts.x != null ? opts.x : 33;
    const block = (widths.length - 1) * pitch + h, top = 50 - block / 2 + (opts.dy != null ? opts.dy : -2.6);
    const rows = widths.map((w, i) => ({ x, y: top + i * pitch, w, h }));
    const skip = opts.skip == null ? -1 : opts.skip;
    const markup = rows.map((r, i) =>
      i === skip ? "" : line(r.x, r.y, r.w, r.h, opts.fg || c.fg, opts.op != null ? opts.op : c.mut)
    ).join("");
    return { markup, rows };
  }

  // ── directions ───────────────────────────────────────────
  // each: fn(c) -> inner markup, where c = { fg, ac, mut, ringOp, s }
  const DIRECTIONS = [
    {
      id: "wordRing",
      name: "ikmal, underlined",
      note: "LOCKED, full tier. The name itself sits in the ring with the squiggle under it — the mark says what the app does to words by doing it to its own. Holds down to 48px; below that the word closes up and the small tier takes over.",
      draw(c) {
        const k = c.s || 1;
        return `<text x="50" y="52.5" text-anchor="middle" font-family="Inter,-apple-system,sans-serif" font-size="20" font-weight="700" letter-spacing="-1" fill="${c.fg}">ikmal</text>` +
          squiggle(29.5, 70.5, 62, c.ac, 3.1 * k, 2.1, 8.2);
      },
    },
    {
      id: "letterI",
      name: "Lowercase i",
      note: "One letter, underlined. Reads at any size, sits happily beside the tasks mark in a dock, and the tittle gives the ring an off-centre focal point the other directions don't have.",
      draw(c) {
        const k = c.s || 1;
        return `<text x="50" y="58" text-anchor="middle" font-family="Inter,-apple-system,sans-serif" font-size="46" font-weight="700" fill="${c.fg}">i</text>` +
          squiggle(36, 64, 66, c.ac, 3.3 * k, 2.3, 9.4);
      },
    },
    {
      id: "twoLine",
      name: "Two lines",
      note: "The mid tier: enough text to read as a document, few enough rows to stay open at 24px. Rows sit a touch heavier than the three-line version so they hold their weight when the third row is gone.",
      draw(c) {
        const t = textBlock(c, { widths: [34, 25], h: 5.4, pitch: 11.5, dy: -2 });
        const r = t.rows[1];
        return t.markup + squiggle(r.x + 0.4, r.x + r.w - 0.4, r.y + r.h + 4.2, c.ac, 2.8 * (c.s || 1), 2.2, 8.2);
      },
    },
    {
      id: "oneLineBreak",
      name: "Broken squiggle",
      note: "LOCKED, small tier. An unbroken line of prose above, and the squiggle beneath split into two runs at 64 / 78% — two flagged words in one line. The break is what stops the pair reading as a face, and the gap is wide enough to survive the pixel grid at 16px.",
      draw(c) {
        const k = c.s || 1, x = 30, w = 40, y = 55;
        return line(x, 40, w, 6, c.fg, c.mut + 0.14) +
          squiggle(x + 0.4, x + w * 0.64, y, c.ac, 3.4 * k, 2.4, 9.2) +
          squiggle(x + w * 0.78, x + w - 0.4, y, c.ac, 3.4 * k, 2.4, 9.2);
      },
    },
    {
      id: "oneLine",
      name: "Line over squiggle",
      note: "A single centred line with the squiggle full width beneath it. Legible, but the symmetry is a problem — two horizontal features stacked in a circle read as eyes and a mouth.",
      draw(c) {
        const k = c.s || 1;
        return line(32, 42, 36, 6, c.fg, c.mut + 0.14) +
          squiggle(32.4, 67.6, 57.5, c.ac, 3.4 * k, 2.4, 9.4);
      },
    },
    {
      name: "Just the squiggle",
      note: "One squiggle, centred in the ring, nothing else. The quietest possible statement of the idea — and the only direction with no small-size problem, because there is nothing to lose. Reads as a mark rather than a picture of a document.",
      draw(c) {
        const k = c.s || 1;
        return squiggle(31, 69, 50, c.ac, 4 * k, 3.4, 12.7);
      },
    },
    {
      id: "bareWide",
      name: "Squiggle, edge to edge",
      note: "The same idea drawn wider and flatter, so it fills the ring and the counter-space reads as deliberate. More cycles means it still says “squiggle” rather than “wave” when it shrinks.",
      draw(c) {
        const k = c.s || 1;
        return squiggle(28, 72, 50, c.ac, 3.6 * k, 2.7, 8.8);
      },
    },
    {
      id: "squiggle",
      name: "Underline",
      note: "Three lines of prose; the middle one carries a squiggle. The most direct read — this is a writing checker — and the closest visual echo of what the user actually sees while typing.",
      draw(c) {
        const t = textBlock(c);
        const r = t.rows[2];
        return t.markup + squiggle(r.x + 0.4, r.x + r.w - 0.4, r.y + r.h + 3.6, c.ac, 2.4 * (c.s || 1), 2, 7.4);
      },
    },
    {
      id: "ringwave",
      name: "Corrected ring",
      note: "The ring itself — the shared piece of the family — picks up the squiggle along its lower arc. Text stays plain. Least literal, and the strongest sibling signal: same silhouette as tasks, one detail changed.",
      noRing: true,
      draw(c) {
        const t = textBlock(c, { widths: [31, 23, 27], dy: -1.4 });
        const sw = P.ringW * (c.s || 1);
        return ringArc(P.ringR, 152, 28, c.fg, sw.toFixed(2), c.ringOp) + t.markup +
          ringSquiggle(P.ringR, 34, 146, 1.9, 5, c.ac, (sw * 0.9).toFixed(2));
      },
    },
    {
      id: "caret",
      name: "Insertion caret",
      note: "A proofreader's caret pushes up between two lines. Reads as editing rather than error-flagging, and holds at small sizes better than a wave.",
      draw(c) {
        const t = textBlock(c, { widths: [34, 25, 30] });
        const r = t.rows[2], cx = r.x + r.w / 2, y = r.y + r.h + 8.4, k = c.s || 1;
        return t.markup +
          `<path d="M${(cx - 6.4).toFixed(2)} ${y.toFixed(2)} L${cx.toFixed(2)} ${(y - 6.6).toFixed(2)} L${(cx + 6.4).toFixed(2)} ${y.toFixed(2)}" stroke="${c.ac}" stroke-width="${(2.6 * k).toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      },
    },
    {
      id: "tighten",
      name: "Tightened",
      note: "The long line is cut back to the short accent one, its tail left as a ghost. Speaks to the conciseness rule packs rather than to spelling — the thing this app adds on top of stock LanguageTool.",
      draw(c) {
        const t = textBlock(c, { widths: [34, 34, 34], skip: 2 });
        const r = t.rows[2];
        return t.markup +
          line(r.x + 17, r.y, 17, r.h, c.fg, 0.15) +
          line(r.x, r.y, 16, r.h, c.ac, 1);
      },
    },
    {
      id: "cursor",
      name: "Live cursor",
      note: "An accent caret sits in the middle line, mid-sentence. Quietest of the set: it says “writing surface”, and it is the only direction with no error semantics at all.",
      draw(c) {
        const t = textBlock(c, { widths: [34, 25, 19] });
        const r = t.rows[2], k = c.s || 1;
        return t.markup +
          `<rect x="${(r.x + r.w + 3.4).toFixed(2)}" y="${(r.y - 3.2).toFixed(2)}" width="${(2.8 * k).toFixed(2)}" height="${(r.h + 6.4).toFixed(2)}" rx="${(1.4 * k).toFixed(2)}" fill="${c.ac}"/>`;
      },
    },
    {
      id: "strike",
      name: "Struck line",
      note: "Classic copy-edit deletion: the middle line is ruled through. Legible down to 16px, but it reads as “cut” more than “improve”.",
      draw(c) {
        const t = textBlock(c, { widths: [34, 27, 30] });
        const r = t.rows[1], y = r.y + r.h / 2;
        return t.markup +
          `<path d="M${(r.x - 1.5).toFixed(2)} ${(y + 1.2).toFixed(2)} L${(r.x + r.w + 1.5).toFixed(2)} ${(y - 1.2).toFixed(2)}" stroke="${c.ac}" stroke-width="${(2.4 * (c.s || 1)).toFixed(2)}" stroke-linecap="round"/>`;
      },
    },
  ];

  const byId = (id) => DIRECTIONS.find((d) => d.id === id) || DIRECTIONS[0];

  // context colors for a colorway + theme
  function ctx(cw, theme, o = {}) {
    return {
      fg: o.fg || cw.fg,
      ac: o.ac || M.accentFor(cw, theme),
      mut: o.mut != null ? o.mut : 0.42,
      ringOp: o.ringOp != null ? o.ringOp : 0.3,
      s: o.s || 1,
    };
  }

  // full inner markup (ring + interior)
  function inner(dir, c, opts = {}) {
    const ring = (opts.noRing || byId(dir).noRing) ? "" :
      `<circle cx="50" cy="50" r="${P.ringR}" stroke="${c.fg}" stroke-width="${(P.ringW * (c.s || 1)).toFixed(2)}" opacity="${c.ringOp}" fill="none"/>`;
    return ring + byId(dir).draw(c);
  }

  function markSVG(dir, opts = {}) {
    const cw = opts.cw || CW.darkUI;
    const c = ctx(cw, opts.theme, opts);
    const bg = cw.bg && cw.bg !== "transparent"
      ? `<rect width="100" height="100"${opts.round ? ` rx="${opts.round}"` : ""} fill="${cw.bg}"/>` : "";
    const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${size} fill="none">${bg}${inner(dir, c, opts)}</svg>`;
  }

  // wordmark lockups: "ikmal editor" where the squiggle sits under "editor"
  // rather than inside a ring. w = target width in px; returns inline SVG.
  function wordmarkSVG(opts = {}) {
    const fg = opts.fg || "#FFFFFF", ac = opts.ac || THEMES.violet.dark;
    const px = opts.size || 260, bold = opts.bold !== false;
    const fs = 46, ik = "ikmal", ed = "editor";
    // approximate advance widths for Inter at 46px, -0.04em tracking
    const wIk = 108, gap = 13, wEd = 118, pad = 4;
    const total = pad * 2 + wIk + gap + wEd, h = 78;
    const baseline = 50, sqY = baseline + 13;
    const x0 = pad, x1 = pad + wIk + gap;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${h}" width="${px}" height="${(px * h / total).toFixed(1)}" fill="none">` +
      `<text x="${x0}" y="${baseline}" font-family="Inter,-apple-system,sans-serif" font-size="${fs}" font-weight="${bold ? 700 : 600}" letter-spacing="-1.9" fill="${fg}">${ik}</text>` +
      `<text x="${x1}" y="${baseline}" font-family="Inter,-apple-system,sans-serif" font-size="${fs}" font-weight="400" letter-spacing="-1.9" fill="${opts.edFg || fg}" opacity="${opts.edOp || 1}">${ed}</text>` +
      squiggle(x1 + 1, x1 + wEd - 5, sqY, ac, 3.4, 2.5, 10.4) +
      `</svg>`;
  }
  // mark + wordmark on one line
  function lockupSVG(dir, opts = {}) {
    const px = opts.size || 300, mk = Math.round(px * 0.2);
    return `<span style="display:inline-flex;align-items:center;gap:${Math.round(px * 0.05)}px">` +
      `<span style="width:${mk}px;height:${mk}px;flex:0 0 auto;display:block">${markSVG(dir, { ...opts, size: mk })}</span>` +
      wordmarkSVG({ ...opts, size: Math.round(px * 0.72) }) + `</span>`;
  }

  // app icon: deep field, high-contrast mark (mirrors markgen's icon engine)
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
    const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
    const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  let gid = 0;
  function appIconSVG(dir, opts = {}) {
    const t = opts.theme || THEMES.violet, field = opts.field || "gradient", id = "efld" + ++gid;
    let defs = "", fill = t.light, sheen = 0.12;
    if (field === "ink") {
      defs = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(t.dark, "#1B1A22", 0.8)}"/><stop offset="1" stop-color="#131217"/></linearGradient>`;
      fill = `url(#${id})`; sheen = 0.05;
    } else if (field === "gradient") {
      defs = `<linearGradient id="${id}" x1="0.12" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${t.grad[0]}"/><stop offset="1" stop-color="${mix(t.grad[1], "#000000", 0.14)}"/></linearGradient>`;
      fill = `url(#${id})`; sheen = 0.16;
    }
    const sid = id + "s";
    const c = field === "ink"
      ? { fg: "#ECECF3", ac: t.dark, mut: 0.5, ringOp: 0.55 }
      : { fg: "#FFFFFF", ac: "#FFFFFF", mut: 0.64, ringOp: 0.92 };
    const sc = 0.64, tx = (50 - 50 * sc).toFixed(2);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${opts.size || 512}" height="${opts.size || 512}" fill="none">` +
      `<defs>${defs}<radialGradient id="${sid}" cx="0.5" cy="-0.08" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="${sheen}"/><stop offset="0.72" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
      `<rect width="100" height="100" rx="${opts.round != null ? opts.round : 22}" fill="${fill}"/>` +
      `<rect width="100" height="100" rx="${opts.round != null ? opts.round : 22}" fill="url(#${sid})"/>` +
      `<g transform="translate(${tx} ${tx}) scale(${sc})">${inner(dir, c)}</g></svg>`;
  }

  window.IkmalEditorMark = { P, DIRECTIONS, byId, ctx, inner, markSVG, appIconSVG, wordmarkSVG, lockupSVG, squiggle, ringSquiggle, ringArc, textBlock, THEMES, CW };
})();
