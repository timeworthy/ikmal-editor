# ikmal editor — VS Code adapter

This optional extension adds local grammar and style diagnostics to VS Code.
It talks only to the ikmal quality proxy on loopback, by default:

```text
http://127.0.0.1:8096/v2/check
```

The adapter uses the same LanguageTool-compatible offsets and replacements as
the browser extension. It converts them into VS Code diagnostics and quick
fixes, debounces typing, and discards responses for older document versions.

Open this directory in VS Code and use **Run Extension**. Start ikmal first:

```bash
ikmal-editor --integrated
```

The endpoint setting deliberately accepts only `127.0.0.1`, `localhost`, or
`::1`. The adapter has no account, cloud endpoint, analytics, or payment gate.

## Checking that it works

`node tools/verify_vscode_extension.mjs` covers the structural promises,
including the loopback-only one.

The behaviour has an end-to-end harness. It launches a real VS Code window with
this extension loaded and a fixture checker on loopback, then asserts what a
user would see: a document with a misspelling acquires a diagnostic covering the
right word, the quick fix offered for it actually corrects the text, and
checking resumes afterwards.

```bash
npm ci
npm run smoke:vscode
```

It downloads a VS Code build on first use; `IKMAL_VSCODE_VERSION` pins one.

Note that the extension imports `./writing-core/index.js`, which only the
packager and this harness stage. A bare checkout cannot **Run Extension**
without building it first — `npm run smoke:vscode` does that staging, or run
`npm run build --prefix packages/writing-core` and copy `dist/index.js` there.
