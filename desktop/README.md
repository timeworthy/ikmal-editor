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
