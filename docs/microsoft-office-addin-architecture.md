# Microsoft Office add-in architecture

Microsoft Office is not LibreOffice, and its supported cross-platform
extension model is different. A Word or Outlook Office Add-in consists of a
manifest plus a web application. Microsoft’s own local development flow uses
an HTTPS server on `localhost`, a trusted development certificate, and—on
Windows in some cases—a WebView loopback exemption.

References:

- [Office Add-in requirements](https://learn.microsoft.com/en-us/office/dev/add-ins/concepts/requirements-for-running-office-add-ins)
- [Sideload Office Add-ins](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-office-add-ins-for-testing)
- [Office local HTTPS development](https://learn.microsoft.com/en-us/office/dev/add-ins/tutorials/excel-tutorial)
- [Word Add-in development kit](https://learn.microsoft.com/en-us/samples/officedev/office-add-in-samples/word-get-started-with-dev-kit/)
- [Word Range API](https://learn.microsoft.com/en-us/javascript/api/word/word.range)
- [Word change-tracking mode](https://learn.microsoft.com/en-us/javascript/api/word/word.changetrackingmode)
- [Word tracked changes](https://learn.microsoft.com/en-us/javascript/api/word/word.trackedchange)
- [Outlook body API](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/insert-data-in-the-body)
- [Power BI custom visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/develop-power-bi-visuals)
- [OfficeDev Office Add-in samples](https://github.com/OfficeDev/Office-Add-in-samples)
- [Open-source LanguageTool Word add-in](https://github.com/jaumeortola/languagetool-msword10-addin)

## Proposed ikmal system

```text
Office host
        |
        | Office.js + local HTTPS task pane
        v
https://localhost:8765/office/<host>/
        |
        | bounded bridge request
        v
http://127.0.0.1:8096/v2/check
```

The bridge is local-only. It serves the packaged task-pane assets over HTTPS,
validates the exact Office origin, enforces request size/time limits, and
forwards checks to the existing ikmal proxy. It must never bind to a LAN
interface or forward arbitrary URLs.

## Host capability matrix

The shared foundation is the Office manifest, Office.js runtime, local HTTPS
task pane, and bounded bridge. The text adapter remains host-specific because
each application exposes a different native unit and different requirement-set
availability.

| Host | Native text unit | First useful capability | Main mapping risk | Priority |
| --- | --- | --- | --- | --- |
| Word | Document body, paragraphs, ranges | Selection/document review with explicit replacement | Unicode offsets, tables, fields, tracked changes | First |
| Outlook | HTML/plain-text compose body | Draft review in a task pane with explicit HTML-preserving apply | Body API and client-version differences | Second |
| Excel | Cells, ranges, and range areas | Check selected or bounded used-range text and report cell/character locations | Formulas, mixed values, huge ranges, non-contiguous areas | Second |
| PowerPoint | Slides, shapes, text frames, text ranges | Check text boxes by slide and apply an explicit shape-text replacement | Shape identity, slide order, text-frame offsets | Second |
| OneNote | Pages and page content | Review the current page through a task pane where the target client supports the API | Page-content HTML and limited client/API coverage | Scaffolded |
| Project | Tasks and task text fields | Check selected task names/notes in a task pane; apply only to one field after a fresh read | Windows desktop-only Common API surface and non-document data model | Scaffolded |
| Power BI | Report visuals, semantic model, custom visuals | Separate companion/custom visual for report annotations or text fields | Not a general Office.js document editor surface | Separate |

Excel and PowerPoint must not be treated as Word with a different manifest:
Excel checks values in bounded ranges and maps findings back to cell addresses,
while PowerPoint checks text frames and maps them back to a slide and shape.
Large Excel reads should be split into bounded blocks, and formulas/numeric
cells should be preserved unless the user explicitly requests checking their
display text.

Power BI is deliberately outside the first Office.js adapter family. Its
extension model is centered on report visuals, custom visuals, and data/report
interactions rather than a document-wide editable text stream. We should
create a separate `powerbi-companion` design only when we have a concrete
target—such as checking text in a supported visual or providing a companion
review pane—and should not promise Word-style inline squiggles in reports.

## Shared Office foundation and host modules

The implementation should be a small monorepo-style family of host modules:

```text
office-common
  manifest/bootstrap, local HTTPS, settings, bridge, stale/version checks
office-word       document/range projection and explicit replacement
office-outlook    HTML/plain-text body projection and safe apply
office-excel      bounded range projection and cell/character mapping
office-powerpoint slide/shape/text-frame projection
office-onenote    page-content projection where supported
office-project    task-field projection after capability validation
powerbi-companion separate custom-visual/report integration
```

Each module should consume the same check contract and fixtures, but own its
own projection, offset mapping, apply operation, and host capability gates.
That lets us update the checking core and bridge once while shipping only the
host adapters that are actually supported by a given Office client.

## Certificate and installation flow

The desktop app should provide an explicit Office integration setup flow:

1. Generate or locate a per-user `localhost` certificate and private key.
2. Show the certificate fingerprint and ask for consent before adding trust.
3. Install trust using the platform certificate store where supported, with a
   manual fallback and removal action.
4. Start the bridge on a fixed loopback port, defaulting to `8765`.
5. Sideload the selected Office manifest, whose source URLs point to the local
   HTTPS task pane.
6. Offer a health check and a complete remove flow that deletes only ikmal's
   certificate, manifest, and bridge state.

Microsoft’s development tooling already demonstrates the local HTTPS and
certificate pattern. The production difference is that ikmal owns the bridge,
certificate lifecycle, and explicit consent instead of relying on a developer
tool.

## Word adapter: inline findings and first milestone

Inline findings are a core requirement, not a later luxury. The task pane is
the review and apply surface; the document itself should show where a finding
is anchored whenever the host API can do so safely. Ikmal’s visual treatment
should be independently selectable—wavy underline, dotted/dashed underline,
or highlight—so findings remain visually distinct from Word’s own revision
marks and from one another.

The first milestone should therefore:

- check the current selection, then optionally the document body;
- map each unambiguous match to a Word range and render its configured inline
  treatment, with a task-pane fallback for unsupported or ambiguous ranges;
- display source, message, relationship context, and replacement in the pane;
- apply a replacement only after the user clicks Apply;
- keep the document text/version used for the request and discard stale
  results before changing the document; and
- clear or replace ikmal’s own annotations on each new check without touching
  author formatting or unrelated document marks.

Word exposes range highlighting/formatting and tracked-change objects, but
those are different concepts. A diagnostic underline or highlight is an ikmal
annotation; applying a replacement is a document edit. If Word change tracking
is already enabled, the adapter must detect that mode, preserve it, and verify
the resulting revision rather than silently turning it off or accepting/rejecting
existing revisions. We should test the exact rendering and apply behavior by
Word client and requirement set, with a safe task-pane fallback when an inline
style would mutate document formatting.

Word’s JavaScript API exposes ranges, insertion, formatting, and comments, but
the adapter still has to map LanguageTool character offsets into Word ranges.
That mapping should be a separately tested module, especially around Unicode,
field codes, tables, and duplicated phrases.

The older open-source LanguageTool Word add-in is a useful implementation
warning: it uses a Windows/.NET host, sends paragraphs to a local LanguageTool
server, and shows results in a dialog rather than underlining the document. Its
README calls out inline highlighting and tracked changes as difficult cases.
Our design keeps those as explicit test areas, while making inline annotation a
required product behavior wherever the Office host can support it cleanly.

The modern OfficeDev samples reinforce the task-pane approach: Word samples
operate on document ranges and replacements, while Outlook samples use a task
pane and asynchronous body APIs. Those are patterns to follow, not code to
copy into the ikmal runtime.

## Outlook adapter: separate milestone

Outlook exposes message bodies through asynchronous HTML or text APIs. A first
version should aim for inline HTML-safe markers plus a draft-review task pane:

- read the current compose body;
- check a bounded plain-text projection;
- map findings back to the HTML text nodes when the projection is unambiguous;
- show the same suggestions in the pane for navigation and review;
- apply only explicit replacements, preserving the HTML structure;
- re-read the body before applying to detect edits made while checking.

If a client cannot safely map plain-text offsets back into sanitized HTML, the
adapter should keep the finding in the task pane and explain why inline
marking is unavailable for that message. Outlook on the web, new Outlook,
classic Outlook, and mobile also have different body behavior, so the adapter
must retain per-client capability gates instead of assuming one HTML path.

## Why not a native COM/VSTO-only path?

A Windows-native Word adapter could obtain more direct range access, but it
would be Windows-only and would not cover Word for Mac or the web. It also does
not provide a universal Outlook solution. Office.js plus a local HTTPS bridge
is the better shared base; a native Windows adapter can be added later if
Office.js range fidelity proves insufficient.

## Security rules

- `localhost`/loopback only; no wildcard CORS and no LAN binding.
- No Office document text in logs, telemetry, crash reports, or URLs.
- Bounded body size, timeout, and response size.
- Explicit certificate installation and removal.
- Exact generation/document-version checks before applying edits.
- Office.js assets and host communication are treated as platform dependencies;
  ikmal’s own data path remains local.

The first implementation target should be a Word task pane with inline
selection findings and explicit Apply actions. Excel and PowerPoint can follow
with their own inline cell/shape treatments once mapping fixtures are defined.
Outlook should remain a separate HTML-body annotation strategy. OneNote and
Project now have conservative task-pane scaffolds, but they still require real
client validation before release: OneNote page-content behavior varies by
client, and Microsoft documents Project task APIs as Windows-desktop-only.
Power BI should be planned as its own companion surface, not added to the
Office document adapter by analogy.
