# Open-source extension patterns for ikmal editor

ikmal should borrow behavior and integration patterns from open-source
projects, not copy implementation code whose license or host assumptions do not
fit the MIT, local-first runtime.

## What is worth borrowing

| Project | License / boundary | Useful pattern for ikmal | Likely ikmal host |
| --- | --- | --- | --- |
| [LTeX / ltex-ls](https://github.com/valentjn/vscode-ltex) | GPL-3.0; study behavior, do not copy code | Language-mode enablement, markup-aware ranges, workspace settings, dictionary and false-positive controls | VS Code Markdown, LaTeX, Typst |
| [languagetool-for-libreoffice](https://github.com/languagetool-org/languagetool-for-libreoffice) | LGPL-2.1; separate process/UNO boundary | Native underlines, context-menu corrections, document-local language and ignore state | LibreOffice Writer/Calc/Impress |
| [Obsidian LanguageTool plugin](https://github.com/Clemens-E/obsidian-languagetool-plugin) | AGPL-3.0; behavior reference only | Explicit whole-document vs selection commands, hotkeys, self-hosted endpoint setting | Obsidian Markdown editor |
| [languagetool.el](https://github.com/PillFall/languagetool.el) | GPL; behavior reference only | Point correction menu, visible color key, synchronous/manual fallback for small buffers | Emacs |
| [vim-LanguageTool](https://github.com/dpelle/vim-LanguageTool) | Check upstream license before redistribution | Simple `:LanguageToolCheck` command and editor-native quick correction | Vim/Neovim |
| [Thunderbird grammar add-on example](https://github.com/raulpardo/thunderbird-langtool-mailextension) | Verify upstream license before redistribution | Compose-only checking, signature exclusion, explicit “Grammar” action | Thunderbird |

## Delivery order

1. **Firefox WebExtension** — shared browser runtime, separate Gecko manifest.
   This is now packaged as `npm run package:firefox` and keeps the server
   boundary at loopback.
2. **VS Code language modes** — add Markdown/LaTeX/Typst enablement, workspace
   configuration, dictionary and false-positive commands without importing
   LTeX code.
3. **LibreOffice native remote checker** — first configure and test LibreOffice
   7.4+'s built-in LanguageTool server. Only build a UNO adapter if native
   checking cannot provide safe Apply and context-menu behavior.
4. **Obsidian and Joplin** — thin plugins around the existing browser/desktop
   core, with selection/manual-check commands and local endpoint settings.
5. **Thunderbird** — a dedicated compose adapter; the generic browser content
   script must not be pointed at mail internals or signatures.

## Rules for implementation

- Share the versioned `/v2/check` contract, normalized core results, stale-result
  guards, and loopback transport.
- Keep host-native text projection and Apply logic separate. A Markdown source,
  LibreOffice UNO range, HTML email body, and browser contenteditable do not
  share safe offsets.
- Treat GPL/AGPL/LGPL repositories as design references unless a deliberate
  license review approves code reuse. No upstream implementation is copied by
  the Firefox artifact.
- Every host needs an install artifact, an uninstall/disable path, a degraded
  service state, a stale Apply test, and a test that proves existing host
  settings remain untouched.
