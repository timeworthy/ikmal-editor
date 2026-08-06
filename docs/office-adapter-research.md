# Office adapter research

## LibreOffice/OpenOffice

The official open-source LanguageTool Office implementation is
[`languagetool-for-libreoffice`](https://github.com/languagetool-org/languagetool-for-libreoffice).
It is a Java/UNO extension distributed as an `.oxt` package. Its user-facing
model is the right precedent for ikmal: check text in the host document,
underline the reported ranges, and offer a correction from the context menu.

The repository is marked as no longer actively maintained and is LGPL-2.1.
That makes it useful for architectural study, but not a source to fold into
ikmal's MIT codebase without a deliberate LGPL compliance decision. We should
implement a clean ikmal UNO adapter against the documented `/v2/check`
contract, retaining only the behavior we need:

- bounded paragraph or visible-region checks;
- host-native range/underline annotations;
- native context-menu replacement actions;
- document-version or text-generation checks before applying a result;
- local endpoint and timeout settings.

LibreOffice 7.4 and newer also have built-in support for a remote LanguageTool
checker, so the first ikmal deliverable should test whether configuring that
native path is sufficient before shipping a separate `.oxt` adapter.

## Microsoft Word and Outlook

The public LanguageTool Word add-in is not an open-source implementation to
reuse. Microsoft Office add-ins are web applications hosted from a web server;
Microsoft documents HTTPS as the normal requirement, and Office web or store
scenarios require SSL. That is a poor fit for ikmal's strict loopback-only
contract unless we add a deliberate local HTTPS/native bridge.

The eventual Office strategy should therefore be one of:

1. a native Word/Outlook adapter for a specific desktop platform;
2. a separately designed Office add-in with an explicit local HTTPS boundary;
3. an integration that only opens the ikmal editor and applies user-approved
   replacements, without attempting inline annotations.

We should not copy or reverse-engineer the proprietary LanguageTool add-in.

## Implementation order

1. Validate LibreOffice's native remote-checker path against the ikmal proxy.
2. If native support is insufficient, build a small UNO adapter in its own
   package and keep it isolated from the browser/VS Code adapters.
3. Revisit Word/Outlook only after choosing between native and HTTPS-hosted
   deployment.

All host adapters should continue sharing the versioned check contract and
the same stale-result fixtures; only text extraction, range mapping, and native
actions should differ.
