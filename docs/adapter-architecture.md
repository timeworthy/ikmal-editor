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

The transport contract remains represented by
[`extension/core/check_contract.js`](../extension/core/check_contract.js). It
defines the form body and compatibility response shape. The semantic contract
is now represented by the compiled
[`packages/writing-core`](../packages/writing-core/) package, which owns
document revisions, normalized issues, language state, focus filtering,
relationships, and stale-result rules. Neither layer owns network calls or
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

The VS Code adapter provides the first compiled-core example: it reuses the
same transport contract, feeds the response through `packages/writing-core`,
and translates normalized offsets into native diagnostics and quick fixes.
Build it with `cd desktop && npm run package:vscode`; the packager compiles and
ships the core beside the adapter. A new host should follow that pattern and
add only the code needed to translate its native text/range APIs.

The versioned host-message boundary follows the same artifact rule. The
WebExtension packager builds `packages/writing-adapters` and stages its emitted
`extension_messages.js` into `extension/adapters/`; the service worker parses
every incoming message before dispatching it. The Electron packager builds the
same package and ships `dist/` as an extra resource; `desktop/main.cjs` loads
`desktop_ipc.js` before registering handlers and rejects unlisted channels or
invalid arguments. These are runtime guards around the existing legacy host
surfaces, not a claim that the old application has been replaced yet.

The browser slice’s DOM boundary is kept in
`packages/writing-adapters/src/browser_field.ts`. It knows only how to identify
editable fields, read text/selections, and perform bounded replacements. The
service-worker message contract, checker transport, issue normalization, and
indicator/popover semantics remain separate so a hostile page cannot become a
second source of writing behavior.

When a non-empty selection is checked, the core request intentionally carries
the selected substring and its document range. The browser slice rebases the
normalized result ranges back into the full field before Apply, so transport
offsets cannot accidentally replace text at the start of the document.

The fresh browser slice is staged by `tools/package_browser_rewrite.mjs` under
`bin/browser-extension/`. Its MV3 bootstrap loads only the staged compiled
artifacts and the local checker transport; it does not import or modify the
deprecated `extension/` runtime.

The fresh desktop slice follows the same boundary. `apps/desktop-editor/` is
an isolated renderer entrypoint over the preload-shaped `window.ikmal.checkText`
service and `onEditorText` handoff, shared field/controller adapters, and the
portable indicator/popover packages. `tools/package_desktop_rewrite.mjs`
stages its compiled modules at desktop package time. Electron keeps the
deprecated `editor.html` renderer as the default;
`IKMAL_DESKTOP_REWRITE_SLICE=1` is an explicit opt-in for the replacement
window during development and smoke testing.

For Office, “shared base” means shared transport, settings, manifest/bootstrap
helpers, check contract, fixtures, stale-result rules, and security policy—not
one universal text mapper. Word ranges, Outlook HTML bodies, Excel ranges,
PowerPoint text frames, OneNote page content, and Project task fields need independent projection,
inline rendering, and apply modules so updates can be coordinated without
flattening their host semantics.
