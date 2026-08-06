# ikmal editor progress

Last updated: 2026-08-05

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
- Real Electron desktop bundles embed the matching Go manager and assets;
  launch-at-login is platform-safe for macOS, Windows, and Linux XDG autostart.
- Normal desktop development now builds and opens the real packaged app bundle,
  avoiding the generic Electron launcher crash seen on this macOS installation.
- LanguageTool enhancer startup now detects known integrations without changing
  them; the desktop UI explains each target and offers configure, retry, or
  leave-unchanged choices before writing local-server settings.
- Release automation now builds and uploads macOS, Linux, and Windows desktop
  bundles with per-artifact SHA256 files.
- Data-driven regression fixtures now cover subject/verb, pronoun/antecedent,
  repeats, word-family echoes, clean text, ambiguity, and approved style rules.
- Desktop repeat/echo findings now show all related occurrences, and
  antecedent links are exposed in the tester and proxy response metadata.
- First desktop UI pass with separate LanguageTool/quality health indicators,
  full replacement suggestions, one-click apply actions, clear/reset control,
  and Cmd/Ctrl+Enter checking.
- ikmal editor Continental-style desktop restyle, using the app reference and
  ikmal slate/violet/serif/mono design tokens.
- Expanded Electron scratch-pad editor with a sidebar, writing canvas,
  suggestion rail, apply/ignore/rule actions, copy-back control, optional
  style-guide selection, and the same local checking IPC as the compact shell.
- Packaged desktop launch now shows the compact window on first launch instead
  of appearing to hang as a tray-only background process.
- Compact and expanded editors now debounce live checks after text changes;
  their explicit Check buttons force an immediate recheck and stale responses
  cannot overwrite newer text.
- Desktop UI contract tests cover both editor entry points, IPC wiring, and
  the live-check path. Integration tests cover temporary Firefox, Chrome, and
  VS Code discovery plus target-filtered setup without touching the real home.
- Optional container quality/proxy smoke harness covers startup, healthchecks,
  a real proxy check, and cleanup; runtime selection prefers Apple's OCI-
  compatible CLI when ready and falls back to Docker Compose.
- Desktop app icons and compact marks now use the exported ikmal ink-field
  family from the “two marks, one system” direction instead of the old door.
- macOS menubar tray now uses a transparent PNG template fallback, restores an
  unfocused compact window on click, and keeps title-bar treatment separate
  between the quickbar and full editor.
- Full editor now has a clean native title bar, a logo dropdown for secondary
  app actions, an in-app Settings view, and a persistent word-count footer.
- Compact tester now checks its initial passage automatically, rechecks after
  typing settles, draws inline finding squiggles with hover/click popovers, and
  keeps all detailed suggestions and antecedent links behind an expandable
  right drawer that is closed by default.
- Compact and full editors now share one annotated-text surface for offsets,
  squiggles, popovers, Apply, Ignore, and related occurrences.
- Full-editor Settings now provides style-guide import, selection, enablement,
  and service controls; the persistent rail is reserved for recent sessions.
- Service controls distinguish ready existing services from services managed by
  ikmal, so Start is not offered when all detected endpoints are already up.
- Compact and full editors now use the same drawer control: the compact drawer
  sits beside the writing surface, and the full-editor rail is hidden until
  opened. The packaged macOS app includes the ikmal Dock icon, defaults to a
  hidden Dock entry, uses the menubar for compact access, and exposes both
  presence settings with a guard against disabling every entry point.
- Compact sizing now starts at a short 440px window and grows with wrapped
  writing and opened suggestion content. Full-editor passages remain top-aligned
  so the bottom area is reserved for notices and the footer; repeated
  privacy/service copy has also been tightened across the desktop surfaces.
- The writing-status control is now the sole suggestions-panel entry point in
  both editors: it sits at the same bottom-right inset as the text surface,
  reveals the panel action on hover, and keeps drawer visibility behind the
  shared status interaction. Redundant compact window resizes are suppressed,
  and custom dark scrollbars prevent native white hover regressions.
- Compact and full editors now use a right-aligned writing-status control with
  an animated checking pulse, green check for no issues, amber/clay issue dots,
  and a hover-revealed suggestions open/close action. Routine checks stay out
  of the larger notice area to prevent layout jumps; live word and character
  counts sit together in the editor footer. Panel, menu, popover, result-card,
  button, and suggestion-rail transitions also have restrained micro-motion
  with a reduced-motion fallback.
- Writing-status tooltips now summarize the number of LanguageTool, grammar,
  and style findings, while clean text reads “No issues detected.”
- Writing-status controls are now dot-only at rest; status text and the
  suggestions action appear in the hover/focus tooltip, and status animation
  restarts no longer force a synchronous layout read. The duplicate native
  title tooltip was removed so the custom tooltip is the single status surface.
- Code-quality pass added guards for redundant compact-window geometry calls,
  editor text delivery during page load, renderer IPC rejection paths, stale
  check generations, and POST-body preservation in the generic proxy forwarder;
  regression coverage now exercises the forwarding behavior. An opt-in
  `npm run smoke` harness from `desktop/` now also exercises delayed
  out-of-order responses, status transitions, and compact drawer geometry
  against a temporary local fake service.
- Checking sensitivity now round-trips through persisted desktop preferences;
  Electron smoke coverage verifies the IPC value and compact Settings control,
  and macOS spell-service bundle inspection uses the synchronous child-process
  helper it requires.
- Rebuilt the packaged macOS app after the desktop fixes and verified the
  manager, tray asset, browser extension, and native spell-service bundle are
  embedded. Added a host-neutral browser check contract and adapter-architecture
  guidance so Chromium-family/Firefox stay one WebExtension while VS Code and
  native macOS clients remain thin host-specific adapters.
- Electron smoke coverage now opens the full editor through the real IPC path,
  verifies compact-to-editor text delivery, exercises both full-editor app
  presence controls, and restores the safe menubar-on/Dock-off default.
- Added the first optional VS Code adapter: loopback-only diagnostics, native
  quick fixes, debounced checks, stale document-version protection, and a
  shared browser/VS Code contract test.
- Researched the open-source LanguageTool LibreOffice/OpenOffice adapter and
  documented a clean-room UNO strategy, LGPL boundary, native remote-checker
  validation step, and the separate HTTPS/native constraints for Word/Outlook.
- Researched Microsoft Office Add-ins and documented a loopback HTTPS bridge,
  explicit certificate/trust flow, Word selection-first task pane milestone,
  and a separate Outlook HTML-body adapter strategy.
- Expanded the Office plan to include Word, Outlook, Excel, PowerPoint,
  OneNote, and Project as distinct Office.js host adapters sharing one local
  HTTPS/checking foundation; inline findings are a core requirement, while
  Power BI is explicitly separated as a future companion/custom-visual
  integration because it is not a document-text host.
- Added the first local Microsoft Office bridge scaffold: loopback-only HTTPS
  handler, exact-origin and bounded JSON checks to the existing proxy, Word
  task-pane manifest/assets, selection review, selectable wavy/dotted/highlight
  annotations, explicit replacement actions, and packaged-resource coverage.
- Added explicit desktop Office bridge controls: per-user localhost
  certificate generation/removal, loopback HTTPS start/stop, Word manifest
  reveal, trust-state messaging, and certificate lifecycle tests. Trust is
  never installed silently; the user must approve it through the operating
  system before Office can load the local task pane.
- Added the first Excel adapter scaffold: selected-range projection with
  UTF-16-safe cell spans and A1 addresses, formula-preserving apply guards,
  cell-level finding styles, an Excel manifest/task pane, and projection tests.
  A real temporary certificate/HTTPS handshake also passes without modifying
  the macOS trust store; Word/Excel still require actual Office-client
  validation for final API/version coverage.
- Added the first PowerPoint adapter scaffold: slide/shape/text-frame
  projection, UTF-16-safe shape spans, inline wavy/dotted underline support,
  explicit text replacement, a PowerPoint manifest/task pane, and slide-aware
  projection tests. Word, Excel, and PowerPoint resources are packaged through
  the same local bridge while keeping their host mappings separate.
- Added the first Outlook adapter scaffold: entity-aware HTML/text projection,
  ikmal-owned inline spans, markup-preserving replacement, stale-body checks,
  compose task-pane manifest/assets, and safe task-pane fallback for findings
  that cross HTML nodes. All four Office adapters are now packaged behind the
  same loopback HTTPS bridge; actual host-client validation remains next.
- Added the first OneNote adapter scaffold: active-page HTML analysis,
  selection-first inline marking/replacement, shared HTML projection reuse,
  pane-only whole-page fallback, OneNote manifest/task-pane assets, and a
  requirement-set/client availability guard. OneNote page content is only
  accessed for the active page as required by its API model.
- Added a conservative Microsoft Project adapter scaffold: selected-task
  Name/Notes projection, field-safe match mapping, stale-task protection before
  writes, Project manifest/task-pane assets, desktop manifest controls, and
  projection tests. Project remains pane-only because its Common API task
  methods are documented as Windows-desktop-only and expose task fields rather
  than an inline document surface.
- Compact and full editor failures now use a shared action-oriented notice
  surface with Retry, Continue, and expandable Details where applicable;
  Electron smoke coverage exercises a failed check and dismissal without
  losing the passage.
- Writing-check failures now use context-specific actions: Retry or Keep
  editing, with the latter dismissing the failed check and returning the
  editor to a ready state.
- Electron smoke coverage now drives both App access controls through the
  actual compact renderer, verifies the menubar/Dock guard, and restores the
  default presence state after toggling each option.
- Checking behavior is now user-controlled in both editors: automatic or
  manual mode, adjustable typing pause, issue-category visibility, and a
  confidence-based sensitivity slider for quality-sidecar findings; settings
  persist locally and sync across the compact and full editors.
- Added the first native macOS spell-server prototype in
  `macos-spellserver/`: bounded local proxy requests, UTF-16-safe offset
  mapping, standard AppKit grammar results, short failure timeouts, and unit
  tests for clipping and range translation. It remains opt-in and unregistered
  until it is validated in real AppKit clients.
- Added a reproducible `.service` bundle manifest, Apple spell-server
  descriptor, package script, and bundle validation script. Installation stays
  separate until the client matrix is verified.
- Built the production spell-server executable with the matching Xcode
  toolchain and validated the generated `ikmal editor spell server.service`
  bundle. XCTest remains unavailable in this command-line environment, so the
  helper’s source syntax, production build, and bundle manifest are verified
  separately.
- Embedded the spell-service bundle in the macOS Electron app and added an
  explicit Settings install/remove flow. Installation refuses to overwrite a
  different service at the target path and removal only deletes a bundle
  identified as ikmal’s own.
- Corrected the native helper’s Apple registration to use the recognized
  human-readable language name (`English`) and matching `ikmal editor` vendor;
  Settings now celebrates installation, reports whether the local checker is
  actually connected, and offers to start ikmal services when it is offline.
- Compact Settings now has a clearer hierarchy: service health, Style guide,
  and App access stay visible while optional enhancer, quality-model, and
  advanced controls collapse until needed; detected enhancer candidates open
  their review section automatically.
- Compact Quick check is now text-first: the redundant writing heading and
  sample action are gone, Open editor sits beside Clear at the bottom, and
  automatic checking remains the default with Cmd/Ctrl+Enter retained as a
  force-check shortcut. Settings now presents one service overview and
  consistently sized expandable rows.
- Inline findings now expose relationships on hover: repeated occurrences
  highlight together, pronouns and antecedents highlight as a pair, and the
  tooltip explains the connection. Indicator style (squiggles, lines, or
  dashes), palette, and color intensity are persistent settings shared by the
  compact and full editors.
- Inline annotations are now bound to the exact text that produced them:
  editing immediately clears stale squiggles, popovers, antecedent links, and
  result cards before the debounced check returns; a regression smoke case
  covers a prefix shift while a prior response is in flight.
- Integrated startup now independently checks the quality engine when an
  existing proxy is reused, starts only the missing managed sidecar, and
  automatically recovers managed proxy/quality processes after health loss;
  user-owned LanguageTool and proxy processes are never killed or replaced.
- Integration discovery now distinguishes connected, wrong-endpoint, installed
  without a managed endpoint, and not-detected states; endpoint comparison
  normalizes scheme, host, port, trailing slash, and `/check` suffix instead
  of relying on substring matching.
- ikmal editor rebrand across source, binaries, assets, packaging, and docs.
- Rewritten Git history and branch split: initial release on `main`, ongoing
  work on `dev`.
- Repository sweep confirmed no legacy guide-name references remain in the
  working tree, reachable history, reflog, or tracked filenames.
- Rebuilt and published the `v0.9.0-beta` cross-platform archives under the
  `ikmal-editor-*` names, with verified SHA256 checksums.
- Updated Homebrew and Scoop metadata on both branches and renamed the
  separate Homebrew tap formula to `ikmal-editor`.

## In progress

- Continue desktop UI polish: make service state understandable at a glance,
  verify the packaged tray/Dock presence behavior on macOS, and make
  suggestions easier to review and apply.

## Next

- Finish context-specific Cancel behavior for the shared action-notice surface
  where abandoning an operation needs a distinct action; service and writing
  failures now offer clear Retry, Continue, and expandable Details choices.
- Extend the Electron interaction harness to cover Dock activation and toggling
  both app-presence settings after the packaged UI pass is stable.
- Build/package the native spell-server helper with a matching Xcode toolchain,
- then validate behavior in TextEdit, Mail, Messages, and other NSTextView
  clients before considering an optional Accessibility bridge for richer
  non-native annotations.
- Documented the macOS integration boundary and guardrails in
  `docs/macos-integration.md`: native spell service first, Accessibility as an
  explicit opt-in companion, bounded local checks, stale-result protection,
  and no secure-field or unrestricted keystroke capture.
- Refine human-centered feedback controls: tune warning-color strength
  independently from detection and make sensitivity explanations clearer for
  findings that do not expose confidence metadata.
