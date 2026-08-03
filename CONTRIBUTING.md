# Contributing to Ikmal Editor

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
3. Run `go build -o ikmal-editor main.go` to test execution.
4. Submit a Pull Request on GitHub!

---

## Building & Testing Cross-Platform Binaries

```bash
# macOS ARM64
GOOS=darwin GOARCH=arm64 go build -o bin/ikmal-editor-darwin-arm64 main.go

# macOS Intel
GOOS=darwin GOARCH=amd64 go build -o bin/ikmal-editor-darwin-amd64 main.go

# Linux x86_64
GOOS=linux GOARCH=amd64 go build -o bin/ikmal-editor-linux-amd64 main.go

# Raspberry Pi ARM64
GOOS=linux GOARCH=arm64 go build -o bin/ikmal-editor-linux-arm64 main.go

# Windows x64
GOOS=windows GOARCH=amd64 go build -o bin/ikmal-editor-windows-amd64.exe main.go
```
