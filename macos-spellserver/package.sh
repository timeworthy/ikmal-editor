#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root_dir=$(CDPATH= cd -- "$project_dir/.." && pwd)
scratch_path=${IKMAL_SWIFT_SCRATCH_PATH:-/private/tmp/ikmal-spellserver-build}
output_dir=${IKMAL_SPELLSERVER_OUTPUT:-$root_dir/bin/macos}
bundle_path="$output_dir/ikmal editor spell server.service"

swift build --package-path "$project_dir" --configuration release --product ikmal-spellserver --scratch-path "$scratch_path"
binary_dir=$(swift build --package-path "$project_dir" --configuration release --product ikmal-spellserver --scratch-path "$scratch_path" --show-bin-path)
binary_path="$binary_dir/ikmal-spellserver"

rm -rf "$bundle_path"
mkdir -p "$bundle_path/Contents/MacOS" "$bundle_path/Contents/Resources"
cp "$binary_path" "$bundle_path/Contents/MacOS/ikmal-spellserver"
cp "$project_dir/Resources/Info.plist" "$bundle_path/Contents/Info.plist"
cp "$project_dir/Resources/services" "$bundle_path/Contents/Resources/services"
chmod 755 "$bundle_path/Contents/MacOS/ikmal-spellserver"

echo "Spell-server bundle ready: $bundle_path"
