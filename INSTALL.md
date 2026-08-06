# Installing ikmal editor

Every part of ikmal runs on your own machine and talks to a server on
`127.0.0.1`. Nothing here creates an account, and nothing phones home.

---

## How the pieces are shipped

Everything lives in this repository as ordinary source. There are no
submodules, no private packages, and nothing is fetched from a registry at
install time.

| Surface | Source | Packaged by | Published to a store? |
|---|---|---|---|
| Server + CLI | `*.go` at the root | `go build` | Homebrew tap, Scoop, Nix, container |
| Desktop app | `desktop/` | `npm run package` | GitHub release |
| Browser extension | `extension/` | `npm run package:extension` | **No** — load unpacked |
| VS Code adapter | `vscode-extension/` | `npm run package:vscode` | **No** — install the `.vsix` |
| Office task panes | `office-bridge/` | shipped inside the desktop app | **No** — sideload a manifest |
| macOS spell server | `macos-spellserver/` | `macos-spellserver/package.sh` | **No** — installed from the app |

Neither extension is in the Chrome Web Store or the VS Code Marketplace yet, so
both install from a local file. That is the honest current state, not a
recommendation to stay there.

The desktop app carries copies of `extension/` and `office-bridge/` in its
application bundle, unpacked rather than inside the asar archive, because
"Load unpacked" and Office's manifest loader both need real directories on
disk. So if you have the app, you already have the files and do not need to
clone anything.

---

## 1. Start the local server first

Nothing else works without it. Every adapter is a client of this.

```bash
ikmal-editor --integrated
```

That runs LanguageTool on `8097`, the quality checks on `8098`, and the proxy
the adapters talk to on `8096`. Leave it running.

Check it:

```bash
curl -s http://127.0.0.1:8096/health
```

If you installed the desktop app instead, it starts and supervises these for
you — use **Settings → Services → Start**.

---

## 2. Desktop app

```bash
cd desktop
npm install
npm start
```

`npm start` builds and opens the packaged app, which is also the recommended
way to develop on macOS: it launches the real ikmal bundle rather than
Electron's generic one.

To build a distributable bundle for your platform:

```bash
cd desktop && npm run package     # -> bin/desktop/
```

---

## 3. Browser extension

**Chromium browsers — Chrome, Edge, Brave, Arc, Vivaldi:**

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Choose **Load unpacked**
4. Select the `extension/` directory

From the desktop app, **Settings → Browser extension → Show files** opens the
right folder for step 4, including in a packaged install where it lives inside
the application bundle.

The extension finds the server on `http://127.0.0.1:8096` by itself. If the
server is not running, the toolbar popup says so.

To build an archive for a store listing:

```bash
cd desktop && npm run package:extension   # -> bin/extension/
```

> **Firefox is not currently supported.** The manifest declares a background
> service worker, which is the Chromium shape; Firefox's MV3 uses event pages
> and also wants a `browser_specific_settings.gecko.id`. `extension/README.md`
> still carries a "Load Temporary Add-on" instruction that predates this and
> has not been verified against a current Firefox. Until it is, use
> LanguageTool's own Firefox plugin pointed at your server — see section 6.

---

## 4. VS Code adapter

```bash
cd desktop && npm run package:vscode
code --install-extension ../bin/vscode-extension/timeworthy-media.ikmal-editor-vscode-0.1.0.vsix
```

The packager prints the exact command with the current version.

Commands, from the palette:

| Command | Does |
|---|---|
| `ikmal: Check Document` | Check the active document now |
| `ikmal: Pause checking` | Stop checking, for a duration you choose |
| `ikmal: Zen mode` | Keep checking, show only the most confident findings |
| `ikmal: Resume checking` | Back to normal |

Settings live under `ikmal.*`. `ikmal.endpoint` accepts loopback addresses
only — a non-loopback value is refused rather than quietly used.

---

## 5. Microsoft Office task panes

Word, Excel, PowerPoint, Outlook, OneNote, and Project. Office only loads task
panes over HTTPS, so this needs a certificate on your own machine.

From the desktop app, **Settings → Microsoft Office**:

1. **Generate certificate** — creates a localhost key and certificate under
   your user data directory, `0700`.
2. **Trust it in your operating system's certificate store.** This step is
   yours: a locally generated certificate is not a trusted one until you say
   so. The app cannot and does not do this for you.
3. **Start bridge** — serves the task panes on `https://localhost:8765`.
4. Pick a host from **Task pane** and choose **Show manifest**, then sideload
   that manifest file in the Office application.

Sideloading is per-application and Microsoft documents it per platform; the
manifest file the app reveals is the one to point at.

---

## 6. LanguageTool's own plugins

Separate from everything above. If you already use LanguageTool's browser
plugin, ikmal can repoint it at your local server instead of LanguageTool's
cloud, so your text stops leaving the machine.

From the desktop app, **Settings → LanguageTool plugins → Review**. It shows
what it found and what it would change before changing anything.

Or from the CLI:

```bash
ikmal-editor --configure-apps
```

These are LanguageTool's extensions, not ikmal's — a different product with its
own account and premium tier. Running both theirs and ikmal's at once underlines
everything twice.

---

## 7. macOS system spell checking

A prototype. Registers ikmal as a system spell-checking service so Cocoa text
views get the local checker without a per-application adapter.

```bash
cd macos-spellserver && ./package.sh    # -> bin/macos/
```

Building needs the Swift toolchain matching your installed Xcode SDK, not the
default Command Line Tools path — `macos-spellserver/README.md` has the exact
invocation. Then install it from the desktop app under **Settings → macOS spell
server**.

---

## Pause and Zen

Available in the desktop app, the browser extension's toolbar popup, and VS
Code.

- **Pause** stops checking until you turn it back on, or until the duration you
  picked runs out.
- **Zen** keeps checking but shows only the most confident findings, and goes
  quiet on style and repetition.

Both are presets over your existing settings, not a separate set of switches.
Your sensitivity slider and category toggles are left exactly as you set them,
so returning to Checking restores what you had.

In the browser, per-site control is separate and permanent: right-click any
text field and choose **Turn ikmal off for this site**, or manage the list in
the extension's options.

---

## Uninstalling

```bash
ikmal-editor --uninstall          # stops services, removes the daemon, clears data
```

The adapters are removed where they were installed: remove the unpacked
extension from `chrome://extensions`, run
`code --uninstall-extension timeworthy-media.ikmal-editor-vscode` for VS Code,
and use **Remove certificate** in the Office settings card to delete the
generated key and certificate.
