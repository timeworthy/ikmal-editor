# Adapter architecture

ikmal should have one checking core and several deliberately thin host
adapters. The adapters should not become separate copies of the product.

## Recommended shape

```text
host UI/runtime
      |
      v
host adapter  --->  shared check contract  --->  local proxy :8096
      |
      v
host-native rendering and settings
```

The shared contract is currently represented by
[`extension/core/check_contract.js`](../extension/core/check_contract.js). It
defines the form body, normalized response shape, and the text-equality rule
for discarding stale results. It intentionally does not own network calls or
DOM/AppKit rendering.

## What should be shared

- `/v2/check` request fields and response offsets;
- `ikmalSource`, confidence, related-occurrence, and antecedent metadata;
- bounded local transport and timeout behavior;
- generation/text checks so a delayed response cannot annotate newer text;
- settings names for endpoint, language, delay, enabled state, and disabled
  hosts;
- contract fixtures and compatibility tests.

## What should remain host-specific

- Browser manifest permissions, service-worker lifecycle, and content-script
  field discovery;
- VS Code document/range APIs and extension activation;
- native macOS spell-server/AppKit result objects;
- optional Accessibility behavior, which must remain an explicit opt-in;
- each host's native settings and annotation presentation.

## Artifact strategy

- Keep one WebExtension artifact for Chromium-family browsers and Firefox
  while their runtime and permission differences remain compatible.
- Keep the VS Code adapter as a separate artifact using diagnostics and
  code-actions; do not copy the browser content script.
- Keep the macOS spell server as a native adapter over the same contract.
- Treat LibreOffice as a separate UNO adapter; validate its built-in remote
  checker before maintaining an `.oxt` package.
- Treat Word, Outlook, Excel, PowerPoint, OneNote, and Project as separate
  Office.js host adapters behind the local
  HTTPS bridge described in `microsoft-office-addin-architecture.md`.
- Treat Power BI as a separate companion/custom-visual integration. It does
  not expose the same document-text surface as the Office.js editors.
- Version the contract independently from host UI versions and run the same
  fixture set against every adapter.

The VS Code adapter now provides the first non-browser example: it reuses the
same request/response contract and translates offsets into native diagnostics
and quick fixes. Build it with `cd desktop && npm run package:vscode`. A new
host should follow that pattern and add only the code needed to translate its
native text/range APIs.

For Office, “shared base” means shared transport, settings, manifest/bootstrap
helpers, check contract, fixtures, stale-result rules, and security policy—not
one universal text mapper. Word ranges, Outlook HTML bodies, Excel ranges,
PowerPoint text frames, OneNote page content, and Project task fields need independent projection,
inline rendering, and apply modules so updates can be coordinated without
flattening their host semantics.
