# Third-Party Notices

`ikmal-editor` is MIT licensed. **That license covers only the code in this
repository.** It does not cover, and cannot grant rights to, the third-party
software this project builds on, links to, or downloads on your behalf. Those
components carry their own licenses, listed below.

This file is organized by *how* each component reaches you, because that
determines who carries the obligation:

- **Part 1** ships inside the binaries we distribute. Their notice
  requirements are ours to satisfy.
- **Part 2** is downloaded onto your machine at runtime, by you, from the
  upstream project. We never redistribute it, so those terms bind **you**, not
  us. Read this part before deploying `ikmal-editor` anywhere that matters.
- **Part 3** is ours.

---

## Part 1 — Bundled in the distributed application

The packaged desktop app (`bin/desktop/`) embeds the Electron runtime. The Go
binary (`ikmal-editor`) embeds nothing: it is built against the Go standard
library only and has no third-party module dependencies.

| Component | Version | License |
|---|---|---|
| [Electron](https://github.com/electron/electron) | 43.2.0 | MIT — © Electron contributors, © 2013-2020 GitHub Inc. |
| Chromium, Node.js, V8 and their transitive dependencies (bundled inside Electron) | — | BSD-3-Clause, MIT, Apache-2.0, LGPL, MPL and others — see `LICENSES.chromium.html` |

The full text of both is distributed with the packaged application as `LICENSE`
(Electron) and `LICENSES.chromium.html` (~20 MB, the complete Chromium
dependency set). If you redistribute the app, **these two files must travel with
it.**

`@electron/packager` and the other entries in `desktop/package.json` are
`devDependencies` used only at build time. Packaging runs with `prune: true`, so
none of them are present in the shipped app and none require attribution here.

The browser extension in `extension/` is also shipped inside the packaged app
(unpacked, so the browser's "Load unpacked" can read it). It has **no
third-party dependencies at all** — no bundled framework, no vendored library,
no build step. Every line is original work under this project's MIT license, so
it adds nothing to this section.

---

## Part 2 — Downloaded at runtime (not redistributed by us)

`ikmal-editor` is a supervisor and configurator. It fetches these components
from their official sources and runs them as separate processes. We do not host,
mirror, modify, or redistribute any of them.

### LanguageTool 6.5 — LGPL-2.1-or-later

Downloaded from `https://org.languagetool.org/download/LanguageTool-6.5.zip`, or
detected from an existing Homebrew, Docker, or system install. Run as a separate
process and communicated with over HTTP; `ikmal-editor` does not link against it
in any form.

The LanguageTool distribution bundles its own third-party stack under mixed
terms — predominantly Apache-2.0, plus BSD, EPL, CDDL, MIT, and CC0. It also
includes dictionaries and language resources under **GPL-2.0** (Irish, Catalan)
and **CC BY-SA 4.0** (German, Greek). LanguageTool notes that dictionaries "are
not technically libraries, they may have different licenses (including GPL)
without affecting LanguageTool's licensing." See `COPYING.txt` and
`third-party-licenses/README.txt` in the distribution.

> LanguageTool is a registered trademark of LanguageTooler GmbH. `ikmal-editor`
> is an independent project, not affiliated with, endorsed by, or sponsored by
> LanguageTooler GmbH. No trademark rights are granted by the LGPL or by this
> project.

### fastText `lid.176.bin` — CC BY-SA 3.0

Language identification model by Meta AI Research (FAIR), downloaded from
`https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin` to
`~/.ikmal-editor/models/`. Trained on Wikipedia, Tatoeba, and SETimes.
ShareAlike obligations attach to the model file if you redistribute or modify it.

### User-supplied runtimes

Not downloaded or bundled by `ikmal-editor`; detected on your system, or
supplied by the container image.

| Runtime | Typical license |
|---|---|
| Java 17+ JRE (required by LanguageTool) | GPL-2.0-with-classpath-exception (Temurin/OpenJDK) or your vendor's terms |
| Node.js and npm (optional quality runtime) | MIT |
| Docker images (optional) | Per image |

---

## Part 3 — Original work in this repository

MIT licensed, © 2026 Ian Sherr / Time Worthy Media. See [LICENSE](LICENSE).

This covers the Go launcher and supervisor, the quality server and proxy, the
style guide engine, the Electron desktop app and editor, the browser extension
in `extension/`, the project's icons and artwork, and the rule packs in
`rules/`.

The browser extension contains no code from either of LanguageTool's browser
extensions. The current one is proprietary and could not be used; the older
`languagetool-browser-addon` is LGPL-2.1 and could have been, but it is
Manifest V2 with vendored 2016-era dependencies, so the extension was written
fresh against the documented LanguageTool HTTP API instead. APIs are not
copyrightable, and the LGPL imposes no conditions on clients that merely speak
to a server. See [extension/README.md](extension/README.md).

The rule packs are original work expressed in LanguageTool's XML rule schema. A
file format is not itself copyrightable, and no rule text was copied from
LanguageTool's own rule files. Rule content is informed by
[PlainLanguage.gov](https://www.plainlanguage.gov/) (a work of the U.S. federal
government, public domain) and by conventions popularized by
[Vale](https://github.com/errata-ai/vale) (MIT).

---

## Corrections

If you believe a component is misattributed or missing, please open an issue.
