# Ikmal Editor — Launch Manager for LanguageTool

<p align="center">
  <img src="assets/ikmal_languagetool_banner.png" alt="Ikmal Editor — Launch Manager for LanguageTool" width="100%" />
</p>

<p align="center">
  <a href="https://go.dev"><img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go" alt="Go Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/timeworthymedia/ikmal-editor"><img src="https://img.shields.io/badge/Ikmal-Editor-7B2CBF?style=flat" alt="Ikmal Editor repository" /></a>
  <a href="https://dev.languagetool.org/"><img src="https://img.shields.io/badge/LanguageTool-Official--Docs-blue" alt="LanguageTool Official" /></a>
</p>

* **GitHub Repository**: [https://github.com/timeworthymedia/ikmal-editor](https://github.com/timeworthymedia/ikmal-editor)
* **Official LanguageTool Documentation**: [https://dev.languagetool.org/](https://dev.languagetool.org/)

**`ikmal-editor`** is a standalone, single-binary Go CLI supervisor, manager, and 1-click background server installer for [LanguageTool](https://dev.languagetool.org/).

It automates environment detection, embeds custom **Plain English & Syntactic Conciseness XML Rule Packs**, auto-downloads Meta's FastText language identification models, and configures persistent background daemons on macOS, Linux, and Windows.

> *Ikmal Editor is an independent third-party tool. It is not affiliated with, endorsed by, or sponsored by LanguageTooler GmbH. LanguageTool is a registered trademark of LanguageTooler GmbH. ([full disclaimer](#acknowledgements--open-source-attribution))*

---

## Requirements

- **Java 17+ or Docker** — LanguageTool itself runs on the JVM. `ikmal-editor` auto-detects a Homebrew, Docker, or system Java install and will not start a server without one.
- **~350MB of disk** — the LanguageTool distribution and Meta's FastText `lid.176.bin` model are downloaded to `~/.ikmal-editor/` on first run.

The `ikmal-editor` binary itself is built from the Go standard library only and has no third-party module dependencies.

---

## Why Ikmal Editor?

While LanguageTool provides powerful HTTP server capabilities, setting up a local server requires managing Java JREs, long command-line flags, CORS headers, FastText model paths, and manual background daemons.

`ikmal-editor` operates as an independent supervisor that detects your local environment and launches a fully configured, production-ready LanguageTool server on port `8097`.

| Feature | Standard Manual Setup | Ikmal Editor |
|---|---|---|
| **One-Command Launch** | Manual `java -jar` commands or Docker YAML | **Single binary** auto-detects Homebrew, Docker, or Java |
| **Plain English Conciseness** | Stock grammar rules only | **Embedded XML Rule Pack** (30+ rules from PlainLanguage.gov & Vale) |
| **FastText Model Download** | Manual 120MB download from Meta FTP | **Auto-downloads** `lid.176.bin` to `~/.ikmal-editor/models/` |
| **Persistent Service** | Requires keeping terminal window open | **Auto-installs background macOS LaunchAgent / systemd / Windows daemon `[BETA]`** |
| **CORS for Web Extensions** | Manual `--allow-origin` flags | Pre-configured `--allow-origin *` on port `8097` |

---

## Independent Package Manager & Version Updates

`ikmal-editor` operates as a **transparent supervisor and configuration manager**:

- **Homebrew (`brew upgrade`)**: When you update LanguageTool via Homebrew (`brew upgrade languagetool`), Homebrew updates the core LanguageTool engine binary independently. `ikmal-editor` detects the updated binary and launches it automatically without requiring changes to your daemon.
- **Raspberry Pi (ARM64 & ARMv7)**: Pre-compiled `linux-arm64` and `linux-armv7` binaries for 1-click execution on Raspberry Pi 3, 4, and 5.
- **Unraid Home Server**: Add template URL `https://raw.githubusercontent.com/timeworthymedia/ikmal-editor/main/unraid/my-ikmal-editor.xml` in Unraid Community Applications.
- **Docker (`docker pull`)**: Containerized LanguageTool images are updated independently via standard Docker image pulls.
- **APT (`sudo apt upgrade`)**: Linux system packages update independently via standard `apt` package management.
- **Standalone Java JAR**: `ikmal-editor` fetches official releases directly from `org.languagetool.org`.

---

## Update Checks & Privacy

`ikmal-editor` runs entirely on your machine. **Your text is never sent anywhere** — the LanguageTool server it manages listens on `127.0.0.1:8097` and nothing leaves the loopback interface.

The one outbound request the binary makes on its own is a **daily update check**: it fetches a static JSON file over HTTPS and tells you if a newer release exists.

- It sends **no identifier** — no UUID, no hostname, no username, no OS or hardware details. There is no request body and no query string.
- It stores **only a timestamp** (`~/.ikmal-editor/.update-check`) to rate-limit itself to once every 24 hours.
- It **fails silently** and never blocks startup (3-second timeout, runs after the server is already up).

Turn it off either way:

```bash
ikmal-editor -no-update-check          # per run
export IKMAL_EDITOR_NO_UPDATE_CHECK=1  # permanently
```

Aggregate download counts come from the GitHub Releases API, not from the binary.

---

## Quick Start

### Option A: Install via Homebrew (macOS & Linux)

```bash
# 1. Tap the official Time Worthy Media repository
brew tap timeworthymedia/tap

# 2. Install Ikmal Editor
brew install timeworthymedia/tap/ikmal-editor

# 3. Auto-configure Chrome, Firefox, Safari, Apple Mail, Word, & VSCode
ikmal-editor -configure-apps
```

### Option B: Build from Source

```bash
# 1. Clone the repository
git clone https://github.com/timeworthymedia/ikmal-editor.git
cd ikmal-editor

# 2. Build & launch server manager (auto-configures background server & apps)
go build -o ikmal-editor main.go
./ikmal-editor

# 3. Auto-configure Chrome, Firefox, Safari, Apple Mail, Word, & VSCode
./ikmal-editor -configure-apps

# 4. Clean 1-click uninstall (purges daemon, stops services, clears data)
./ikmal-editor -uninstall
```

---

## Browser Extensions & Add-ons Setup

> **Note**: `ikmal-editor` automatically configures settings for your installed applications and extensions, but **does not download browser extensions or office plug-ins automatically**. You are responsible for installing your preferred extension once from the official source.

Find official browser extensions and office plug-ins at:
- **[LanguageTool Plug-ins & Add-ons Directory](https://dev.languagetool.org/software-that-supports-languagetool-as-a-plug-in-or-add-on)**

Once installed, running `ikmal-editor -configure-apps` automatically routes your browser extensions to `http://127.0.0.1:8097/v2/check`.

---

## Official LanguageTool Documentation References

`ikmal-editor` strictly follows official LanguageTool specifications and APIs:

- **[Official LanguageTool Developer Documentation Portal](https://dev.languagetool.org/)**
- **[LanguageTool HTTP Server Documentation](https://dev.languagetool.org/http-server)**
- **[LanguageTool Development Overview](https://dev.languagetool.org/development-overview)**
- **[Software Supporting LanguageTool Plug-ins](https://dev.languagetool.org/software-that-supports-languagetool-as-a-plug-in-or-add-on)**

---

## Embedded Plain English & Conciseness XML Rule Pack

The manager embeds [`rules/style_conciseness.xml`](rules/style_conciseness.xml), compiled from [PlainLanguage.gov](https://www.plainlanguage.gov) and open-source style linters ([proselint](https://github.com/amperser/proselint), [write-good](https://github.com/btford/write-good)):

### Sample Rules Included:

- **Wordiness Reduction**:
  - *"in order to"* -> **"to"**
  - *"due to the fact that"* -> **"because"**
  - *"at this point in time"* -> **"now"**
  - *"in the event that"* -> **"if"**
- **Nominalization Reduction (Verbification)**:
  - *"make a decision"* -> **"decide"**
  - *"conduct an investigation into"* -> **"investigate"**
  - *"give consideration to"* -> **"consider"**
- **Redundancy Elimination**:
  - *"advance planning"* -> **"planning"**
  - *"end result"* -> **"result"**
- **Plain English Clarity**:
  - *"has the capability to"* -> **"can"**
  - *"utilize"* -> **"use"**

---

## Integrations

- **[Trilium Notes Plugin (`iansherr/trilium-languagetool`)](https://github.com/iansherr/trilium-languagetool)** `[Coming Soon]`: Connects Trilium's CKEditor note body editor directly to `http://127.0.0.1:8097/v2/check`.
- **Chrome & Firefox Web Extensions**: Point official LanguageTool browser extensions to `http://127.0.0.1:8097/v2/check` under Extension Options -> Local Server.

---

## What is Time Worthy Media?

Time Worthy Media is the studio behind Ikmal Editor. This project grew out of
my work building tools that make complicated systems easier to use in everyday
life. I design with a human-centered philosophy: software should be easy to
start, personalizable as people develop their own workflows, and helpful
without demanding that everyone become an expert first.

I believe everyone benefits from a little help. Ikmal Editor is one expression
of that belief—a local writing companion that gives people more clarity,
confidence, and control over their work.

---

## Acknowledgements & Open-Source Attribution

`ikmal-editor` is an independent open-source utility created to simplify local installation, process management, and browser/app auto-configuration for LanguageTool users.

* **Powered by LanguageTool**: All core grammar checking, spellchecking, and natural language processing engines are developed and maintained by the open-source [LanguageTool](https://dev.languagetool.org/) project created by Daniel Naber and the LanguageTool Community. We express our deep gratitude to the LanguageTool maintainers and contributors for their outstanding work.
* **Independent Project Disclaimer**: `ikmal-editor` is developed independently by [Time Worthy Media, LLC](https://timeworthymedia.com) and is not affiliated with, endorsed by, or sponsored by LanguageTooler GmbH. LanguageTool is a registered trademark of LanguageTooler GmbH.

---

## License & Copyright

MIT License Copyright (c) 2026 [Ian Sherr](https://iansherr.com) / [Time Worthy Media](https://timeworthymedia.com). All rights reserved.
