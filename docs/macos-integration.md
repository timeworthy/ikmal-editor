# macOS integration strategy

This document describes the planned macOS integration for ikmal editor. It is
an opt-in surface around the existing local checker, not a second checking
engine.

## Goals

- Make ikmal suggestions available in editors that do not expose a browser or
  plugin integration.
- Preserve the current local-only checker and its structured response format.
- Keep the native Apple spell-service path and the richer ikmal presentation
  path separate, so either can fail without interrupting typing.
- Never capture passwords, secure fields, or unrestricted keystroke streams.

## Integration tiers

### 1. Native spell service

The first Swift prototype now lives in `macos-spellserver/`. It is backed by
`NSSpellServer`, registers an ikmal language/provider, and translates bounded
checker findings into standard Apple grammar results. This is the preferred
first integration because the host app owns the underline and
correction-menu presentation.

The prototype also includes a `.service` bundle manifest and descriptor. It is
packageable with `macos-spellserver/package.sh`, but installation remains
deliberately separate until TextEdit, Mail, Messages, and other AppKit clients
have been checked for conflicts with the existing Apple spell server.

The helper should talk to the existing local quality proxy over loopback. It
must not duplicate the deterministic rules or transformer protocol.

### 2. Accessibility companion

Use the macOS Accessibility API only when the user explicitly enables
“Enhanced app integration” and grants Accessibility permission. The companion
will observe the focused application and editable text element, then:

1. Read only supported editable text ranges, never secure text fields.
2. Debounce changes and cap each request to the configured checker window.
3. Send the text to the existing local checker with a generation ID.
4. Show findings in an ikmal companion popover or overlay anchored to the
   accessible text element.
5. Before applying a replacement, verify that the source range is unchanged.

The first version should be read-only apart from an explicit Apply action. It
should not attempt to inject attributed text or draw directly inside another
application's text view. The overlay is a presentation fallback for apps that
do not consume `NSSpellServer` results; it is not a promise of pixel-perfect
underlines in every editor.

## Safety and privacy guardrails

- Disabled by default; show the exact permission, affected apps, and stop
  control before enabling it.
- Keep the app allowlist visible and editable. Start with Mail, Messages, and
  a small set of tested editors rather than every application.
- Do not inspect password/secure text roles, clipboard history, or background
  windows.
- Keep text in memory only for the active check and discard it after the result
  or timeout. Do not write captured passages to recent-check history unless
  the user checks them in ikmal directly.
- Bind every response to the focused app, element, source hash, and generation
  so stale results cannot appear over newer text.
- Provide pause, disable, and permission-revocation states with clear wording.

## Implementation phases

1. **Native spell-server prototype:** build and package the helper, then
   validate its registration and result presentation in TextEdit before
   enabling it in other applications.
2. **Read-only probe:** enumerate focused editable elements and text-change
   notifications without sending text or drawing UI.
3. **Local check adapter:** forward bounded passages to the existing proxy and
   log only timing, ranges, and error categories in development builds.
4. **Companion presentation:** show a small status indicator and popover with
   the same finding model used by the Electron editors.
5. **Explicit replacement:** apply one verified replacement at a time, with
   undo-friendly behavior and a visible failure explanation.
6. **App matrix:** validate Mail, Messages, TextEdit, Notes, and common browser
   text areas; disable the adapter for apps whose accessibility behavior is
   unsafe or inconsistent.

## iOS boundary

This Mac Accessibility design should not be reused for iOS. The eventual iOS
path is a keyboard extension and/or a native ikmal editor, with Apple Writing
Tools support inside our own text views. The keyboard extension has different
privacy, memory, and text-context limits.
