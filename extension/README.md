# ikmal editor — browser extension

Grammar, style, and plain-English checking in any text field, backed entirely
by a LanguageTool server running on your own machine.

No account. No cloud. No premium tier. Nothing is locked.

---

## Why this is not a literal fork

The intent was to fork LanguageTool's Chrome extension. Here is what that
actually looks like on inspection, and why this is a clean-room build instead.

There are two LanguageTool extensions:

| | License | Forkable | State |
|---|---|---|---|
| [`languagetool-browser-addon`](https://github.com/languagetool-org/languagetool-browser-addon) (2016–2017) | **LGPL-2.1** | Yes | Manifest V2, vendored jQuery, last touched 2023, marked *OUTDATED* by its own README |
| The current extension | Proprietary | **No** | Closed source, complete rewrite, the one that prompts for subscriptions |

So the only forkable one is the old one, and forking it buys almost nothing:

- **Manifest V2 is dead.** Chrome no longer accepts MV2 in the Web Store. The
  background page, permissions model, and messaging all have to be rewritten
  for MV3 regardless.
- **Its dependencies are 2016-era.** jQuery, `featherlight`, `most.js`,
  `ally.js`, all vendored into the tree. Carrying them forward means carrying
  their CVEs and their weight.
- **The valuable part is small.** Roughly 1,500 lines, most of it popup
  plumbing tied to an API surface that has since changed.

Forking it would mean inheriting a rewrite's worth of work plus a decade of
drift, in exchange for a lineage claim. So this is written fresh against the
documented LanguageTool HTTP API, which is unrestricted: APIs are not
copyrightable, and the LGPL places no conditions on clients that merely speak
to a server.

It contains no LanguageTool code and is [MIT licensed](LICENSE) like the rest of
the project.

The anti-paywall guarantee below is therefore structural rather than legal: MIT
would let someone fork this and close it, but a fork is a thin client that does
nothing without the local server stack, and this version stays free regardless.

---

## Install

The extension needs a local server. Start one:

```bash
ikmal-editor --integrated     # LanguageTool + quality checks + proxy on :8096
```

Then load the extension:

**Chrome / Edge / Brave / Arc**
1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Choose **Load unpacked** and select this `extension/` directory

**Firefox — not currently supported.** This manifest declares a background
service worker, which is the Chromium shape. Firefox's MV3 uses event pages
and also expects a `browser_specific_settings.gecko.id`, so loading it there
needs both added and tested first. Use LanguageTool's own Firefox plugin
pointed at your local server in the meantime — the desktop app's
**LanguageTool plugins** card sets that up.

That is the whole setup. The extension finds the server at
`http://127.0.0.1:8096` and starts working. If the server is not running, the
popup says so and points at the command to start it.

---

## What it talks to

Nothing but your own machine. The manifest declares exactly two permitted
hosts:

```json
"host_permissions": ["http://127.0.0.1/*", "http://localhost/*"]
```

The browser enforces that. The extension *cannot* reach a remote server even if
it wanted to, which is a stronger guarantee than a privacy policy. There is no
analytics call, no update ping, no crash reporter, and no remote fallback.

Point it at a different address in Settings if you run the server elsewhere on
your network — that is the one way to widen its reach, and it takes a
deliberate act by you.

---

## How it works

- `background.js` — the service worker. Owns every network call, so the one
  file that can reach the network is short enough to audit in a minute.
- `content.js` — finds editable fields, checks them, draws underlines.
  Positions marks two ways because the DOM has no single approach that works
  everywhere: a mirror element for `textarea`/`input`, DOM Ranges for
  `contenteditable`.
- `popup.*` — connection status, global and per-site toggles.
- `options.*` — server address, language, timing, per-site exceptions.
- `config.js` — the settings contract, with every default pointing at loopback.
- `support.js` — where the funding link goes, and the rules the project holds
  itself to.

Underline colours follow the desktop app: violet for grammar, terracotta for
spelling, amber for style.

---

## On funding

Good writing keeps us informed and keeps history legible. Tools that check it
should not sit behind a paywall.

That is a claim this codebase has to keep, not just state, so it is enforced
structurally rather than by promise:

1. **No feature is ever gated on payment.** There is no premium tier, no
   license key, and no entitlement check anywhere in this extension. There is
   no code path that could disable a feature for non-payment, because no such
   path exists to be flipped on later.
2. **The support prompt appears once.** It is dismissible forever. Nothing
   resets `supportPromptSeen`.
3. **No nagging.** No timers, no word-count thresholds, no "you have used your
   free checks this month." Those counters do not exist in the codebase.
4. **Declining is not tracked.** There is nowhere to report it to.

If ikmal is useful to you and you are able, funding it helps. If you are not
able, use it anyway — that is the point.
