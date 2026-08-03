# ikmal editor desktop app

This is the Electron shell for the local writing enhancer. It provides a tray
menu, starts the Go manager with `--integrated`, and includes a small writing
tester that checks against the same `http://127.0.0.1:8096/v2/check` endpoint
used by the browser extension. Existing LanguageTool integrations are detected
and shown before any local-server settings are changed.

From the repository root:

```bash
go build -o ikmal-editor .
cd desktop
npm install
npm start
```

`npm start` builds and opens the packaged app. This is also the recommended
local development path on macOS because it launches the real ikmal editor app
bundle instead of Electron's generic development bundle. Use
`npm run dev:electron` only when debugging Electron itself.

The manager binary can be overridden for development or packaging:

```bash
IKMAL_MANAGER_BINARY=/path/to/ikmal-editor npm run dev:electron
```

Verify the desktop package manifest and launch-at-login behavior for all
supported platforms without changing the current machine's login settings:

```bash
npm run verify
```

Build a distributable Electron bundle for the current platform and
architecture. The command cross-compiles and embeds the matching Go manager:

```bash
npm run package
```

Targets can be selected for release automation with
`IKMAL_DESKTOP_PLATFORM=darwin|linux|win32` and
`IKMAL_DESKTOP_ARCH=x64|arm64|armv7l`.

macOS and Windows use Electron's native login-item registration. Linux uses a
per-user XDG autostart entry under the standard application-data directory.
