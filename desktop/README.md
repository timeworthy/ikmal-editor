# Ikmal Editor desktop app

This is the first Electron shell for the local manager. It provides a tray
menu, starts the Go manager with `--integrated`, and includes a small writing
tester that checks against the same `http://127.0.0.1:8096/v2/check` endpoint
used by the browser extension.

From the repository root:

```bash
go build -o ikmal-editor .
cd desktop
npm install
npm start
```

The manager binary can be overridden for development or packaging:

```bash
IKMAL_MANAGER_BINARY=/path/to/ikmal-editor npm start
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
