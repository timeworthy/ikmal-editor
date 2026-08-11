# ikmal writing platform rewrite — agent handoff

This document is for an agent arriving with no conversation context. Read it
before changing code.

## Start here

1. Read the [rewrite plan](./WRITING_PLATFORM_REWRITE_PLAN.md).
2. Read the [progress ledger](./WRITING_PLATFORM_REWRITE_PROGRESS.md).
3. Run `git status --short --branch` in the repository root.
4. Inspect the files relevant to the requested task and preserve all existing
   user changes.
5. Check the current gate status before implementing anything.

Repository root:

```text
/Users/iansherr/Projects/ikmal-editor
```

Related design system:

```text
/Users/iansherr/Projects/ikmal
```

## Product direction

We are rebuilding the writing-quality system around one host-independent core.
Desktop, browser extension, Office, and future VS Code integrations should
share semantic behavior and visual language. The legacy desktop and extension
code is a behavioral oracle only; it is not the target architecture.

The core must be portable TypeScript. It must not import Electron, Chrome,
browser DOM APIs, filesystem APIs, Node services, or network clients. Hosts
own those capabilities through explicit adapters.

The UI must use ikmal/Continental tokens and components. The canonical design
reference is:

```text
/Users/iansherr/Projects/ikmal/design-mockups-inspiration/continental design system/continental-ds
```

The canonical editor logo material is:

```text
/Users/iansherr/Projects/ikmal-editor/docs/design/logo
```

Use its editor generators, variations, and approved SVG exports in:

```text
/Users/iansherr/Projects/ikmal-editor/docs/design/editor/repo-assets
```

Packaged code must never reference developer-local paths.

## Safe working rules

- Inspect `git status` before every task.
- Existing tracked and untracked changes belong to the user unless clearly
  created by the current agent.
- Never use `git reset --hard`, `git checkout --`, broad deletion, or a broad
  recursive cleanup.
- Do not move the legacy implementation until a migration plan explicitly
  requires it and the old behavior has replacement coverage.
- Do not implement a UI-only mode, language, issue, or replacement behavior.
- Do not add a new visual primitive before checking Continental components.
- Never silently rewrite user text.
- Never send text to a cloud service by default.
- Stop and report when a contract, security boundary, destructive migration,
  design-system limitation, crash, hang, data-loss risk, or unexplained
  packaged/source mismatch appears.

## Current architecture map

### Legacy reference

- Desktop compact: `desktop/index.html`, `desktop/renderer.js`,
  `desktop/styles.css`
- Desktop full editor: `desktop/editor.html`, `desktop/editor-renderer.js`,
  `desktop/editor-styles.css`
- Desktop shell/IPC: `desktop/main.cjs`, `desktop/preload.cjs`
- Desktop annotations: `desktop/annotation_surface.js`
- Browser background transport: `extension/background.js`
- Browser content surface: `extension/content.js`, `extension/content.css`
- Browser popup/options/workspace: `extension/popup.*`, `extension/options.*`,
  `extension/workspace.*`
- Existing small helpers: `extension/core/`
- Quality service: `quality_server.go`
- LanguageTool-compatible proxy: `quality_proxy.go`
- Style guides: `style_guide.go`
- Existing tests: Go tests, `desktop/*.test.*`, and `tools/*.test.mjs`

### Target architecture

The plan proposes these dependency directions:

```text
packages/design-system
packages/writing-core
packages/writing-ui
packages/writing-adapters
        ↑
apps/desktop-compact
apps/desktop-editor
apps/browser-extension
apps/office
apps/vscode
```

Do not create a second copy of issue normalization, focus modes, language
state, selection statistics, dictionary suppression, or replacement safety in
an app adapter.

## Gate protocol

### Gate 0 — Intake

Confirm the plan, status, legacy map, design system, logo system, tests,
packaging, security hazards, and risks. Update the progress ledger. Do not
code before this is complete.

### Gate 1 — Architecture

Define and fixture-test:

- document and revision model;
- raw and normalized check result contracts;
- stable issue identity, ranges, overlap ordering, and provenance;
- relationship groups and linked ranges;
- selection statistics and active-field scope;
- mode and language state;
- rewording candidates and safety validation;
- host capability interfaces;
- design token/component boundary;
- logo asset pipeline;
- extension message boundary; and
- desktop IPC/service boundary.

### Gate 2 — Core correctness

Implement the portable core before broad UI. Include Unicode-aware counts,
malformed-response handling, stale-result rejection, out-of-order responses,
mode filtering, dictionary suppression, relationship grouping, range safety,
and rewording safety. Add fuzz/property-style cases where practical.

### Gate 3 — Vertical slice

Complete one path in both desktop and extension:

```text
active field → check request → normalized issue → aligned mark
→ issue popover → Apply/Ignore → updated text
```

The two hosts may differ in anchoring, but not in issue meaning or action
semantics.

### Gates 4–8

Run the chaos, visual, security, packaging, and final review requirements in
the plan. Record exact commands and artifacts in the progress ledger.

## Required behavior checklist

Do not lose these during migration:

- LanguageTool-compatible and deterministic local quality findings;
- language detection with explicit overrides;
- spelling, grammar, structure, missing-word, homophone, style, clarity,
  repetition, word-family, passive voice, wordiness, plain-English,
  conciseness, and antecedent behavior;
- related-word group highlighting and pronoun/antecedent popovers;
- word, character, and issue selection summaries with checking, paused, off,
  unavailable, and too-large states;
- active-field-only selection handling for textarea, input, contenteditable,
  IME, caret preservation, and DOM changes;
- checking, clean, flagged, paused, Zen, off, and unavailable indicators;
- popup-based Pause and Zen modes with all required durations;
- clear Automatic/Continuous naming and local-only privacy copy;
- replacement preview, Apply, Ignore, dictionary, Why, navigation, and stale
  protection;
- full review workspace, history, copy corrected text, grouped findings, and
  undo records;
- style-guide import, selection, enablement, explanation, and provenance; and
- visible, explicit, conservative rewording diffs.

## Useful baseline commands

```sh
cd /Users/iansherr/Projects/ikmal-editor
git status --short --branch
go test ./...
node --test tools/focus_mode.test.mjs tools/text_stats.test.mjs tools/adapter_contract.test.mjs desktop/editor_ui.test.mjs
node tools/verify_extension.mjs
node tools/verify_desktop.mjs
node tools/verify_vscode_extension.mjs
node tools/verify_office_bridge.mjs
git diff --check
```

These are baseline checks, not proof that the rewrite is complete. Packaging,
Playwright, chaos, security, and binary-realism checks remain separate gates.

## How to hand off your own work

Before ending a task:

1. run `git status --short` and inspect the diff for unrelated changes;
2. update the progress ledger with the gate, files, decisions, tests, and
   unknowns;
3. state whether the gate passed, failed, or is waiting for review;
4. record exact next actions; and
5. do not claim completion if required tests or packaged validation remain.

Use this format:

```md
### YYYY-MM-DD — Agent / task

Gate: `N`  
Status: `complete | blocked | pending review`

Inspected:
- …

Changed:
- …

Evidence:
- `command` — result
- artifact or fixture — path

Unknowns / risks:
- …

Next action:
- …
```
