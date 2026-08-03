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
- First desktop UI pass with separate LanguageTool/quality health indicators,
  full replacement suggestions, one-click apply actions, clear/reset control,
  and Cmd/Ctrl+Enter checking.
- Ikmal Editor rebrand across source, binaries, assets, packaging, and docs.
- Rewritten Git history and branch split: initial release on `main`, ongoing
  work on `dev`.
- Repository sweep confirmed no legacy guide-name references remain in the
  working tree, reachable history, reflog, or tracked filenames.

## In progress

- Continue desktop UI polish: make service state understandable at a glance
  and make suggestions easier to review and apply.
- Full suggestion text in result chips, including multi-word replacements.
- Repeat-word and echo results should highlight every related occurrence when
  the suggestion UI is opened.
- Antecedent links should be visible in the writing tester and extension UI.

## Next

- Add style-guide selection, default-guide, and enable/disable controls to the
  desktop settings panel.
- Add a menubar quick-check flow and recent-check history.
- Improve result grouping for grammar, quality, style-guide, and transformer
  findings when multiple systems flag the same text.
- Add desktop packaging and launch-at-login verification for each platform.
- Expand regression fixtures for subject/verb agreement, pronoun agreement,
  repeats, echoes, and contextual style-guide rules.
