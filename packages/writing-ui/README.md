# writing-ui — the writing composites

Every writing surface the product has, implemented once. Hosts render these;
they do not re-implement them.

Each composite is a render function returning HTML, plus a `*_CSS` export for
layout and a `normalize*` for defensive input. Nothing here touches Electron,
Chrome, or the network — a host attaches the result wherever it belongs.

## What is here

| Composite | Answers |
| --- | --- |
| `indicator` | What is happening, in one control attached to the field |
| `indicator_popover` | The full "right now": state, counts, modes, inline review |
| `issue_popover` | Explain and correct the finding nearest attention |
| `selection_popover` | What the writer just highlighted |
| `mode_picker` | Automatic, Pause, Zen — with all four durations |
| `review` | The full review workspace, the review row, and the undo notice |
| `settings` | Settings group, service health card, style-guide card |

## Composed, not restyled

These build on `packages/design-system` primitives. A composite contributes
layout and nothing else — a colour, radius, or control style authored here would
be a second visual system inside the one the package exports.

Two tests enforce it: one rejects a composite that declares a colour, and the
gallery harness fails if a composite renders a class outside the `cnt-`/
`writing-` vocabulary.

## Behaviours that are deliberate

These look like details and are not. Each was either specified in the plan or
learned from the legacy implementation, which remains the behavioural oracle:

- **No issue count while checking or unavailable.** A count means nothing before
  a result exists, and a stale one says "you are fine" untruthfully.
- **An empty review collapses** rather than rendering an empty list, which reads
  as failure rather than as calm.
- **The selection popover reports states, not just numbers** — `Checking…`,
  `Paused`, `Off`, `Unavailable`, `Too large` — with singular and plural counts.
  It was a three-number stub, and migrating a host onto that would have dropped
  every state the product actually has.
- **The issue card navigates.** Previous/next with "n of total", disabled at the
  ends, plus a close control. Without it a writer facing overlapping findings
  can reach only the first.
- **The service card says `managed` or `existing`.** Whether the app started a
  service decides whether restarting the app can fix it.
- **A refused correction is not presented as an applied one.**

## An obligation on hosts

`test/indicator.test.mjs` asserts every action the issue card renders is one a
host implements: `apply`, `ignore`, `dictionary`, `previous`, `next`, `close`.
A host adopting these cards owes all six, or it ships a control that does
nothing when clicked.

## Seeing them

`packages/design-system/gallery.html` renders every composite beside the
primitives they are built from:

```sh
npm run smoke:gallery
```

Rendering them is not optional diligence. It has caught two defects a passing
test suite did not: status dots that stayed accent-coloured whatever the state,
and controls that overflowed their container.
