#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
bundle_path=${1:-$project_dir/../bin/macos/ikmal editor spell server.service}

test -x "$bundle_path/Contents/MacOS/ikmal-spellserver"
test -f "$bundle_path/Contents/Info.plist"
test -f "$bundle_path/Contents/Resources/services"
grep -Fx 'Spell Checker: ikmal editor' "$bundle_path/Contents/Resources/services" >/dev/null
grep -Fx 'Language: English' "$bundle_path/Contents/Resources/services" >/dev/null
grep -Fx 'Executable: ikmal-spellserver' "$bundle_path/Contents/Resources/services" >/dev/null

if command -v plutil >/dev/null 2>&1; then
  plutil -lint "$bundle_path/Contents/Info.plist" >/dev/null
fi

echo "Spell-server bundle manifest verified: $bundle_path"
