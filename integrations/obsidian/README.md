# ikmal editor — Obsidian adapter

This thin plugin keeps Obsidian's Markdown editor, selection, settings, and
undo model in charge. It adds whole-note and selection checks, explicit Apply,
rule suppression, and a personal spelling dictionary. The only transport is a
loopback LanguageTool-compatible `/v2/check` endpoint.

The source is host-native and intentionally does not reuse browser DOM code.
Use Obsidian's community-plugin packaging flow; `main.js`, `manifest.json`,
and `../common/languagetool.cjs` are the complete artifact.
