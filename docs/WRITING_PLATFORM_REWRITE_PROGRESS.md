# Writing platform rewrite — progress ledger

Status: active, Gate 0 and Gate 1 complete; Gate 8 in progress  
Last reviewed: 2026-08-09  
Primary roadmap: [WRITING_PLATFORM_REWRITE_PLAN.md](./WRITING_PLATFORM_REWRITE_PLAN.md)

This is the operational ledger for the rewrite. It is intentionally separate
from the roadmap: the roadmap describes the destination; this document records
what has actually been inspected, decided, implemented, tested, and deferred.

## How to maintain this document

Agents must update this ledger when they:

1. complete or reopen a gate;
2. add or change a public contract;
3. make an architecture or design-system decision;
4. discover a new risk, blocker, or untested behavior; or
5. run a meaningful test, build, visual review, or security check.

Do not mark a gate complete because the app launches. Record evidence: exact
commands, fixture names, screenshots, package paths, or review notes. Keep
older decisions and test results; append corrections rather than erasing the
history.

## Gate dashboard

| Gate | Purpose | Status | Evidence / next review |
| --- | --- | --- | --- |
| 0 — Intake and evidence | Read plan, inspect worktree, inventory legacy behavior, design, logos, tests, packaging, and risks | **Complete** | Baseline recorded below; no source changes made |
| 1 — Architecture review | Define core, host, UI, design, logo, extension, and desktop boundaries; add contract fixtures | **Complete** | All checklist rows have executable draft-accepted evidence; continue to Gate 2/3 work |
| 2 — Core correctness | Implement and test normalized document, issue, range, relationship, selection, mode, language, and rewrite behavior | **In progress** | Core and adapter fixtures pass; fuzz/property and host-race coverage remain |
| 3 — Vertical slice | Active field → check → normalized issue → mark → popover → Apply/Ignore → updated text in desktop and extension | **In progress** | Fresh desktop Apply path and headed MV3 injection/action smoke pass; broader host parity and chaos remain |
| 4 — Crash and chaos | Exercise focus changes, DOM mutation, IME, stale races, huge text, popovers, hostile pages, and service failures | **In progress** | Fresh browser/desktop slices cover mutation, IME, stale responses, and unavailable-service paths; broader chaos remains |
| 5 — Visual and interaction | Playwright screenshots and keyboard/accessibility review across hosts, themes, palettes, densities, and states | **In progress** | Headed MV3 and desktop evidence covers light theme, opaque/padded dialog surfaces, focus, Escape, and primary actions; full matrix remains |
| 6 — Security and privacy | Review permissions, origins, schemas, injection, network, filesystem, logging, CSP, and local-only behavior | **In progress** | Fresh MV3 headed smoke verifies iframe policy and loopback-only page requests; packaged CSP/service-worker and host review remain |
| 7 — Packaging realism | Build actual desktop/extension artifacts and test outside the source tree | **Complete with platform limitation** | macOS packaged execution, Windows PE/icon inspection, Linux bundle/resource inspection, and browser artifact verification pass; Linux/Windows native runtime execution remains host-limited |
| 8 — Final review | Diff, duplication, leaks, accessibility, all tests, and explicit unknowns | **In progress** | Fresh boundary audit and full regression pass; live screen-reader, signing/notarization, packaged CSP/service-worker review, and final visual matrix remain |

## Current baseline

### Worktree

- Repository: `/Users/iansherr/Projects/ikmal-editor`
- Branch: `dev`, 30 commits ahead of `origin/dev`
- The worktree contains existing tracked and untracked user changes across
  desktop, extension, Go quality services, tests, packaging, and design docs.
- The current implementation is legacy reference material, not the rewrite
  architecture.
- No files have been reset, deleted, moved, or overwritten for this rewrite.
- Ignored build artifacts already exist under `bin/`; do not delete them as
  part of ordinary rewrite work.
- Related design repository: `/Users/iansherr/Projects/ikmal`

### Current implementation map

| Capability | Legacy reference | Intended rewrite owner | Current evidence / gap |
| --- | --- | --- | --- |
| LanguageTool-compatible checking | `quality_proxy.go`, `main.go`, `desktop/main.cjs`, `extension/background.js` | `writing-core` check contracts; host transport adapters | Existing Go and adapter tests; no shared core |
| Local quality rules | `quality_server.go`, `RULES.md`, `rules/style_conciseness.xml` | normalized source-aware issues | Deterministic checks exist; proxy currently flattens them into LT-shaped matches |
| Language detection and overrides | `main.go`, `extension/config.js`, host request builders | requested/detected/effective language contract | Host/service behavior is not normalized or fully tested |
| Repetition and word-family groups | `quality_server.go`, `quality_proxy.go`, desktop annotation/renderers | first-class relationship groups | Desktop support exists; extension parity is absent |
| Pronoun/antecedent links | quality service, `desktop/annotation_surface.js`, desktop renderers | relationship annotations with linked ranges | Desktop smoke coverage; no extension coverage |
| Unicode counts and selections | `extension/core/text_stats.js`, `extension/content.js`, desktop counters | shared statistics and active-field selection contracts | Basic stats tests; no chaos or field teardown tests |
| Automatic/Pause/Zen | `extension/core/focus_mode.js`, `.cjs`, VS Code copy, desktop adapters | one shared `FocusState` implementation | Tests explicitly reveal three implementations |
| Marking and issue cards | `desktop/annotation_surface.js`, `desktop/*renderer.js`, `extension/content.js` | portable writing UI and annotation layer | Separate UI vocabularies; no visual parity suite |
| Dictionary and ignore | desktop preferences/IPC and extension storage/background | core action semantics plus host persistence | Separate implementations; no stable issue identity contract |
| Style guides | `style_guide.go`, desktop IPC/UI | style-guide source/capability contract | Desktop/Go support; no shared extension surface |
| History and undo | desktop recent checks/workspace code | correction records and stale-safe actions | Partial behavior; no unified correction contract |
| Rewording | optional transformer plumbing in quality service | explicit reword request, diff, safety gate | Not implemented as a core contract |
| Host boundaries | Electron IPC/preload and Chrome runtime messaging/DOM | `WritingHost` capability interface | Host logic is currently interleaved with behavior |
| Design system | custom runtime CSS; Continental only in fixtures | extracted Continental tokens/primitives | Runtime does not yet consume the shared package |
| Logo | `docs/design/logo/` and `docs/design/editor/repo-assets/` | packaged generated assets with no developer paths | Editor logo source is canonical; runtime packaging adoption remains |

## Decisions

| ID | Decision | Reason | Date |
| --- | --- | --- | --- |
| D-001 | Build the rewrite as a fresh system while retaining the old app as a behavioral oracle | The current implementation is from a previous version and should not dictate architecture | 2026-08-07 |
| D-002 | Do not move legacy code yet | Moving it would alter existing packaging/tests before the new boundaries are reviewed; preserve stable reference paths first | 2026-08-07 |
| D-003 | Use `/Users/iansherr/Projects/ikmal-editor/docs/design/logo/` for editor logo generators, editor variations, and asset references | This is the canonical editor-specific logo material; use approved exports in `docs/design/editor/repo-assets/` for packaging | 2026-08-07 |
| D-004 | Use Continental from `/Users/iansherr/Projects/ikmal/design-mockups-inspiration/continental design system/continental-ds` as the design-system authority | It contains the tokens, axes, primitives, components, and behavior contract | 2026-08-07 |
| D-005 | No new host-specific issue or mode semantics after the core contracts land | Prevents desktop and extension drift during migration | 2026-08-07 |

## Risk register

| ID | Risk | Severity | Status / mitigation |
| --- | --- | --- | --- |
| R-001 | No TypeScript shared core or package boundary exists | High | Core boundary, cross-host fixture compatibility, production `tsc` build, and compiled adapter packaging are now present; full host adoption remains open |
| R-002 | Desktop and extension duplicate filtering, modes, annotations, and popovers | High | VS Code uses compiled-core issue/focus semantics; browser message validation and desktop IPC validation now use compiled adapters; full UI migration remains open |
| R-003 | LanguageTool-shaped proxy output loses provenance/actionability/relationship semantics | High | Open; normalize before broad UI work |
| R-004 | UTF-16 offsets, Unicode counts, overlaps, and stale revisions can corrupt text | High | Core and browser controller reject unsafe/stale edits with fixtures; fuzz and contenteditable/IME chaos coverage remain open |
| R-005 | Extension global event routing and active-field teardown are untested under hostile DOM changes | High | Compiled message parser and browser field boundary now guard dispatch/text edits; lifecycle, DOM, iframe, Shadow DOM, mutation, IME, and rapid-selection chaos tests remain open |
| R-006 | Runtime CSS is a parallel design system instead of Continental | High | `packages/design-system` now contains portable Continental tokens/primitives; host adoption remains open |
| R-007 | Local service origin, bind-host, endpoint, and message-schema boundaries need security validation | High | Extension and desktop message/channel schemas added; Gate 6 still must inspect actual packaged behavior and origins |
| R-008 | Rewording lacks a deterministic, explainable safety boundary | High | Core safety gate now checks revision, bounds, overlaps, protected tokens, rationale, risk, and explicit confirmation; adapter/UI diff rendering remains open |
| R-009 | Existing asset names and packaging paths may drift from the canonical editor logo system | Medium | Fresh packaging uses product-branded `ikmal_editor` assets and verifiers check the approved tiers; legacy-named assets remain intentionally for the deprecated reference runtime |
| R-010 | No Playwright visual baseline or screenshot evidence exists for the rewrite | Medium | Open; create fixtures in Phase 0/5 |

## Baseline test ledger

Run from `/Users/iansherr/Projects/ikmal-editor` on 2026-08-07:

| Command | Result |
| --- | --- |
| `go test ./...` | Passed |
| `node --test tools/focus_mode.test.mjs tools/text_stats.test.mjs tools/adapter_contract.test.mjs desktop/editor_ui.test.mjs` | Passed, 21 tests |
| `node tools/verify_extension.mjs` | Passed |
| `node tools/verify_desktop.mjs` | Passed |
| `node tools/verify_vscode_extension.mjs` | Passed |
| `node tools/verify_office_bridge.mjs` | Passed |
| JavaScript `node --check` commands for desktop and extension entrypoints | Passed |
| `git diff --check` | Passed |

Not yet run for the rewrite: full native desktop packaging/built-binary
execution outside the repository, complete Playwright visual/theme tests,
chaos/fuzz tests, and the security gate. The local Electron desktop bundle,
opt-in rewrite smoke, and headed MV3 injection smoke now run successfully;
extension and VSIX packaging have also run successfully.

## Next actions

1. Expand the headed MV3 rapid-edit case into disposable-checker coverage when
   the environment permits a fully isolated endpoint; retain the packaged-runtime
   smoke for deterministic Apply, outage, and stale-range behavior.
2. Complete the keyboard/theme/accessibility matrix and add cross-host visual
   parity evidence against Continental tokens and approved logo tiers.
3. Continue Gate 6 review of packaged permissions, CSP, service-worker network,
   logging, and origin boundaries.
4. Complete the remaining Gate 8 release review: live screen-reader behavior,
   packaged CSP/service-worker boundaries, signing/notarization, and the full
   visual/theme matrix.
5. Keep the legacy implementation runnable as the behavioral reference; do
   not remove it during incremental migration.

## Gate 1 review — 2026-08-08

Gate 1 is **complete**. All listed architecture contracts have executable
draft-accepted evidence. Vertical-slice, visual, chaos, security, and native
packaging work remains in later gates and is not being represented as complete
by this status.

| Contract area | Evidence reviewed | Review decision | Remaining work |
| --- | --- | --- | --- |
| Document, revisions, ranges, identity, ordering, provenance | `packages/writing-core/src/index.ts`, core fixtures, compiled smoke test | Draft accepted | Add property/fuzz coverage in Gate 2 |
| Relationships and linked ranges | Related-occurrence and antecedent fixtures | Draft accepted | Extension/desktop UI parity remains open |
| Selection statistics and language state | Selection, Unicode, language fallback, and mixed-language tests | Draft accepted | Active-field/DOM lifecycle belongs to host chaos tests |
| Focus modes, dictionary filtering, stale results | Core focus/filter/stale/undo tests; VS Code bridge tests | Draft accepted | Migrate browser and desktop semantics |
| Rewording and correction safety | Protected-token, overlap, risk, explicit confirmation, and undo fixtures | Draft accepted | Visible diff UI and transformer adapter remain open |
| Host capability interface | `WritingHost` type, VS Code fake-host bridge, and `packages/writing-adapters` schemas | Draft accepted | Host-specific fake hosts and lifecycle coverage remain open |
| Design tokens and component boundary | External Continental reference, `packages/design-system/tokens.json`, `tokens.css`, canonical `cnt-*` primitives, and 2 tests | Draft accepted | Runtime hosts must consume the package; visual/component parity remains open |
| Logo asset pipeline | `docs/design/logo/edmark.js`, 8 approved `repo-assets/` SVGs, target-size/theme assertions, and `tools/verify_editor_assets.mjs` | Draft accepted | Runtime package adoption and Gate 7 packaged-resource checks remain open |
| Extension message boundary | `packages/writing-adapters/src/extension_messages.ts`, compiled staged `extension/adapters/extension_messages.js`, package/verifier checks, and 2 fixtures | Draft accepted | Add lifecycle/DOM/chaos coverage; browser vertical-slice migration remains open |
| Desktop IPC/service boundary | `packages/writing-adapters/src/desktop_ipc.ts`, compiled `dist/` resource loading in `desktop/main.cjs`, package/verifier checks, and 2 fixtures | Draft accepted | Add runtime security coverage; desktop vertical-slice migration remains open |

Review decision: the previously held design and logo rows have executable
contract evidence, and the compiled adapter schemas are integrated into the
browser service-worker and Electron main-process packaging paths. Gate 1 is
closed; the required desktop/browser vertical slice and host lifecycle/security
evidence are tracked under later gates.

## Handoff update template

Append a dated entry after meaningful work:

```md
### YYYY-MM-DD — Agent / task

- Gate: `N`
- Inspected:
- Changed:
- Contracts or fixtures added:
- Tests run and results:
- New risks or decisions:
- Unknowns:
- Next action:
```

### 2026-08-08 — Agent / initial writing-core contract slice

- Gate: `1`
- Inspected: the rewrite plan, adapter architecture, existing browser/VS Code/Office check contracts, quality proxy metadata, and the existing worktree status.
- Changed: added `packages/writing-core` as a host-neutral TypeScript package. It contains document revisions, language preferences, UTF-16-safe ranges, Unicode statistics, raw check normalization, stable issue identity, overlap ordering, provenance/category/actionability normalization, relationship groups, focus modes, dictionary suppression, stale-result rejection, safe text edits, and the `WritingHost` capability interface.
- Contracts or fixtures added: `packages/writing-core/test/fixtures.mjs` covers grammar, repetition, related ranges, antecedents, detected language, malformed ranges, and duplicate findings. `packages/writing-core/test/core.test.mjs` covers deterministic ordering/identity, surrogate boundaries, focus/dictionary filtering, stale revisions, and Unicode counts.
- Tests run and results: `npm test --prefix packages/writing-core` — passed, 6 tests; `go test ./...` — passed; baseline Node contract/UI tests — passed, 21 tests; extension, desktop, VS Code, and Office verifiers — passed; `git diff --check` — passed.
- New risks or decisions: checker offsets remain UTF-16 units, but ranges that split a surrogate pair are rejected before rendering or replacement. The package uses Node's built-in TypeScript type stripping only for the current test harness; production host compilation remains an open packaging task.
- Unknowns: Gate 1 review has not approved the exact language, rewording, correction-history, or adapter integration shapes; no host consumes this package yet.
- Next action: review the draft contracts, then add selection/language/rewording fixtures and run the normalized fixture set through one adapter.

---

### 2026-08-08 — Agent / language, selection, rewording, and correction contracts

- Gate: `1`
- Inspected: the progress ledger’s next actions, the plan’s language-resolution, selection, rewording-safety, and undo requirements, and the first writing-core implementation.
- Changed: extended `packages/writing-core` with requested/detected/effective language resolution, conservative host-hint fallback, mixed-language status, active-document selection requests/statistics, bounded reword edits, protected-token and unresolved-overlap safety checks, explicit confirmation, correction records, and stale-safe undo.
- Contracts or fixtures added: added language uncertainty/mixed-language cases, emoji selection boundaries, protected URLs, reword rationale/diff validation, unresolved correction overlap, explicit apply, correction undo, and stale undo cases. The suite now has 10 deterministic tests.
- Tests run and results: `npm test --prefix packages/writing-core` — passed, 10 tests; `go test ./...` — passed; baseline Node contract/UI tests — passed, 21 tests; extension, desktop, VS Code, and Office verifiers — passed; `git diff --check` — passed.
- New risks or decisions: the core exposes a safety decision but does not render the visible diff or provide a production TypeScript build yet. Rewording remains review-first and cannot be applied without explicit confirmation.
- Unknowns: the exact host adapter transport and UI mapping still need Gate 1 review; no legacy host consumes these contracts yet.
- Next action: review the expanded contracts, then execute the shared fixture set through the first adapter.

---

### 2026-08-08 — Agent / cross-host fixture compatibility

- Gate: `1`
- Inspected: the browser, VS Code, and Office transport normalizers and their existing adapter contract tests.
- Changed: added a core adapter fixture test and expanded the package test script to run all core fixture tests. The same raw checker response now passes through each existing transport normalizer and must produce the same core issue IDs, categories, relationships, and language state.
- Contracts or fixtures added: `packages/writing-core/test/adapter_fixture.test.mjs` covers browser ESM, VS Code CommonJS, and Office CommonJS transport compatibility.
- Tests run and results: `npm test --prefix packages/writing-core` — passed, 11 tests.
- New risks or decisions: this proves payload compatibility but deliberately does not make a legacy host depend on the uncompiled TypeScript source. Production compilation is required before adapter migration.
- Unknowns: the first compiled host target and bundling strategy still need Gate 1 review.
- Next action: establish production TypeScript compilation, then migrate one adapter behind the shared core while retaining the old path for comparison.

---

### 2026-08-08 — Agent / production writing-core build

- Gate: `1`
- Inspected: the available TypeScript toolchain and the package’s test-only Node type-stripping path.
- Changed: added `packages/writing-core/tsconfig.json`, a production `build` script, emitted declarations/source maps, an ignored `dist/` build directory, and a compiled-JavaScript smoke test. The package test command now builds before running its fixture suite.
- Contracts or fixtures added: `packages/writing-core/test/compiled.test.mjs` confirms the emitted module runs independently of TypeScript syntax and host imports.
- Tests run and results: `npm test --prefix packages/writing-core` — passed, 12 tests; `go test ./...` — passed; baseline Node contract/UI tests — passed, 21 tests; extension, desktop, VS Code, and Office verifiers — passed; `git diff --check` — passed.
- New risks or decisions: `dist/` is a build artifact, not a second source of behavior. Host packaging must invoke the core build and include the emitted module rather than import `src/index.ts`.
- Unknowns: the first host migration still needs an adapter-specific bundle/import boundary and comparison coverage.
- Next action: migrate the first adapter to the compiled core while retaining the legacy adapter path for side-by-side verification.

---

### 2026-08-08 — Agent / first compiled-core adapter migration

- Gate: `1`
- Inspected: the VS Code adapter lifecycle, diagnostic/code-action mapping, VSIX packager, and adapter verifier.
- Changed: migrated VS Code result normalization and focus/category filtering to the compiled `writing-core`; retained the existing transport normalizer for wire compatibility. The VSIX packager now builds the core and stages `extension/writing-core/index.js` beside the adapter.
- Contracts or fixtures added: extended VS Code verification to require compiled-core usage and package staging; inspected the packaged VSIX contents and emitted core exports.
- Tests run and results: `node --check vscode-extension/extension.js` — passed; `node tools/verify_vscode_extension.mjs` — passed; `npm test --prefix packages/writing-core` — passed, 12 tests; `node tools/package_vscode_extension.mjs` — produced an 18.2 KB VSIX with the compiled core; `unzip -l`/`unzip -p` checks confirmed the staged module and adapter imports; baseline gates remained passed.
- New risks or decisions: VS Code is the first migrated adapter, but the old focus-mode copy and other legacy hosts remain in place as comparison/reference paths. This is not yet the desktop/browser vertical slice.
- Unknowns: native VS Code runtime execution still needs a real extension-host smoke test; the next browser/desktop migration must use the same compiled artifact boundary.
- Next action: add a VS Code adapter fake-host contract test for normalized diagnostics, stale responses, and Apply actions, then begin the browser or desktop vertical slice.

---

### 2026-08-08 — Agent / VS Code fake-host contract path

- Gate: `1`
- Inspected: the migrated VS Code adapter’s normalization, diagnostic storage, code-action, and Apply flow.
- Changed: added `vscode-extension/core_adapter.cjs`, a VS Code-API-free bridge that creates core document requests, filters normalized issues, rejects stale results, and applies corrections through core correction records. VS Code code actions now invoke a guarded Apply command instead of writing directly through an unvalidated edit.
- Contracts or fixtures added: `packages/writing-core/test/vscode_adapter.test.mjs` covers normalized diagnostic issues, current-revision Apply, correction records, and stale Apply rejection. The package suite now has 14 tests.
- Tests run and results: `npm test --prefix packages/writing-core` — passed, 14 tests; `node --check vscode-extension/extension.js` — passed; `node --check vscode-extension/core_adapter.cjs` — passed; VS Code verifier — passed; packaged VSIX — produced a 19.4 KB artifact containing the bridge and compiled core.
- New risks or decisions: the native VS Code host still has no real extension-host smoke test, and this adapter is not the required desktop/browser vertical slice. The old adapter files remain available for comparison.
- Unknowns: whether the first full vertical slice should start in the browser extension or desktop editor remains open for Gate 1 review.
- Next action: begin the first browser or desktop vertical slice with the compiled core, preserving the legacy surface beside it.

---

### 2026-08-08 — Agent / Gate 1 review and host boundary contracts

- Gate: `1`
- Inspected: every Gate 1 requirement in the plan, including core models, host capabilities, Continental/design authority, logo sources, browser runtime messages, Electron preload channels, and `ipcMain.handle` registrations.
- Changed: recorded a Gate 1 review matrix. The core and host capability rows are draft-accepted; design tokens and logo automation remain held. Added `packages/writing-adapters` with versioned WebExtension message and desktop IPC contracts, strict runtime parsers, response helpers, TypeScript builds, and malformed/unknown-message fixtures.
- Contracts or fixtures added: `packages/writing-adapters/test/adapters.test.mjs` covers known check/apply/focus/settings messages, invalid ranges and unknown types, all desktop channel allowlisting, argument validation, and event-channel validation.
- Tests run and results: `npm test --prefix packages/writing-adapters` — passed, 2 tests; `npm test --prefix packages/writing-core` — passed, 14 tests; Go tests — passed; baseline Node tests — passed, 21 tests; extension, desktop, VS Code, and Office verifiers — passed; `git diff --check` — passed.
- New risks or decisions: Gate 1 is not complete. The next blockers are an extracted Continental token/component package and automated logo asset/package validation. The new schemas are not yet imported by the browser or Electron runtime; their integration must happen through compiled artifacts.
- Unknowns: choose the first browser/desktop vertical-slice host after the design and logo rows are closed; retain both legacy paths during comparison.
- Next action: close the design-system and logo boundary rows, then integrate the compiled adapter contracts into host packaging before starting the browser/desktop slice.

---

### 2026-08-08 — Agent / Gate 1 design and asset boundary review

- Gate: `1`
- Inspected: the canonical Continental token source, the editor mark generator’s locked 48px tier behavior, approved editor SVG exports, and runtime/package paths for developer-local leakage.
- Changed: added `packages/design-system` with portable semantic Continental tokens, theme/palette/density/contrast axes, framework-free primitives, a manifest, and two contract tests. Added `tools/verify_editor_assets.mjs` to validate the locked logo generator exports, eight approved SVGs, self-contained resources, and runtime path hygiene.
- Contracts or fixtures added: design-system tests require the semantic variable set and host-neutral primitives; the asset verifier checks `switchPx: 48`, `tierFor`, `markSVG`, `templateIconSVG`, SVG viewBoxes, compact small-tier marks, solid black menu-bar ink, and four runtime roots.
- Tests run and results: `npm test --prefix packages/design-system` — passed, 2 tests; `node tools/verify_editor_assets.mjs` — passed, 8 approved SVG exports and 4 runtime roots; `git diff --check` — passed.
- New risks or decisions: the design and logo rows are now draft-accepted with executable evidence, but host runtime adoption and packaged-resource checks remain later-gate work. The old app and its stylesheet remain untouched as deprecated reference behavior.
- Unknowns: the first browser or desktop vertical slice still needs to choose its host and import the compiled contracts without creating a second semantic implementation.
- Next action: integrate the compiled extension and desktop contracts into host packaging, then begin the first vertical slice while retaining the legacy implementation for comparison.

---

### 2026-08-08 — Agent / compiled adapter host packaging integration

- Gate: `1`
- Inspected: the WebExtension service-worker message dispatcher, extension zip packager, Electron `ipcMain.handle` registrations, preload event surface, desktop packager resources, and adapter build output.
- Changed: the browser service worker now parses every incoming message through the compiled `extension_messages.js` artifact. The extension packager builds and stages that artifact. Electron now loads compiled `desktop_ipc.js` before handler registration, guards every invocation against the versioned channel/argument contract, validates event channels, and ships the adapter `dist/` as an extra resource.
- Contracts or fixtures added: extension and desktop verifier requirements now assert compiled adapter imports/loading and packaging; `docs/adapter-architecture.md` records the artifact boundary. The legacy browser/desktop implementations remain in place for comparison.
- Tests run and results: `npm test --prefix packages/writing-adapters` — passed, 2 tests; `node tools/package_extension.mjs` — produced a 62.3 KB extension zip with the staged compiled parser; `node tools/verify_extension.mjs` — passed; `node tools/verify_desktop.mjs` — passed; `node --check desktop/main.cjs desktop/preload.cjs extension/background.js` — passed; `npm test --prefix packages/writing-core` — passed, 14 tests; `npm test --prefix packages/design-system` — passed, 2 tests; Go tests — passed; baseline Node tests — passed, 21 tests.
- New risks or decisions: this closes the compiled message/IPC packaging integration row without claiming a vertical slice. Runtime test coverage still needs hostile lifecycle/security cases, and the browser/desktop UI must migrate to shared core/design semantics incrementally.
- Unknowns: choose the first full vertical slice; the browser path has the more direct DOM/IME chaos risk, while the desktop path has the stronger native IPC/resource smoke burden.
- Next action: start the first browser or desktop vertical slice, retaining the old app as the deprecated behavioral and visual reference until the new slice passes its contract and smoke checks.

---

### 2026-08-08 — Agent / first browser slice indicator foundation

- Gate: `1` → Phase `4` foundation
- Inspected: the plan’s canonical indicator requirements, core focus/status semantics, Continental semantic variables, and the browser Shadow DOM isolation requirement.
- Changed: added `resolveIndicatorState` to `packages/writing-core` and created `packages/writing-ui` with a portable indicator renderer, Shadow-DOM mount helper, custom-element definition, accessible labels, issue counts, unavailable/paused/Zen/checking states, reduced-motion handling, and semantic-token-only styling.
- Contracts or fixtures added: core indicator-state coverage and two writing-UI tests covering bounded HTML/accessibility and a fake Shadow DOM host. The UI package has no Chrome, Electron, framework, network, or filesystem imports.
- Tests run and results: `npm test --prefix packages/writing-core` — passed, 15 tests; `npm test --prefix packages/writing-ui` — passed, 2 tests; `git diff --check` — passed.
- New risks or decisions: this is the first browser-slice foundation, not a replacement of the legacy extension. The next slice work must attach a real editable-field host adapter, feed normalized core results, and add hostile DOM/IME lifecycle coverage.
- Unknowns: whether the first end-to-end browser slice should share the legacy service-worker transport temporarily or introduce a fresh packaged app surface; the core/UI boundary is now independent of that choice.
- Next action: implement the browser field capability adapter and issue-popover contract against the same compiled core/UI packages, keeping legacy files runnable beside it.

---

### 2026-08-08 — Agent / Gate 1 follow-up contract audit

- Gate: `1`
- Inspected: the Gate 1 checklist against the actual design-system primitive names and all approved logo tier exports.
- Changed: aligned the design package with canonical Continental `cnt-*` names (`cnt-btn`, `cnt-icon-btn`, and `cnt-menu`, while retaining readable aliases). Strengthened logo validation for full/minimum light/dark tiers, 1024/512/64/44 target dimensions, foreground/accent colors, and solid menu-bar ink.
- Contracts or fixtures added: design-system tests now require the canonical primitive boundary; asset validation remains executable over all eight approved SVGs and four runtime roots.
- Tests run and results: `npm test --prefix packages/design-system` — passed, 2 tests; `node tools/verify_editor_assets.mjs` — passed; `git diff --check` — passed.
- Review decision: all Gate 1 checklist rows have draft-accepted evidence. Gate 1 is now marked complete; later vertical-slice, visual, chaos, security, and native packaging gates remain explicitly open.
- Next action: continue the browser vertical slice with the real active-field capability adapter and canonical issue-popover contract.

---

### 2026-08-08 — Agent / Gate 1 completion

- Gate: `1`
- Status: `complete`
- Evidence: core, UI, design-system, logo, extension-message, desktop-IPC, VS Code bridge, packaging, verifier, Go, baseline Node, and diff checks all passed. The complete checklist and exact evidence remain in the Gate 1 matrix above.
- Decision: Gate 1 is closed. The old application remains deprecated reference behavior; Gate 3 will prove the replacement path in desktop and browser before any legacy removal is considered.
- Next action: implement the browser active-field capability and canonical issue-popover/selection-summary contracts.

---

### 2026-08-08 — Agent / browser field and issue-popover contracts

- Gate: `2` / `3` foundation after Gate 1 completion
- Inspected: the browser host-capability requirements for textarea, input, and contenteditable fields; core bounded range/revision rules; and canonical indicator/popover action vocabulary.
- Changed: added `packages/writing-adapters/src/browser_field.ts` with editable-field detection, UTF-16 selection reads, bounded replacement, caret updates, and contenteditable range replacement. Added `packages/writing-ui/src/issue_popover.ts` with safe Apply/reword/alternative action labels, Ignore, dictionary affordance, replacement preview, Why disclosure, and selection statistics.
- Contracts or fixtures added: four adapter tests cover textarea selection/replacement and host-neutral capability shape; the UI suite now has three tests covering indicator, Shadow DOM, issue-popover, and selection-summary output.
- Tests run and results: `npm test --prefix packages/writing-adapters` — passed, 4 tests; `npm test --prefix packages/writing-ui` — passed, 3 tests; `git diff --check` — passed.
- New risks or decisions: the field capability is not yet attached to a live extension controller, and contenteditable DOM/IME behavior still needs browser chaos coverage. Popover output is a portable contract; actions must call core revision/correction checks before any host mutation.
- Next action: create the fresh browser-slice controller that coordinates field snapshots, compiled checker results, indicator state, and revision-safe popover actions while leaving the legacy extension runnable.

---

### 2026-08-08 — Agent / browser slice controller

- Gate: `3` foundation
- Inspected: the browser field capability, compiled-core document/check/correction functions, and the portable indicator/popover contracts.
- Changed: added `packages/writing-adapters/src/browser_slice.ts`, which coordinates field snapshots, document revisions, checker promises, normalized core results, indicator state, stale-response rejection, and revision-safe Apply through the field capability.
- Contracts or fixtures added: two controller tests prove a delayed response is discarded after field mutation and a current normalized issue applies through the host field exactly once. The controller returns settled `checking: false` state after success or stale completion.
- Tests run and results: `npm test --prefix packages/writing-adapters` — passed, 6 tests; `npm test --prefix packages/writing-ui` — passed, 3 tests; `git diff --check` — passed.
- New risks or decisions: this is still a package-level browser slice, not a live extension replacement. The next integration must stage the compiled controller/core/UI artifacts and exercise actual contenteditable, Shadow DOM, IME, mutation, and selection lifecycles.
- Next action: create the fresh browser runtime/controller entrypoint and add hostile DOM/IME fixtures before changing the deprecated extension’s rendering path.

---

### 2026-08-08 — Agent / fresh browser rewrite runtime package

- Gate: `3` foundation
- Inspected: the browser controller imports, MV3 content-script/module constraints, loopback checker permissions, Shadow DOM token inheritance, and extension artifact staging requirements.
- Changed: added `apps/browser-extension` as a fresh runtime entrypoint with a classic bootstrap, module content controller, loopback-only service worker, explicit web-accessible compiled artifacts, and no dependency on the deprecated `extension/` runtime. Added `tools/package_browser_rewrite.mjs` and `tools/verify_browser_rewrite.mjs`; packaging stages core, browser adapters, UI, message contract, transport contract, and Continental CSS into a 13-file browser-slice artifact.
- Contracts or fixtures added: source verifier checks MV3 structure, exact loopback permissions, compiled imports, web-accessible resources, and developer-path/network leakage. The runtime mounts indicator and issue popover inside Shadow DOM, handles checker failure as unavailable, and routes Apply through the revision-safe controller.
- Tests run and results: `node tools/package_browser_rewrite.mjs` — passed and produced `bin/browser-extension/ikmal-editor-browser-slice-v0.1.0.zip`; `node tools/verify_browser_rewrite.mjs` — passed; `node --check` on fresh runtime files — passed; design-system, writing-adapters, and writing-ui suites — passed; `git diff --check` — passed.
- New risks or decisions: the packaged runtime has not yet been exercised in a real browser with hostile contenteditable/IME/iframe/Shadow DOM mutations. Its service-worker transport is intentionally minimal and remains a slice, not the full extension feature set.
- Next action: run live browser smoke/chaos coverage against the fresh artifact, then build the corresponding desktop active-field path.

---

### 2026-08-08 — Agent / packaged browser smoke attempt

- Gate: `3` / browser smoke follow-up
- Inspected: Chromium 151 with a clean temporary profile, the staged MV3 artifact, a local fixture page containing textarea and contenteditable fields, the fresh extension service worker, and DevTools page targets.
- Result: the fresh service worker loaded and identified as `ikmal editor rewrite (browser slice)`, but Chromium headless did not inject the MV3 content script into the page, so no indicator mount could be observed. This is an environment limitation, not evidence that the DOM slice passed.
- Cleanup: removed temporary page-visible bootstrap diagnostics and stopped the Chromium/local HTTP-server processes. The final artifact was rebuilt after cleanup.
- Tests run and results: `node tools/package_browser_rewrite.mjs` — passed; `node tools/verify_browser_rewrite.mjs` — passed; `npm test --prefix packages/writing-adapters` — passed, 6 tests; `npm test --prefix packages/writing-ui` — passed, 3 tests; `npm test --prefix packages/design-system` — passed, 2 tests; `git diff --check` — passed.
- New risk: a headed browser or Playwright-capable environment is still required for content-script injection, Shadow DOM rendering, contenteditable mutation, IME, and iframe/hostile-page smoke coverage.
- Next action: retain the static/package evidence, add headed-browser/Playwright smoke when available, and continue the desktop vertical-slice adapter without modifying the deprecated extension rendering path.

---

### 2026-08-08 — Agent / desktop renderer slice foundation

- Gate: `3` foundation
- Inspected: the desktop editor textarea/preload service boundary, shared browser field capability, browser slice controller, and core correction semantics.
- Changed: added `packages/writing-adapters/src/desktop_slice.ts`, a renderer-only adapter that accepts a preload-shaped `checkText` service and delegates field reads, normalized checks, stale handling, indicator state, and Apply to the shared browser/core slice. It has no Electron imports.
- Contracts or fixtures added: `packages/writing-adapters/test/desktop_slice.test.mjs` proves the preload-shaped service receives the current text and that a normalized issue applies through the same revision-safe correction path as the browser slice.
- Tests run and results: `npm test --prefix packages/writing-adapters` — passed, 7 tests; `node tools/package_browser_rewrite.mjs` — passed; `node tools/verify_browser_rewrite.mjs` — passed; design-system and writing-ui suites — passed; `git diff --check` — passed.
- New risks or decisions: this is a renderer contract foundation, not yet a fresh Electron window or native desktop smoke run. The deprecated desktop renderer remains the behavioral reference until the replacement window is wired and packaged.
- Next action: add the fresh desktop renderer entrypoint and package/resource staging, then exercise both host slices with real visual and stale/selection checks.

### 2026-08-08 — Agent / fresh desktop renderer and native smoke

- Gate: `3` foundation / desktop vertical-slice evidence
- Inspected: the Electron full-editor load path, preload `checkText` boundary, fresh renderer module graph, desktop packager `extraResource` behavior, and the existing legacy smoke harness.
- Changed: added `apps/desktop-editor/` as the fresh desktop renderer entrypoint with shared tokens, textarea field capability, compiled core/controller/UI modules, indicator Shadow DOM, issue popover, and revision-safe Apply. Added `desktop/rewrite_smoke.mjs`; Electron selects the new page only with `IKMAL_DESKTOP_REWRITE_SLICE=1`, while `editor.html` remains the default. Desktop packaging now stages the rewrite resources and `desktop/package:rewrite` exposes the staging command.
- Contracts or fixtures added: the focused native smoke opens the fresh renderer through the real preload/main-process boundary, checks an issue through the local fake checker, verifies the indicator’s Shadow DOM, and applies the correction to updated text. The desktop verifier checks the opt-in resolver, rewrite packager, resource path, and smoke entrypoint.
- Tests run and results: `node tools/verify_desktop_rewrite.mjs` — passed; `npm run smoke:rewrite --prefix desktop` — passed; `npm run package --prefix desktop` — passed for `darwin/arm64` and produced a bundle containing `Resources/desktop-editor/index.html`, `writing-core.js`, and `desktop_slice.js`; `npm run verify --prefix desktop` — passed, 42 tests; `go test ./...` — passed; browser/asset/VS Code/Office verifiers — passed; writing-adapters — passed, 7 tests; writing-ui — passed, 3 tests; design-system — passed, 2 tests; `git diff --check` — passed.
- New risks or decisions: the fresh desktop window proves the core check/apply path but does not yet cover native visual parity, IME, selection chaos, or packaged execution outside the repository. The old desktop renderer remains the default reference and is not being removed.
- Unknowns: headed browser injection is still unavailable in the current headless smoke environment; browser DOM/IME/iframe/Shadow DOM lifecycle evidence remains open.
- Next action: add headed-browser/Playwright smoke and hostile-field chaos fixtures, then expand both slices with stale/selection/Ignore and unavailable-service coverage before a visual gate review.

### 2026-08-08 — Agent / packaged browser runtime smoke and field chaos

- Gate: `3` browser vertical-slice evidence
- Inspected: the staged MV3 compiled modules in Chromium 151, textarea and contenteditable active-field transitions, Shadow DOM indicator/popover rendering, composition events, and field mutation/removal during delayed checks.
- Changed: added `tools/browser_rewrite_smoke.mjs`, which packages the fresh browser artifact, serves it with the existing fixture, loads the actual staged content module in Chromium with a controlled loopback `chrome.runtime` stub, and exercises Apply plus teardown races. Documented the distinction between this packaged-runtime smoke and a true MV3 injection smoke in `apps/browser-extension/README.md`.
- Contracts or fixtures added: the smoke verifies textarea issue detection and Apply, contenteditable replacement after compositionstart/compositionend/input events, Shadow DOM UI boundaries, and stale delayed results after text mutation and field removal. It reports page errors and rejects stale issue presentation.
- Tests run and results: `node tools/browser_rewrite_smoke.mjs` — passed; `npm test --prefix packages/writing-adapters` — passed, 7 tests; `node tools/verify_browser_rewrite.mjs` — passed; `git diff --check` — passed.
- New risks or decisions: the controlled runtime smoke is real Chromium execution but not proof of browser MV3 content-script injection. Headed/Playwright injection, iframe coverage, selection-range chaos, Ignore/unavailable-service UI, and visual review remain open.
- Unknowns: the current environment has Chromium but no Playwright package and the earlier headless extension load did not inject the MV3 content script; a headed-capable browser harness is still needed for that specific boundary.
- Next action: add selection/Ignore/unavailable-service assertions to the host slices, then run MV3 injection when a headed/Playwright environment is available before visual-gate review.

### 2026-08-08 — Agent / browser selection and service-state follow-up

- Gate: `3` browser vertical-slice evidence
- Inspected: selected-text request semantics, relative checker offsets, browser Apply ranges, and the direct Chromium smoke’s selection/Ignore/unavailable paths.
- Changed: the fresh content module now forwards the versioned selection signal. The browser adapter rebases selected-result issue and relationship ranges into full-document coordinates before Apply. Added a regression fixture for a selected `teh` correction and extended the Chromium smoke with selection-aware Apply, Ignore, and unavailable-service state assertions.
- Contracts or fixtures added: `packages/writing-adapters/test/browser_slice.test.mjs` now has 8 passing tests, including selected-range rebasing. `tools/browser_rewrite_smoke.mjs` runs the staged artifact in Chromium against textarea/contenteditable fields, composition events, stale teardown, and service failure.
- Tests run and results: `npm test --prefix packages/writing-adapters` — passed, 8 tests; `node tools/browser_rewrite_smoke.mjs` — passed; `node tools/verify_browser_rewrite.mjs` — passed; `git diff --check` — passed.
- New risks or decisions: selected-check offsets are now explicitly host-rebased; the direct Chromium smoke is strong runtime evidence but still does not prove MV3 content-script injection. Headed/Playwright injection, iframe coverage, and visual/accessibility review remain open.
- Unknowns: whether the next environment can provide headed extension injection; no Playwright package is present locally.
- Next action: run true MV3 injection smoke when headed/Playwright execution is available, then begin visual/accessibility review and broader cross-host selection parity.

### 2026-08-08 — Agent / desktop preload handoff and parity smoke

- Gate: `3` desktop vertical-slice evidence
- Inspected: the fresh renderer’s preload event surface, initial text delivery from `showEditorWindow`, selected-range controller behavior, issue popover actions, and checker failure presentation.
- Changed: `apps/desktop-editor/renderer.js` now consumes `window.ikmal.onEditorText`, updates the fresh field, and checks the delivered draft. The native smoke now verifies preload text handoff, selected-range Apply, Ignore, and unavailable-service state in addition to the Shadow DOM indicator.
- Contracts or fixtures added: `desktop/rewrite_smoke.mjs` exercises the actual Electron main/preload/renderer boundary with a fake local checker and proves the legacy editor path is not required for the fresh slice’s active-field flow.
- Tests run and results: `node --check ../apps/desktop-editor/renderer.js` from `desktop/` — passed; `npm run smoke:rewrite --prefix desktop` — passed; selected Apply produced `The results are ready.`, Ignore preserved `The results is ready.`, and checker failure produced `unavailable` / `Local checker unavailable`.
- New risks or decisions: native desktop parity now includes initial text transfer, but visual parity, keyboard/accessibility review, and packaged execution outside the repository remain open. The old desktop renderer remains the default.
- Unknowns: browser MV3 headed injection is still unavailable; no Playwright package is present locally.
- Next action: package the updated desktop renderer, then run the remaining cross-host verifiers and pursue true MV3 injection or visual review when the environment supports it.

### 2026-08-08 — Agent / packaged desktop parity refresh

- Gate: `3` desktop vertical-slice and packaging evidence
- Inspected: the rebuilt Darwin/arm64 bundle’s unpacked desktop rewrite resource directory after the preload-handoff change.
- Changed: rebuilt the desktop artifact so `Resources/desktop-editor/` contains the current renderer, compiled core, adapter, and UI modules. The desktop rewrite verifier now requires the preload `onEditorText` handoff in the fresh renderer.
- Tests run and results: `npm run package --prefix desktop` — passed for `darwin/arm64`; `Resources/desktop-editor/index.html`, `renderer.js`, and `writing-core.js` verified present; `npm run verify --prefix desktop` — passed, 42 tests; browser runtime smoke — passed; adapter suite — passed, 8 tests; `go test ./...` — passed; `git diff --check` — passed.
- New risks or decisions: packaging evidence is local and platform-specific; packaged execution outside the repository and visual parity remain open. The non-fatal existing Electron icon-format warning remains from the current asset/packager combination.
- Unknowns: no headed/Playwright MV3 injection environment is available locally.
- Next action: pursue true MV3 injection evidence or begin screenshot/keyboard/accessibility review, then add iframe and cross-host selection parity coverage.

### 2026-08-08 — Agent / browser visual review and primitive CSS fix

- Gate: `5` foundation / Gate `3` browser visual evidence
- Inspected: a real Chromium screenshot of the fresh browser runtime with an active contenteditable issue popover and Shadow-DOM indicator.
- Finding: the first screenshot exposed a visual defect: the browser artifact shipped tokens but not Continental primitive CSS, leaving `.cnt-popover` without its background, border, padding, and semantic contrast.
- Changed: staged `primitives.css` in the browser artifact, declared it web-accessible, loaded it into both indicator and popover Shadow DOM roots, and added verifier coverage. The corrected screenshot shows the dark popover surface, readable foreground text, replacement preview, and visible Apply/Ignore controls.
- Tests run and results: `node tools/browser_rewrite_smoke.mjs` — passed after the fix; screenshot regenerated at ignored `bin/browser-extension/browser-rewrite-smoke.png`; `node tools/verify_browser_rewrite.mjs` — passed; design-system — passed, 2 tests; `git diff --check` — passed.
- New risks or decisions: this is a runtime screenshot review of the staged module surface, not a complete multi-theme/keyboard/contrast matrix and not proof of MV3 injection. Desktop visual review and full Playwright coverage remain open.
- Unknowns: headed/Playwright extension injection is still unavailable locally.
- Next action: review the equivalent desktop screenshot and keyboard path, then add true MV3 injection evidence when the environment supports it.

### 2026-08-08 — Agent / desktop visual review and viewport fit fix

- Gate: `5` foundation / Gate `3` desktop visual evidence
- Inspected: a real Electron screenshot of the fresh desktop renderer at the native smoke window size with an active issue popover, replacement preview, Why disclosure, Apply, Ignore, indicator, and editor footer visible.
- Finding: the first screenshot pushed the issue card below the fold because the renderer’s 360px minimum textarea consumed too much of the 760px window.
- Changed: reduced the fresh slice textarea minimum to 260px so the issue card and actions remain visible together while preserving vertical resize behavior.
- Tests run and results: `npm run smoke:rewrite --prefix desktop` — passed after the fix; screenshot regenerated at ignored `bin/desktop-rewrite-smoke.png` and visually reviewed; preload handoff, selected Apply, Ignore, unavailable service, and Shadow DOM checks remain passing.
- New risks or decisions: this is a single dark-theme viewport review, not a complete density/theme/keyboard/accessibility matrix. The deprecated desktop renderer remains unchanged and default.
- Unknowns: true MV3 headed/Playwright injection remains unavailable locally.
- Next action: add keyboard/focus assertions to the fresh desktop and browser surfaces, then pursue true MV3 injection evidence.

### 2026-08-08 — Agent / fresh-slice keyboard and accessibility smoke

- Gate: `5` interaction evidence
- Inspected: indicator `aria-label` output, Shadow DOM active elements, popover Apply focus, and the desktop light-DOM Apply focus path.
- Changed: browser and desktop smoke harnesses now assert the issue indicator exposes `1 issue` and that Apply receives programmatic keyboard focus before action execution.
- Tests run and results: browser rewrite Chromium smoke — passed; desktop rewrite Electron smoke — passed; both retained their Apply, Ignore, unavailable-service, selection, and stale-field assertions.
- New risks or decisions: focus assertions cover the first actionable state only; full Tab order, Escape behavior, screen-reader review, reduced-motion, and all theme/density combinations remain open.
- Unknowns: true MV3 headed/Playwright injection remains unavailable locally.
- Next action: package the final fresh slices and run the remaining cross-host regression checks; then pursue MV3 injection and broader accessibility review.

### 2026-08-08 — Agent / Escape dismissal and focus return

- Gate: `5` interaction evidence
- Inspected: open issue popovers in the browser and desktop fresh slices, synthetic Escape events, shadow-root focus state, and dismissal/reopen behavior.
- Changed: both fresh hosts now close the issue popover on Escape and return focus to the writing indicator. Smoke coverage verifies the popover is removed/hidden, the indicator regains focus, and the popover can be reopened for the subsequent Apply path.
- Tests run and results: browser Chromium runtime smoke — passed; Electron desktop smoke — passed; existing selection, Apply, Ignore, unavailable-service, stale teardown, and accessible-label assertions remain passing.
- New risks or decisions: Escape coverage uses real browser/Electron DOM execution but still does not replace a screen-reader audit or full Tab/Escape matrix across themes and densities.
- Unknowns: true MV3 headed/Playwright injection remains unavailable locally.
- Next action: package the latest interaction changes, run final verifiers, and pursue true MV3 injection or broader accessibility review when the environment supports it.

### 2026-08-08 — Agent / headed MV3 injection smoke

- Gate: `3` browser vertical-slice evidence
- Inspected: the packaged MV3 extension in headed Chromium through an external Playwright runtime, its service-worker manifest, loopback fixture injection, live checker transport, Shadow DOM indicator, issue action vocabulary, and Ignore behavior.
- Changed: added `tools/browser_extension_injection_smoke.mjs`, an opt-in harness that packages the fresh artifact, discovers an already-running local checker safely or starts a fixture checker on `8096`, launches headed Chromium with only the fresh extension, and exercises the actual injected page. The browser verifier and README now require/document the harness without adding Playwright to the rewrite dependencies.
- Contracts or fixtures added: the real checker’s review-only spelling result is accepted as `Review alternatives` + `Add to dictionary` + `Ignore`; deterministic packaged-runtime smoke remains the Apply proof. The harness polls existing service workers to avoid a Playwright registration race.
- Tests run and results: `IKMAL_PLAYWRIGHT_MODULE=/Users/iansherr/Projects/fleetcommand/supercompass/demos-react/node_modules/playwright/index.mjs node tools/browser_extension_injection_smoke.mjs` — passed; service worker, content-script injection, Shadow DOM indicator, checker transport, and issue actions verified. The run reused the existing healthy local checker on `127.0.0.1:8096` without stopping or replacing it.
- New risks or decisions: this closes the previously environment-blocked injection evidence, but checker-dependent real-browser results are intentionally allowed to expose review-only actions. Full contenteditable/iframe/IME/unavailable-service MV3 cases and the keyboard/theme/accessibility matrix remain open.
- Unknowns: the external Playwright module path is host-specific and intentionally supplied through `IKMAL_PLAYWRIGHT_MODULE`; it is not a new repository dependency.
- Next action: extend the headed harness across contenteditable, iframe, mutation, IME, unavailable checker, and visual/theme cases before considering Gate 3/5 closure.

### 2026-08-08 — Agent / headed MV3 hostile-field expansion

- Gate: `3` browser chaos foundation / `5` theme evidence
- Inspected: the real injected extension against a loopback fixture with a light-theme root, same-origin `srcdoc` iframe, textarea, contenteditable field, composition events, and immediate field removal during a pending check.
- Changed: the fixture now includes an embedded iframe; the MV3 harness asserts no injection into it because the manifest intentionally uses `all_frames: false`. The fresh browser runtime resolves an explicit page `data-theme` onto indicator/popover hosts. The harness records page errors and covers contenteditable + IME input and mutation teardown after the existing live textarea action check.
- Contracts or fixtures added: `apps/browser-extension/test/fixture.html` now provides the hostile iframe surface. `tools/browser_extension_injection_smoke.mjs` verifies service-worker identity, light-theme indicator, iframe isolation, live checker action vocabulary, contenteditable text stability, composition events, and teardown without page errors.
- Tests run and results: headed Playwright MV3 smoke with the external module path — passed; service worker, content-script injection, light theme, iframe isolation, textarea actions, contenteditable + IME events, and mutation teardown all verified. `node tools/verify_browser_rewrite.mjs` — passed.
- New risks or decisions: the real checker was reused because `8096` was already occupied by a healthy local checker; deterministic unavailable-service behavior remains in `tools/browser_rewrite_smoke.mjs`. The iframe assertion proves the selected host policy, not cross-frame editing support.
- Unknowns: rapid-selection races and a real checker outage in headed MV3 mode still need coverage; full visual/theme/accessibility matrix and security review remain open.
- Next action: add headed checker-unavailable/rapid-selection cases where the environment can safely provide them, then continue Gate 5/6 review without touching the deprecated runtime.

### 2026-08-08 — Agent / headed MV3 focus and theme assertions

- Gate: `5` browser interaction evidence
- Inspected: real injected popover focus, trusted Escape key handling, Shadow-DOM focus return, light-theme host inheritance, and the reopened issue-action path.
- Changed: headed MV3 smoke now focuses a real issue action, verifies the popover inherits the page light theme, presses Escape through Playwright, asserts popover removal and indicator focus return, then reopens the popover for the real action check.
- Tests run and results: headed MV3 Playwright smoke — passed; service worker, content-script injection, light theme, iframe isolation, focus/Escape, textarea actions, contenteditable + IME events, and mutation teardown verified.
- New risks or decisions: keyboard evidence now covers the primary issue flow, but full Tab order, screen-reader behavior, unavailable checker in headed mode, rapid selection races, and all density/theme combinations remain open.
- Unknowns: the external Playwright module remains host-specific and is passed through `IKMAL_PLAYWRIGHT_MODULE`; it is not a repository dependency.
- Next action: add safe headed checker-unavailable/rapid-selection cases, then continue the security and full visual/accessibility matrix.

### 2026-08-08 — Agent / rapid response race fixture

- Gate: `2` / `3` correctness and chaos evidence
- Inspected: two overlapping browser controller checks where the field changes before the first response returns, with the newest response resolving first and the stale response resolving last.
- Changed: added a `packages/writing-adapters` fixture proving the controller keeps the newest document revision/result, marks the older completion stale, and settles `checking` false without allowing the stale issue to apply.
- Tests run and results: `npm test --prefix packages/writing-adapters` — passed, 9 tests.
- New risks or decisions: deterministic stale-race coverage now includes both response orderings; browser checker-outage behavior remains in the packaged runtime smoke, while headed MV3 outage injection still needs a safe isolated endpoint.
- Unknowns: whether the next test environment can provide a disposable checker endpoint for a headed MV3 unavailable-service case without changing the fixed loopback production contract.
- Next action: continue security/origin review and complete the cross-host visual/accessibility matrix.

### 2026-08-08 — Agent / headed MV3 visual and origin assertions

- Gate: `5` / `6` foundation evidence
- Inspected: the real injected light-theme issue popover’s computed surface, foreground, border, padding, dialog role, page-request origins, and checker transport count.
- Changed: headed MV3 smoke now rejects transparent/unpadded popovers, verifies `role="dialog"` and light-theme inheritance, records HTTP requests, and fails if the runtime makes any non-loopback request.
- Tests run and results: headed Playwright MV3 smoke — passed; computed popover state was opaque `rgb(255, 253, 247)`, readable `rgb(41, 39, 34)`, bordered, padded, and `role=dialog`; request count was 1 and remained loopback-only. Browser verifier and diff checks remain passing.
- New risks or decisions: this is runtime evidence for one light-theme viewport and page-request surface, not a complete CSP, service-worker network, permission, screen-reader, or multi-theme security review.
- Unknowns: checker-unavailable headed mode still needs a disposable endpoint; the current healthy checker on `8096` was reused without interruption.
- Next action: complete the unavailable-checker scenario safely, then continue Gate 6 security review and full theme/density/accessibility coverage.

### 2026-08-08 — Agent / headed MV3 outage and rapid-edit follow-up

- Gate: `3` / `4` / `5` browser runtime evidence
- Inspected: the injected controller’s runtime-message failure path, the packaged MV3 background artifact, an unreachable checker endpoint, and an overlapping `teh` → `the` edit in headed Chromium.
- Changed: added a five-second content-side timeout so a runtime message that never invokes its callback transitions to the unavailable state. Added `tools/browser_extension_unavailable_smoke.mjs`; it patches only the generated smoke artifact to an unreachable loopback port and leaves the fixed production endpoint and running checker untouched. The headed injection harness now asserts the final rapid-edit state matches the current text.
- Tests run and results: `IKMAL_PLAYWRIGHT_MODULE=/Users/iansherr/Projects/fleetcommand/supercompass/demos-react/node_modules/playwright/index.mjs node tools/browser_extension_unavailable_smoke.mjs` — passed with `status=unavailable`, `label=Checking unavailable`; the same command with `browser_extension_injection_smoke.mjs` — passed for service worker, real content-script injection, iframe isolation, textarea actions, rapid edit freshness, contenteditable/IME, mutation teardown, visual semantics, and loopback-only requests; `node tools/verify_browser_rewrite.mjs` — passed; `git diff --check` — passed.
- New risks or decisions: the headed rapid-edit case proves final-state freshness against the available checker but does not control response delay; deterministic adapter tests remain the authoritative two-order stale-race evidence. The unavailable harness intentionally tests an unreachable checker rather than stopping a shared local process.
- Unknowns: full keyboard Tab order, screen-reader behavior, dark/high-contrast and density parity, packaged CSP/service-worker network review, and a disposable headed checker with controlled response ordering remain open.
- Next action: continue the Gate 5 keyboard/theme/accessibility matrix and Gate 6 packaged-origin/security review.

### 2026-08-08 — Agent / headed MV3 dark-theme matrix

- Gate: `5` / `6` visual and interaction evidence
- Inspected: fresh headed Chromium pages initialized with both light and dark root themes, issue popover computed surfaces, dialog roles, padding, foreground colors, and the existing focus/Escape path.
- Changed: extended `tools/browser_extension_injection_smoke.mjs` with a second dark-theme page while retaining the light-theme assertions on the primary page. Both paths use the packaged fresh MV3 artifact and real checker transport.
- Tests run and results: headed MV3 Playwright smoke — passed; light surface was `rgb(255, 253, 247)` with readable foreground, dark surface was `rgb(15, 15, 20)` with readable foreground, both had `12px` padding and `role=dialog`; rapid edit, contenteditable/IME, iframe isolation, mutation teardown, and loopback-only request assertions also passed.
- New risks or decisions: theme evidence now covers two runtime themes and one viewport; it does not establish density, high-contrast, reduced-motion, screen-reader, or full Tab-order parity across desktop and browser hosts.
- Unknowns: packaged CSP/service-worker network review and approved logo/runtime asset adoption remain open for later gates.
- Next action: complete cross-host keyboard/accessibility evidence, then inspect packaged security boundaries and resource leakage.

### 2026-08-08 — Agent / packaged browser boundary review

- Gate: `6` security and privacy foundation / `7` packaging evidence
- Inspected: `bin/browser-extension/ikmal-editor-browser-slice-v0.1.0.zip`, its manifest, background transport, and all fresh portable package sources for developer paths, filesystem/process imports, non-loopback URLs, dynamic evaluation, and broad extension permissions.
- Result: the packaged artifact contains 14 expected runtime files; the manifest declares no permissions and only `http://127.0.0.1/*` plus `http://localhost/*` host permissions; the background checker endpoint is fixed to loopback; no portable core/adapter/UI/design source imports Node, Electron, filesystem, or network modules.
- Tests run and results: `unzip -l bin/browser-extension/ikmal-editor-browser-slice-v0.1.0.zip` — passed expected artifact inventory; targeted `rg` boundary scan — found only the intentional loopback transport and design-token schema URL; browser verifier and headed MV3 smoke remain passing.
- New risks or decisions: this is a source/artifact boundary review, not a complete CSP, service-worker request interception, permission minimization across every browser host, logging, or release-signing review.
- Unknowns: full Tab order/screen-reader behavior, high-contrast and density states, CSP headers, and packaged desktop/extension execution outside this workspace remain open.
- Next action: add cross-host keyboard evidence and inspect the fresh desktop package for the same origin/resource boundary properties.

### 2026-08-08 — Agent / packaged desktop boundary and Tab review

- Gate: `5` / `6` / `7` desktop runtime evidence
- Inspected: the actual `darwin/arm64` Electron bundle produced by `npm run package --prefix desktop`, its unpacked `Resources/desktop-editor` rewrite payload, compiled `Resources/dist` adapters, preload/main loading path, and fresh browser/desktop popover focus order.
- Changed: added real Tab-order assertions to `tools/browser_extension_injection_smoke.mjs` and `desktop/rewrite_smoke.mjs`. The browser expects the live action order (`alternatives`, `dictionary`, `ignore` for the available checker); the desktop smoke drives a native Tab event from Apply to Ignore.
- Tests run and results: `npm run package:rewrite --prefix desktop` — passed; `npm run package --prefix desktop` — passed and produced the fresh macOS bundle with `Resources/desktop-editor` and compiled `Resources/dist`; headed MV3 Playwright smoke — passed with `tabOrder=[alternatives,dictionary,ignore]`; `npm run smoke:rewrite --prefix desktop` — passed with preload handoff, selected Apply, Ignore, unavailable service, Shadow DOM, focus/Escape, and Tab assertions; packaged renderer scan found no developer paths, Electron/Node imports, or external URLs.
- New risks or decisions: Tab evidence now covers the primary issue actions in both fresh hosts, but it is not a screen-reader audit, focus trap, high-contrast review, or complete keyboard matrix for every state.
- Unknowns: packaged CSP headers, service-worker request interception, release signing, desktop high-contrast/density themes, and approved logo/runtime asset adoption remain open.
- Next action: review the packaged desktop preload/network boundary and add reduced-motion/high-contrast evidence where the fresh design-system contract supports it.

### 2026-08-08 — Agent / Continental axis propagation

- Gate: `5` visual interaction / `6` design-boundary evidence
- Inspected: the Continental token axes for theme, palette, density, and contrast, Shadow DOM host inheritance, and the fresh browser/desktop renderer boundaries.
- Changed: token selectors now support host-level palette, density, and contrast attributes in addition to document descendants. The browser rewrite synchronizes those attributes from the page root onto its indicator and popover hosts and observes runtime changes; the desktop rewrite synchronizes the same attributes onto its indicator host.
- Tests run and results: `npm test --prefix packages/design-system` — passed, 2 tests; headed MV3 smoke — passed with dark theme, compact density, high contrast, bathymetric palette, `10px` compact popover padding, and `--accent=#34c6c0`; `npm run package:rewrite --prefix desktop` — passed; `npm run smoke:rewrite --prefix desktop` — passed; `git diff --check` — passed.
- New risks or decisions: axis propagation now has runtime evidence for one compact/high-contrast/palette combination, but full density/palette/contrast combinations and reduced-motion behavior remain open.
- Unknowns: screen-reader semantics, packaged CSP/service-worker network review, and release asset/signing review remain open.
- Next action: continue reduced-motion and high-contrast interaction checks, then finish the packaged desktop preload/network boundary review.

### 2026-08-08 — Agent / reduced-motion and contrast runtime check

- Gate: `5` visual/accessibility evidence
- Inspected: headed MV3 computed token values for compact density, high contrast, bathymetric palette, and the reduced-motion media query on the live Shadow DOM indicator.
- Changed: the headed harness now sets `prefers-reduced-motion: reduce`, verifies the checking dot has `animationName=none`, and checks high-contrast `--border-1` plus palette `--accent` values in the dark compact fixture.
- Tests run and results: headed MV3 Playwright smoke — passed; dark compact/high-contrast/bathymetric popover had `10px` padding, `--border-1=rgba(232,232,236,0.22)`, `--accent=#34c6c0`, `role=dialog`, and reduced-motion animation disabled; light/dark theme, Tab order, rapid edit, IME, mutation, iframe, and loopback-origin checks also passed.
- New risks or decisions: reduced-motion and one high-contrast axis combination are now runtime-tested; this does not replace a screen-reader audit or cover every palette/density combination.
- Unknowns: packaged desktop preload/network boundary, CSP, service-worker interception, release signing, and approved logo/runtime asset adoption remain open.
- Next action: inspect the packaged desktop preload bridge and network ownership, then run the final rewrite regression set.

### 2026-08-08 — Agent / fresh desktop preload isolation

- Gate: `6` security/privacy / `7` packaged desktop evidence
- Inspected: the fresh desktop renderer’s preload selection in development and the actual packaged macOS bundle, including `Resources/desktop-editor/preload.cjs` and the asar main/preload entries.
- Changed: added `apps/desktop-editor/preload.cjs` exposing only `checkText` and `onEditorText`. `desktop/main.cjs` selects that preload only for `IKMAL_DESKTOP_REWRITE_SLICE=1` and retains the legacy preload for the deprecated reference app. The desktop verifier and smoke now assert the exact fresh surface.
- Tests run and results: `npm run package:rewrite --prefix desktop` — passed; `npm run smoke:rewrite --prefix desktop` — passed with `preloadSurface=["checkText","onEditorText"]`, selected Apply, Ignore, unavailable service, Shadow DOM, focus/Escape, and Tab assertions; `npm run package --prefix desktop` — passed and produced the macOS bundle; packaged resource inspection confirmed `Resources/desktop-editor/preload.cjs`; `node tools/verify_desktop_rewrite.mjs` and `git diff --check` — passed.
- New risks or decisions: this closes the fresh renderer’s broad legacy preload exposure without changing the legacy app path. The main process still owns a large legacy IPC registry because the rewrite is opt-in and the old app remains a behavioral reference.
- Unknowns: renderer CSP, service-worker/network interception, release signing, and full packaged execution on every target platform remain open.
- Next action: run the final rewrite regression set and document the remaining cross-host/security unknowns before considering Gate 6/7 closure.

### 2026-08-08 — Agent / final rewrite regression pass

- Gate: `2` / `3` / `4` / `5` / `6` regression evidence
- Inspected: the current fresh core, adapters, UI, design-system, browser, desktop, asset, and Go service surfaces after the preload and Continental-axis changes.
- Tests run and results: `npm test --prefix packages/writing-core` — passed, 15 tests; `npm test --prefix packages/writing-adapters` — passed, 9 tests; `npm test --prefix packages/writing-ui` — passed, 3 tests; `npm test --prefix packages/design-system` — passed, 2 tests; browser and desktop rewrite verifiers — passed; editor asset verifier — passed; `go test ./...` — passed; `git diff --check` — passed; headed MV3 unavailable-service smoke — passed.
- New risks or decisions: the fresh rewrite regression set is green, but this is evidence for the implemented vertical slices and not a claim that later gates are complete.
- Unknowns: screen-reader audit, all-host accessibility parity, CSP and service-worker network interception, release signing, full platform package execution, and final approved logo/runtime adoption remain open.
- Next action: keep the ledger active for the remaining Gate 6/7/8 review items; do not mark later gates complete from this regression pass alone.

### 2026-08-08 — Agent / macOS product icon packaging fix

- Gate: `7` packaging realism / `8` release review
- Inspected: Electron Packager 20.0.4’s macOS icon normalization, the approved `assets/ikmal_languagetool.icns` source, the generated app bundle, and `Contents/Info.plist`.
- Changed: `desktop/package_desktop.mjs` now passes the icon basename in the form Packager expects, sets `CFBundleIconFile` to `ikmal editor.icns`, suppresses Packager’s non-fatal `.icon` probe warning because this project intentionally ships ICNS without an Xcode asset-catalog source, removes the unused template `electron.icns`, and asserts the product-named icon exists after packaging.
- Tests run and results: `npm run package --prefix desktop` — passed with no icon warning; `Info.plist` reports `CFBundleDisplayName=ikmal editor`, `CFBundleName=ikmal editor`, and `CFBundleIconFile=ikmal editor.icns`; the packaged product ICNS is byte-identical to `assets/ikmal_languagetool.icns`; no default `electron.icns` remains in the app bundle; asset verifier and `git diff --check` — passed.
- New risks or decisions: the source asset remains canonically named `ikmal_languagetool.icns`, while the distributable resource is deliberately product-named `ikmal editor.icns`; this keeps source provenance and bundle identity separate. The `.icon` asset-catalog format remains unsupported in this environment because `actool` is unavailable.
- Unknowns: Windows `.ico` and Linux desktop metadata have not been rebuilt in this pass; release signing/notarization and final Gate 8 review remain open.
- Next action: run the fresh desktop smoke once more against the product-named bundle and then continue platform packaging review if needed.

### 2026-08-08 — Agent / product icon post-fix verification

- Result: the rebuilt product-named macOS bundle passed `npm run smoke:rewrite --prefix desktop`, `node tools/verify_editor_assets.mjs`, `node tools/verify_desktop_rewrite.mjs`, and `git diff --check`. The fresh desktop smoke still reports the isolated two-method preload surface and all Apply/Ignore/unavailable/Shadow DOM checks passing.
- Remaining: Windows `.ico`/Linux metadata and signing/notarization are separate packaging work; the macOS ICNS naming/warning issue is resolved.

### 2026-08-08 — Agent / packaged desktop rewrite execution

- Gate: `7` packaged vertical-slice evidence
- Inspected: the actual generated `bin/desktop/ikmal editor-darwin-arm64/ikmal editor.app` executable, its `file://.../app.asar` compact renderer, unpacked `Resources/desktop-editor` rewrite payload, minimal preload, and packaged local-service boundary.
- Changed: added `desktop/rewrite_packaged_smoke.mjs` and the `smoke:rewrite:packaged` script. The shared desktop smoke now recognizes packaged `app.asar` and `Resources/desktop-editor` targets and selects a free DevTools port to avoid unrelated Chromium collisions.
- Tests run and results: `npm run smoke:rewrite:packaged --prefix desktop` — passed against the real `.app` executable with `preloadSurface=["checkText","onEditorText"]`, preload text handoff, selected-range Apply, Ignore, unavailable service, Shadow DOM, focus/Escape, and Tab checks; `node tools/verify_desktop_rewrite.mjs` and `git diff --check` — passed.
- New risks or decisions: this is packaged macOS execution evidence, not a release-signing/notarization result. The smoke uses a temporary user-data directory and loopback fake services, while preserving the existing running local checker.
- Unknowns: Windows/Linux packaged execution, signed/notarized distribution, and final Gate 8 screen-reader/diff review remain open.
- Next action: complete Windows/Linux icon/package validation if those targets are in scope, then perform the final Gate 8 review.

### 2026-08-08 — Agent / Windows and Linux package validation

- Gate: `7` packaging realism
- Inspected: the approved 1024px product PNG, Electron Packager’s Windows `.ico` requirement, the generated Windows PE resource table, and the fresh Linux x64 bundle path.
- Changed: generated `assets/ikmal_languagetool.ico` with six product-icon sizes (16, 32, 48, 64, 128, 256) from the approved transparent PNG. Windows packaging now supplies that ICO basename to Packager; the desktop verifier requires the asset. Linux remains explicitly resource-based because Electron Packager does not generate Linux desktop-entry metadata.
- Tests run and results: `IKMAL_DESKTOP_PLATFORM=win32 IKMAL_DESKTOP_ARCH=x64 npm run package --prefix desktop` — passed with no icon warning; PE resource inspection found one product icon group containing six sizes; `IKMAL_DESKTOP_PLATFORM=linux IKMAL_DESKTOP_ARCH=x64 npm run package --prefix desktop` — passed; `node tools/verify_desktop.mjs` and `git diff --check` — passed.
- New risks or decisions: Windows and macOS now have explicit product icon inputs and package assertions. Linux package execution succeeds, but desktop-environment registration/icon metadata is a separate distribution integration and has not been invented inside Electron Packager.
- Unknowns: signed/notarized macOS and Windows distribution, Linux desktop-entry integration, and final Gate 8 review remain open.
- Next action: move to Gate 8 final review after deciding whether Linux desktop integration is in release scope.

### 2026-08-08 — Agent / rewrite asset rebrand correction

- Gate: `7` packaging / `8` product identity review
- Finding: the rewrite packaging was still sourcing icons through the legacy `ikmal_languagetool_*` filenames. Those names describe the underlying checker heritage, not the rewritten product identity, and should not define fresh app packaging.
- Changed: added product-branded `assets/ikmal_editor_icon.png`, `assets/ikmal_editor.icns`, and `assets/ikmal_editor.ico` aliases from the approved editor artwork. Fresh desktop packaging now uses only the `ikmal_editor` base; legacy LanguageTool-named assets remain available only for the deprecated reference runtime. The rewrite verifier rejects regression to the legacy packaging base.
- Tests run and results: macOS package — passed without icon warning, `CFBundleName=ikmal editor`, `CFBundleIconFile=ikmal editor.icns`, and product ICNS matched `assets/ikmal_editor.icns`; Windows x64 package — passed without icon warning and embedded six sizes `[16,32,48,64,128,256]`; desktop verifiers and `git diff --check` — passed.
- Decision: LanguageTool remains an engine/provenance dependency and may appear in backend/service categories; it is no longer the fresh rewrite’s product or icon identity.
- Unknowns: legacy UI naming and Linux desktop-entry metadata remain separate migration/release decisions; no legacy runtime was renamed or removed.
- Next action: continue Gate 8 review with the fresh rewrite identity boundary fixed.

### 2026-08-08 — Agent / technical LanguageTool reference sweep

- Gate: `8` product identity review
- Inspected: fresh `apps/`, portable packages, rewrite smoke harnesses, and rewrite verifiers for user-facing or packaging-level `LanguageTool` branding.
- Result: remaining fresh-surface references are technical and intentional: the checker provenance value `LanguageTool`, the local service environment variable, and normalization fixtures. Fresh manifest/title/renderer/package identity uses `ikmal editor`; no generic LanguageTool headline or icon path remains in rewrite packaging.
- Decision: preserve LanguageTool wherever it names the actual engine, protocol, source provenance, or integration; prohibit it as the product headline/name unless an issue source is explicitly LanguageTool, matching the plan’s issue-popover rule.
- Tests run and results: targeted `rg` identity sweep — passed with only technical references; `node tools/verify_desktop_rewrite.mjs`, `node tools/verify_desktop.mjs`, and `git diff --check` — passed.
- Unknowns: legacy reference UI retains historical LanguageTool naming by design; Linux desktop-entry branding and final accessibility/signing review remain open.
- Next action: proceed with final Gate 8 review and decide whether Linux desktop integration belongs in this release scope.

### 2026-08-08 — Agent / executable identity and accessibility checks

- Gate: `8` final review foundation
- Changed: browser and desktop rewrite verifiers now reject legacy LanguageTool branding in fresh product-facing manifest/README/HTML surfaces while allowing technical source-provenance references. The shared writing-UI test now asserts the issue popover’s `role="dialog"`, accessible label, canonical actions, and absence of generic LanguageTool branding.
- Tests run and results: `node tools/verify_browser_rewrite.mjs` — passed; `node tools/verify_desktop_rewrite.mjs` — passed; `npm test --prefix packages/writing-ui` — passed, 3 tests; `git diff --check` — passed.
- Decision: this enforces the agreed boundary mechanically: “ikmal editor” is the product identity; LanguageTool remains valid only where it names the actual engine, source, protocol, or integration.
- Unknowns: screen-reader behavior beyond structural ARIA assertions, Linux desktop-entry integration, and signed/notarized release review remain open.
- Next action: finalize the Gate 8 audit after the Linux scope decision.

### 2026-08-09 — Agent / Linux desktop integration

- Gate: `7` packaging realism
- Changed: added `desktop/linux/ikmal-editor.desktop`, product-branded hicolor PNGs at 16/32/48/64/128/256px, Linux executable naming as `ikmal-editor`, and packaged `Resources/linux` placement. The packaged launcher now targets the Linux product executable.
- Tests run and results: `node tools/verify_desktop.mjs` and `node tools/verify_desktop_rewrite.mjs` — passed; `IKMAL_DESKTOP_PLATFORM=linux IKMAL_DESKTOP_ARCH=x64 npm run package --prefix desktop` — passed; packaged Linux bundle contains `ikmal-editor`, the `.desktop` entry, and all 6 hicolor icon sizes; `git diff --check` — passed.
- Decision: Linux is in release scope. The `.desktop` file is shipped as an installable resource; system-wide registration remains the installer/package-manager responsibility rather than modifying the user’s desktop during build.
- Unknowns: Linux runtime execution cannot be launched natively from this macOS workspace; signed/notarized distribution and final screen-reader review remain open.
- Next action: perform the final Gate 8 audit across the fresh artifacts and all regression suites.

### 2026-08-09 — Agent / cross-platform final regression

- Gate: `7` complete evidence / `8` still open
- Inspected: rebuilt macOS packaged `.app`, Linux x64 bundle with desktop entry/resources, Windows x64 bundle, fresh browser artifact, and all portable rewrite packages.
- Tests run and results: macOS `npm run package --prefix desktop` — passed; `npm run smoke:rewrite:packaged --prefix desktop` — passed against the actual `.app`; Linux package and resource checks — passed; Windows package and PE icon checks — passed; core — 15 passed; adapters — 9 passed; UI — 3 passed; design system — 2 passed; browser/desktop verifiers — passed; asset verifier — passed; `go test ./...` — passed; `git diff --check` — passed.
- New risks or decisions: Gate 7 has executable evidence for all three package targets, but Linux execution is not runnable natively in this macOS workspace and distribution installers still own system-wide `.desktop` registration.
- Unknowns: screen-reader behavior beyond structural ARIA checks, signing/notarization, and final diff/duplication review remain open; Gate 8 is not complete.
- Next action: perform the final Gate 8 review and leave explicit release blockers/unknowns documented.

### 2026-08-09 — Agent / Gate 8 final boundary audit

- Gate: `8` final review
- Status: `in progress`
- Inspected: the fresh browser and desktop runtime trees, portable package
  sources, staged compiled core artifact, product-facing identity surfaces,
  accessibility hooks, host-import boundaries, developer-path leakage, and
  the current dirty-worktree scope.
- Changed: added `tools/verify_rewrite_final.mjs` as an executable final audit.
  It checks the fresh runtime inventory, one canonical core source plus one
  staged compiled copy, portable import isolation, product identity, no
  developer-local runtime paths, Shadow DOM/keyboard/ARIA/reduced-motion
  hooks, and the rewrite’s final source boundaries.
- Tests run and results: `node tools/verify_rewrite_final.mjs` — passed with
  26 fresh runtime files; `npm test --prefix packages/writing-core` — passed,
  15 tests; `npm test --prefix packages/writing-adapters` — passed, 9 tests;
  `npm test --prefix packages/writing-ui` — passed, 3 tests; `npm test
  --prefix packages/design-system` — passed, 2 tests; `go test ./...` —
  passed; browser, desktop, and editor-asset verifiers — passed; `git
  diff --check` — passed.
- Review result: no fresh-runtime developer paths, forbidden portable host
  imports, duplicate checked-in core implementation, or headline
  LanguageTool branding were found. Gate 7 is now recorded complete with the
  documented cross-platform native-execution limitation.
- Remaining release blockers/unknowns: live screen-reader behavior beyond
  structural assertions; full visual/theme screenshot matrix; packaged CSP
  and service-worker interception review; macOS/Windows signing and
  notarization; and native Linux/Windows runtime execution outside this macOS
  workspace. The legacy app remains intentionally available as the deprecated
  behavioral reference.
- Next action: continue Gate 8 with the highest-value external review item
  available in this environment, starting with packaged CSP/network evidence
  or a visual/accessibility matrix; do not remove the legacy runtime.

### 2026-08-09 — Agent / packaged CSP and transport review

- Gate: `6` security/privacy / `8` final review
- Inspected: the packaged browser-slice ZIP, packaged macOS fresh renderer
  resources, MV3 service worker transport, and fresh desktop renderer policy.
- Changed: added an explicit MV3 extension-page CSP (`script-src 'self';
  object-src 'self'`) and an explicit fresh desktop renderer CSP with no
  network or object connections. Fresh verifiers now reject dynamic-code
  execution markers and require these policies.
- Tests run and results: browser/desktop/final verifiers, syntax checks, and
  `git diff --check` — passed; browser rewrite ZIP packaging — passed; ZIP
  manifest/resource inventory — passed with no developer-local paths; macOS
  desktop packaging — passed; packaged macOS rewrite smoke — passed; isolated
  headed MV3 injection smoke — passed with service worker, iframe isolation,
  themes/axes, reduced motion, actions, rapid edits, IME/mutation teardown,
  visual semantics, and loopback-only requests; unavailable-service smoke —
  passed.
- Review result: the fresh browser page can request only the fixed loopback
  checker through the service worker, while the fresh desktop renderer uses
  the preload boundary rather than renderer network access. A concurrent
  smoke attempt briefly contended for the shared 8096 fixture port; the
  sequential rerun passed and this is test-environment contention, not a
  product result.
- Visual sanity: the packaged desktop capture shows the `IKMAL EDITOR`
  product lockup and the fresh writing workspace. The issue card’s
  `LANGUAGETOOL` source label is retained as technical provenance for that
  checker result, not as the product headline or application name.
- Remaining unknowns: live screen-reader behavior, full visual/theme matrix,
  signing/notarization, and native Windows/Linux runtime execution remain
  open. The packaged service-worker/CSP source review is complete for this
  vertical slice; broader legacy-host security review remains separate.
- Next action: continue the accessibility/visual review and preserve the
  legacy implementation as the deprecated behavioral reference.

### 2026-08-09 — Agent / live accessibility-tree review

- Gate: `5` visual/accessibility / `8` final review
- Inspected: Chromium’s live accessibility representation for the fresh
  packaged desktop renderer and the headed MV3 browser slice, including the
  Shadow DOM indicator and issue popover.
- Changed: desktop rewrite smoke now queries the Chromium AX tree and requires
  named `Draft` textbox, issue indicator, `Writing issue` dialog, Apply, and
  Ignore nodes. Headed MV3 smoke now asserts Playwright’s live ARIA snapshot
  for the issue indicator, primary action, dialog, and Ignore; it also uses an
  isolated ephemeral loopback checker when the unrelated 8096 service is
  already occupied. The staged smoke-only background artifact is patched to
  that port; production remains fixed to its documented 8096 endpoint.
- Tests run and results: packaged desktop rewrite smoke — passed with
  Chromium AX-tree assertions; headed MV3 injection smoke — passed with the
  live ARIA snapshot, isolated checker, themes/axes, reduced motion,
  iframe/IME/mutation lifecycle, focus/Tab/Escape, and loopback checks;
  direct packaged browser rewrite smoke — passed with selection-aware
  textarea Apply, contenteditable Apply, Ignore, unavailable service, and
  mutation teardown.
- Review result: both fresh hosts expose the expected named controls through
  Chromium’s accessibility layer, not only through source-level ARIA markup.
- Remaining limitation: this is browser accessibility-tree evidence, not a
  human VoiceOver/NVDA/JAWS pass. Screen-reader announcement order, verbosity,
  and modal navigation still require manual review; the full visual/theme
  screenshot matrix, signing/notarization, and native Windows/Linux runtime
  execution also remain open.
- Next action: perform manual screen-reader review when an appropriate host
  is available, then close the remaining visual/release review items without
  removing the deprecated reference runtime.

### 2026-08-09 — Agent / fresh host visual sanity review

- Gate: `5` visual/accessibility / `8` final review
- Inspected: fresh browser Shadow DOM capture and packaged desktop rewrite
  capture after the current CSP, identity, and accessibility changes.
- Result: browser issue popover is opaque, padded, readable, and visibly
  separated from the host page; Apply, dictionary, Ignore, Why, and the
  issue indicator are visible. The iframe remains untouched. Desktop shows
  the `IKMAL EDITOR` lockup, writing workspace, readable editor surface,
  indicator, and issue card with the technical checker provenance label.
- Evidence: `IKMAL_BROWSER_REWRITE_DEBUG_PORT=9242 node
  tools/browser_rewrite_smoke.mjs` — passed and produced the browser capture;
  packaged desktop smoke — passed and produced `bin/desktop-rewrite-smoke.png`.
- Review decision: no concrete visual defect found in these representative
  fresh-host captures. This is a sanity review, not completion of the full
  dark/light × density/palette × state screenshot matrix.
- Remaining: full visual matrix, human screen-reader announcements,
  signing/notarization, and native Windows/Linux runtime execution.

### 2026-08-09 — Agent / release-signing capability review

- Gate: `8` final review
- Inspected: `desktop/package.json`, `desktop/package_desktop.mjs`, available
  Electron signing dependencies, the generated macOS app signature, and
  release workflow references.
- Result: the current package workflow has no signing/notarization command or
  configured identity inputs. The generated app reports only an ad-hoc
  linker signature with no team identifier; it has no `_CodeSignature`
  resource, and strict `codesign --verify --deep --strict` plus `spctl
  --assess --type execute` both fail.
- Decision: keep unsigned/ad-hoc packaging as local build and smoke evidence;
  do not invent certificates, identities, entitlements, or notarization
  credentials in the workspace.
- Release blocker: production distribution still requires the release
  certificate/profile/notarization setup and a signed macOS/Windows artifact
  validation run on the appropriate release host.
- Next action: once release credentials and host access exist, add the
  signing/notarization workflow and repeat packaged smoke plus Gate 8 review;
  otherwise continue the remaining uncredentialed visual/accessibility
  review without claiming release readiness.

### 2026-08-09 — Agent / theme capture timing correction

- Gate: `5` visual/accessibility / `8` final review
- Finding: the first dynamically toggled light desktop screenshot captured
  before Chromium painted the new theme cascade, making the buttons appear
  darker than their computed light tokens.
- Changed: the desktop smoke waits for two animation frames after switching
  to light mode before capturing and records computed button background,
  foreground, and color-scheme values.
- Evidence: the corrected packaged light capture shows the intended
  `#ded8c9` button surface with `#292722` text; dark packaged capture,
  browser light capture, and browser dark/compact/bathymetric capture remain
  visually coherent. Packaged desktop smoke and headed browser smoke pass.
- Decision: no runtime styling defect was found; the initial discrepancy was
  an evidence-capture timing issue. The complete visual matrix is still open
  beyond these representative host/theme states.

### 2026-08-09 — Agent / desktop Continental-axis propagation

- Gate: `5` visual/accessibility / `8` final review
- Finding: the fresh desktop renderer copied theme attributes to the
  indicator only at startup, so later palette/density/contrast changes could
  leave its Shadow DOM on stale tokens.
- Changed: `apps/desktop-editor/renderer.js` now observes the document root’s
  Continental axis attributes and synchronizes them onto the indicator host.
  The packaged smoke captures a dark compact/high-contrast/bathymetric state
  and asserts both indicator and popover accent tokens, compact padding, and
  axis values.
- Tests run and results: rebuilt macOS package — passed; packaged desktop
  smoke — passed with `indicatorAccent=#34c6c0`,
  `popoverAccent=#34c6c0`, `popoverPadding=10px`, and Chromium AX-tree
  assertions; dark compact/bathymetric capture visually inspected and passed.
- Decision: this closes the tested desktop host-axis propagation gap. Full
  visual coverage across every supported state and host remains open.

---

### 2026-08-11 — Agent / browser chunked-check coverage and declared toolchain

Gate: `3` vertical slice / `7` packaging
Status: `complete`

Inspected:
- `extension/background.js`, `extension/content.js`,
  `packages/writing-adapters/src/chunked_checks.ts`, and the Electron
  chunked-check assertions in `desktop/electron_smoke.mjs`.
- `tools/browser_extension_injection_smoke.mjs`,
  `tools/browser_extension_unavailable_smoke.mjs`, `tools/verify_*.mjs`,
  `.github/workflows/*`, and every `package.json` in the repository.

Changed:
- Added `tools/extension_chunked_check_smoke.mjs`. The existing browser
  harnesses drive `apps/browser-extension`, which does not chunk; the chunked
  path lives in `extension/`, so no browser harness covered it. The new one
  loads the packaged zip and drives the worker's check handler from the
  extension's own options page, which is the browser equivalent of the desktop
  asserting through the IPC: no debounce or idle whole-document pass can
  re-derive a dropped finding and hide a regression behind its timing.
- Repaired `tools/browser_extension_injection_smoke.mjs`, which was already
  failing before this task. Two assertions had drifted from
  `packages/writing-ui/src/issue_popover.ts` moving review-first candidates
  inside a `<details>`: an ARIA assertion pinned to `button "Review
  alternatives"` where Chromium 151 exposes an unnamed group, and a focus
  assertion targeting the first `[data-action]`, now hidden inside the
  collapsed disclosure. Keyboard assertions now run over focusable controls
  and additionally prove that opening the disclosure puts an Apply in reach.
- Declared the toolchain. A root `package.json` (npm workspaces over
  `packages/*` and `tools`) plus `typescript` in the three compiling packages;
  `playwright` in a new `tools/package.json` rather than `desktop/`, so the
  release runner's `npm ci` never pulls it and nothing that ships depends on
  it. `tools/chromium_launch.mjs` resolves `IKMAL_CHROMIUM`, then Playwright's
  pinned build, then a system Chromium, and each harness reports which it used.
- Rewrote the developer-path leak check in `tools/verify_editor_assets.mjs` as
  a Node walk. It shelled out to `rg`, which threw `ENOENT` where ripgrep is
  absent — and the tempting fix, swallowing that alongside rg's "no matches"
  exit code, would have left the check passing while scanning nothing.
- Added `.github/workflows/tests.yml` (Go, Node/verifiers, browser
  extensions under `xvfb`) and a root `npm ci` step to
  `.github/workflows/desktop-release.yml`.

Evidence:
- `node tools/extension_chunked_check_smoke.mjs` — passed;
  requests `[6728, 4047, 6748, 6748, 6728]` against a 6748-character draft,
  showing the caret chunk and the unchunked whole/selection paths.
- Mutation-tested rather than trusted: dropping `plan.carried?.matches` in
  `mergeChunkedCheck` fails it with `A finding outside the rechecked chunk was
  dropped: []`; forcing `planChunkedCheck` to always return whole fails it with
  `Expected a chunk that never saw the opening paragraph`. Source restored and
  byte-compared against a pre-mutation copy.
- A file containing the developer path under `extension/` fails the rewritten
  leak check by name; removing it passes.
- Clean room, `node`/`npm` only on `PATH`: `npm ci` then `npm run build`,
  `npm run test:units` (61 pass), `npm run verify` (8 verifiers) — all pass.
  The same commands before this change printed `sh: tsc: command not found`.
- `npm test` — 141 pass; `go test ./...` — pass; `desktop/npm run verify` — 61
  pass; `desktop/npm run smoke` — pass; `npm run smoke:browser` — 3 passed;
  `git diff --check` — clean.

Unknowns / risks:
- The pinned-Chromium branch of `tools/chromium_launch.mjs` is unverified:
  `npx playwright install chromium` times out against `cdn.playwright.dev` from
  this environment, so every run above used the system-Chromium fallback and
  said so. Playwright 1.62 pins Chromium 151.0.7922 — the same major as the
  Homebrew 151.0.7898 used here, so pinning would not have prevented the ARIA
  drift repaired above; it guards against future drift, not that instance.
- `.github/workflows/tests.yml` is valid YAML running locally-verified
  commands, but has never executed on GitHub. The headed-under-`xvfb` browser
  job is the part most likely to need adjustment.
- `apps/browser-extension` does not chunk. If it is to replace `extension/`,
  chunking and retention need porting, and the new harness covers only the
  legacy extension.
- The chunked-check wiring this task covers was implemented in a previous
  session and never recorded here; this entry documents its coverage, not its
  design.

Next action:
- Commit the branch; the entire rewrite is still uncommitted working tree.
- Push so `tests.yml` runs, and adjust the browser job against a real result.
- Run `npx playwright install chromium` on an unrestricted network and re-run
  `npm run smoke:browser` to exercise the pinned-browser path.

### 2026-08-11 — Agent / first CI run, and what it caught

Gate: `7` packaging
Status: `complete`

Changed:
- The rewrite was split into five branches merged into `dev` in dependency
  order, after merging `main` in first. The conflict there was not the release
  checksums — those matched — but `timeworthy` against `timeworthymedia` in the
  download URLs; `dev`'s org rename is the newer commit and matches the remote.
- `npm test` now stages the desktop slice before running. `host_actions.test.mjs`
  reads `apps/desktop-editor/issue_popover.js`, which is generated and ignored,
  so the suite only passed where an earlier package run had left it behind.
- The injection smoke's Apply branch was dead: it tested a list of objects that
  had become a list of strings, so the condition never fired and the apply path
  went unexercised. It now runs against a freshly checked field, and its
  screenshot is best-effort because a virtual display cannot always capture.

Evidence:
- Run 31533294871 — success on all three jobs. The browser job reports
  `"browser":"pinned Playwright Chromium"`, which closes the previous entry's
  open item: the pinned-browser path is exercised, headed under `xvfb`.
- The revived branch now reports `"text":"the"`, so Apply is proven end to end
  rather than skipped.
- Run 31532455248 — the first attempt, failing on both items above. Recorded
  because it is the evidence that the workflow was worth adding.

Unknowns / risks:
- `applyIssue` returning `{ applied: false }` is discarded by the popover click
  handlers, which close the card either way. A correction refused for being
  derived from a superseded check therefore looks exactly like one that worked —
  the card closes and the text does not change. Refusing the stale correction is
  right; saying nothing about it is the same silent-no-op failure that
  `tools/host_actions.test.mjs` exists to prevent. Corrected below: this is in
  both slices, not only the browser one, and it is now fixed.
- ~~`desktop/main.cjs`, `tools/package_debian.mjs`, and
  `vscode-extension/LICENSE` still say `timeworthymedia`; the org rename looks
  incomplete.~~ Wrong, see the correction below.

Next action:
- Port chunking and retention to `apps/browser-extension`, with a harness
  pointed at it. The caret is the work, not the planner: `content_module.js` has
  no equivalent of the legacy `caretOf`, which handles `selectionEnd` for inputs
  and a Range measurement for contenteditable.
- Decide whether the popover should surface a refused apply.

### 2026-08-11 — Agent / refused corrections, and two corrections of my own

Gate: `3` vertical slice / `8` final review
Status: `complete`

Corrections to the entry above:
- The claim that the org rename is incomplete was wrong. `com.timeworthymedia.*`
  are macOS bundle identifiers, `ian@timeworthymedia.com` is the maintainer
  address, and the LICENSE lines name the company. All are correct, and changing
  the bundle identifiers would break code signing and existing installs. The
  only genuinely stale references were GitHub, ghcr, and Homebrew-tap URLs in
  `docs/design/editor/*.html`, now pointed at `timeworthy` to match the README,
  the container workflow, and the remote.
- The silent refused-apply is in both rewrite slices, not only the browser one.
  `apps/desktop-editor/renderer.js` discarded the same answer.

Changed:
- Both slices now read whether the correction was applied. A refusal re-checks
  and leaves the card on the current finding instead of closing on a correction
  that did not happen, so the next click is the one that works. No new visual
  primitive was introduced for this.
- `tools/host_actions.test.mjs` gains a case tying both handlers to that answer,
  and to the controller that reports it.
- `desktop/rewrite_smoke.mjs` pinned the fresh preload surface to an exact
  `checkText|onEditorText`, so it had been failing since the slice gained the
  dictionary capability its own popover offers. It now asserts nothing outside
  an allowed set reaches the renderer, which is the isolation the check was for.
- Workflow actions moved off the Node 20 runtimes, and the Go job stops asking
  for a `go.sum` cache in a module with no dependencies.

Evidence:
- `node --test tools/host_actions.test.mjs` — 6 pass. Removing either guard
  fails it with `discards whether the correction was applied`; source restored
  and byte-compared.
- `node desktop/rewrite_smoke.mjs` — passes, reporting
  `"applied":{"text":"The results are ready."}`, so Apply still works.
- `npm run smoke:browser` — 3 passed.

Unknowns / risks:
- `.github/workflows/desktop-release.yml` still only runs on a published
  release, so its action bumps and its workspace install step remain unexercised.

Next action:
- Port chunking and retention to `apps/browser-extension`.

### 2026-08-11 — Agent / one chunking policy across the hosts

Gate: `3` vertical slice
Status: `complete`

Correction to the two entries above:
- `apps/browser-extension` was never missing chunking, and the "port chunking to
  the browser slice" next-action was wrong. It chunks and retains through
  `createBrowserSliceController` — `core.chunkAround`, `core.mergeChunkResult`,
  a caret tracked from both the selection and the position of the last edit, and
  `fullCheckPending` driving the whole-document pass. The earlier claim came from
  grepping `background.js` and `content_module.js`, where the behaviour is not
  written, rather than the controller they import.

Finding:
- The two implementations disagreed about the first check of a long document.
  `chunked_checks.ts` sends it whole because there is nothing to merge a slice
  into; `browser_slice.ts` chunked immediately, so `mergeChunkResult` retained
  nothing and everything outside the window came back empty until the full pass.
  Measured on a 6705-character draft: the first request was 4004 characters and
  never reached the opening paragraph.
- This was deliberate on the rewrite side, asserted by a test reading `an
  oversized document starts out chunked`, so it was a product decision rather
  than a defect and was referred rather than changed unilaterally.

Decision:
- Both hosts now check whole until there are findings to carry. Gate 3 allows
  the hosts to differ in anchoring but not in issue meaning, and a document that
  reports a different issue count for a second and a half differs in issue
  meaning. The cost is one slower first check on a long draft.
- `desktop_slice.ts` passes `chunkBudget` through to the same controller, so
  both rewrite hosts take the change together.

Changed:
- The guard in `browser_slice.ts`, and the test that asserted the old policy now
  establishes findings first and asserts a chunk on the following edit.
- Chunk retention in the browser slice gained coverage; it had none.
- The proxy forwards the whole `/v2` subtree, so a LanguageTool plugin's
  `/v2/words` reaches the upstream instead of a 404 invented here. No CORS
  header comes with it, and the reason is recorded in `routes`.
- `ikmal-floating-picker.png` removed from the repository root.

Evidence:
- 34 adapter tests, 141 node tests, `go test ./...`, all eight verifiers, three
  browser smokes, the desktop rewrite smoke, and the Electron smoke — all pass.
- Mutation checks: forcing `mergeChunkResult(null, …)` fails the retention test
  with `the finding outside the rechecked chunk was dropped`; restoring
  `/v2/languages` in place of the `/v2/` subtree fails the parity test. Sources
  restored and byte-compared.

Next action:
- `vscode-extension` still has no end-to-end coverage; it is the last host
  checked only by contract assertions.
- `.github/workflows/desktop-release.yml` remains unexercised until a release.

### 2026-08-11 — Agent / the VS Code adapter gets a harness

Gate: `3` vertical slice / `4` chaos
Status: `complete`

Changed:
- `tools/vscode_extension_smoke.mjs` launches a real VS Code window with the
  adapter loaded, and `tools/vscode_smoke_runner.cjs` runs inside the extension
  host. The runner half is in `tools/` rather than under `vscode-extension/`
  because the packager ships that directory wholesale and a test has no business
  in a `.vsix`.
- The assertions are what a user would see, and all of them go through the real
  extension rather than importing a module of it: a document with a misspelling
  acquires a diagnostic covering the right word, the quick fix offered for that
  diagnostic corrects the text, and checking still runs afterwards.
- `verify_vscode_extension.mjs` now requires both harness files, and a `vscode`
  job runs the smoke under `xvfb`.

Finding:
- The adapter could not run from a checkout at all. `extension.js` imports
  `./writing-core/index.js`, which only the packager created, and only inside a
  staging directory — so **Run Extension** on a fresh clone would fail at
  activation on an `import()` that nothing catches. The harness stages it, the
  README says so, and the staged copy is now ignored like the other hosts'.

Evidence:
- `npm run smoke:vscode` — passed: `2 checks, diagnostic and quick fix
  verified`.
- Mutation checks: returning `[]` from `provideCodeActions` fails it with `no
  ikmal quick fix was offered: ["Fix","Explain","Modify"]`; making `applyIssue`
  a no-op fails it with `Timed out waiting for the correction to reach the
  document`. Source restored and byte-compared after each.
- That first mutation also showed the quick-fix assertion had been matching on
  title text loosely enough that a built-in VS Code action could have satisfied
  it. It now matches on the `ikmal.applyIssue` command.

Unknowns / risks:
- Pause is not invoked at all. It opens a quick pick to choose a duration and
  `executeCommand` awaits the handler, which awaits the pick; with nothing to
  answer it the command never returns. On a desktop the pick dismisses itself
  when focus moves and the call happens to resolve, which is why the first
  version passed locally and then hung the CI job for twenty minutes until it
  was cancelled. The harness now leaves the mode alone, and the launcher fails
  after ten minutes rather than occupying a runner until the six-hour limit.
  Pause suppression stays covered at the unit level by
  `tools/focus_mode.test.mjs`.
- The `vscode` CI job has not completed on a Linux runner yet.

Next action:
- `.github/workflows/desktop-release.yml` is the last unexercised path; a
  `workflow_dispatch` run against an existing tag would settle it.

### 2026-08-11 — Agent / CI workflow validation

Gate: `3` / `4` / `7` / `8`
Status: `complete`

Evidence:
- Dispatched the `Tests` workflow on `dev` at commit
  `9aed6ed` as [run 31550010159](https://github.com/timeworthy/ikmal-editor/actions/runs/31550010159).
- Go job passed.
- Node and verifiers job passed after `npm ci`, build, unit tests, and all
  verifiers.
- Browser job passed with the pinned Playwright Chromium under Xvfb.
- VS Code adapter job passed with the real extension smoke under Xvfb.

Result:
- The new CI workflow is green on Linux, including the previously unverified
  pinned-browser and VS Code paths. No source correction was required.

Remaining:
- `desktop-release.yml` has not been dispatched. It would build the macOS,
  Linux, and Windows bundles and upload or clobber assets on the existing
  `v0.9.0-beta` GitHub release. That is the next step, but it is an external
  release mutation rather than a local validation run.

### 2026-08-11 — Agent / the release pipeline has never been able to run

Gate: `7` packaging
Status: `complete`

Finding — the release automation is inert:
- `main` has never contained a `.github/workflows/` directory. All four
  workflows were added on `dev` (`b41a6a7` for the desktop one) and never
  merged. GitHub registers `workflow_dispatch` and `release` triggers only from
  the default branch, so `gh api .../workflows/desktop-release.yml/dispatches`
  answers `404` and a published release today would run nothing: no desktop
  bundles, no container image, no version sync. The v0.9.0-beta assets were
  produced some other way.
- This is why the workflow could not be exercised as intended. A dispatch
  against `v0.9.0-beta` would also have proved nothing: the workflow checks out
  the tag, and that tag predates the workspace root, so `npm ci` would fail on a
  combination that will never occur.

Finding — a real defect the dry run caught:
- The archive step spelled the bundle name itself, as `Ikmal Editor-<platform>-
  <arch>`. The packager produces `ikmal editor-<platform>-<arch>`, from
  `name: 'ikmal editor'` in `desktop/package_desktop.mjs`. macOS and Windows are
  case-insensitive and would never have noticed; the `ubuntu-22.04` matrix job
  would have failed at `tar` on the first real release.
- Both archive steps now discover the directory by its `-<platform>-<arch>`
  suffix and fail loudly, listing `bin/desktop`, when nothing matches. The name
  belongs to the packager; repeating it here was the bug.

Evidence:
- Clean room, `node_modules` removed: root `npm ci`, `desktop npm ci`,
  `npm run verify` (62 pass), and `IKMAL_DESKTOP_PLATFORM=darwin
  IKMAL_DESKTOP_ARCH=arm64 npm run package` — all pass, so the workspace install
  step added earlier does hold on a fresh checkout.
- The fixed archive step run verbatim: discovered `ikmal editor-darwin-arm64`,
  produced a 128M tarball and its `.sha256`.
- A case-sensitive lookup for the old hardcoded name finds nothing, which is
  what a Linux runner would have done.
- The throwaway tag and draft release created to attempt the dispatch were
  deleted; `gh release list` shows only `v0.9.0-beta`.

Next action:
- Merging `dev` into `main` is what makes any of the release workflows exist.
  Until then the desktop, container, and version-sync automation cannot fire,
  and the fixes above are untested on a runner.

### 2026-08-12 — Agent / the desktop pipeline runs, and what it took

Gate: `7` packaging
Status: `complete`

Changed:
- `desktop-release.yml` gained push triggers: a `staging` branch for iterating
  on the workflow and a `v*-rc*` tag for rehearsing against a frozen tree. Push
  events resolve the workflow from the ref being pushed, so unlike `release` and
  `workflow_dispatch` they work while these files live off the default branch —
  which is the only reason the pipeline could be exercised at all.
- A push run keeps its bundles as workflow artifacts and publishes nothing. The
  upload-to-release step is gated to non-push events.
- `docs/RELEASING.md` documents the process, the branch rule behind it, and each
  trap below. Linked from `CONTRIBUTING.md`.

Four defects, none of which any local run could have found:
- `desktop npm run verify` failed on a clean runner: two tests read compiled
  output that only the packagers stage. Root `npm test` already staged for this
  reason; the desktop entry point, which is the one the release uses, did not.
- `macos-13` is retired. That job sat queued with no runner while the other
  three finished, and on a real release would have done so until the six-hour
  timeout — a matrix naming a dead image fails by hanging, not by erroring.
  `darwin/x64` is now cross-packaged on `macos-14`.
- Every npm call in the repository was broken on Windows. npm there is
  `npm.cmd`, and since the fix for CVE-2024-27980 Node refuses to execFile a
  `.cmd` without a shell, failing with `spawnSync npm.cmd EINVAL`. Eight call
  sites now share `tools/npm_command.mjs`, which quotes its arguments because a
  shell would otherwise split the absolute `--prefix` paths on their spaces.
- `tools/office_certificate.test.mjs` asserted a `0600` key mode on every
  platform. Node's chmod on Windows toggles the read-only attribute and nothing
  else, so the key reads back `0666`. The restriction `certificate.cjs` asks for
  is genuinely not in force on Windows and would have to be an ACL the bridge
  does not set; the assertion is now POSIX-only and the gap is written down
  rather than hidden behind a red test.
- A staging run that hangs used to hold the concurrency group and queue every
  later push behind it. Push events now cancel in progress; releases never do.

Evidence:
- Run 31555811794 — success on all four: darwin/arm64, darwin/x64, linux/x64,
  win32/x64. Artifacts: 122MB, 124MB, 126MB, 149MB.
- Nothing was published: `gh release list` shows only `v0.9.0-beta`, and no `rc`
  tags exist on the remote.

Unknowns / risks:
- The `release: published` path is still untested, because it cannot run until
  these workflows reach `main`. What a rehearsal cannot cover is the upload
  step, which is the only part that differs.
- Windows Office private keys remain unrestricted; an ACL would be the fix.

Next action:
- Merge `dev` into `main`, which is what registers all four workflows. Rehearse
  once more with a `v*-rc*` tag cut from `main` before publishing anything.

### 2026-08-12 — Agent / main, and a rehearsed release

Gate: `7` packaging / `8` final review
Status: `complete`

Changed:
- `dev` fast-forwarded into `main`, 82 commits. Fast-forward rather than a merge
  commit so the branches stay identical; the divergence this session opened with
  was three commits on `main` that `dev` never had.
- All four workflows are registered for the first time. `release` and
  `workflow_dispatch` now exist as triggers, which they never have before.
- The desktop pipeline refuses to build a tag that disagrees with the version.

Finding:
- The first rehearsal packaged `v0.9.1-rc1` and produced a binary reporting
  `0.9.0-beta`. `appVersion` is a constant in `main.go`, `package_desktop.mjs`
  checks it against `desktop/package.json`, and nothing checked either against
  the tag — so a release cut without a bump would have shipped binaries naming
  the previous version. The workflow now compares the tag, with any `-rc`
  suffix stripped, against `appVersion`.

Evidence:
- `tests.yml` on `main` — success on all four jobs.
- Run 31602572941, tag `v0.9.2-rc1`: **failure** at `Check the tag matches the
  version being built`, as intended.
- Run 31602650970, tag `v0.9.0-beta-rc1`: success on all four platforms.
  The darwin/arm64 artifact was downloaded, its checksum verified, extracted to
  736 entries, and the bundled Go server ran and reported `0.9.0-beta` — the
  version the tag promised.
- Every rehearsal tag has been deleted; `gh release list` shows only
  `v0.9.0-beta` and no `rc` tags remain on the remote.

Unknowns / risks:
- The `release: published` path remains the one untested step. A rehearsal
  covers everything except the upload, and the upload is what differs.
- An earlier attempt at the mismatch proof passed spuriously: the tag had been
  cut from a stale local `main` and so carried a workflow without the guard.
  `docs/RELEASING.md` now says to fetch before tagging.

Next action:
- Publishing is a product decision — version, notes, and whether the rewrite
  ships as 0.9.1 or 1.0 — and is left to the maintainer.
