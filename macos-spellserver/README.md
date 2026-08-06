# ikmal macOS spell server prototype

This is the first native AppKit integration prototype for ikmal editor. It
uses `NSSpellServer` and forwards bounded text to the existing local quality
proxy at `http://127.0.0.1:8096/v2/check`. It does not duplicate checker rules,
capture keystrokes, or write text back into a host application.

The bridge caps each request at 8,000 UTF-16 code units, maps LanguageTool
offsets back to `NSTextCheckingResult` ranges, and returns no findings when the
local service is unavailable. The request timeout is 1.5 seconds so a local
service problem cannot block an editor indefinitely.

## Build on macOS

Use the Swift toolchain that matches the installed Xcode/macOS SDK. If Xcode
is installed but not selected as the active developer directory, point the
commands at its toolchain and SDK explicitly:

```sh
XCODE_TOOLCHAIN=/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin
SDKROOT=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX26.5.sdk
PATH="$XCODE_TOOLCHAIN:$PATH" SDKROOT="$SDKROOT" swift build -c release
```

The repository’s default Command Line Tools path is a different Swift/SDK
patch version. The production helper was successfully built with the matching
Xcode toolchain; the XCTest target still requires the complete matching test
runtime in the local Xcode installation.

The endpoint and language can be overridden for development:

```sh
IKMAL_SPELL_ENDPOINT=http://127.0.0.1:8096/v2/check \
IKMAL_SPELL_LANGUAGE=English \
swift run ikmal-spellserver
```

`NSSpellServer.registerLanguage` expects the human-readable language name
recognized by macOS, such as `English`, rather than a BCP 47 tag such as
`en-US`. The default vendor is `ikmal editor`, matching the service listing.

To create the opt-in service bundle after a successful matching-toolchain
build:

```sh
./package.sh
./validate_package.sh
```

The bundle contains the legacy macOS `services` descriptor required for a
spell checker service: vendor, supported language, and executable name. Apple
looks for spell-server bundles with a `.service` or `.app` suffix; do not copy
this prototype into `/Library/Services` or `~/Library/Services` until the AppKit
client matrix has been validated.

The helper is intentionally not registered or enabled by this repository yet.
The next validation step is to package it as a signed macOS spell-service
component and test it in TextEdit, Mail, Messages, Notes, and other AppKit
clients. Accessibility remains a separate, explicit opt-in integration for
apps that do not consume the native spell-service path.
