# Frequently Asked Questions (FAQ) & Ecosystem Guide

---

## Official LanguageTool Documentation References

`ikmal-editor` is built directly on official LanguageTool specifications and APIs:

- **[LanguageTool Official Developer Portal](https://dev.languagetool.org/)**: Central portal for all LanguageTool open-source documentation.
- **[LanguageTool HTTP Server Specification](https://dev.languagetool.org/http-server)**: Technical details on configuration flags, REST endpoints (`/v2/check`), and security options.
- **[LanguageTool Development Overview](https://dev.languagetool.org/development-overview)**: Architecture overview for POS tagging and FastText models.
- **[Software Supporting LanguageTool Plug-ins](https://dev.languagetool.org/software-that-supports-languagetool-as-a-plug-in-or-add-on)**: Official catalog of browser extensions and desktop add-ons.

### Open-Source Attribution & Independence
`ikmal-editor` is an independent open-source utility designed to enhance the local setup for LanguageTool. All core natural language processing and grammar checking engines belong to [LanguageTool](https://dev.languagetool.org/) and its community of open-source contributors. `ikmal-editor` is created independently by Time Worthy Media, LLC and is not affiliated with LanguageTooler GmbH.

---

## Sister Repositories & Integrations

- **[ikmal editor repository](https://github.com/timeworthymedia/ikmal-editor)**: Source code, releases, and project documentation.
- **[Trilium Notes Plugin (`iansherr/trilium-languagetool`)](https://github.com/iansherr/trilium-languagetool)** `[Coming Soon]`: Connects Trilium Notes' CKEditor body editor to your local `ikmal-editor` server.
- **[Ikmal Tools for Trilium (`iansherr/ikmal_tools`)](https://github.com/iansherr/ikmal_tools)**: Dashboard, automation engine, template studio, and FleetSync integration suite.

---

## Browser Extensions & Add-ons Responsibilities FAQ

### Q: Does `ikmal-editor` download browser extensions automatically?
**No.** `ikmal-editor` automatically configures settings for your installed applications and extensions, but downloading browser extensions (for Chrome, Firefox, Edge, Safari) or office plug-ins (for Word, LibreOffice) is your responsibility.

You can install official plug-ins and add-ons directly from:
- **[Software Supporting LanguageTool Plug-ins & Add-ons](https://dev.languagetool.org/software-that-supports-languagetool-as-a-plug-in-or-add-on)**

Once installed, running `ikmal-editor -configure-apps` automatically routes those extensions to your local server on `http://127.0.0.1:8097/v2/check`.

---

## Windows Setup & Uninstallation FAQ

### Q: Does Windows require WSL (Windows Subsystem for Linux)?
**No.** `ikmal-editor-windows-amd64.exe` is a native 64-bit Windows application that runs directly on Windows 10 and 11 without WSL, Docker Desktop, or Linux virtual machines.

### Q: How does `ikmal-editor` handle Java on Windows?
`ikmal-editor` auto-detects `javaw.exe` (windowless Java launcher) across `%PATH%`, `%JAVA_HOME%\bin\javaw.exe`, `C:\Program Files\Eclipse Adoptium`, `C:\Program Files\Java`, and `C:\Program Files (x86)\Java`. Using `javaw.exe` ensures the server runs silently in the background without popping up command prompt windows.

### Q: Will Windows Defender Firewall pop up an alert?
No. `ikmal-editor` binds the local server specifically to loopback (`http://127.0.0.1:8097/v2/check`) with `--public`, preventing Windows Defender Firewall popup prompts.

### Q: How do I completely uninstall on Windows?
Run:
```cmd
ikmal-editor-windows-amd64.exe -uninstall
```
On Windows, this automatically:
1. Deletes the Windows Startup Registry Run Key (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run\IkmalEditor`) `[BETA / EXPERIMENTAL]`.
2. Clears Chrome & Edge Managed Registry Policies (`HKCU\Software\Policies\Google\Chrome` & `HKCU\Software\Policies\Microsoft\Edge`).
3. Terminates background `javaw.exe` / `java.exe` server processes (`taskkill`).
4. Purges `%USERPROFILE%\.ikmal-editor` application data.

---

## Privacy & General FAQ

### Q: Does `ikmal-editor` send my text to third-party cloud servers?
**No.** `ikmal-editor` runs a 100% local LanguageTool server on `http://127.0.0.1:8097`. All text analysis happens locally on your computer.

### Q: How do I add my own custom rules?
You can add custom LanguageTool XML rules to `~/.ikmal-editor/rules/style_conciseness.xml` or edit `rules/style_conciseness.xml` directly.

### Q: How do I completely uninstall on macOS and Linux?
Run:
```bash
ikmal-editor -uninstall
```
This unloads LaunchAgent / systemd background daemons, deletes browser policy files, stops container instances, and purges `~/.ikmal-editor`.
