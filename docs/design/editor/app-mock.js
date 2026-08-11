// app-mock.js — markup builders for the ikmal editor desktop shell.
// The restyle states reproduce the repo's real desktop/index.html markup and
// renderer.js output verbatim, so what is styled here drops straight in.
(function () {
  const E = window.IkmalEditor, EP = E.loadMaster();
  const TH = E.THEME;

  const icon = (size, round) => E.appIconSVG(EP, { theme: TH, field: "ink", size, round: round != null ? round : 22, tier: "full" });
  const brandIcon = (size) => `<div class="brand-icon" style="width:${size}px;height:${size}px">${icon(size, 22)}</div>`;

  const HEADER = (statusClass, statusLabel) => `<header class="app-header">
  <div class="brand-lockup">${brandIcon(28)}
    <div><div class="eyebrow">LOCAL WRITING QUALITY</div><h1>Ikmal Editor</h1></div>
  </div>
  <div class="service-summary ${statusClass}" title="Service status"><span class="status-dot"></span><span>${statusLabel}</span></div>
</header>`;

  const TABS = (active) => `<nav class="tabs" aria-label="Application sections">
  ${[["writing-panel", "Writing test"], ["history-panel", "Recent"], ["settings-panel", "Settings"]]
      .map(([id, label]) => `<button class="tab${id === active ? " is-active" : ""}" data-panel="${id}">${label}</button>`).join("")}
</nav>`;

  const FOOTER = `<footer class="app-footer"><span>Local-first writing quality</span><span class="footer-version">0.9 beta</span></footer>`;

  const shell = (active, panels, statusClass = "is-ready", statusLabel = "Ready") =>
    `<main class="app-shell">${HEADER(statusClass, statusLabel)}${TABS(active)}${panels}${FOOTER}</main>`;

  // ── writing panel ────────────────────────────────────────
  const SAMPLE = "In order to facilitate the utilisation of the local server, the manager will automatically detect Java. Plants, by comparison, produces its own light.";

  const resultCard = (o) => `<article class="result-card">
  <div class="result-topline"><span class="result-category">${o.source}</span><span class="result-offset">${o.chars} chars</span></div>
  <p class="result-message">${o.message}</p>
  <div class="suggestion-chip"><span class="chip-label">Suggested change</span><strong>${o.suggestion}</strong></div>
  ${o.occurrence || ""}${o.related || ""}
  <button class="result-apply" type="button">${o.apply || "Apply suggestion"}</button>
</article>`;

  function writingPanel(opts = {}) {
    if (opts.empty) {
      return `<section class="panel is-active" id="writing-panel">
  <div class="panel-heading"><div><p class="section-kicker">LOCAL CHECK</p><h2>Try a passage</h2></div>
    <button class="button button-quiet">Load sample</button></div>
  <textarea id="writing-input" placeholder="Paste or write a short passage here…"></textarea>
  <div class="editor-footer"><span id="word-count">0 words</span>
    <div class="editor-actions"><button class="button button-quiet">Clear</button><button class="button button-primary">Check writing <span class="button-shortcut">⌘↵</span></button></div></div>
  <section class="results"><div class="empty-state"><span class="empty-mark">✦</span><p>Suggestions will appear here.</p><small>Checks stay on this computer.</small></div></section>
</section>`;
    }
    return `<section class="panel is-active" id="writing-panel">
  <div class="panel-heading"><div><p class="section-kicker">LOCAL CHECK</p><h2>Try a passage</h2></div>
    <button class="button button-quiet">Load sample</button></div>
  <textarea id="writing-input" spellcheck="false">${SAMPLE}</textarea>
  <div class="editor-footer"><span id="word-count">23 words</span>
    <div class="editor-actions"><button class="button button-quiet">Clear</button><button class="button button-primary">Check writing <span class="button-shortcut">⌘↵</span></button></div></div>
  <div class="notice">Review the suggestions below.</div>
  <div class="check-summary">3 suggestions · 127.0.0.1:8096 · 41&nbsp;ms</div>
  <section class="antecedent-links" aria-label="Pronoun antecedent links">
    <div class="antecedent-heading">Pronoun links</div>
    <div class="antecedent-list"><button class="antecedent-link">its → Plants</button><button class="antecedent-link">the manager</button></div>
  </section>
  <section class="results">
    ${resultCard({
      source: "Conciseness", chars: 12,
      message: "“In order to” is wordy. PlainLanguage.gov recommends the shorter form.",
      suggestion: "Replace “In order to” with “To”",
    })}
    ${resultCard({
      source: "LanguageTool + 1 related", chars: 8,
      message: "The plural subject “Plants” does not agree with the verb “produces”.",
      suggestion: "Replace “produces” with “produce”",
      related: `<details class="related-findings"><summary>Also flagged by Quality model</summary>
      <div class="related-list"><div class="related-finding"><strong>Quality model</strong><span>Subject–verb agreement is unlikely here.</span><small>Suggested: produce</small></div></div></details>`,
    })}
    ${resultCard({
      source: "Plain English", chars: 11,
      message: "Prefer the everyday word. “Utilisation” adds length without meaning.",
      suggestion: "Replace “the utilisation of” with “using”",
      occurrence: `<div class="occurrence-preview" aria-label="All related occurrences"><span>Occurrences</span>
      <p>…facilitate <mark>the utilisation of</mark> the local server…</p></div>`,
    })}
  </section>
</section>`;
  }

  // ── history panel ────────────────────────────────────────
  const historyCard = (when, count, text) => `<article class="history-card">
  <div class="history-topline"><span>${when}</span><span>${count} suggestion${count === 1 ? "" : "s"}</span></div>
  <p>${text}</p>
  <button class="history-open" type="button">Open and check again</button>
</article>`;

  const historyPanel = () => `<section class="panel is-active" id="history-panel">
  <div class="panel-heading"><div><p class="section-kicker">LOCAL HISTORY</p><h2>Recent checks</h2></div>
    <button class="button button-quiet" type="button">Clear</button></div>
  <section class="history-list">
    ${historyCard("Aug 3, 2026, 9:41 AM", 3, "In order to facilitate the utilisation of the local server, the manager will automatically detect Java. Plants, by comparison, produces its own light.")}
    ${historyCard("Aug 2, 2026, 6:12 PM", 1, "The release notes should be written prior to the tag being pushed, so that the changelog stays accurate.")}
    ${historyCard("Aug 1, 2026, 11:04 AM", 0, "Ikmal Editor runs entirely on your machine. Nothing leaves the loopback interface.")}
  </section>
</section>`;

  // ── settings panel ───────────────────────────────────────
  const settingsPanel = (opts = {}) => `<section class="panel is-active" id="settings-panel">
  <div class="panel-heading"><div><p class="section-kicker">APP CONTROL</p><h2>Service settings</h2></div></div>
  <div class="setting-card">
    <div><strong>Ikmal services</strong><p>Runs LanguageTool and the quality proxy for browser extensions.</p></div>
    <div class="setting-actions"><button class="button button-primary" disabled>Start</button><button class="button button-quiet">Stop</button></div>
  </div>
  <div class="service-status-grid" aria-label="Service health">
    <div class="service-status-item"><span class="mini-status-dot is-ready"></span><span><strong>LanguageTool</strong><small>Ready</small></span></div>
    <div class="service-status-item"><span class="mini-status-dot ${opts.qualityReady === false ? "is-unavailable" : "is-ready"}"></span><span><strong>Quality checks</strong><small>${opts.qualityReady === false ? "Unavailable" : "Ready"}</small></span></div>
  </div>
  <div class="setting-card style-guide-card">
    <div class="style-guide-heading">
      <div><strong>Style guide</strong><p>Optionally apply approved rules from an imported guide.</p></div>
      <button class="button button-quiet" type="button">Refresh</button>
    </div>
    <label class="style-guide-select-row" for="style-guide-select">
      <span><strong>Default guide</strong><small>${opts.guides === 0 ? "No guides imported" : "2 guides available"}</small></span>
      <select id="style-guide-select"${opts.guides === 0 ? " disabled" : ""}><option>${opts.guides === 0 ? "No imported guides" : "House style (48 entries)"}</option></select>
    </label>
    <label class="setting-row style-guide-toggle-row">
      <span><strong>Use selected guide</strong><small>${opts.guides === 0 ? "Import and select a guide to enable style checks." : "Enabled. Restart services to apply native XML rules."}</small></span>
      <input type="checkbox"${opts.guides === 0 ? " disabled" : " checked"}>
    </label>
  </div>
  <label class="setting-row">
    <span><strong>Start at login</strong><small>Keep the local checker ready in the background.</small></span>
    <input type="checkbox" checked>
  </label>
  <div class="endpoint-card"><span class="section-kicker">ENDPOINTS</span>
    <code>http://127.0.0.1:8096/v2</code>
    <small>Use <code>http://127.0.0.1:8096/v2</code> in the LanguageTool extension.</small>
  </div>
</section>`;

  // ── first run (new state) ────────────────────────────────
  const frStep = (state, title, sub, meta, bar) => `<div class="fr-step ${state}">
  <span class="fr-dot">${state === "done" ? "✓" : ""}</span>
  <div><strong>${title}</strong><small>${sub}</small></div>
  <em>${meta}</em>
  ${bar != null ? `<div class="fr-bar"><b style="width:${bar}%"></b></div>` : ""}
</div>`;

  const firstRun = () => `<main class="app-shell">${HEADER("is-warning", "Starting")}
  <div class="fr">
    <div class="fr-head"><h2>Setting up, once.</h2>
      <p>Ikmal Editor is configuring the LanguageTool server it will manage. Everything lands in <code style="font-family:var(--mono);font-size:11.5px;color:var(--violet-300)">~/.ikmal-editor/</code> and nothing is sent anywhere.</p></div>
    <div class="fr-steps">
      ${frStep("done", "Java runtime", "Found Homebrew OpenJDK 21 — no Docker needed.", "detected")}
      ${frStep("done", "LanguageTool distribution", "Fetched from languagetool.org.", "246 MB")}
      ${frStep("active", "Language identification model", "Meta FastText lid.176.bin", "83 / 126 MB", 66)}
      ${frStep("", "Background service", "macOS LaunchAgent, starts at login.", "queued")}
      ${frStep("", "Connected apps", "Chrome, Safari, Apple Mail, Word, VS Code.", "queued")}
    </div>
    <div class="fr-optin">
      <div class="fr-optin-top">
        <div><strong>Local quality model</strong><p>Adds the quantized grammar model and a managed Node runtime — about 650 MB. Opt-in, and you can add it later from Settings.</p></div>
        <input type="checkbox">
      </div>
    </div>
    <div class="fr-foot"><small>Port 8097 · loopback only</small><button class="button button-quiet">Skip for now</button></div>
  </div>${FOOTER}</main>`;

  // ── tray popover (new state) ─────────────────────────────
  const tray = () => `<div class="tray">
  <div class="tray-head"><div class="ti">${icon(22, 22)}</div>
    <div><strong>Ikmal Editor</strong><small>READY · 8096</small></div>
  </div>
  <div class="tray-item"><span>Check clipboard</span><em>⌥⌘V</em></div>
  <div class="tray-item"><span>Open editor…</span><em>⌥⌘E</em></div>
  <div class="tray-item"><span>Recent checks</span><em>3</em></div>
  <div class="tray-sep"></div>
  <div class="tray-status">
    <div><span class="mini-status-dot is-ready"></span>LanguageTool<em>8097</em></div>
    <div><span class="mini-status-dot is-ready"></span>Quality proxy<em>8096</em></div>
    <div><span class="mini-status-dot is-ready"></span>Style guide<em>House style</em></div>
  </div>
  <div class="tray-sep"></div>
  <div class="tray-item"><span>Stop services</span></div>
  <div class="tray-item"><span>Settings…</span><em>⌘,</em></div>
  <div class="tray-item"><span>Quit Ikmal Editor</span><em>⌘Q</em></div>
</div>`;

  // ── exploration: wide editor surface ─────────────────────
  const proSug = (cls, src, meta, msg, from, to, primary) => `<div class="pro-sug ${cls}">
  <div class="pro-sug-top"><span class="pro-sug-src">${src}</span><em>${meta}</em></div>
  <p>${msg}</p>
  ${from ? `<div class="pro-swap"><del>${from}</del><span>→</span><ins>${to}</ins></div>` : ""}
  <div class="pro-sug-act"><button class="pro-btn ${primary ? "pri" : ""}">Apply</button><button class="pro-btn ghost">Ignore</button><button class="pro-btn ghost">Rule</button></div>
</div>`;

  const pro = () => `<div class="pro">
  <aside class="pro-side">
    <div class="pro-brand">${brandIcon(24)}<span>ikmal <em>editor</em></span></div>
    <div class="pro-nav on"><i></i>Editor</div>
    <div class="pro-nav"><i></i>Recent<em>3</em></div>
    <div class="pro-navlabel">Rules</div>
    <div class="pro-nav"><i></i>Plain English<em>31</em></div>
    <div class="pro-nav"><i></i>Conciseness<em>18</em></div>
    <div class="pro-nav"><i></i>House style<em>48</em></div>
    <div class="pro-navlabel">Local services</div>
    <div class="pro-nav"><i></i>LanguageTool<em>8097</em></div>
    <div class="pro-nav"><i></i>Quality model<em>8096</em></div>
    <div class="pro-side-foot"><span class="mini-status-dot is-ready"></span>All local · 0.9 beta</div>
  </aside>
  <section class="pro-main">
    <div class="pro-top">
      <div class="pro-doc">Untitled passage<em>23 words</em></div>
      <div class="pro-actions"><button class="button button-quiet">Style guide: House</button><button class="button button-primary">Check <span class="button-shortcut">⌘↵</span></button></div>
    </div>
    <div class="pro-canvas">
      <h3>Release notes, draft</h3>
      <p class="pro-p"><span class="flag concise on">In order to</span> facilitate <span class="flag style">the utilisation of</span> the local server, the manager will automatically detect Java.</p>
      <p class="pro-p">Plants, by comparison, <span class="flag grammar">produces</span> its own light. The server it manages listens on 127.0.0.1 and nothing leaves the loopback interface.</p>
      <div class="pro-pop" style="left:44px;top:206px">
        <div class="pro-sug-top"><span class="pro-sug-src">Conciseness</span><em>ikmal rule pack</em></div>
        <p>“In order to” is wordy. PlainLanguage.gov recommends the shorter form.</p>
        <div class="pro-swap"><del>In order to</del><span>→</span><ins>To</ins></div>
        <div class="pro-sug-act"><button class="pro-btn pri">Apply</button><button class="pro-btn ghost">Ignore</button><button class="pro-btn ghost">Always allow</button></div>
      </div>
      <span class="pro-count">3 suggestions · checked 41 ms ago</span>
    </div>
  </section>
  <aside class="pro-rail">
    <div class="pro-rail-top"><strong>Suggestions</strong><em>3</em></div>
    <div class="pro-rail-list">
      ${proSug("", "Conciseness", "ikmal", "“In order to” is wordy.", "In order to", "To", true)}
      ${proSug("s", "Plain English", "ikmal", "Prefer the everyday word.", "the utilisation of", "using")}
      ${proSug("g", "LanguageTool", "+1 related", "Plural subject “Plants” disagrees with “produces”.", "produces", "produce")}
    </div>
    <div class="pro-rail-foot"><span>127.0.0.1 only</span><span>8096</span></div>
  </aside>
</div>`;

  window.IkmalEditorApp = { icon, brandIcon, shell, writingPanel, historyPanel, settingsPanel, firstRun, tray, pro, SAMPLE };
})();
