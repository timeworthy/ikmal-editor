# desktop-compact — the launcher

The compact window, rebuilt on the shared architecture. It is a **launcher**:
quick check, service status, focus modes, and the way into the editor.

It carries no settings. Settings live in `apps/desktop-editor`, and the gear
here opens them there. That is a product decision, not an omission: the compact
window and the editor are two windows of one app with different jobs, and
settings existing in both is the duplication this rewrite exists to remove.

## What keeps it a launcher

Three things, all mechanical, because a rule nobody enforces is a rule that
erodes:

- `preload.cjs` exposes nine capabilities and not one settings capability. It
  cannot read the quality-model state, style guides, Office, the spell server,
  or integrations, so it cannot render a panel for any of them.
- `tools/verify_desktop_rewrite.mjs` fails if a settings capability appears in
  that preload.
- `desktop/rewrite_smoke.mjs` fails if a settings group renders in this window.

Adding settings here would have to start by defeating all three.

## What it is built from

Everything visible comes from the shared packages:

| Surface | Source |
| --- | --- |
| Indicator | `packages/writing-ui` — `indicator` |
| Issue card, with navigation | `packages/writing-ui` — `issue_popover` |
| Focus modes | `packages/writing-ui` — `mode_picker` |
| Service health | `packages/writing-ui` — `settings` (health card) |
| Checking semantics | `packages/writing-core` via `desktop_slice` |
| Every colour, radius, control | `packages/design-system` |

`styles.css` is layout only. A colour declared there would be a second visual
system starting, and the verifier rejects it.

## Running it

The slice is behind a flag; without it the legacy compact renderer loads.

```sh
cd desktop
IKMAL_DESKTOP_REWRITE_SLICE=1 npx electron .
```

Staged modules (`writing-core.js`, `desktop_slice.js`, the composites, the CSS)
are build output, produced by `node tools/package_desktop_rewrite.mjs` and
ignored by git. A checkout builds them rather than carrying a copy that can go
stale.

## Status

Nine of the fifty-five desktop capabilities, and the first surface to consume
the shared composites. The legacy compact renderer is still the default; it can
be deleted once the editor's settings page covers the groups the legacy compact
tab still carries. See [docs/WRITING_PLATFORM.md](../../docs/WRITING_PLATFORM.md).
