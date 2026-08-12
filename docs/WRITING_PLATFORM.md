# ikmal writing platform

One document. It replaces `WRITING_PLATFORM_REWRITE_PLAN.md`,
`WRITING_PLATFORM_REWRITE_PROGRESS.md`, and
`WRITING_PLATFORM_REWRITE_AGENT_HANDOFF.md`, which described a destination, a
history, and an onboarding path separately — and between them never answered the
one question that mattered: *how much of the product actually runs on the new
architecture?*

The detailed 67-entry evidence ledger those documents accumulated is preserved
in git history (`git show 85e12cce5384c68f9b50408431f63d1058c5903c:docs/WRITING_PLATFORM_REWRITE_PROGRESS.md`); it is
not reproduced here. What is reproduced is every finding
from it that still constrains a decision.

---

## 1. Status, honestly

**The core is nearly finished. The hosts have barely started.**

That asymmetry is the whole picture, and stating it as a single percentage hides
it. Measured:

| Layer | Built | Notes |
| --- | --- | --- |
| `packages/writing-core` | **~75 exports** | Documents, revisions, issue normalization and identity, ranges, overlap, relationships, focus modes, language resolution, statistics, dictionary, chunking, rewording, corrections and undo, indicator state |
| `packages/writing-adapters` | **7 modules** | Browser field, browser slice, desktop slice, desktop IPC, extension messages, chunked checks, raw matches |
| `packages/design-system` | **60 tokens, 10 primitives** | `cnt-btn`, `cnt-card`, `cnt-field`, `cnt-menu`, `cnt-popover`, `cnt-badge`, `cnt-status-dot`, and variants |
| `packages/writing-ui` | **2 components** | `indicator`, `issue_popover` |
| `apps/desktop-editor` | **3 host capabilities** | `checkText`, `addDictionaryWord`, `onEditorText` |
| `apps/browser-extension` | **1 message type** | `check` |
| `apps/desktop-compact` | **does not exist** | |
| `apps/office`, `apps/vscode` | **do not exist** | |

Against the legacy surface still shipping:

| Surface | Legacy | On the new architecture |
| --- | --- | --- |
| Desktop host capabilities | 55 | 3 |
| Extension message types | 15 | 1 |
| Extension HTML surfaces | 3 (popup, options, workspace) | 0 |
| Desktop settings groups | 10 | 0 |
| Office task panes | 6 | 0 |

**What this means.** The semantic layer — the hard part, the part that makes
hosts agree about what an issue *is* — is largely done and well tested. What has
not happened is the migration: rebuilding the product's surfaces on top of it.
The vertical slice proved the architecture works. Nothing after that proved it
scales across the product, because nothing after that was attempted.

**Why it stayed invisible.** The old gate model (0–8) measured the *quality* of
the slice — correctness, chaos, visual, security, packaging. Not one gate
measured *coverage*. Every gate could read "in progress" and look healthy while
the rewrite carried a twentieth of the app. Section 5 fixes that with a gate
that tracks coverage as a fraction.

**The compounding problem.** Features keep landing in the legacy surface —
Pause/Zen, the issue workspace, Office task panes, the quality-model panel, the
LanguageTool plugin switcher. Every one widens the gap the rewrite must close.
The legacy code is not standing still while the rewrite catches up.

---

## 2. The goal, restated

One writing product with several host adapters — not several similar writing
products that happen to share a name.

Concretely, and this is the test the work has to pass: **a change to a token, a
primitive, or an issue rule should reach every surface without being reapplied
by hand.** If a fix has to be made twice, the architecture has not arrived.

The failure mode to avoid is a system that *feels bolted on* — where the
extension has its own idea of a card, the compact window has its own idea of a
setting, and the editor has a third. That is what the current codebase is, and
it is why a badge sat 31px from one edge and 91px from another until somebody
measured it.

### The rule

Semantics live in `writing-core`. Host boundaries live in `writing-adapters`.
Visual vocabulary lives in `design-system`. Writing-specific composites live in
`writing-ui`. Apps own placement, anchoring, and their shell — nothing else.

Do not create a second copy of issue normalization, focus state, language
resolution, selection statistics, dictionary suppression, replacement safety, or
chunk planning in an app.

Do not introduce a visual primitive without first checking Continental. A
component may add a local semantic token; it may not start a second violet, a
second spacing scale, or a second motion system.

---

## 3. What is left, grouped by dependency

The 52 uncovered desktop capabilities are not 52 independent tasks. They fall
into ten groups, and the groups have an order.

| # | Group | Capabilities | Depends on |
| --- | --- | --- | --- |
| 1 | Services and health | `getServiceState`, `startServices`, `stopServices`, `onServiceState`, `onServiceError` | — |
| 2 | Shell and windows | `platform`, `openEditor`, `openCompact`, `setCompactExpanded`, `setCompactHeight`, `onCompactInvoked`, `getDesktopPresence`, `setDesktopPresence`, `getLaunchAtLogin`, `setLaunchAtLogin` | — |
| 3 | Preferences | `get/set/onCheckingPreferences`, `get/set/onAnnotationPreferences` | core (already has the model) |
| 4 | Focus modes | `get/set/onFocusMode` | core (already has `FocusState`) |
| 5 | History | `getRecentChecks`, `clearRecentChecks`, `onShowHistory`, `onQuickCheck` | 3 |
| 6 | Style guides | `getStyleGuideState`, `importStyleGuide`, `selectStyleGuide`, `setStyleGuideEnabled` | 1 |
| 7 | Quality model | `getQualityStatus`, `installQualityStack`, `openThirdPartyNotices` | 1 |
| 8 | Integrations | `getIntegrationStatus`, `configureIntegrations`, `revealExtension` | 1 |
| 9 | Native spell server | `getSpellServerState`, `installSpellServer`, `removeSpellServer` | 1 |
| 10 | Office bridge | `getOfficeBridgeState`, cert generate/remove, bridge start/stop, 6 manifest reveals | 1 |

Groups 3 and 4 are the cheapest: the core already models preferences and focus
state, so these are adapter plumbing, not new semantics.

Groups 6–10 are all *settings surfaces*. They are blocked on the same thing.

### The real blocker: settings primitives do not exist

Every one of groups 6–10 renders as a settings panel. `design-system` currently
ships 10 primitives — button, card, field, menu, popover, badge, status dot and
variants. The plan's Continental mapping calls for roughly thirty, and the ones
settings actually needs are the missing ones:

```
needed and absent:  label  input  textarea  select  help  switch  check
                    segmented  slider  panel  sheet  tag  tabs  accordion
                    drawer  alert  banner  toast  stat  progress  steps  empty
```

This is why "put settings in the editor" could not be answered simply. Built
today it would be authored in legacy CSS on legacy markup — more surface for the
rewrite to replace later, which is the bolted-on outcome we are trying to end.

Same for `writing-ui`: it has 2 of the ~10 composites the product needs
(indicator, issue popover). Missing: indicator popover, selection popover, mode
picker, review workspace, settings group, service health card, style-guide card,
undo notice.

---

## 4. The plan forward

Dependency-ordered. Each phase consumes the previous; none defines a parallel
version of something an earlier phase owns.

### Phase A — Finish the primitive layer

Extend `packages/design-system` to the Continental mapping, prioritising the
settings set: `label`, `input`, `textarea`, `select`, `help`, `switch`, `check`,
`segmented`, `slider`, `panel`, `tabs`, `accordion`, `alert`, `stat`, `empty`.

Every primitive is verified in a gallery against dark and light, two palettes,
compact and comfortable density, keyboard focus, reduced motion, and inside a
Shadow DOM container. No hard-coded colour, radius, shadow, or spacing outside a
documented local semantic alias.

**Exit:** a settings form can be built entirely from `cnt-*` primitives with no
new CSS beyond layout.

### Phase B — Finish the writing composites

Extend `packages/writing-ui`: indicator popover, selection popover, mode picker,
settings group, service health card, style-guide card, undo notice, review row.

**Exit:** every surface named in the taxonomy has one implementation, consumed
by at least two hosts.

### Phase C — `apps/desktop-compact`, as a launcher only

The compact window becomes a launcher: quick check, service status, focus modes,
and a way into the editor. **It carries no settings.** Its gear opens the
editor's settings view.

This is a product decision already taken: compact and editor are two windows of
one app with different jobs, and settings existing in both is the defect.

Needs groups 1, 2, 4 and part of 3.

**Exit:** compact runs on the new architecture with no legacy renderer, and the
legacy compact can be deleted without losing a tested capability.

### Phase D — Settings, once, in the editor

Build the canonical settings page in `apps/desktop-editor` on Phase A/B
components, in the canonical order: Checking, Appearance, Dictionary and rules,
Integrations, Services and diagnostics, Privacy and data, About and support.

Absorbs groups 3, 5, 6, 7, 8, 9, 10.

**Exit:** one settings implementation. The legacy editor and the compact
settings tab are both deleted.

### Phase E — Extension parity

Rebuild popup, options, and workspace in `apps/browser-extension` on the same
components. Extend its message surface from 1 to the 15 the product needs.

**Exit:** `extension/` can be deleted.

### Phase F — Office and VS Code

`apps/office` and `apps/vscode` consume the same core and components, rendering
the applicable subset.

**Exit:** every host on one architecture; `desktop/`'s legacy renderers,
`extension/`, and the duplicated Office pane logic are gone.

### The deletion test

A phase is not complete when the new thing works. It is complete when **the old
thing can be deleted and no tested capability is lost.** That is the only
definition that prevents two architectures coexisting indefinitely — which is
exactly what happened after the vertical slice.

---

## 5. Tracking coverage, not just quality

The old gates measured depth. This measures breadth, and both are required.

| Metric | Now | Target |
| --- | --- | --- |
| Desktop host capabilities on the new architecture | 3 / 55 | 55 / 55 |
| Extension message types | 1 / 15 | 15 / 15 |
| Extension HTML surfaces | 0 / 3 | 3 / 3 |
| Settings groups on shared components | 0 / 10 | 10 / 10 |
| `design-system` primitives | 10 / ~30 | ~30 |
| `writing-ui` composites | 2 / ~10 | ~10 |
| Legacy files deleted | 0 | all |

Update these numbers whenever a phase closes. A phase that moves no number has
not moved.

Quality gates still apply per phase — correctness, chaos, visual and
accessibility, security, packaging — but they are checks *within* a phase, not a
substitute for coverage.

---

## 6. Working rules

- Inspect `git status` before every task. Existing changes belong to the user.
- Never `git reset --hard`, `git checkout --`, or broad recursive deletion.
- Do not delete a legacy implementation until its replacement passes the
  deletion test above.
- Do not implement a UI-only mode, language, issue, or replacement behaviour.
- Do not add a visual primitive before checking Continental.
- Never silently rewrite user text. Never send text to a cloud service by
  default.
- Packaged code must never reference a developer-local path.
- Stop and report on a contract break, security boundary, destructive
  migration, crash, hang, data-loss risk, or packaged/source mismatch.

### Behaviour that must survive migration

LanguageTool-compatible and deterministic quality findings; language detection
with overrides; spelling, grammar, structure, missing-word, homophone, style,
clarity, repetition, word-family, passive voice, wordiness, plain-English,
conciseness and antecedent behaviour; related-word groups and antecedent
popovers; selection summaries with checking/paused/off/unavailable/too-large
states; active-field-only handling for textarea, input, contenteditable, IME,
caret preservation and DOM mutation; checking/clean/flagged/paused/Zen/off/
unavailable indicators; Pause and Zen with all durations; replacement preview,
Apply, Ignore, dictionary, Why, navigation and stale protection; review
workspace, history, copy corrected text, grouped findings, undo records;
style-guide import, selection, enablement and provenance; explicit conservative
rewording diffs.

---

## 7. Architecture map

```
packages/design-system     tokens, Continental primitives
packages/writing-core      semantics — no Electron, Chrome, DOM, fs, or network
packages/writing-ui        writing composites, built from primitives
packages/writing-adapters  host boundaries, contracts, fixtures
        ↑
apps/desktop-compact   (to build)      apps/office    (to build)
apps/desktop-editor    (3 of 55)       apps/vscode    (to build)
apps/browser-extension (1 of 15)
```

**Legacy, still shipping, to be replaced:** `desktop/index.html`,
`desktop/renderer.js`, `desktop/styles.css`, `desktop/editor.html`,
`desktop/editor-renderer.js`, `desktop/editor-styles.css`,
`desktop/annotation_surface.js`, `extension/` (background, content, popup,
options, workspace), and the per-pane logic in `office-bridge/public/office/*`.

**Not legacy — services, and staying:** `quality_server.go`, `quality_proxy.go`,
`style_guide.go`, `macos-spellserver/`.

The rewrite slices are behind `IKMAL_DESKTOP_REWRITE_SLICE=1`. The default
desktop editor is still the legacy one.

---

## 8. Verifying your work

A fresh clone needs the workspace install first — the packagers and verifiers
shell out to `tsc`, which nothing else supplies:

```sh
npm ci                    # required first; supplies tsc
npm run build             # compile the packages
npm test                  # 141 unit tests across packages, desktop, tools
npm run verify            # 8 structural verifiers
go test ./...             # services
git diff --check
```

End-to-end harnesses, all opt-in:

```sh
npx playwright install chromium
npm run smoke:browser              # 3 MV3 harnesses, incl. chunked-check retention
npm run smoke:vscode               # launches a real VS Code window
npm run smoke --prefix desktop     # Electron
node desktop/rewrite_smoke.mjs     # the rewrite slice
```

Release process: [RELEASING.md](./RELEASING.md).

---

## 9. Open risks

- **Two architectures are being maintained at once.** This is the central risk.
  It resolves only by finishing the migration or abandoning it; it does not
  resolve by waiting.
- **New features are still landing in legacy**, widening the gap each time.
- **`apps/desktop-editor` has no settings at all**, so the flag cannot be turned
  on without losing capability. Phase D is what unblocks it.
- **The design system is a third of the way to the mapping the plan assumes**,
  and the missing two-thirds are exactly what settings needs.
- **macOS bundles are ad-hoc signed, not notarized.** No Developer ID
  certificate exists; `security find-identity -v -p codesigning` reports none.
- **Windows Office private keys are unrestricted** — `chmod 0600` is a no-op
  there; an ACL would be required.
- **`apps/desktop-compact` was planned and never started**, so the compact
  window has no migration path yet beyond Phase C.

---

## 10. Decisions on record

| Decision | Rationale |
| --- | --- |
| Compact is a launcher; settings live in the editor | Two windows, different jobs. Settings in both is the defect. |
| Hosts check whole until there are findings to carry | Hosts may differ in anchoring, not in what the document is said to contain. |
| Prereleases reach only opt-in users | `version.json` carries separate stable and prerelease pointers. |
| Homebrew and Scoop track the newest release, beta or not | Only prereleases exist; freezing installers on an older beta is worse. Revisit at first stable. |
| Legacy is a behavioural oracle, not the target | It defines correct behaviour until its replacement passes the deletion test. |
| Ad-hoc signing is required at packaging time | Without it macOS reports the bundle as damaged, which is worse than unsigned. |
