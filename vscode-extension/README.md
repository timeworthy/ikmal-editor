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
