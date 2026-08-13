# Contributing to ikmal editor

We welcome open-source contributions to `ikmal-editor`!

---

## How to Contribute New Plain English & Conciseness Rules

1. Open `rules/style_conciseness.xml`.
2. Add your rule following official LanguageTool XML rule syntax:
   ```xml
   <rule id="IKMAL_WORDINESS_PHRASE" name="Simplify 'at this point'">
     <pattern>
       <token>at</token><token>this</token><token>point</token>
     </pattern>
     <message>Consider simplifying for conciseness: <suggestion>now</suggestion></message>
     <example correction="now">We should <marker>at this point</marker> simplify.</example>
   </rule>
   ```
3. Run `go build -o ikmal-editor .` to test execution.
4. Submit a Pull Request on GitHub!

---

## Setting Up the JavaScript Side

The portable writing packages compile with TypeScript, and the packagers and
verifiers shell out to `tsc`. It is a workspace dependency rather than
something you are expected to have installed globally, so run this once from
the repository root:

```bash
npm ci
```

That covers `npm run build`, `npm test`, and `npm run verify`, and it is needed
before `desktop/`'s own `npm run verify` or `npm run package`, which build
those packages too. The desktop app keeps a separate `npm ci` for Electron.

For the end-to-end harnesses, add the pinned Chromium:

```bash
npx playwright install chromium
npm run smoke:browser     # the two MV3 extensions
npm run smoke:vscode      # a real VS Code window
npm run smoke:gallery     # primitives and composites across every axis
```

If you are changing anything visual, run `smoke:gallery` and **look at what it
renders**. Both defects it has caught so far — controls overflowing their
container, and status dots that ignored their state — passed the whole test
suite first.

## The writing platform rewrite

[docs/WRITING_PLATFORM.md](docs/WRITING_PLATFORM.md) is the single source for
the architecture, where the migration actually stands, and what order the
remaining work goes in. Read it before adding a feature to `desktop/` or
`extension/` — both are legacy surfaces being replaced, and new work landing
there widens the gap.

## Releasing

The release process, how to rehearse it without publishing anything, and the
rule that decides which workflows can run from which branch are documented in
[docs/RELEASING.md](docs/RELEASING.md).

## Building & Testing Cross-Platform Binaries

```bash
# macOS ARM64
GOOS=darwin GOARCH=arm64 go build -o bin/ikmal-editor-darwin-arm64 .

# macOS Intel
GOOS=darwin GOARCH=amd64 go build -o bin/ikmal-editor-darwin-amd64 .

# Linux x86_64
GOOS=linux GOARCH=amd64 go build -o bin/ikmal-editor-linux-amd64 .

# Raspberry Pi ARM64
GOOS=linux GOARCH=arm64 go build -o bin/ikmal-editor-linux-arm64 .

# Windows x64
GOOS=windows GOARCH=amd64 go build -o bin/ikmal-editor-windows-amd64.exe .
```
