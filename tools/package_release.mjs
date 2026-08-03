import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const binDir = path.join(process.cwd(), 'bin');
if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

// Single source of truth for the release version: appVersion in main.go. Keeping
// it here rather than hardcoding avoids the archives and the binary disagreeing
// about what version they are.
const mainGo = fs.readFileSync(path.join(process.cwd(), 'main.go'), 'utf8');
const versionMatch = mainGo.match(/appVersion\s*=\s*"([^"]+)"/);
if (!versionMatch) {
    console.error('ERROR: could not read appVersion from main.go');
    process.exit(1);
}
const version = versionMatch[1];

console.log(`Building Cross-Platform Release Binaries for ikmal editor v${version}...`);

const targets = [
    { os: 'darwin', arch: 'arm64', name: 'ikmal-editor-darwin-arm64' },
    { os: 'darwin', arch: 'amd64', name: 'ikmal-editor-darwin-amd64' },
    { os: 'linux', arch: 'amd64', name: 'ikmal-editor-linux-amd64' },
    { os: 'linux', arch: 'arm64', name: 'ikmal-editor-linux-arm64' },
    { os: 'linux', arch: 'arm', name: 'ikmal-editor-linux-armv7' },
    { os: 'windows', arch: 'amd64', name: 'ikmal-editor-windows-amd64.exe' },
];

for (const target of targets) {
    const targetPath = path.join(binDir, target.name);
    console.log(`  -> Compiling ${target.os}/${target.arch} -> ${target.name}...`);
    execSync(`CGO_ENABLED=0 GOOS=${target.os} GOARCH=${target.arch} go build -o "${targetPath}" .`, { stdio: 'inherit' });
}

console.log('All cross-platform binaries (including Raspberry Pi ARM64/ARMv7) built successfully in bin/');

// Package each binary into the release archive the package managers expect:
// ikmal-editor-v<version>-<os>-<arch>.tar.gz (zip on Windows), with the binary
// at the archive root under its platform name. Formula/ikmal-editor.rb and
// scoop/ikmal-editor.json both resolve their downloads by these exact names.
console.log(`\nPackaging release archives for v${version}...`);

const distDir = path.join(process.cwd(), 'bin', 'dist');
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const archives = [];
for (const target of targets) {
    const slug = target.name.replace(/^ikmal-editor-/, '').replace(/\.exe$/, '');
    const isWindows = target.os === 'windows';
    const archiveName = `ikmal-editor-v${version}-${slug}` + (isWindows ? '.zip' : '.tar.gz');
    const archivePath = path.join(distDir, archiveName);

    if (isWindows) {
        execSync(`zip -j -q "${archivePath}" "${path.join(binDir, target.name)}"`, { stdio: 'inherit' });
    } else {
        execSync(`tar -czf "${archivePath}" -C "${binDir}" "${target.name}"`, { stdio: 'inherit' });
    }
    console.log(`  -> ${archiveName}`);
    archives.push(archiveName);
}

// Emit SHA256SUMS so the Homebrew formula and Scoop manifest hashes can be filled
// in (and verified later) without re-deriving them by hand.
const sums = execSync(`shasum -a 256 ${archives.map((a) => `"${a}"`).join(' ')}`, {
    cwd: distDir,
}).toString();
fs.writeFileSync(path.join(distDir, 'SHA256SUMS'), sums);

console.log(`\nSHA256SUMS:\n${sums}`);
console.log(`Release archives ready in bin/dist/ (${archives.length} archives + SHA256SUMS)`);
