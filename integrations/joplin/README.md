# ikmal editor — Joplin adapter

The Joplin adapter keeps note storage and selection replacement in Joplin's
API. It contributes whole-note and selection commands, a panel with explicit
Apply actions, and the shared endpoint/language/length/dictionary/rule settings.

It is intentionally a thin plugin: no browser DOM assumptions, no cloud path,
and no direct filesystem access. Package `index.js`, `package.json`, and the
shared `../common/languagetool.cjs` through Joplin's plugin tooling.
