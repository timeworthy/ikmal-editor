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
| `packages/design-system` | **63 tokens, 60 classes** | `cnt-btn`, `cnt-card`, `cnt-field`, `cnt-menu`, `cnt-popover`, `cnt-badge`, `cnt-status-dot`, and variants |
| `packages/writing-ui` | **12 composites** | indicator, issue popover, selection summary, mode picker, indicator popover, review row, review workspace, undo notice, settings group, service health card, style-guide card |
| `apps/desktop-editor` | **36 host capabilities** | writing, plus the settings surface — the product's only settings implementation |
| `apps/browser-extension` | **1 message type** | `check` |
| `apps/desktop-compact` | **launcher, 9 capabilities** | quick check, service health, focus modes, route into the editor — no settings |
| `apps/office`, `apps/vscode` | **do not exist** | |

Against the legacy surface still shipping:

| Surface | Legacy | On the new architecture |
| --- | --- | --- |
| Desktop host capabilities | 55 | 45 |
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

Groups 6–10 are all *settings surfaces*, and all five are now built.

### The blocker that was, and what replaced it

Groups 6–10 all render as settings panels, and until Phase A there was nothing
to build one from: the package shipped ten primitives — button, card, field,
menu, popover, badge, status dot — against roughly thirty the Continental
mapping calls for, and the missing ones were exactly what a settings form needs.

That is resolved. `design-system` now ships **33 primitives / 60 classes**, and
`writing-ui` **12 composites**. A settings section is now assembled from shared
parts, which is what made Phase D's six sections a day's work rather than a
rewrite of its own.

Groups 8, 9 and 10 followed, which was the remaining work: about twenty host
capabilities, each backing a card whose data comes from the shell. All are
present. What is left is not desktop settings at all — it is the browser, Office
and VS Code hosts, which are Phases E and F.


---

## 4. The plan forward

Dependency-ordered. Each phase consumes the previous; none defines a parallel
version of something an earlier phase owns.

### Phase A — Finish the primitive layer — **complete**

Done: the settings set — `label`, `help`, `input`, `select`, `textarea`,
`switch`, `check`, `segmented`, `slider`, `panel`, `tabs`, `tab`, `accordion`,
`alert`, `stat`, `empty` — authored against the token contract with Continental's
class names and DOM semantics, plus a `--control-h` token that follows density.
`packages/design-system/gallery.html` renders every primitive and
`npm run smoke:gallery` proves in a browser that theme, density, and palette
reach computed values, that intents stay distinct, that focus is visible, and
that the Shadow DOM copy is both styled and unreachable from the page.

`.cnt-field` was realigned to Continental's meaning (a layout wrapper, with
`.cnt-input` as the control) while it still had no consumers.

Also done: `sheet`, `drawer`, `scrim`, `tag`, `chip`, `banner`, `toast`,
`tooltip`, `kbd`, `progress`, `steps`, `btn-group`, `divider` — 60 classes over
33 primitives, every one rendered in the gallery and asserted by the harness.

Two local semantic pairs were added rather than repeated per component:
`--surface-blur`/`--scrim` for Continental's translucent floating surfaces, and
`--control-h` for control height.

Looking at the rendered gallery caught a defect no test would have: `box-sizing`
was never set, so every full-width control overflowed its container by its own
padding and border. Every settings form built on those primitives would have
inherited it. It is fixed, scoped to `[class^="cnt-"]` rather than as a global
reset a host would not expect, and the harness now fails if a control overflows
or the page scrolls sideways.



Extend `packages/design-system` to the Continental mapping, prioritising the
settings set: `label`, `input`, `textarea`, `select`, `help`, `switch`, `check`,
`segmented`, `slider`, `panel`, `tabs`, `accordion`, `alert`, `stat`, `empty`.

Every primitive is verified in a gallery against dark and light, two palettes,
compact and comfortable density, keyboard focus, reduced motion, and inside a
Shadow DOM container. No hard-coded colour, radius, shadow, or spacing outside a
documented local semantic alias.

**Exit:** a settings form can be built entirely from `cnt-*` primitives with no
new CSS beyond layout.

### Phase B — Finish the writing composites — **built, not yet consumed**

Done: mode picker (all four durations), indicator popover, review row, review
workspace, undo notice, settings group, service health card, style-guide card.
Eleven composites, every one composed from the primitives rather than restyling
them — a test rejects a composite that declares its own colour, and the gallery
harness fails if a composite uses a class outside `cnt-`/`writing-`.

Rendering them caught a defect the tests could not: service status dots stayed
accent-coloured whatever the state, so the dot was decoration rather than
status. Status intents now live on `.cnt-status-dot`, which is where the plan's
component mapping puts them.

Deliberate behaviours worth keeping: the indicator popover shows no issue count
while checking or unavailable, because a count is only meaningful once a result
exists; the inline review collapses to nothing rather than rendering an empty
list; the service card states whether the app manages a service or reused one
already running, because that decides what a restart can do.

Two composites were stubs, and auditing against the legacy oracle found them:

- The **selection popover** rendered three numbers. The product reports
  `Checking…`, `Paused`, `Off`, `Unavailable` and `Too large`, plus singular and
  plural counts, a truncated preview, and the effective language. Migrating a
  host onto the stub would have silently dropped every state.
- The **issue popover** had no previous/next, no "n of total", and no close
  control, while the legacy card had all three. A writer facing overlapping
  findings could not have reached the next one.

**Exit criterion, corrected.** This phase originally read "consumed by at least
two hosts" — which only Phases C and D can deliver, so B could never have been
finished before C. That was a defect in the plan, not a sequencing choice. The
exit is now: every surface in the taxonomy has one implementation, composed from
the primitives, contract-tested, and rendered in the gallery. **Met.**

Consumption is where it belongs, as the exit criterion of the phases that do it.
Note the standing obligation this creates: `indicator.test.mjs` asserts that
every rendered action is one a host implements, and that list now includes
`previous`, `next`, and `close`. A host adopting these cards owes all three.

### Phase C — `apps/desktop-compact`, as a launcher only — **built, behind the flag**

Built and driven: quick check with the shared indicator and issue card, service
health, focus modes, and the route into the editor. Nine capabilities, all
already present in the shell — no new IPC was added for it.

It is the first surface to consume the Phase B composites, which is what the
phase was for. The issue card it renders is the shared one, so navigating
between findings works here too.

**The launcher stays a launcher by construction.** Its preload cannot reach a
single settings capability, `verify_desktop_rewrite.mjs` fails if one appears,
and `rewrite_smoke.mjs` fails if a settings group renders in it. Both were
mutation-checked.

Running it found three things no test would have: `default-src 'none'` breaks a
`file://` page outright because `'self'` resolves to an opaque origin;
`desktop_slice` imports two modules that had to be staged with it; and the slice
controller takes the field element, not read/write callbacks — an API I guessed
instead of reading.

**Exit, still open:** the legacy compact renderer is still what loads by
default. Deleting it needs Phase D, because the legacy compact carries the ten
settings groups and they have nowhere else to go yet.

### Phase C — original scope

The compact window becomes a launcher: quick check, service status, focus modes,
and a way into the editor. **It carries no settings.** Its gear opens the
editor's settings view.

This is a product decision already taken: compact and editor are two windows of
one app with different jobs, and settings existing in both is the defect.

Needs groups 1, 2, 4 and part of 3.

**Exit:** compact runs on the new architecture with no legacy renderer, and the
legacy compact can be deleted without losing a tested capability.

### Phase D — Settings, once, in the editor — **every legacy group covered**

Built in the canonical order and driven end to end: Checking, Appearance,
Dictionary and rules, Services and diagnostics, Privacy and data, About. Every
control is a shared primitive; every card a shared composite. A change writes
through the shell and comes back — `automatic → manual` was verified through the
real IPC, as was a nested category write.

Absorbed: groups 3 (preferences), 5 (history), 6 (style guides), and the
service half of group 1.

`verify_desktop_rewrite.mjs` now asserts the canonical section order, that the
page uses the composites rather than restyling, that it hard-codes no colour,
and that its controls bind the shell's own preference keys so no translation
layer can drift. All mutation-checked.

Two assertions had to be corrected rather than satisfied, because Phase D
changed their premise: the editor preload was asserted *not* to contain
`getServiceState`, from when the editor slice was meant to be minimal; and the
smoke's preload allow-list was the three writing capabilities. Both now describe
the intentional surface — bounded, but the boundary moved when settings arrived.

Running it found the usual class of thing: a class that sets `display` beats the
user-agent `[hidden]` rule, so hiding by attribute silently did nothing; and the
shell's preference keys are `mode`/`delay`/`sensitivity`, not the
`checkMode`/`checkDelay`/`checkSensitivity` I guessed.

Integrations, native spell server and Office followed. The integrations card is
the one the legacy version made hardest to read: each row now carries the plugin
name, what it is, where it points, and its state, rather than a run-on line. It
also keeps the distinction the legacy card blurred — these are LanguageTool's
own plugins being pointed at this machine, and ikmal's extension is a separate
product.

A status mapping was corrected on sight: "Not detected" was drawing the colour
reserved for something broken. An absent plugin is an absence, not a fault.

The reconciliation found two gaps that a read-through would have missed: the
**Browser extension** group and the **Local quality model** group had no
equivalent. Both are now built — the quality panel carrying forward the fix it
needed, which is that installed and running are different questions and the
remedy depends on whether the app owns the services or reused ones already
running.

`verify_desktop_rewrite.mjs` now reads the ten group titles out of
`desktop/index.html` and asserts each maps to a section that exists. That is the
deletion test made mechanical: the legacy file cannot lose coverage silently,
and it cannot be deleted while the mapping still reads from it.

**Remaining for the exit:** the flag is still off. Flipping it is now a decision
rather than a blocker — every legacy settings group has an equivalent, and the
remaining ten capabilities are compact-window shell concerns (window sizing,
quick-check invocation) rather than user-facing features.

### Phase D — original scope

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
| Desktop host capabilities on the new architecture | 45 / 55 | 55 / 55 |
| Extension message types | 1 / 15 | 15 / 15 |
| Extension HTML surfaces | 0 / 3 | 3 / 3 |
| Settings groups on shared components | **10 / 10 — every legacy group mapped** | 10 / 10 |
| `design-system` primitives | **33 / ~30 — complete** | ~30 |
| `writing-ui` composites | **12 / ~10 — complete** | ~10 |
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
apps/desktop-compact   launcher, 9 caps   apps/office    (to build)
apps/desktop-editor    45 of 55, owns settings
apps/browser-extension 1 of 15             apps/vscode    (to build)
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
npm run smoke:gallery              # primitives and composites across every axis
npm run smoke --prefix desktop     # Electron
node desktop/rewrite_smoke.mjs     # the rewrite slices, launcher and editor

# The rewrite slices are behind a flag. To see them:
IKMAL_DESKTOP_REWRITE_SLICE=1 npx electron .   # from desktop/
```

Release process: [RELEASING.md](./RELEASING.md).

---

## 9. Open risks

- **Two architectures are being maintained at once.** This is the central risk.
  It resolves only by finishing the migration or abandoning it; it does not
  resolve by waiting.
- **New features are still landing in legacy**, widening the gap each time.
- **The flag still cannot be turned on.** Six of the ten settings groups are
  built; Integrations, native spell server and Office are not, and the legacy
  compact tab is the only place they exist. Turning the slice on today would
  lose them.
- **Nothing consumes the composites outside the desktop.** The browser
  extension is still on its own surfaces, so the "reaches every host" property
  is asserted by tests and not yet demonstrated across hosts.
- **macOS bundles are ad-hoc signed, not notarized.** No Developer ID
  certificate exists; `security find-identity -v -p codesigning` reports none.
- **Windows Office private keys are unrestricted** — `chmod 0600` is a no-op
  there; an ACL would be required.
- **The legacy renderers are still what ship.** `desktop/index.html`,
  `desktop/editor.html` and their renderers load by default, and every hour they
  keep receiving features is an hour added to the migration.

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
