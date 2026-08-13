# ikmal Continental design system

This package is the rewrite’s portable design boundary. `tokens.css` exposes
semantic Continental variables, and `primitives.css` contains deliberately
small framework-free building blocks that can be consumed by browser, desktop,
Office, or VS Code host surfaces.

The external Continental token source remains the design authority. This copy
is an explicit, reviewable runtime contract; it does not load fonts or remote
resources and does not import the deprecated application stylesheet.

## What is in it

**63 tokens** and **33 primitives / 60 classes**. Class names and DOM semantics
are Continental's, so markup stays portable between this package and the design
system it came from. The declarations are authored against the token contract
rather than copied: Continental's own component CSS depends on around forty
internal tokens (`--cnt-surface`, `--ctl-h`, `--elev-4`, the intent softs) that
this contract deliberately does not carry.

```
buttons     btn  icon-btn  btn-group
forms       field  label  input  select  textarea  help  switch  check
            segmented  slider
containers  card  panel  sheet  accordion  tabs  tab  drawer  scrim
feedback    alert  banner  toast  tooltip  badge  tag  chip  kbd  status-dot
data        stat  progress  steps  step  empty  divider  menu  popover
```

Three local semantic tokens exist, each carried once rather than repeated per
component: `--control-h` (follows density), and `--surface-blur` / `--scrim` for
Continental's translucent floating surfaces. The plan permits a local semantic
alias; it forbids a second scale, and none of these is one.

## Rules the tests enforce

- **No hard-coded colour** in a primitive. A hex, `rgb()`, or `hsl()` in a
  declaration fails the suite.
- **Every token referenced must be defined** by the contract.
- **Intents derive from their intent colour** with `color-mix`, so a palette
  change carries instead of needing an edit per intent.
- **`box-sizing` is scoped to `cnt-` classes**, never shipped as a global reset —
  a package has no business changing layout in every host that adopts it.
- **Status dots carry state intents**, because a dot that stays one colour
  whatever the state is decoration rather than status.

## Seeing it

```sh
npm run smoke:gallery
```

`gallery.html` renders every primitive and composite, and the harness asserts in
a real browser that theme, density, and palette reach computed values, that
intents stay distinct, that focus is visible on a control, that nothing
overflows its container, and that the Shadow DOM copy is styled and unreachable
from the page.

Look at the output, not only the exit code. Both defects the gallery has caught
so far — overflowing controls and meaningless status dots — passed every test.
