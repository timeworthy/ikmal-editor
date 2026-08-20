# ikmal editor — LibreOffice adapter boundary

LibreOffice already has a native LanguageTool integration. ikmal supplies a
loopback LanguageTool-compatible endpoint profile and a bounded UNO-facing
projection/Apply contract instead of injecting browser code into Writer, Calc,
or Impress.

The profile covers language, mother tongue, enablement, dictionary, ignored
rules, native underlines, context-menu correction ranges, and stale-safe Apply.
`npm run smoke:docker:libreoffice` runs the contract against a real headless
Writer/UNO process plus a loopback checker fixture. The repository still does
not claim to package a full LibreOffice GUI extension; the native profile and
UNO range boundary are the supported integration seam.
