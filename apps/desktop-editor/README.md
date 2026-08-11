# Desktop rewrite slice

This is the fresh renderer entrypoint for the desktop vertical slice. It uses
its own minimal isolated preload surface, exposing only
`window.ikmal.checkText`, `window.ikmal.addDictionaryWord`, and
`window.ikmal.onEditorText`, and consumes staged compiled core, adapter, UI, and
Continental assets.

The issue popover renders `Add to dictionary` only when the host exposes
`addDictionaryWord`, so a host without a personal dictionary never shows an
action it cannot perform.

The legacy desktop editor remains the default. Set
`IKMAL_DESKTOP_REWRITE_SLICE=1` when launching a development build to select
this renderer after running the desktop slice staging script.
