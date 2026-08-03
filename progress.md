# Ikmal Editor progress

Last updated: 2026-08-03

## Completed

- Local Go manager for LanguageTool with background-service setup on macOS,
  Linux, and Windows.
- Deterministic writing-quality sidecar with repetition, word-family echo,
  pronoun/antecedent, and optional style-guide checks.
- Optional local Transformers.js/ONNX adapter with managed downloads and short
  context windows.
- LanguageTool-compatible quality proxy with duplicate and overlap handling.
- Deterministic style-guide ingestion for PDF, HTML, Markdown, text, and CSV
  review workflows. Imported guides are optional and switchable.
- Electron menubar shell with a writing tester and service controls.
- Desktop style-guide settings with imported-guide selection, persisted default,
  and enable/disable controls backed by the local management API.
- Menubar quick-check action for clipboard text and capped, local recent-check
  history in the desktop writing tester.
- Grouped overlapping findings retain source provenance and supporting messages
  across LanguageTool, quality, style-guide, and transformer checks.
- Desktop package manifest verification and platform-safe launch-at-login
  support for macOS, Windows, and Linux XDG autostart.
- First desktop UI pass with separate LanguageTool/quality health indicators,
  full replacement suggestions, one-click apply actions, clear/reset control,
  and Cmd/Ctrl+Enter checking.
- Ikmal Editor rebrand across source, binaries, assets, packaging, and docs.
- Rewritten Git history and branch split: initial release on `main`, ongoing
  work on `dev`.
- Repository sweep confirmed no legacy guide-name references remain in the
  working tree, reachable history, reflog, or tracked filenames.
- Rebuilt and published the `v0.9.0-beta` cross-platform archives under the
  `ikmal-editor-*` names, with verified SHA256 checksums.
- Updated Homebrew and Scoop metadata on both branches and renamed the
  separate Homebrew tap formula to `ikmal-editor`.

## In progress

- Continue desktop UI polish: make service state understandable at a glance
  and make suggestions easier to review and apply.
- Full suggestion text in result chips, including multi-word replacements.
- Repeat-word and echo results should highlight every related occurrence when
  the suggestion UI is opened.
- Antecedent links should be visible in the writing tester and extension UI.

## Next

- Expand regression fixtures for subject/verb agreement, pronoun agreement,
  repeats, echoes, and contextual style-guide rules.
