# ikmal writing platform rewrite plan

Status: planning

This document defines the replacement architecture for the ikmal writing
surface across the desktop app, browser extension, Office integrations, and
future hosts. The current implementation is the reference application and
behavioral oracle during migration. It is not discarded until the replacement
passes the same behavioral and visual checks.

The goal is one writing product with several host adapters, not several
similar writing products.

## 1. Product outcome

Every host should expose the same conceptual system:

- a checking service and language state
- an unobtrusive indicator
- an issue popover for the text under review
- a consistent issue model and action vocabulary
- word, character, and issue counts
- Automatic, Pause, and Zen modes
- selection checking for phrases and passages
- local dictionary handling
- an expanded issue review surface
- the ikmal design system and theme options

The host may change the placement and available space, but it must not change
what an issue means or what the core actions do.

## 2. Guiding constraints

### 2.1 One source of behavior

Checking state, language selection, issue identity, filtering, mode behavior,
dictionary behavior, replacement validation, and text statistics belong in the
shared core. They must not be reimplemented separately in Electron and browser
content scripts.

### 2.2 Thin host adapters

Hosts provide capabilities that the core cannot know about:

- reading and replacing text
- locating the active editable field
- storing preferences
- sending a request to the local service
- opening a native window or browser tab
- positioning a floating surface

### 2.3 UI components are portable

Shared writing UI uses native DOM/Web Components, TypeScript, and CSS. It does
not depend on React, Electron, Chrome APIs, or a particular application shell.

The browser extension should render floating UI inside a Shadow DOM so host
page styles cannot change its layout or typography.

### 2.4 The existing app remains a reference

Until each replacement slice passes its checks, the current desktop and
extension implementations remain available for comparison. No large deletion
or irreversible migration is required.

## 3. Proposed package boundaries

The final source layout should be organized around dependency direction:

```text
packages/
  design-system/
    tokens/
    themes/
    components/
    styles/
  writing-core/
    model/
    checking/
    modes/
    language/
    statistics/
    dictionary/
    selection/
  writing-ui/
    indicator/
    issue-popover/
    issue-review/
    selection-popover/
    mode-picker/
    status/
  writing-adapters/
    contracts/
    test-fixtures/

apps/
  desktop-compact/
  desktop-editor/
  browser-extension/
  office/
  vscode/
```

The first implementation can live inside this repository while the package
boundaries settle. It does not need to become a published npm package before
the behavior is stable.

## 4. Design-system integration

`/Users/iansherr/Projects/ikmal` is the canonical design reference and should
become the source for the writing product's visual vocabulary.

### Reuse directly

- color ramps and semantic aliases from `app/colors_and_type.css`
- dark and light theme variables
- typography families and type scale
- spacing scale and 4px base grid
- radii, button heights, borders, shadows, and motion tokens
- theme and dialect attributes where they make sense
- the calm, sentence-case content style
- existing menu, modal, card, status, and focus patterns

### Extract and stabilize

The writing UI should not import the entire ikmal application stylesheet. We
will extract a small writing-compatible design package containing:

- canonical token CSS
- a token JSON representation for tests and tooling
- theme variants
- portable primitives such as button, popover, card, status dot, and menu
- a documented list of host overrides

The generated extension bundle must contain its own copy of the compiled
assets. It must never depend on an absolute path such as
`/Users/iansherr/Projects/ikmal` at runtime.

### Theme contract

Every writing surface reads the same semantic variables. At minimum:

```text
--bg-0, --bg-1, --bg-2, --bg-pop
--fg-1, --fg-2, --fg-3, --fg-4
--border-1, --border-2
--accent, --accent-hover, --accent-press, --accent-soft
--radius-1, --radius-2, --radius-3, --radius-pill
--space-1 through --space-8
--font-sans, --font-serif, --font-mono
--shadow-pop, --shadow-focus
--ease-default, --ease-spring
--dur-fast, --dur-default, --dur-modal-in
```

A component may add a local semantic token, but it should not hard-code a
second violet, slate, cream, spacing, or motion system.

### 4.1 Design reference hierarchy

The repository now contains additional design material under `docs/design`.
That material is valuable as a template and review reference, but it does not
create a second design system.

Use this authority order:

1. the Continental/ikmal design-system package in `~/Projects/ikmal`
2. the existing ikmal application tokens and components
3. the writing-specific templates and recommendations in `docs/design`
4. a new writing-specific primitive only when no ikmal component fits

`docs/design/editor/Ikmal Editor App.html` and `app-mock.js` are especially
useful because they demonstrate the current desktop markup and ids with the
Continental treatment applied. They should be used as visual fixtures and
migration references, not copied into production as an independent runtime.

The design directory contains both drop-in restyles and broader explorations.
The drop-in principle is important: preserve existing behavior and markup where
that lets us adopt the ikmal components safely. The rewrite may change markup
when the shared component contract requires it, but it should not introduce a
new visual vocabulary merely because a template uses different class names.

### 4.2 Continental component mapping

Prefer these existing ikmal components for the writing product:

| Writing need | Continental component or primitive |
| --- | --- |
| primary/secondary actions | `cnt-btn`, `cnt-btn-group` |
| text inputs and settings fields | `cnt-field`, `cnt-label`, `cnt-input`, `cnt-textarea`, `cnt-select`, `cnt-help` |
| toggles and categories | `cnt-switch`, `cnt-check`, `cnt-segmented`, `cnt-slider` |
| issue cards and setting cards | `cnt-card`, `cnt-panel`, `cnt-sheet` |
| source/status labels | `cnt-tag`, `cnt-badge`, status dot intents |
| indicator menus and mode pickers | `cnt-dropdown`, `cnt-pop`, `cnt-popover` |
| desktop tabs and settings navigation | `cnt-tabs`, `cnt-accordion`, `cnt-tree` where appropriate |
| full review on a narrow host | `cnt-drawer`, `cnt-sheet` |
| notices and Apply/Undo feedback | `cnt-alert`, `cnt-banner`, `cnt-toast` |
| counts and document metrics | `cnt-stat`, `cnt-badge` |
| progress and model/service setup | `cnt-progress`, `cnt-steps`, `cnt-empty` |

Writing-specific components should be composed from these primitives:

- `writing-indicator` uses a status dot/badge and a `cnt-popover`
- `writing-issue-popover` uses `cnt-sheet`/`cnt-card`, `cnt-btn`, and the
  existing diff/replacement treatment
- `writing-selection-popover` uses `cnt-popover` and `cnt-stat`
- `writing-review-workspace` uses `cnt-panel`, `cnt-list`, `cnt-drawer`, and
  the shared issue card
- `writing-mode-picker` uses `cnt-segmented` or the existing dropdown/pop
  behavior rather than a new select style

The text-marking layer, active-field indicator anchor, relationship highlights,
and selection anchor are legitimate writing-specific primitives because the
Continental component library does not know about editor ranges. Their colors,
focus rings, elevation, motion, and typography must still come from
Continental tokens.

### 4.3 Axes, density, and host adaptation

Continental provides three main visual axes and a density/contrast vocabulary:

```text
data-theme:   dark | light
data-dialect: shelf | rift | hillshade | contour | tide | basin | island | cave
data-palette: slate | bathymetric | sediment | ultraviolet | aurora | parchment
data-density: compact | comfortable | spacious
```

The writing product should support the same axes where the host can render
them safely. The default writing configuration is:

- desktop full: theme, dialect, palette, density, and contrast options
- desktop compact: theme, palette, and compact/comfortable density; dialect
  can be exposed in Appearance once the shell is stable
- browser extension: theme, palette, and compact density inside its isolated
  Shadow DOM; dialect must not create visually heavy terrain on the host page
- Office and VS Code: theme and compact density first, with host-aware palette
  fallback

All hosts still consume the same semantic token names, even if they expose
fewer controls. A host may choose a safe default; it may not create a second
set of colors or spacing values.

The Continental package is framework-agnostic pure CSS with optional,
dependency-free behavior. Use its existing `cnt-*` markup and
`data-cnt-*` behavior hooks before writing custom JavaScript. Any component
that cannot use the runtime behavior because it lives in an extension
Shadow DOM should retain the same DOM semantics and accessibility contract.

### 4.4 Design-system acceptance checks

Every writing component must be checked against:

- the existing ikmal dark and light themes
- the selected palette and at least one alternate palette
- compact and comfortable density
- the selected dialect’s elevation language
- keyboard focus and reduced motion
- page-CSS isolation in the browser extension
- no hard-coded colors, shadows, radii, or spacing outside documented local
  semantic aliases

The component gallery should include the exact writing surfaces: indicator,
indicator popover, issue popover, selection popover, mode picker, review row,
settings group, service health card, style-guide card, and undo notice.

### 4.5 Logo and brand asset contract

The locked ikmal editor mark is part of the shared product contract, not a
host-specific decoration. The canonical sources are:

- `~/Projects/ikmal-editor/docs/design/logo/markgen.js` for the underlying ikmal mark
- `~/Projects/ikmal-editor/docs/design/logo/edmark.js` for the editor-specific lockup
  and generated assets
- the approved SVG exports in `docs/design/editor/repo-assets/` as packaging
  references

Do not redraw the mark in CSS, substitute a generic icon, or depend on live
font-rendered logo text. The generated SVG is the source of truth; raster
variants are build outputs for surfaces that require them.

Use the locked tiers consistently:

- full mark at 48px and above: ring, `ikmal` wordmark, and editor squiggle
- minimum mark below 48px: the compact one-line mark with its prescribed
  squiggle treatment
- menu-bar template: one solid black mark, because macOS masks and tints
  template icons itself

Surface rules:

- full desktop and settings headers use the approved full SVG
- desktop tray/menu-bar surfaces use the template SVG
- extension popup and options use the full or minimum SVG according to the
  rendered size, with approved light/dark contrast variants
- the in-text indicator remains a writing-status control; it should not stamp
  a large logo into every editable field
- all branded images have accessible labels where they convey meaning and
  remain decorative where adjacent text already names the product

The packaging step must copy generated, approved assets into the repository’s
`assets/` and `extension/icons/` outputs. Packaged code may not reference a
developer’s `~/Projects/ikmal` path at runtime. Reconcile the current
`ikmal_languagetool_*` filenames with the approved editor asset names rather
than creating a second naming system.

Logo acceptance checks cover transparent backgrounds, light/dark contrast,
the 48px tier boundary, menu-bar masking, extension isolation, and screenshot
parity between desktop headers, extension popup, settings, and tray surfaces.

## 5. Information architecture and surface organization

The writing product has several surfaces that may look related but have
different jobs. Naming them explicitly prevents the indicator, issue card,
selection summary, and settings controls from becoming one overloaded popup.

### 5.1 Surface taxonomy

```text
Writing field
├── Indicator
│   └── Indicator popover
│       ├── current status and counts
│       ├── modes
│       ├── inline issue review
│       └── links to full review and settings
├── Marked issue
│   └── Issue popover
│       ├── issue explanation
│       ├── replacement preview
│       └── issue actions
└── Text selection
    └── Selection popover
        ├── word count
        ├── character count
        ├── issue count
        └── compact issue review

Application settings
└── Settings page or settings panel
    ├── Checking
    ├── Appearance
    ├── Dictionary and rules
    ├── Integrations
    ├── Services and diagnostics
    ├── Privacy and data
    └── About and support
```

The full issue review workspace is a fourth review surface, not a replacement
for the indicator popover. It is appropriate for long documents and detailed
review; the indicator popover is for quick inspection without leaving the
current editor.

### 5.2 Shared versus host-specific layout

The following are shared across hosts:

- surface names and roles
- content hierarchy
- action labels
- button priority
- spacing and typography tokens
- open, close, focus, and keyboard behavior
- empty, loading, paused, clean, and unavailable states

The following may vary by host:

- anchor position
- maximum width and available height
- whether the full review opens in a panel, window, tab, or task pane
- how text replacement is performed
- whether a host can show native system settings

The browser extension must not reproduce the desktop layout pixel-for-pixel
when the browser has less space. It must reproduce the same hierarchy and
interaction model at a compact size.

## 6. Popover specifications

All floating surfaces use the design-system popover primitive. They share the
same border, radius, shadow, motion, focus ring, outside-click behavior, and
Escape behavior. A child popover may temporarily appear above its parent, but
there must never be two unrelated floating surfaces competing for focus.

### 6.1 Indicator

The indicator is always attached to the active writing surface, never to an
arbitrary page coordinate.

Contents:

- status dot or neutral indicator mark
- issue count when findings exist
- short status label in its tooltip or accessible name
- checking animation only while a request is active

States:

- checking: animated, no misleading issue count
- clean: quiet positive/neutral state
- issues: count is visible and clickable
- paused: paused icon/state, no new requests
- Zen: neutral indicator with count, no inline text markings
- unavailable: actionable service failure state

The indicator must not contain settings controls itself. Its click opens the
indicator popover.

### 6.2 Indicator popover

Purpose: answer “what is happening right now?” and provide immediate control.

Recommended order:

1. current state: Automatic, Paused, Zen, or unavailable
2. count summary: issues, words, and characters when relevant
3. Modes row: Automatic, Pause, Zen
4. inline `Review issues` section when findings exist
5. `Open full review` action
6. `Settings` action
7. privacy note where space permits

The mode controls open their own anchored mini-popover. The parent indicator
popover stays in place; opening a mode picker must not push the surrounding
content down or resize the writing field.

The inline review section is collapsed by default when there are no findings.
When expanded, it shows compact issue rows with the same actions as the issue
popover. It must not create a separate, second issue model.

### 6.3 Issue popover

Purpose: explain and correct the issue nearest the user’s attention.

Recommended order:

1. source label and issue category
2. previous/next controls and `n of total` when needed
3. issue message
4. matched text and replacement preview
5. primary action: `Apply` or `Review`
6. secondary actions: `Ignore`, `Add to dictionary` when applicable
7. `Why?` disclosure
8. close control

The source label describes the actual source. It must never display
“LanguageTool” as a generic brand header for an ikmal quality or style finding.

Replacement suggestions are presented as a visual change, not as an unexplained
list of pills. If there are multiple valid replacements, the first is the
primary action and the alternatives appear below it or in a compact chooser.

`Add to dictionary` appears only for a spelling-like finding and must explain
that the word is stored locally. `Ignore` suppresses the current finding for
the current review. A future policy may add rule-level ignore, but it must not
be conflated with the current action.

### 6.4 Selection popover

Purpose: provide immediate information about highlighted text, whether the
selection is a phrase or a full passage.

Recommended order:

1. selected text preview, truncated safely
2. word count and character count
3. issue count or checking state
4. detected/effective language, when available
5. `Review issues` when findings exist

The selection popover is informational first. It should not automatically show
the full issue card unless the user asks to review an issue. This keeps a short
highlight from producing a large disruptive panel.

### 6.5 Full review workspace

Purpose: review the complete result set for a long document or selection.

Recommended layout:

- header: document/selection label, issue count, close/back action
- summary: words, characters, language, current mode
- filter row: all, spelling, grammar, style, quality
- issue list: ordered by document position
- detail pane or popover: selected issue and its actions

The workspace may be a new tab in the browser or a dedicated desktop view,
but the data and actions must come from the same core review state.

### 6.6 Popup stacking and dismissal

Rules for every host:

1. At most one primary surface is open at a time: indicator, issue, or
   selection popover.
2. A nested mode picker may be open inside the indicator popover.
3. Opening an issue popover closes the indicator popover unless the issue is
   being reviewed inside the inline review section.
4. Clicking another mode picker closes the previous mode picker.
5. Clicking outside closes the active floating surface.
6. Escape closes the innermost surface first, then its parent on a second
   Escape.
7. Focus returns to the triggering control when a surface closes.
8. Opening a surface never changes the writing field’s height or causes text
   to jump.
9. The surface repositions on scroll and resize, or closes if its anchor no
   longer exists.
10. A stale issue action closes or refreshes the surface with a clear message;
    it never applies a replacement to a different revision.

## 7. Settings information architecture

Settings use one canonical order. Hosts may collapse sections or omit controls
they cannot support, but they should not reorder the conceptual system.

### 7.1 Canonical settings order

#### 1. Checking

This is the first section because it changes what the product does while the
user writes.

- enabled/disabled
- default language
- automatic language detection
- checking timing: Automatic or Manual
- typing delay
- suggestion sensitivity
- issue categories: spelling, grammar, repetition, style, quality, and
  LanguageTool-compatible findings

Pause and Zen are quick controls in the indicator popover, not permanent
settings. Their expiry and current state may be displayed here, but users
should not need to navigate into Settings to pause writing feedback.

#### 2. Appearance

- theme: system, dark, or light where supported
- dialect or visual variant where supported
- indicator style
- annotation palette
- annotation intensity
- reduced motion preference, following the host when possible

Appearance controls must update the indicator, markings, cards, popovers, and
review workspace together.

#### 3. Dictionary and rules

- local dictionary words
- add/remove dictionary entries
- ignored findings or rules, once rule-level ignore exists
- explanation of what is stored locally
- reset controls with confirmation

The dictionary list is a core data source, not a browser-extension-only
feature.

#### 4. Integrations

- browser extension
- Microsoft Office
- VS Code
- LanguageTool-compatible integrations
- host-specific installation and connection status

Each integration card should clearly distinguish ikmal’s own adapter from a
third-party LanguageTool extension configured to use the local service.

#### 5. Services and diagnostics

- local service status
- LanguageTool status
- quality sidecar status
- start/stop or restart controls where supported
- endpoint information
- copyable diagnostic details
- recent check or connection errors

Technical details belong here rather than in the primary writing popovers.

#### 6. Privacy and data

- local-only processing explanation
- account/cloud/tracking statement
- recent-check history controls
- clear history
- export or diagnostic-log controls if added later

The privacy promise should also appear in compact form near first-run or
connection controls, but its full explanation belongs here.

#### 7. About and support

- version
- licenses and notices
- documentation
- support link
- feedback/reporting path

Support must never be mixed into a correction action or presented as a
requirement for using the writing features.

### 7.2 Settings host mapping

Desktop full editor exposes the complete ordered settings page. The compact
desktop app exposes the same sections as collapsible groups or opens the full
settings view. The browser options page follows the same order and labels but
starts with browser-specific connection and site controls. Office and VS Code
show only the applicable integration and checking controls, with a clear link
to the full desktop settings when available.

### 7.3 Settings formatting rules

- Each section has a sentence-case heading and one-line explanation.
- High-frequency controls appear first within a section.
- Destructive or reset actions appear last and use the danger treatment.
- Technical identifiers use the mono token and are visually secondary.
- A setting’s current value is visible without opening another dialog.
- Changes either apply immediately with a status confirmation or use an
  explicit Save action consistently within that surface.
- Settings never use a floating issue popover for explanatory content.

## 8. Competitive audit and ikmal-specific additions

The plan should learn from established writing assistants without becoming a
copy of either one. LanguageTool’s browser experience demonstrates the value
of per-site enable/disable controls, personal dictionaries, language options,
rule controls, synonyms, dark mode, and a dedicated issue overview. Grammarly’s
extension demonstrates the usefulness of an animated indicator, an issue count,
one-at-a-time correction cards, a larger review sidebar, per-site controls,
personal dictionary actions, definitions/synonyms, and document goals.

These are interaction patterns to evaluate, not reasons to reproduce their
account, premium, cloud, or AI product model.

### 8.1 Adopt as core behavior

#### Per-site and per-host controls — P0

The browser options page already has the beginning of this feature. Make it a
formal host capability:

- checking enabled globally
- checking enabled or disabled for the current site
- a visible reason when a site is disabled
- a quick “disable on this site” action near the indicator
- temporary pause separate from permanent site disable
- a way to restore site defaults

The distinction must be clear:

```text
Pause       temporary, applies to the current mode/session, expires
Site off    persistent, applies to this host/site until restored
Global off  persistent, applies everywhere
```

#### Preferred language variants — P0

Automatic detection is not enough. The language model must distinguish:

- requested language
- detected language
- effective language variant
- confidence or uncertainty
- manual override scope: current selection, site, host, or global

Support preferred variants such as US/UK/Canadian/Australian English and
regional German and Portuguese where the checker supports them. Short text
must show a conservative “Language uncertain” state with an easy override,
not silently switch to German or another language.

Mixed-language text should report that only the dominant language was checked
and offer selection-based checking for the other language. This is preferable
to pretending one result covers every language in the passage.

#### Personal dictionary and rule controls — P0/P1

Keep `Add to dictionary` local, explicit, and reversible. Add:

- dictionary search
- remove word
- import/export as plain text or CSV
- optional language/variant association
- duplicate and case-normalization rules

Rule controls should be separate from Ignore:

- Ignore this finding: current review only
- Ignore this rule: future findings from one rule
- Add to dictionary: spelling vocabulary only

Every rule-level disable needs a visible management path in Settings and a
restore action. Do not hide permanent suppression behind the issue card.

#### Inline and expanded review — P0

Keep both review styles:

- one-at-a-time issue popovers for focused correction
- an inline issue list in the indicator popover
- a full review workspace for long text

The list should support filtering by category and source, and the selected
issue should remain synchronized with the marked text. Applying or ignoring an
issue in one surface updates the other immediately.

#### Reversible corrections — P0

Every Apply action should create a local correction record containing:

- document revision before the change
- range and original text
- replacement text
- issue id and source
- timestamp

The first version can expose a small `Undo` notice after Apply. The full editor
can later expose a correction history. Never offer “Apply all” until each
replacement has a safety classification and the operation can be undone.

#### Word lookup and synonym popover — P1

The issue popover and word popover are different surfaces. A word popover is
opened by an explicit double-click or keyboard command and may show:

- the selected word
- definition, when a local or configured dictionary provides one
- synonyms, when available
- Add to dictionary
- language and spelling status

This feature must be opt-in and clearly distinguish local dictionary data from
any external lookup. It must not cause every double-click on every page to
trigger a network request.

### 8.2 Existing ikmal foundation to promote into the core

The rewrite must preserve and strengthen capabilities that already exist in
ikmal editor. They are not speculative features.

#### Focus modes — existing P0 foundation

Automatic, Pause, and Zen are already part of the product and must be carried
into the shared core without changing their meaning:

- Automatic uses the user’s normal checking preferences.
- Pause makes no new checking request and does not add new markings for its
  selected duration.
- Zen continues checking, retains the issue count, and suppresses text
  markings so the user can keep writing without visual noise.
- All modes support 15 minutes, 1 hour, 4 hours, and until turned off.
- Changing modes closes competing mode pickers and updates every host.

The mode state is part of `CheckResult`, indicator state, settings state, and
review state. It must not be implemented as a visual-only toggle.

#### Style-guide importing and selection — existing P0/P1 foundation

Style guides already have an import, selection, and enable/disable workflow.
The new system should make that workflow a first-class source of findings:

- imported guide metadata is stored locally
- one guide can be selected for checking
- the selected guide can be enabled or disabled without deleting it
- each finding identifies the active guide as its source
- guide rules can explain the matched term and recommended treatment
- the full settings page manages import, selection, enablement, and removal
- browser, desktop, Office, and VS Code adapters report whether guide support
  is available

Style-guide findings should participate in the same review queue but remain
visually distinguishable from correctness errors.

#### Local quality sidecar — existing P0/P1 foundation

The local quality layer already complements LanguageTool with deterministic and
optional model-backed analysis. The shared core should preserve its source and
capability boundaries:

- LanguageTool remains the base spelling, grammar, punctuation, and POS source.
- The deterministic quality sidecar handles local agreement, homophones,
  sentence structure, missing-word/article signals, repetition, passive voice,
  antecedent relationships, and style-guide findings.
- The optional local transformer can provide contextual grammatical correction
  and quality suggestions.
- The quality proxy merges sources into the shared result contract and keeps
  UTF-16 offsets stable.
- If the transformer is unavailable, deterministic local quality checks still
  work and the UI reports the reduced capability honestly.

The core must never flatten these sources into an anonymous “AI suggestion.”
Source, confidence, category, and whether a finding is safe to apply remain
available to the review UI.

#### Existing feature inventory — migration checklist

The following behaviors already exist in the current implementation and must
be carried into the replacement. They are easy to lose if the rewrite is
planned only around spelling cards.

##### Related-word highlighting

The quality layer can return repeated-word and word-family occurrences. The
writing surface should:

- underline the primary occurrence and every related occurrence
- use a shared relationship group so the occurrences are linked
- highlight all members of the group when one is hovered or focused
- open the same issue popover when one is clicked
- show an occurrence preview or list in expanded review
- distinguish “repeated/related” from a direct correctness error
- avoid treating every repeated word as wrong; the analyzer’s context and
  confidence determine whether it is guidance

This behavior currently exists most fully in the desktop annotation surface
through `ikmalRelatedOccurrences`, related groups, hover emphasis, and the
occurrence preview. Browser and other hosts must reach parity through the
shared annotation component.

##### Pronoun and antecedent links

Antecedents are not ordinary spelling or grammar underlines. They are a
relationship annotation with two linked ranges:

- the pronoun and antecedent are both highlightable
- hovering or focusing either range emphasizes its counterpart
- clicking either range opens a “Pronoun link” explanation popover
- the popover explains what the pronoun refers to and reports agreement when
  available
- the compact desktop results area provides a clickable antecedent list that
  jumps to the pronoun range
- ambiguous relationships are reported as unresolved or omitted rather than
  invented

The browser extension should eventually offer the same hover/click behavior;
the full desktop editor may also provide a relationship view in the review
workspace.

##### Selection details

Selecting text in the active editor opens an informational summary before the
check finishes. It shows:

- selected text context or a safe truncated preview
- word count
- character count
- issue count after the local check completes
- `Checking…`, `Paused`, `Off`, `Unavailable`, or `Too large` state when
  applicable
- detected/effective language when that data is available

The current browser implementation intentionally scopes this to the active
editable field, supports textarea/input ranges and contenteditable ranges,
limits checking to 20,000 characters, and avoids a page-wide
`selectionchange` observer. Those crash-prevention constraints are part of the
feature, not implementation trivia.

##### Text marking and annotation preferences

The existing desktop settings expose shared annotation preferences:

- squiggles, lines, or dashes
- balanced, warm, cool, or high-contrast palette
- adjustable annotation intensity
- Zen suppresses markings while retaining the indicator and count
- markings stay aligned with textarea mirrors and contenteditable ranges
- clicking a marked word must still place the host editor caret correctly

The extension and desktop replacement must consume the same semantic tokens and
annotation preferences. The extension may use a different positioning layer,
but it must not invent a separate color or severity vocabulary.

##### Review and history behavior

Existing surfaces also include:

- compact desktop quick check
- expandable inline results drawer
- full desktop issue rail
- browser issue workspace with context and replacement actions
- recent checks/history and “open and check again” behavior
- copy corrected text in the full editor
- grouped findings and related-source disclosures
- issue counts by source/category
- stale-result protection when the text changes while checking
- notices with retry, cancel, details, and recoverable service errors

These become explicit host capabilities or shared review behaviors rather than
being treated as incidental desktop-only markup.

##### Service and integration behavior

The rewrite must preserve the operational features around writing checks:

- LanguageTool and quality-sidecar health states
- managed service start/stop and restart guidance
- optional local transformer installation, model licensing notice, and status
- browser extension endpoint/connection test
- LanguageTool integration detection and approved local-server configuration
- native spell-server setup where supported
- Office bridge and manifest/certificate setup where supported
- menubar/Dock or tray presence controls for the desktop host
- privacy wording that makes the local-only boundary clear

The core should expose capability and health states; each host decides how to
render installation and native integration controls.

### 8.3 Graduated rewording and local rewriting

Rewording should be available when it helps, but it must be a deliberate,
reviewable action rather than an aggressive automatic correction.

#### Three levels of intervention

```text
Correction       high-confidence, narrow edit; may show Apply directly
Rewording        contextual alternative; requires explicit review and diff
Guidance         explains a concern; no generated replacement required
```

Examples:

- `choclate` → `chocolate`: Correction, direct Apply.
- `too kids` → `two kids`: Correction when the homophone rule is confident.
- passive voice with a clear actor: Rewording candidate, “Consider active voice.”
- passive voice without a clear actor: Guidance only.
- a wordy phrase with a deterministic local replacement: Correction or
  Rewording depending on whether the surrounding meaning can change.
- sentence-level transformer output: Rewording candidate with a full diff,
  never a silent replacement.

#### Rewording contract

```ts
interface RewordRequest {
  documentId: string;
  revision: number;
  range: TextRange;
  text: string;
  language: LanguagePreference;
  intent?: DocumentIntent;
  reason: RewordReason;
}

interface RewordCandidate {
  id: string;
  replacementText: string;
  edits: TextEdit[];
  rationale: string;
  source: IssueSource;
  confidence: number;
  meaningRisk: 'low' | 'medium' | 'high';
  scope: 'phrase' | 'sentence' | 'selection';
}
```

The local sidecar can later expose a separate rewrite endpoint, as already
anticipated in `QUALITY.md`. Rewording must not be forced through the normal
point-match `/v2/check` path when it needs sentence context or returns several
edits.

#### Safety gate

Before a rewording candidate is shown as actionable, the core checks:

1. the document revision is still current
2. the candidate does not overlap an unresolved correction unless the user
   explicitly requested a combined rewrite
3. the replacement preserves protected tokens such as names, numbers, URLs,
   quoted text, and code spans when the host identifies them
4. the candidate has a bounded scope
5. the candidate has an explanation and visible before/after diff
6. the user explicitly chooses Apply

High-risk candidates are shown as guidance or require a second confirmation.
No rewording candidate is applied automatically while the user is typing.

#### Passive voice behavior

Passive voice is an important example of why advice and correction must differ.
The existing analyzer correctly flags high-confidence passive constructions but
does not invent an active rewrite by default. Preserve that behavior:

- explain that passive voice may be appropriate
- say that active voice may help when the actor matters
- offer a candidate only when the actor and grammatical transformation are
  sufficiently clear
- otherwise offer `Review wording` with a contextual rewrite request
- let the user keep the original without treating passive voice as an error

#### Rewording UI

The issue popover uses the following action vocabulary:

- `Apply` for narrow, high-confidence corrections
- `Consider rewording` for a bounded candidate
- `Review alternatives` when multiple candidates need comparison
- `Why?` for the explanation
- `Keep original` or closing the card to reject advice without creating an
  ignore rule

Rewording cards show a diff and rationale before Apply. The full review
workspace may allow side-by-side comparison of alternatives; the extension
should begin with one compact candidate at a time.

### 8.4 Add as ikmal-specific product behavior

#### Local-first provenance — P0

Every issue can identify its source in plain language:

- LanguageTool
- ikmal quality checks
- style guide
- relationship or document-structure analysis

The user should be able to understand why a finding exists without seeing
internal rule identifiers. The full detail view may expose the rule id for
diagnostics.

#### Document intent profile — P1

Instead of copying a broad “tone score,” ikmal can offer a small local profile:

- audience: self, colleague, client, public, academic
- purpose: inform, request, explain, persuade, record
- formality: casual, neutral, formal
- variant: US English, UK English, or another supported variant

The profile changes which style and clarity checks are prioritized. It should
not rewrite text automatically or claim that one tone is universally better.
Profiles can be saved per document or host, entirely locally.

#### Calm review queue — P0/P1

The product should distinguish “important to fix” from “worth considering.”
Order findings using a transparent priority model:

1. likely spelling or correctness errors
2. grammar and agreement
3. sentence structure and missing-word problems
4. repetition and clarity
5. style-guide suggestions

The user can change filters, but the default should prevent low-confidence style
advice from visually competing with a clear spelling mistake.

#### Relationship and structure views — P1

The existing pronoun/antecedent work is a strong ikmal-specific direction. It
should become a general structure layer that can eventually represent:

- pronoun-to-antecedent links
- repeated terms and echoes
- sentence boundaries
- paragraph structure
- unresolved references

These should be visualized as optional relationships or review annotations,
not forced into the same correction underline as a spelling error.

#### Whole-text health snapshot — P1

In addition to word, character, and issue counts, the full editor may show:

- sentence and paragraph counts
- estimated reading time
- issue distribution by category
- repeated-word or phrase signals
- language confidence

These belong in the review workspace or document footer, not in every inline
popover. The compact extension should keep only the first three required
counts unless the user opens a richer summary.

#### Explainability without judgment — P0

`Why?` should explain the rule in plain language and show the before/after
example where possible. Avoid labels such as “bad writing,” numerical writing
scores, or shaming copy. The system should say what it noticed and why the
alternative may help.

### 8.5 Evaluate but defer

#### Tone detection and goals — P2

Tone and audience goals are useful ideas, and Grammarly’s goals system shows
that users understand audience, formality, domain, and intent as meaningful
controls. However, tone detection is easy to make culturally narrow or
overconfident. Build the intent profile first, then add narrowly defined,
explainable checks rather than a single opaque tone score.

#### Snippets and phrase library — P2

Snippets are valuable for repeated work, but they are a writing-productivity
feature rather than a proofreading primitive. Consider a local phrasebook only
after dictionary, style guides, and review are stable. It could eventually
reuse the same local storage and host adapters.

#### AI rewriting and generation — separate future track

Grammarly now exposes generative drafting, rewriting, tone adjustment, and
strategic suggestions in some products. Those capabilities should not enter
the core checking surface. If ikmal adds them later, they need a separate,
explicit provider boundary with:

- a clear cloud/local label
- per-request consent
- no silent sending of the active field
- an undoable diff view
- provider and retention settings

The local correction core must remain useful with no account, cloud model, or
AI provider.

### 8.6 Explicitly avoid

- subscription or premium locks in the correction flow
- account prompts before local checking works
- opaque global writing scores
- automatic whole-paragraph rewrites as a default action
- unrequested cloud lookup from a word click
- silent rule suppression with no management screen
- analytics or telemetry disguised as diagnostics
- treating every style suggestion as equal to a spelling error

### 8.7 Competitive reference links

These references informed the additions above:

- [LanguageTool browser add-on overview](https://languagetool.org/chrome)
- [LanguageTool browser add-on options](https://blog.languagetool.org/insights/post/add-on/)
- [LanguageTool language-detection guidance](https://help.languagetool.org/en/articles/39254510037399-a-wrong-language-is-detected-e-g-english-when-i-write-dutch-when-i-use-languagetool)
- [Grammarly browser extension guide](https://support.grammarly.com/hc/en-us/articles/115000091592-How-does-Grammarly-s-browser-extension-work-)
- [Grammarly goals](https://support.grammarly.com/hc/en-us/articles/360054679292-What-are-Goals)
- [Grammarly snippets](https://support.grammarly.com/hc/en-us/articles/4403077145485-Create-snippets)

## 9. Core contracts

The core is TypeScript source compiled to JavaScript for each host. It must be
free of Node, Electron, Chrome, filesystem, and network imports.

### 9.1 Text document

```ts
interface TextDocument {
  id: string;
  text: string;
  revision: number;
  language: LanguagePreference;
  source: DocumentSource;
}
```

The revision is mandatory. A result for revision 3 must never be applied to a
document currently at revision 4.

### 9.2 Check request and result

```ts
interface CheckRequest {
  documentId: string;
  revision: number;
  text: string;
  language: LanguagePreference;
  selection?: TextRange;
}

interface CheckResult {
  documentId: string;
  revision: number;
  requestedLanguage: LanguagePreference;
  detectedLanguage?: DetectedLanguage;
  matches: Issue[];
  statistics: TextStatistics;
  focus: FocusState;
  checkedAt: number;
}
```

The host owns transport. The core owns validation, normalization, stale-result
handling, filtering, dictionary suppression, and presentation ordering.

### 9.3 Issue

```ts
interface Issue {
  id: string;
  offset: number;
  length: number;
  message: string;
  kind: 'correction' | 'rewording' | 'guidance' | 'relationship';
  actionability: 'safe-apply' | 'review-first' | 'explanation-only';
  replacements: Replacement[];
  rewordCandidates?: RewordCandidate[];
  category: IssueCategory;
  severity: IssueSeverity;
  source: IssueSource;
  rule?: RuleInfo;
  confidence?: number;
  relatedRanges?: TextRange[];
}
```

Issue identity must be stable enough for Ignore and Add to dictionary to refer
to the intended finding even when multiple findings overlap.

### 9.4 Host capabilities

```ts
interface WritingHost {
  check(request: CheckRequest): Promise<RawCheckResult>;
  reword(request: RewordRequest): Promise<RawRewordResult>;
  replace(range: TextRange, replacement: string): Promise<void>;
  readPreferences(): Promise<WritingPreferences>;
  writePreferences(patch: Partial<WritingPreferences>): Promise<void>;
  addDictionaryWord(word: string): Promise<void>;
  openIssueReview(context: ReviewContext): Promise<void>;
  announce(message: string, kind?: NoticeKind): void;
}
```

The core should be testable with a fake host implementing this interface.

## 10. Feature and component order

The order below is dependency-driven. Later work must consume the earlier
contracts rather than define parallel versions.

### Phase 0: reference capture and safety net

Purpose: preserve what already works before changing structure.

Tasks:

1. Capture representative desktop compact, desktop full, extension, and
   selection screenshots.
2. Record current behavior for clean text, spelling, grammar, style,
   repeated-word groups, antecedent links, overlapping issues, stale checks,
   selection counts, Pause, Zen, style-guide findings, and language detection.
3. Convert known fixtures into deterministic check responses.
4. Add Playwright selectors and accessibility labels to the current surfaces
   where missing.
5. Preserve existing packaging and smoke tests.

Exit criteria:

- every major current behavior has a fixture or test
- screenshots exist for comparison
- the old implementation can still be packaged

### Phase 1: design tokens and portable primitives

Purpose: eliminate visual drift before building writing-specific components.

Tasks:

1. Extract the shared token layer from `~/Projects/ikmal`.
2. Adopt the locked `edmark.js`/`markgen.js` asset pipeline and verify full,
   minimum, light/dark, and menu-bar logo outputs at their target sizes.
3. Add dark/light theme loading and theme-change tests.
4. Implement portable Button, IconButton, Popover, Card, StatusDot, and Menu
   primitives.
5. Verify them in a standalone component gallery and in an extension-like
   Shadow DOM container.
6. Add reduced-motion and keyboard-focus behavior.

Exit criteria:

- desktop and extension component screenshots use the same token values
- page CSS cannot alter extension component layout
- themes can be switched without changing component markup

### Phase 2: text and issue core

Purpose: establish the semantic model every host consumes.

Tasks:

1. Implement document revisions and stale-result rejection.
2. Normalize LanguageTool-compatible responses.
3. Normalize issue categories, sources, severity, replacements, and ranges.
4. Implement stable issue identity and overlap ordering.
5. Implement word and character counting with Unicode-aware behavior.
6. Implement issue filtering by preference and focus mode.
7. Implement local dictionary matching and spelling suppression.
8. Normalize source provenance for LanguageTool, local quality, style-guide,
   transformer, and relationship findings.
9. Add the `kind`, `actionability`, and optional reword-candidate fields to the
   issue contract.
10. Normalize related-occurrence groups and pronoun/antecedent relationship
    ranges as first-class annotations.
11. Add fixtures for typo, grammar, style, homophone, passive voice, missing
    word, sentence structure, repeated words, word-family echoes, antecedents,
    related ranges, and overlapping findings.

Exit criteria:

- all hosts receive the same normalized `Issue[]`
- the same input and response produce the same counts and issue ordering
- stale results cannot overwrite newer text

### Phase 3: checking and language state

Purpose: make request behavior reliable before attaching UI.

Tasks:

1. Define automatic, explicit, and detected language states.
2. Add conservative language fallback for short or uncertain text.
3. Distinguish requested, detected, and effective language in status UI.
4. Define minimum-length, debounce, cancellation, and retry behavior.
5. Define paused, unavailable, checking, clean, and issue-present states.
6. Add local-only endpoint and privacy status contracts.
7. Add explicit capabilities for style-guide state and local quality-sidecar
   availability.
8. Distinguish correction requests from contextual rewording requests.

Exit criteria:

- short English fragments do not unexpectedly become German or another
  language when the host hint is English
- paused mode makes no check request
- late responses are ignored
- every failure has a recoverable UI state

### Phase 4: canonical indicator

Purpose: provide the same entry point everywhere.

The indicator must show:

- checking animation
- neutral clean state
- issue count
- paused state
- Zen state with issue count but no text markings
- unavailable state
- accessible label and tooltip

Interactions:

- click opens the indicator popover
- Escape closes it
- clicking elsewhere closes it
- keyboard activation behaves like pointer activation
- opening it never moves the underlying text unexpectedly

Exit criteria:

- indicator markup and state names are shared across desktop and extension
- only positioning and host attachment differ
- micro-animation honors reduced-motion

### Phase 5: canonical issue popover

Purpose: replace the divergent desktop and extension cards with one issue
interaction model.

The popover contains:

1. source and severity metadata
2. previous/next navigation when multiple issues exist
3. a concise explanation
4. matched text and replacement preview
5. primary Apply, Consider rewording, or Review alternatives action
6. Ignore
7. Add to dictionary for spelling findings
8. Why? expandable explanation
9. close control

Rules:

- no LanguageTool branding unless the source is explicitly LanguageTool
- no action changes text without a current revision check
- Apply closes or advances predictably
- Ignore removes only the selected finding from the current review state
- dictionary addition persists locally and suppresses future spelling matches
- rewording candidates show a visible diff and require explicit Apply
- passive voice can remain guidance-only when an active rewrite is uncertain
- hovering or focusing a related occurrence emphasizes every member of its
  group
- hovering or focusing an antecedent relationship emphasizes both ranges and
  opens an explanation on click

Exit criteria:

- compact desktop, full desktop, and extension popovers use the same action
  vocabulary and visual hierarchy
- issue navigation works for overlapping and adjacent findings
- every action has keyboard and screen-reader behavior

### Phase 6: quality sources and graduated rewording

Purpose: make ikmal’s local quality layer useful without turning every quality
finding into an aggressive automatic edit.

Tasks:

1. Merge LanguageTool, deterministic quality, style-guide, relationship, and
   optional local-transformer results through one source-aware contract.
2. Classify findings as correction, rewording, guidance, or relationship.
3. Add a separate local reword request path for phrase, sentence, and selection
   rewrites.
4. Implement the safety gate for revisions, protected tokens, overlap, scope,
   confidence, and meaning risk.
5. Add passive-voice behavior: explain first, offer an active rewrite only when
   the actor and transformation are sufficiently clear.
6. Render before/after diffs and explicit Apply/Keep original actions.
7. Preserve deterministic quality checks when the optional transformer is not
   installed or unavailable.

Exit criteria:

- high-confidence narrow corrections remain one-click actions
- quality suggestions never silently rewrite text
- a passive-voice finding can be useful even when it has no replacement
- transformer failure does not disable LanguageTool or deterministic quality
- every applied rewording can be undone

### Phase 7: selection popover

Purpose: make highlighted phrases and passages first-class.

The selection popover shows:

- word count
- character count
- issue count
- checking state
- detected/effective language when available
- a compact issue preview or “Review issues” action

Rules:

- phrase and paragraph selections use the same counting functions
- selection checking never attaches listeners to unrelated text boxes
- selection results are tied to the selected text and host revision
- clicking away closes the popover without changing the selection’s source text

Exit criteria:

- short phrases work
- long passages work
- selections in contenteditable editors do not crash the host application
- no background observer scans every text box

### Phase 8: modes and settings

Purpose: make modes consistent and understandable.

Modes:

- Automatic: normal checking preferences
- Pause: no requests and no new markings for the selected duration
- Zen: checking continues, but only the strongest findings are shown and text
  markings are hidden; the indicator remains available

Durations:

- 15 minutes
- 1 hour
- 4 hours
- until turned off

The picker is a true floating popover. Opening one mode picker closes the
others. The selected mode is visually emphasized and inactive controls are
dimmed.

Exit criteria:

- mode state persists and expires consistently across hosts
- all hosts update when the state changes elsewhere
- Automatic, Pause, and Zen never have contradictory labels

### Phase 9: review workspace

Purpose: provide both quick correction and complete review without forcing a
new page for ordinary use.

The indicator popover gets an inline “Review issues” section. A separate full
workspace remains available for long documents and detailed review.

The inline reviewer supports:

- issue list
- selection/navigation to an issue
- Apply, Ignore, Add to dictionary, and Why?
- a clear path to the full workspace

Exit criteria:

- users can review several issues without leaving the current editor
- the full workspace consumes the same `Issue[]` and action contracts
- the compact and full views never maintain separate issue semantics

### Phase 10: host migration

Migrate in this order:

1. desktop compact, because it has the smallest controlled surface
2. desktop full editor, because it can expose the complete feature set
3. browser extension content surface
4. browser extension popup and workspace
5. Office and VS Code adapters

Each migration must keep the old surface available until the replacement
passes its contract tests, screenshots, and smoke test.

## 11. Testing strategy

### Unit tests

- issue normalization
- range and overlap behavior
- stable issue identity
- language fallback
- focus modes and expiry
- dictionary suppression
- Unicode statistics
- stale-result rejection
- related-occurrence grouping and hover state
- antecedent relationship ranges and click behavior
- selection summary states and active-field scoping
- annotation style, palette, intensity, and Zen suppression
- reword candidate safety gates
- passive-voice guidance versus active rewrite behavior
- correction and rewording undo records

### Contract tests

Every host adapter is tested against the same fake core scenarios:

- check succeeds
- check is paused
- service is unavailable
- text changes during a request
- replacement is applied
- reword request returns a diff
- reword request is rejected when the revision is stale
- issue is ignored
- word is added to dictionary
- focus mode changes externally

### Accessibility tests

- keyboard navigation
- focus trapping for modal review surfaces
- Escape and outside-click behavior
- accessible names and live regions
- color contrast in every theme
- reduced-motion behavior

### Playwright visual tests

Capture the same fixtures in:

- dark and light themes
- compact desktop
- full desktop
- browser extension Shadow DOM
- narrow and wide popovers
- clean, checking, paused, Zen, and issue states
- repeated-word hover/click and occurrence previews
- antecedent hover/click and relationship popovers
- selection summaries for phrases and long passages
- style-guide and local-quality source labels

Visual differences should be reviewed as token or host-layout changes, not
fixed with isolated magic numbers.

## 12. Migration rules

1. No new host-specific issue card behavior after Phase 5 begins.
2. No duplicated mode or language logic in an adapter.
3. No absolute cross-repository asset paths in packaged output.
4. No destructive deletion of the current implementation until replacement
   verification is complete.
5. Every new feature must identify its core contract, UI component, host
   capability, and tests before implementation.
6. If a host cannot support a feature, it reports that capability explicitly;
   it does not silently invent different semantics.

## 13. Definition of done

The rewrite is complete when:

- all supported hosts consume the same core issue model
- all supported hosts use the same design tokens and theme contract
- all supported hosts use the approved generated logo assets and size tiers
- indicator, issue popover, selection popover, and review workspace share the
  same component vocabulary
- modes, language state, dictionary actions, counts, and stale-result rules
  behave identically
- the browser extension remains isolated from page CSS and does not scan
  unrelated fields
- desktop and extension packages pass verification and smoke tests
- Playwright screenshots show deliberate, explainable host differences only
- the old implementation can be removed without losing a tested capability
